'use server';

import { db } from '../../lib/db';
import { invoices, invoiceItems } from '../../lib/db/schema/transactions';
import {
  products,
  productBatches,
  customers,
  suppliers,
  taxSlabs,
  areas,
  salesmen,
  doctors,
} from '../../lib/db/schema/masters';
import { customerOutstandings } from '../../lib/db/schema/ledgers';
import { auditLogs } from '../../lib/db/schema/system';
import { eq, sql, asc, and, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import {
  calculateLineItem,
  calculateInvoiceTotals,
  roundToPaise,
  roundToRupee,
  calculateSchemeFreeQty,
} from '../../lib/business-engine/calculations';
import {
  validateBusinessInvariants,
  validateLineItemPricing,
  validateCustomerDrugLicense,
  validateCustomerCreditLimit,
  calculateDateDiffInDays,
} from '../../lib/business-engine/invariants';
import { allocateStockFIFO, analyzeBatchMrps } from '../../lib/business-engine/fifoAllocation';
import { checkDateIsClosed } from '../system/day-end/actions';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-HTTP context (e.g. testing)
  }
}

export interface CreateInvoiceLineItemInput {
  productId: string;
  batchId: string;
  productName: string;
  packaging: string;
  hsnCode: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  freeQuantity: number;
  sellingRate: number;
  purchaseRate: number;
  mrp: number;
  tradeDiscountPct: number;
  taxCode: string;
  taxPct: number;
  schemeThreshold?: number;
  schemeFreeQty?: number;
  isReplacement?: boolean;
}

export interface CreateInvoiceInput {
  customerId: string;
  salesmanId?: string | null;
  doctorId?: string | null;
  areaId?: string | null;
  invoiceDate: string; // ISO 'YYYY-MM-DD'
  paymentTerms: 'CASH' | 'CREDIT' | 'CHEQUE';
  creditDays?: number;
  isInterstate: boolean;
  preparedBy: string;
  items: CreateInvoiceLineItemInput[];
  cashDiscountPct?: number;
  freightCharges?: number;
  boxCharges?: number;
  serviceCharges?: number;
  creditLimitBypassed?: boolean;
  remarks?: string;
}

export interface InvoiceCreationResult {
  success: boolean;
  invoiceId?: string;
  invoiceNo?: string;
  grandTotal?: number;
  roundOff?: number;
  error?: string;
}

