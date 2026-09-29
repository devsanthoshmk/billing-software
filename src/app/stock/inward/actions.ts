'use server';

import { db } from '../../../lib/db';
import {
  products,
  productBatches,
  suppliers,
  taxSlabs,
} from '../../../lib/db/schema/masters';
import { purchases, purchaseItems } from '../../../lib/db/schema/transactions';
import { auditLogs } from '../../../lib/db/schema/system';
import { eq, and, sql, desc, asc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import { roundToPaise, roundToRupee } from '../../../lib/business-engine/calculations';
import { parseExpiryMonthYearToIso } from './utils';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {}
}

export interface PurchaseInwardLineItemInput {
  productId: string;
  batchNo: string;
  expiryMonthYear: string; // 'MM/YY' e.g. '08/27'
  quantity: number;
  freeQuantity?: number;
  schemeThreshold?: number;
  schemeFreeQty?: number;
  purchaseRate: number;
  sellingRate: number;
  secondaryRate?: number;
  mrp: number;
  targetMarginPct?: number;
  tradeDiscountPct?: number;
  taxCode: string; // '01', '02', '03', '04', '05'
}

export interface PurchaseInwardHeaderInput {
  supplierId: string;
  supplierBillNo: string;
  supplierBillDate: string; // 'YYYY-MM-DD'
  inwardDate: string;       // 'YYYY-MM-DD'
  dueDate: string;          // 'YYYY-MM-DD'
  paymentTerms?: 'CREDIT' | 'CASH';
  isInterstate?: boolean;
  cashDiscountPct?: number;
  otherChargesAdd?: number;
  otherChargesLess?: number;
  remarks?: string;
  operatorId?: string;
  lineItems: PurchaseInwardLineItemInput[];
}

export interface PurchaseInwardResult {
  success: boolean;
  purchaseId?: string;
  inwardNo?: string;
  netAmount?: number;
  totalUnits?: number;
  error?: string;
}

