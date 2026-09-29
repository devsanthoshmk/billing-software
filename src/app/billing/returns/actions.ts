'use server';

import { db } from '../../../lib/db';
import {
  salesReturns,
  salesReturnItems,
  invoices,
  invoiceItems,
} from '../../../lib/db/schema/transactions';
import {
  products,
  productBatches,
  customers,
  taxSlabs,
} from '../../../lib/db/schema/masters';
import { customerOutstandings } from '../../../lib/db/schema/ledgers';
import { auditLogs } from '../../../lib/db/schema/system';
import { eq, sql, desc, asc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import { roundToPaise } from '../../../lib/business-engine/calculations';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {}
}

export interface SalesReturnItemInput {
  productId: string;
  batchId?: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  freeQuantity?: number;
  rate: number;
  purchaseRate: number;
  discountPct?: number;
  taxCode: string;
  restockInventory: boolean; // true = saleable batch stock, false = quarantine
  reason?: string;
}

export interface CreateSalesReturnInput {
  customerId: string;
  originalInvoiceId?: string | null;
  returnDate: string; // ISO 'YYYY-MM-DD'
  returnType: 'CREDIT_NOTE' | 'CASH_REFUND' | 'REPLACEMENT';
  reason: 'EXPIRED' | 'DAMAGED' | 'RATE_DIFFERENCE' | 'EXCESS_STOCK';
  items: SalesReturnItemInput[];
  remarks?: string;
  operatorId?: string;
}