function withDbRetry<T>(fn: () => T, maxRetries = 15, baseDelayMs = 40): T {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return fn();
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (
        msg.includes('database is locked') ||
        msg.includes('SQLITE_BUSY') ||
        msg.includes('busy') ||
        msg.includes('UNIQUE constraint failed')
      ) {
        lastError = err;
        const jitter = Math.floor(Math.random() * 40);
        const start = Date.now();
        while (Date.now() - start < baseDelayMs + jitter) {
          // busy wait
        }
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Creates a Sales Invoice atomically inside a database transaction.
 */
export async function createSalesInvoice(
  input: CreateInvoiceInput
): Promise<InvoiceCreationResult> {
  try {
    if (!input.items || input.items.length === 0) {
      throw new Error('Please add at least one item before saving.');
    }

    if (!input.customerId) {
      throw new Error('Please select a customer.');
    }

    if (!input.invoiceDate) {
      throw new Error('Invoice date is required.');
    }

    // 1. Fetch Customer
    const customer = db.query.customers.findFirst({
      where: eq(customers.id, input.customerId),
    }).sync();

    if (!customer) throw new Error('Customer record not found.');
    if (customer.isBlocked) throw new Error('Customer account is blocked for billing.');

    // 2. Fetch Tax Slabs for GST validation
    const allTaxSlabs = db.select().from(taxSlabs).all();
    const taxMap = new Map(allTaxSlabs.map((t) => [t.code, t]));

    // 3. Process Line Items and validate pricing bounds
    let totalBilledUnits = 0;
    let totalFreeUnits = 0;

    const validatedLines = input.items.map((item, idx) => {
      const lineNum = idx + 1;

      if (item.quantity <= 0) {
        throw new Error(`Line ${lineNum}: Quantity must be at least 1.`);
      }

      // Check batch pricing bounds
      if (item.sellingRate <= 0 && !item.isReplacement) {
        throw new Error(`Line ${lineNum} (${item.productName}): Selling Rate cannot be zero!`);
      }
      if (item.mrp <= 0) {
        throw new Error(`Line ${lineNum} (${item.productName}): MRP cannot be zero!`);
      }
      if (item.sellingRate > item.mrp) {
        throw new Error(
          `Line ${lineNum} (${item.productName}): DPCO Violation! Selling Rate (Rs. ${item.sellingRate.toFixed(2)}) cannot exceed MRP (Rs. ${item.mrp.toFixed(2)})`
        );
      }

      // Calculate free goods scheme if configured
      let freeUnits = item.freeQuantity || 0;
      if (item.schemeThreshold && item.schemeThreshold > 0 && item.schemeFreeQty && item.schemeFreeQty > 0) {
        const calculatedFree = calculateSchemeFreeQty(
          item.quantity,
          item.schemeThreshold,
          item.schemeFreeQty,
          item.isReplacement
        );
        if (item.freeQuantity === undefined || item.freeQuantity === null) {
          freeUnits = calculatedFree;
        }
      }

      const gross = roundToPaise(item.quantity * item.sellingRate);
      const discount = roundToPaise((gross * (item.tradeDiscountPct || 0)) / 100);
      const taxable = roundToPaise(gross - discount);

      let cgstRate = 0;
      let sgstRate = 0;
      let igstRate = 0;
      let cgst = 0;
      let sgst = 0;
      let igst = 0;

      const slab = taxMap.get(item.taxCode);
      const taxPct = slab ? (input.isInterstate ? slab.igstRate : slab.cgstRate + slab.sgstRate) : item.taxPct;

      if (!customer.isTaxExempt && item.taxCode !== '01' && taxPct > 0) {
        if (input.isInterstate) {
          igstRate = taxPct;
          igst = roundToPaise((taxable * igstRate) / 100);
        } else {
          cgstRate = roundToPaise(taxPct / 2);
          sgstRate = roundToPaise(taxPct / 2);
          cgst = roundToPaise((taxable * cgstRate) / 100);
          sgst = roundToPaise((taxable * sgstRate) / 100);
        }
      }

      const totalTax = roundToPaise(cgst + sgst + igst);
      const lineNet = roundToPaise(taxable + totalTax);

      totalBilledUnits += item.quantity;
      totalFreeUnits += freeUnits;

      return {
        ...item,
        freeQuantity: freeUnits,
        sortOrder: lineNum,
        grossAmount: gross,
        discountAmount: discount,
        taxableAmount: taxable,
        cgstRate,
        cgstAmount: cgst,
        sgstRate,
        sgstAmount: sgst,
        igstRate,
        igstAmount: igst,
        totalTaxAmount: totalTax,
        netAmount: lineNet,
        totalUnitsToDeduct: item.quantity + freeUnits,
      };
    });

    // 4. Calculate Invoice Totals via Parity Engine
    const totals = calculateInvoiceTotals({
      lineItems: validatedLines.map((l) => ({
        id: crypto.randomUUID(),
        productId: l.productId,
        batchId: l.batchId,
        productName: l.productName,
        quantity: l.quantity,
        calculatedFreeQty: l.freeQuantity,
        totalUnits: l.totalUnitsToDeduct,
        isReplacement: Boolean(l.isReplacement),
        sellingRate: l.sellingRate,
        purchaseRate: l.purchaseRate,
        mrp: l.mrp,
        grossAmount: l.grossAmount,
        tradeDiscountPct: l.tradeDiscountPct,
        discountAmount: l.discountAmount,
        taxableAmount: l.taxableAmount,
        taxCode: l.taxCode,
        taxPct: l.cgstRate + l.sgstRate + l.igstRate,
        cgstRate: l.cgstRate,
        cgstAmount: l.cgstAmount,
        sgstRate: l.sgstRate,
        sgstAmount: l.sgstAmount,
        igstRate: l.igstRate,
        igstAmount: l.igstAmount,
        totalTaxAmount: l.totalTaxAmount,
        netAmount: l.netAmount,
      })),
      cashDiscountPct: input.cashDiscountPct || 0,
      freightCharges: input.freightCharges || 0,
      boxCharges: input.boxCharges || 0,
      serviceCharges: input.serviceCharges || 0,
      tcsPct: customer.isTcsApplicable ? 0.075 : 0,
      isTcsApplicable: customer.isTcsApplicable,
    });

    // 5. Customer Regulatory Drug License & Credit Limit Invariant Checks
    const dlViolations = validateCustomerDrugLicense(
      {
        dlExpiryDate: customer.dlExpiryDate || undefined,
        dlNo20b: customer.dlNo20b || undefined,
        dlNo21b: customer.dlNo21b || undefined,
        creditLimit: customer.creditLimit || 0,
        closingBalance: customer.closingBalance || 0,
      },
      input.invoiceDate,
      false, // isScheduleH
      Boolean(input.creditLimitBypassed)
    );
    const expiredDl = dlViolations.find((v) => v.code === 'DRUG_LICENSE_EXPIRED' && v.severity === 'ERROR');
    if (expiredDl) {
      throw new Error(`Customer Drug License has expired: ${expiredDl.message}`);
    }

    const creditViolations = validateCustomerCreditLimit(
      {
        creditLimit: customer.creditLimit,
        closingBalance: customer.closingBalance,
        bypassCreditLimit: customer.bypassCreditLimit,
      },
      totals.grandTotal,
      input.paymentTerms === 'CASH' ? 'C' : input.paymentTerms === 'CHEQUE' ? 'H' : 'R',
      Boolean(input.creditLimitBypassed)
    );
    const creditBlocked = creditViolations.find((v) => v.code === 'CREDIT_LIMIT_EXCEEDED' && v.severity === 'ERROR');
    if (creditBlocked) {
      throw new Error(creditBlocked.message);
    }

    let invoiceNo = '';
    const invoiceId = crypto.randomUUID();

    // Guard: Prohibit backdated transactions after Day-End closing
    const dateClosed = await checkDateIsClosed(input.invoiceDate);
    if (dateClosed.isClosed) {
      throw new Error(`Billing date ${input.invoiceDate} was already closed on ${dateClosed.closedAt}. Entries on closed dates are not permitted.`);
    }

    // 7. Execute Atomic Drizzle ORM Transaction
    withDbRetry(() => {
      // 6. Generate sequential invoice number (e.g. INV-000001)
      const existingInvoices = db.select({ invoiceNo: invoices.invoiceNo }).from(invoices).all();
      const invoiceSet = new Set(existingInvoices.map((inv) => inv.invoiceNo));
      let invoiceCounter = existingInvoices.length + 1;
      let generatedNo = `INV-${invoiceCounter.toString().padStart(6, '0')}`;
      while (invoiceSet.has(generatedNo)) {
        invoiceCounter++;
        generatedNo = `INV-${invoiceCounter.toString().padStart(6, '0')}`;
      }
      invoiceNo = generatedNo;

      db.transaction((tx) => {
      // Step A: Check and decrement stock for all lines
      for (const line of validatedLines) {
        const batch = tx.query.productBatches.findFirst({
          where: eq(productBatches.id, line.batchId),
        }).sync();

        if (!batch) {
          throw new Error(`Batch record not found: ${line.batchNo} (${line.productName})`);
        }

        if (batch.stockQty < line.totalUnitsToDeduct) {
          throw new Error(
            `Insufficient stock in batch ${batch.batchNo} for ${line.productName}. Required: ${line.totalUnitsToDeduct}, Available: ${batch.stockQty}`
          );
        }

        // Decrement Batch Stock
        tx.update(productBatches)
          .set({
            stockQty: sql`${productBatches.stockQty} - ${line.totalUnitsToDeduct}`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(productBatches.id, line.batchId))
          .run();

        // Decrement Product Total Stock & record last sale date
        tx.update(products)
          .set({
            totalStockOnHand: sql`${products.totalStockOnHand} - ${line.totalUnitsToDeduct}`,
            lastSaleDate: input.invoiceDate,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(products.id, line.productId))
          .run();
      }

      // Step B: Insert Invoice Header
      tx.insert(invoices).values({
        id: invoiceId,
        invoiceNo,
        invoiceSeries: input.isInterstate ? 2 : 1,
        invoiceDate: input.invoiceDate,
        invoiceTime: new Date().toTimeString().split(' ')[0],
        customerId: input.customerId,
        salesmanId: input.salesmanId || customer.salesmanId || null,
        doctorId: input.doctorId || null,
        areaId: input.areaId || customer.areaId || null,
        isInterstate: input.isInterstate,
        paymentTerms: input.paymentTerms,
        dueDate: new Date(
          new Date(input.invoiceDate).getTime() + (input.creditDays || customer.creditDays || 21) * 86400000
        ).toISOString().split('T')[0],
        subtotalGross: totals.totalGross,
        totalLineDiscount: totals.totalLineDiscount,
        cashDiscountPct: totals.cashDiscountPct,
        cashDiscountAmount: totals.cashDiscountAmount,
        taxableAmount: totals.netTaxableAmount,
        cgstAmount: totals.totalCgst,
        sgstAmount: totals.totalSgst,
        igstAmount: totals.totalIgst,
        totalTaxAmount: totals.totalTax,
        freightCharges: input.freightCharges || 0,
        boxCharges: input.boxCharges || 0,
        serviceCharges: input.serviceCharges || 0,
        tcsPct: totals.tcsPct,
        tcsAmount: totals.tcsAmount,
        roundOff: totals.roundOffAmount,
        netAmount: totals.grandTotal,
        totalItemsCount: validatedLines.length,
        totalQuantity: totals.totalBilledQuantity,
        customerGstin: customer.gstin || null,
        customerDl20b: customer.dlNo20b || null,
        customerDl21b: customer.dlNo21b || null,
        creditLimitBypassed: Boolean(input.creditLimitBypassed),
        dayEndLocked: false,
        status: 'FINAL',
        remarks: input.remarks || `Prepared by ${input.preparedBy}`,
      }).run();

      // Step C: Insert Invoice Line Items
      for (const line of validatedLines) {
        tx.insert(invoiceItems).values({
          id: crypto.randomUUID(),
          invoiceId,
          sortOrder: line.sortOrder,
          productId: line.productId,
          batchId: line.batchId,
          productName: line.productName,
          packaging: line.packaging,
          hsnCode: line.hsnCode,
          batchNo: line.batchNo,
          expiryDate: line.expiryDate,
          quantity: line.quantity,
          freeQuantity: line.freeQuantity,
          isReplacement: Boolean(line.isReplacement),
          purchaseRate: line.purchaseRate,
          sellingRate: line.sellingRate,
          mrp: line.mrp,
          grossAmount: line.grossAmount,
          tradeDiscountPct: line.tradeDiscountPct,
          tradeDiscountAmount: line.discountAmount,
          taxableAmount: line.taxableAmount,
          taxCode: line.taxCode,
          cgstRate: line.cgstRate,
          cgstAmount: line.cgstAmount,
          sgstRate: line.sgstRate,
          sgstAmount: line.sgstAmount,
          igstRate: line.igstRate,
          igstAmount: line.igstAmount,
          netAmount: line.netAmount,
        }).run();
      }

      // Step D: Update Customer Financial Ledger (if CREDIT or CHEQUE)
      if (input.paymentTerms !== 'CASH') {
        tx.insert(customerOutstandings).values({
          id: crypto.randomUUID(),
          customerId: input.customerId,
          invoiceId,
          invoiceNo,
          invoiceDate: input.invoiceDate,
          dueDate: new Date(
            new Date(input.invoiceDate).getTime() + (input.creditDays || customer.creditDays || 21) * 86400000
          ).toISOString().split('T')[0],
          originalAmount: totals.grandTotal,
          paidAmount: 0,
          balanceAmount: totals.grandTotal,
          status: 'OPEN',
        }).run();

        // Increment customer closingBalance (receivable balance)
        tx.update(customers)
          .set({
            closingBalance: sql`${customers.closingBalance} + ${totals.grandTotal}`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(customers.id, input.customerId))
          .run();
      }

      // Step E: Audit Log
      tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        action: 'SALES_INVOICE_CREATE',
        entityType: 'invoice',
        entityId: invoiceId,
        userId: input.preparedBy || 'SYSTEM',
        newValues: JSON.stringify({
          invoiceNo,
          customerId: input.customerId,
          grandTotal: totals.grandTotal,
          itemsCount: validatedLines.length,
          paymentTerms: input.paymentTerms,
        }),
        remarks: `Invoice ${invoiceNo} generated by ${input.preparedBy}`,
      }).run();
    });
  });

    safeRevalidatePath('/billing');
    safeRevalidatePath('/stock');

    return {
      success: true,
      invoiceId,
      invoiceNo,
      grandTotal: totals.grandTotal,
      roundOff: totals.roundOffAmount,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to save sales invoice.',
    };
  }
}

/**
 * Loads master data for POS Billing screen.
 */
export async function getBillingInitialData() {
  const [
    allCustomers,
    allSalesmen,
    allDoctors,
    allTaxSlabs,
    allAreas,
    allSuppliers,
  ] = await Promise.all([
    db.query.customers.findMany({
      orderBy: [asc(customers.name)],
      with: { area: true, salesman: true },
    }),
    db.query.salesmen.findMany({
      orderBy: [asc(salesmen.name)],
    }),
    db.query.doctors.findMany({
      orderBy: [asc(doctors.name)],
    }),
    db.select().from(taxSlabs).all(),
    db.query.areas.findMany({
      orderBy: [asc(areas.name)],
    }),
    db.query.suppliers.findMany({
      orderBy: [asc(suppliers.name)],
    }),
  ]);

  return {
    customers: allCustomers,
    salesmen: allSalesmen,
    doctors: allDoctors,
    taxSlabs: allTaxSlabs,
    areas: allAreas,
    suppliers: allSuppliers,
  };
}

/**
 * Returns available batches for a product, sorted by FEFO (Earliest Expiry First).
 */
export async function getBatchesForProduct(productId: string) {
  const batches = await db.query.productBatches.findMany({
    where: and(
      eq(productBatches.productId, productId),
      eq(productBatches.isActive, true),
      eq(productBatches.isBlocked, false)
    ),
    orderBy: [asc(productBatches.expiryDate), asc(productBatches.batchNo)],
  });

  return batches;
}

/**
 * Searches customers by code or name or phone.
 */
export async function searchCustomers(query: string) {
  const clean = query.trim().toLowerCase();
  if (!clean) return [];

  const list = await db.query.customers.findMany({
    orderBy: [asc(customers.name)],
    with: { area: true, salesman: true },
  });

  return list.filter(
    (c) =>
      c.code.toLowerCase().includes(clean) ||
      c.name.toLowerCase().includes(clean) ||
      (c.phone && c.phone.toLowerCase().includes(clean))
  );
}

/**
 * Rapid customer registration triggered by '+' key in Customer input.
 */
export interface InlineCustomerInput {
  name: string;
  areaId: string;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  addressLine4?: string; // Place
  phone?: string;
  gstin?: string;
  dlNo20b?: string;
  dlNo21b?: string;
  billingType?: string; // 'L' or 'O'
  paymentTerms?: string; // 'C' | 'R' | 'H'
  salesmanId?: string | null;
  creditDays?: number;
  creditLimit?: number;
  defaultDiscountPct?: number;
}

export async function createInlineCustomer(input: InlineCustomerInput) {
  try {
    const trimmedName = input.name?.trim().toUpperCase();
    if (!trimmedName) throw new Error('Customer Name is required');
    if (!input.areaId) throw new Error('Area is required');

    // Auto-generate next customer code
    const result = db.select({
      maxCode: sql<number>`MAX(CAST(${customers.code} AS INTEGER))`,
    }).from(customers).get();
    const nextVal = (Number(result?.maxCode || 0)) + 1;
    const code = nextVal.toString().padStart(4, '0');

    const customerId = crypto.randomUUID();
    const phoneClean = input.phone ? input.phone.replace(/[^0-9]/g, '') : null;
    const gstinClean = input.gstin?.trim().toUpperCase() || null;
    const panClean = gstinClean && gstinClean.length === 15 ? gstinClean.substring(2, 12) : null;

    const creditDays = input.creditDays !== undefined ? Number(input.creditDays) : 21;
    const paymentTerms = creditDays === 0 ? 'C' : (input.paymentTerms || 'R');

    db.transaction((tx) => {
      tx.insert(customers).values({
        id: customerId,
        code,
        name: trimmedName,
        areaId: input.areaId,
        salesmanId: input.salesmanId || null,
        addressLine1: input.addressLine1?.trim() || null,
        addressLine2: input.addressLine2?.trim() || null,
        addressLine3: input.addressLine3?.trim() || null,
        addressLine4: input.addressLine4?.trim() || null,
        phone: phoneClean,
        gstin: gstinClean,
        pan: panClean,
        dlNo20b: input.dlNo20b?.trim() || null,
        dlNo21b: input.dlNo21b?.trim() || null,
        billingType: input.billingType || 'L',
        paymentTerms,
        creditDays,
        creditLimit: Number(input.creditLimit || 0),
        defaultDiscountPct: Number(input.defaultDiscountPct || 0),
        openingBalance: 0,
        closingBalance: 0,
        isBlocked: false,
        isTaxExempt: false,
        isTcsApplicable: false,
        isActive: true,
      }).run();
    });

    const newCustomer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId),
      with: { area: true, salesman: true },
    });

    safeRevalidatePath('/billing');
    safeRevalidatePath('/masters/customers');

    return {
      success: true,
      customer: newCustomer,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to create customer.',
    };
  }
}