function withDbRetry<T>(fn: () => T, maxRetries = 10, baseDelayMs = 50): T {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return fn();
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('database is locked') || msg.includes('SQLITE_BUSY') || msg.includes('busy')) {
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
 * Creates Purchase Inward GRN atomically.
 * Replicates PURCHASE.PRG / PURTRA.PRG.
 */
export async function createPurchaseInward(
  input: PurchaseInwardHeaderInput
): Promise<PurchaseInwardResult> {
  try {
    if (!input.supplierId) throw new Error('Supplier is mandatory');
    if (!input.supplierBillNo || !input.supplierBillNo.trim()) throw new Error('Supplier Bill No is mandatory');
    if (!input.lineItems || input.lineItems.length === 0) throw new Error('At least one line item is required');

    const supplier = db.query.suppliers.findFirst({
      where: eq(suppliers.id, input.supplierId),
    }).sync();

    if (!supplier) throw new Error(`Supplier not found: ${input.supplierId}`);
    if (supplier.isBlocked) throw new Error(`Supplier "${supplier.name}" is blocked for purchases!`);

    const allTaxSlabs = db.select().from(taxSlabs).all();
    const taxMap = new Map(allTaxSlabs.map((t) => [t.code, t]));

    const isInterstate = input.isInterstate ?? (supplier.gstin ? !supplier.gstin.startsWith('33') : false);

    let totalGrossAmount = 0;
    let totalTradeDiscount = 0;
    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalInwardUnits = 0;

    const validatedLines = input.lineItems.map((line, idx) => {
      const lineNum = idx + 1;

      // Pricing invariants (PURCHASE.PRG:2179-2192)
      if (line.quantity <= 0) {
        throw new Error(`Line ${lineNum}: Quantity must be greater than zero.`);
      }
      if (line.purchaseRate <= 0) {
        throw new Error(`Line ${lineNum}: Purchase Rate is Zero or negative!`);
      }
      if (line.sellingRate <= 0) {
        throw new Error(`Line ${lineNum}: Selling Rate is Zero!`);
      }
      if (line.mrp <= 0) {
        throw new Error(`Line ${lineNum}: MRP is Zero!`);
      }
      if (line.sellingRate > line.mrp) {
        throw new Error(
          `Line ${lineNum}: Selling Rate (${line.sellingRate}) cannot exceed MRP (${line.mrp})!`
        );
      }
      if (line.purchaseRate > line.mrp) {
        throw new Error(
          `Line ${lineNum}: Purchase Rate (${line.purchaseRate}) cannot exceed MRP (${line.mrp})!`
        );
      }
      if (line.sellingRate < line.purchaseRate) {
        throw new Error(
          `Line ${lineNum}: Selling Rate (${line.sellingRate}) is less than Purchase Rate (${line.purchaseRate})! Negative margin prohibited.`
        );
      }

      const expiryIso = parseExpiryMonthYearToIso(line.expiryMonthYear);
      if (expiryIso < input.inwardDate) {
        throw new Error(
          `Line ${lineNum}: Expired product received! Expiry (${expiryIso}) is earlier than Inward Date (${input.inwardDate}).`
        );
      }

      const freeQty = line.freeQuantity ?? 0;
      const inwardQty = line.quantity + freeQty;
      totalInwardUnits += inwardQty;

      const lineGross = roundToPaise(line.quantity * line.purchaseRate);
      const discPct = line.tradeDiscountPct ?? supplier.defaultDiscountPct ?? 0;
      const lineDiscount = roundToPaise(lineGross * (discPct / 100));
      const lineTaxable = roundToPaise(lineGross - lineDiscount);

      const slab = taxMap.get(line.taxCode);
      let cgstRate = 0, cgstAmt = 0, sgstRate = 0, sgstAmt = 0, igstRate = 0, igstAmt = 0;

      if (slab && !slab.isExempt) {
        if (isInterstate) {
          igstRate = slab.igstRate;
          igstAmt = roundToPaise(lineTaxable * (igstRate / 100));
        } else {
          cgstRate = slab.cgstRate;
          sgstRate = slab.sgstRate;
          cgstAmt = roundToPaise(lineTaxable * (cgstRate / 100));
          sgstAmt = roundToPaise(lineTaxable * (sgstRate / 100));
        }
      }

      const lineNet = roundToPaise(lineTaxable + cgstAmt + sgstAmt + igstAmt);

      totalGrossAmount += lineGross;
      totalTradeDiscount += lineDiscount;
      totalTaxable += lineTaxable;
      totalCgst += cgstAmt;
      totalSgst += sgstAmt;
      totalIgst += igstAmt;

      return {
        lineInput: line,
        expiryIso,
        grossAmount: lineGross,
        tradeDiscountAmount: lineDiscount,
        taxableAmount: lineTaxable,
        cgstRate,
        cgstAmount: cgstAmt,
        sgstRate,
        sgstAmount: sgstAmt,
        igstRate,
        igstAmount: igstAmt,
        netAmount: lineNet,
        inwardQty,
      };
    });

    totalGrossAmount = roundToPaise(totalGrossAmount);
    totalTradeDiscount = roundToPaise(totalTradeDiscount);
    totalTaxable = roundToPaise(totalTaxable);
    totalCgst = roundToPaise(totalCgst);
    totalSgst = roundToPaise(totalSgst);
    totalIgst = roundToPaise(totalIgst);
    const totalTaxAmount = roundToPaise(totalCgst + totalSgst + totalIgst);

    const cashDiscPct = input.cashDiscountPct ?? 0;
    const cashDiscountAmount = roundToPaise(totalTaxable * (cashDiscPct / 100));

    const chargesAdd = input.otherChargesAdd ?? 0;
    const chargesLess = input.otherChargesLess ?? 0;

    const unroundedNet = totalTaxable + totalTaxAmount - cashDiscountAmount + chargesAdd - chargesLess;
    const finalNetAmount = roundToRupee(unroundedNet);
    const roundOff = roundToPaise(finalNetAmount - unroundedNet);

    const existingPurchases = db.select({ inwardNo: purchases.inwardNo }).from(purchases).all();
    const purchaseSet = new Set(existingPurchases.map((p) => p.inwardNo));
    let inwardCounter = existingPurchases.length + 1;
    let inwardNo = `GRN-${inwardCounter.toString().padStart(6, '0')}`;
    while (purchaseSet.has(inwardNo)) {
      inwardCounter++;
      inwardNo = `GRN-${inwardCounter.toString().padStart(6, '0')}`;
    }
    const purchaseId = crypto.randomUUID();

    withDbRetry(() => {
      db.transaction((tx) => {
      // A. Insert Purchase Inward Header
      tx.insert(purchases).values({
        id: purchaseId,
        inwardNo,
        supplierId: input.supplierId,
        supplierBillNo: input.supplierBillNo.trim(),
        supplierBillDate: input.supplierBillDate,
        inwardDate: input.inwardDate,
        dueDate: input.dueDate,
        paymentTerms: input.paymentTerms ?? 'CREDIT',
        isInterstate,
        totalGrossAmount,
        tradeDiscountAmount: totalTradeDiscount,
        cashDiscountPct: cashDiscPct,
        cashDiscountAmount,
        taxableAmount: totalTaxable,
        cgstAmount: totalCgst,
        sgstAmount: totalSgst,
        igstAmount: totalIgst,
        totalTaxAmount,
        otherChargesAdd: chargesAdd,
        otherChargesLess: chargesLess,
        roundOff,
        netAmount: finalNetAmount,
        paidAmount: 0,
        balanceAmount: finalNetAmount,
        paymentStatus: 'UNPAID',
        isTransit: false,
        dayEndLocked: false,
        status: 'VERIFIED',
        remarks: input.remarks || null,
      }).run();

      // B. Process Items & Update/Create Batches
      for (const [idx, item] of validatedLines.entries()) {
        const line = item.lineInput;

        const existingBatch = tx.query.productBatches.findFirst({
          where: and(
            eq(productBatches.productId, line.productId),
            eq(productBatches.batchNo, line.batchNo.trim().toUpperCase())
          ),
        }).sync();

        let batchId: string;

        if (existingBatch) {
          batchId = existingBatch.id;
          tx.update(productBatches)
            .set({
              stockQty: sql`${productBatches.stockQty} + ${item.inwardQty}`,
              purchaseRate: line.purchaseRate,
              sellingRate: line.sellingRate,
              secondaryRate: line.secondaryRate ?? existingBatch.secondaryRate,
              mrp: line.mrp,
              expiryDate: item.expiryIso,
              expiryMonthYear: line.expiryMonthYear,
              lastPurchaseDate: input.inwardDate,
              taxCode: line.taxCode,
              schemeThreshold: line.schemeThreshold ?? existingBatch.schemeThreshold,
              schemeFreeQty: line.schemeFreeQty ?? existingBatch.schemeFreeQty,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(productBatches.id, existingBatch.id))
            .run();
        } else {
          batchId = crypto.randomUUID();
          tx.insert(productBatches).values({
            id: batchId,
            productId: line.productId,
            batchNo: line.batchNo.trim().toUpperCase(),
            expiryDate: item.expiryIso,
            expiryMonthYear: line.expiryMonthYear,
            purchaseRate: line.purchaseRate,
            sellingRate: line.sellingRate,
            secondaryRate: line.secondaryRate ?? 0,
            mrp: line.mrp,
            stockQty: item.inwardQty,
            quarantineQty: 0,
            schemeThreshold: line.schemeThreshold ?? 0,
            schemeFreeQty: line.schemeFreeQty ?? 0,
            taxCode: line.taxCode,
            lastPurchaseDate: input.inwardDate,
            isActive: true,
            isBlocked: false,
          }).run();
        }

        // Increment Product Total Stock On Hand
        tx.update(products)
          .set({
            totalStockOnHand: sql`${products.totalStockOnHand} + ${item.inwardQty}`,
            lastPurchaseDate: input.inwardDate,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(products.id, line.productId))
          .run();

        // Insert Purchase Line Item
        tx.insert(purchaseItems).values({
          id: crypto.randomUUID(),
          purchaseId,
          sortOrder: idx + 1,
          productId: line.productId,
          batchId,
          batchNo: line.batchNo.trim().toUpperCase(),
          expiryDate: item.expiryIso,
          quantity: line.quantity,
          freeQuantity: line.freeQuantity ?? 0,
          schemeThreshold: line.schemeThreshold ?? 0,
          schemeFreeQty: line.schemeFreeQty ?? 0,
          purchaseRate: line.purchaseRate,
          sellingRate: line.sellingRate,
          secondaryRate: line.secondaryRate,
          mrp: line.mrp,
          targetMarginPct: line.targetMarginPct ?? 0,
          tradeDiscountPct: line.tradeDiscountPct ?? 0,
          tradeDiscountAmount: item.tradeDiscountAmount,
          grossAmount: item.grossAmount,
          taxableAmount: item.taxableAmount,
          taxCode: line.taxCode,
          cgstRate: item.cgstRate,
          cgstAmount: item.cgstAmount,
          sgstRate: item.sgstRate,
          sgstAmount: item.sgstAmount,
          igstRate: item.igstRate,
          igstAmount: item.igstAmount,
          netAmount: item.netAmount,
        }).run();
      }

      // C. Update Supplier Accounts Payable Balance
      tx.update(suppliers)
        .set({
          currentBalance: sql`${suppliers.currentBalance} + ${finalNetAmount}`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(suppliers.id, input.supplierId))
        .run();

      // D. Audit Log
      tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        action: 'PURCHASE_INWARD_CREATE',
        entityType: 'purchase',
        entityId: purchaseId,
        userId: input.operatorId ?? 'SYSTEM',
        newValues: JSON.stringify({
          inwardNo,
          supplierId: input.supplierId,
          supplierBillNo: input.supplierBillNo,
          netAmount: finalNetAmount,
          itemsCount: validatedLines.length,
          totalUnits: totalInwardUnits,
        }),
        remarks: `Inward GRN ${inwardNo} created against supplier bill ${input.supplierBillNo}`,
      }).run();
    });
  });

    safeRevalidatePath('/stock');
    safeRevalidatePath('/stock/inward');
    safeRevalidatePath('/stock/purchase');

    return {
      success: true,
      purchaseId,
      inwardNo,
      netAmount: finalNetAmount,
      totalUnits: totalInwardUnits,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to process purchase inward GRN',
    };
  }
}

/**
 * Loads master data for Purchase Inward screen.
 */
export async function getPurchaseInitialData() {
  const [allSuppliers, allTaxSlabs, allProducts] = await Promise.all([
    db.query.suppliers.findMany({
      orderBy: [asc(suppliers.name)],
    }),
    db.select().from(taxSlabs).all(),
    db.query.products.findMany({
      orderBy: [asc(products.name)],
    }),
  ]);

  return {
    suppliers: allSuppliers,
    taxSlabs: allTaxSlabs,
    products: allProducts,
  };
}

/**
 * Feature F22: Inline Supplier Creation ('+' hotkey)
 */
export async function createInlineSupplier(input: {
  name: string;
  addressLine1?: string;
  place?: string;
  phone?: string;
  gstin?: string;
  creditDays?: number;
  defaultDiscountPct?: number;
}) {
  try {
    const trimmedName = input.name?.trim().toUpperCase();
    if (!trimmedName) throw new Error('Supplier Name is required');

    const result = db.select({
      maxCode: sql<number>`MAX(CAST(${suppliers.code} AS INTEGER))`,
    }).from(suppliers).get();
    const nextVal = (Number(result?.maxCode || 0)) + 1;
    const code = nextVal.toString().padStart(3, '0');

    const supplierId = crypto.randomUUID();
    const gstinClean = input.gstin?.trim().toUpperCase() || null;
    const panClean = gstinClean && gstinClean.length === 15 ? gstinClean.substring(2, 12) : null;
    const phoneClean = input.phone ? input.phone.replace(/[^0-9]/g, '') : null;

    db.transaction((tx) => {
      tx.insert(suppliers).values({
        id: supplierId,
        code,
        name: trimmedName,
        addressLine1: input.addressLine1?.trim() || null,
        addressLine4: input.place?.trim() || null,
        phone: phoneClean,
        gstin: gstinClean,
        pan: panClean,
        creditDays: input.creditDays ?? 30,
        defaultDiscountPct: input.defaultDiscountPct ?? 0,
        openingBalance: 0,
        currentBalance: 0,
        isActive: true,
        isBlocked: false,
      }).run();
    });

    const newSupplier = await db.query.suppliers.findFirst({
      where: eq(suppliers.id, supplierId),
    });

    safeRevalidatePath('/stock');
    safeRevalidatePath('/masters/suppliers');

    return {
      success: true,
      supplier: newSupplier,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to create inline supplier',
    };
  }
}