export interface SalesReturnResult {
  success: boolean;
  returnId?: string;
  returnNo?: string;
  grandTotal?: number;
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
 * Creates a Sales Return (Credit Note) atomically in Drizzle ORM.
 * Replicates SRETPRE.PRG.
 */
export async function createSalesReturn(
  input: CreateSalesReturnInput
): Promise<SalesReturnResult> {
  try {
    if (!input.items || input.items.length === 0) {
      throw new Error('Sales return must contain at least 1 line item');
    }
    if (!input.customerId) {
      throw new Error('Customer is required');
    }

    const customer = db.query.customers.findFirst({
      where: eq(customers.id, input.customerId),
    }).sync();
    if (!customer) throw new Error('Customer not found');

    const allTaxSlabs = db.select().from(taxSlabs).all();
    const taxMap = new Map(allTaxSlabs.map((t) => [t.code, t]));

    let totalGross = 0;
    let totalDiscount = 0;
    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const validatedLines = input.items.map((item, idx) => {
      const lineNum = idx + 1;
      if (item.quantity <= 0) {
        throw new Error(`Line ${lineNum}: Returned quantity must be greater than zero`);
      }
      if (item.rate < 0) {
        throw new Error(`Line ${lineNum}: Return rate cannot be negative`);
      }

      const gross = roundToPaise(item.quantity * item.rate);
      const disc = roundToPaise((gross * (item.discountPct || 0)) / 100);
      const taxable = roundToPaise(gross - disc);

      const slab = taxMap.get(item.taxCode);
      const taxRate = slab ? (customer.billingType === 'O' ? slab.igstRate : slab.cgstRate + slab.sgstRate) : 0;

      let cgstRate = 0, sgstRate = 0, igstRate = 0;
      let cgst = 0, sgst = 0, igst = 0;

      if (!customer.isTaxExempt && item.taxCode !== '01' && taxRate > 0) {
        if (customer.billingType === 'O') {
          igstRate = taxRate;
          igst = roundToPaise((taxable * igstRate) / 100);
        } else {
          cgstRate = roundToPaise(taxRate / 2);
          sgstRate = roundToPaise(taxRate / 2);
          cgst = roundToPaise((taxable * cgstRate) / 100);
          sgst = roundToPaise((taxable * sgstRate) / 100);
        }
      }

      const net = roundToPaise(taxable + cgst + sgst + igst);

      totalGross += gross;
      totalDiscount += disc;
      totalTaxable += taxable;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;

      return {
        ...item,
        sortOrder: lineNum,
        grossAmount: gross,
        discountAmount: disc,
        taxableAmount: taxable,
        cgstRate,
        cgstAmount: cgst,
        sgstRate,
        sgstAmount: sgst,
        igstRate,
        igstAmount: igst,
        netAmount: net,
        totalReturnUnits: item.quantity + (item.freeQuantity || 0),
      };
    });

    const unroundedTotal = totalTaxable + totalCgst + totalSgst + totalIgst;
    const grandTotal = Math.round(unroundedTotal);
    const roundOff = roundToPaise(grandTotal - unroundedTotal);

    const existingReturns = db.select({ returnNo: salesReturns.returnNo }).from(salesReturns).all();
    const returnSet = new Set(existingReturns.map((r) => r.returnNo));
    let returnCounter = existingReturns.length + 1;
    let returnNo = `SR-${returnCounter.toString().padStart(6, '0')}`;
    while (returnSet.has(returnNo)) {
      returnCounter++;
      returnNo = `SR-${returnCounter.toString().padStart(6, '0')}`;
    }
    const returnId = crypto.randomUUID();

    let originalInvoiceNo: string | null = null;
    if (input.originalInvoiceId) {
      const origInv = db.query.invoices.findFirst({
        where: eq(invoices.id, input.originalInvoiceId),
      }).sync();
      if (origInv) originalInvoiceNo = origInv.invoiceNo;
    }

    withDbRetry(() => {
      db.transaction((tx) => {
      // 1. Insert Sales Return Header
      tx.insert(salesReturns).values({
        id: returnId,
        returnNo,
        returnDate: input.returnDate,
        customerId: input.customerId,
        originalInvoiceId: input.originalInvoiceId || null,
        originalInvoiceNo,
        returnType: input.returnType,
        reason: input.reason,
        totalGrossAmount: totalGross,
        totalDiscountAmount: totalDiscount,
        taxableAmount: totalTaxable,
        cgstAmount: totalCgst,
        sgstAmount: totalSgst,
        igstAmount: totalIgst,
        roundOff,
        netAmount: grandTotal,
        adjustedAmount: 0,
        balanceAmount: grandTotal,
        isFullyAdjusted: false,
        dayEndLocked: false,
        remarks: input.remarks || null,
      }).run();

      // 2. Insert Return Items & Adjust Stock
      for (const line of validatedLines) {
        tx.insert(salesReturnItems).values({
          id: crypto.randomUUID(),
          salesReturnId: returnId,
          sortOrder: line.sortOrder,
          productId: line.productId,
          batchId: line.batchId || null,
          batchNo: line.batchNo,
          expiryDate: line.expiryDate,
          quantity: line.quantity,
          freeQuantity: line.freeQuantity || 0,
          rate: line.rate,
          purchaseRate: line.purchaseRate,
          discountPct: line.discountPct || 0,
          taxableAmount: line.taxableAmount,
          taxCode: line.taxCode,
          cgstRate: line.cgstRate,
          cgstAmount: line.cgstAmount,
          sgstRate: line.sgstRate,
          sgstAmount: line.sgstAmount,
          igstRate: line.igstRate,
          igstAmount: line.igstAmount,
          netAmount: line.netAmount,
          restockInventory: line.restockInventory,
          reason: line.reason || input.reason,
        }).run();

        // Inventory Stock Disposition:
        if (line.batchId) {
          if (line.restockInventory) {
            // Restock to active saleable stock
            tx.update(productBatches)
              .set({
                stockQty: sql`${productBatches.stockQty} + ${line.totalReturnUnits}`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
              })
              .where(eq(productBatches.id, line.batchId))
              .run();

            tx.update(products)
              .set({
                totalStockOnHand: sql`${products.totalStockOnHand} + ${line.totalReturnUnits}`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
              })
              .where(eq(products.id, line.productId))
              .run();
          } else {
            // Regulatory Quarantine: Segregate damaged/expired returns
            tx.update(productBatches)
              .set({
                quarantineQty: sql`${productBatches.quarantineQty} + ${line.totalReturnUnits}`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
              })
              .where(eq(productBatches.id, line.batchId))
              .run();
            // Total saleable stock on hand remains unchanged
          }
        }
      }

      // 3. Customer Ledger Balance Credit (Decreases outstanding receivable)
      tx.update(customers)
        .set({
          closingBalance: sql`${customers.closingBalance} - ${grandTotal}`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(customers.id, input.customerId))
        .run();

      // 4. Auto-offset against original invoice outstandings if linked
      if (input.originalInvoiceId) {
        const outRec = tx.query.customerOutstandings.findFirst({
          where: eq(customerOutstandings.invoiceId, input.originalInvoiceId),
        }).sync();

        if (outRec) {
          const offsetAmt = Math.min(outRec.balanceAmount, grandTotal);
          const newBal = outRec.balanceAmount - offsetAmt;

          tx.update(customerOutstandings)
            .set({
              paidAmount: sql`${customerOutstandings.paidAmount} + ${offsetAmt}`,
              balanceAmount: newBal,
              status: newBal <= 0.01 ? 'PAID' : 'PARTIALLY_PAID',
              lastPaymentDate: input.returnDate,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(customerOutstandings.id, outRec.id))
            .run();

          tx.update(salesReturns)
            .set({
              adjustedAmount: offsetAmt,
              balanceAmount: grandTotal - offsetAmt,
              isFullyAdjusted: offsetAmt >= grandTotal,
            })
            .where(eq(salesReturns.id, returnId))
            .run();
        }
      }

      // 5. Audit Log
      tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        action: 'SALES_RETURN_CREATE',
        entityType: 'sales_return',
        entityId: returnId,
        userId: input.operatorId || 'SYSTEM',
        newValues: JSON.stringify({
          returnNo,
          customerId: input.customerId,
          grandTotal,
          reason: input.reason,
          itemsCount: validatedLines.length,
        }),
        remarks: `Sales Return Credit Note ${returnNo} created`,
      }).run();
    });
  });

    safeRevalidatePath('/billing');
    safeRevalidatePath('/billing/returns');
    safeRevalidatePath('/stock');

    return {
      success: true,
      returnId,
      returnNo,
      grandTotal,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to process sales return',
    };
  }
}

/**
 * Fetches recent open invoices for a customer to link returns.
 */
export async function getCustomerInvoicesForReturn(customerId: string) {
  return await db.query.invoices.findMany({
    where: eq(invoices.customerId, customerId),
    orderBy: [desc(invoices.invoiceDate)],
    with: {
      items: true,
    },
    limit: 10,
  });
}
