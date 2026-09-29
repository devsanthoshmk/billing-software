'use server';

import { db } from '../../../lib/db';
import { products, productBatches, suppliers, taxSlabs } from '../../../lib/db/schema/masters';
import { purchaseReturns, purchaseReturnItems, purchases, debitNotes } from '../../../lib/db/schema/transactions';
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

export interface PurchaseReturnLineItemInput {
  productId: string;
  batchId: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  freeQuantity?: number;
  purchaseRate: number;
  mrp: number;
  taxCode: string;
}

export interface PurchaseReturnInput {
  supplierId: string;
  purchaseId?: string; // Optional link to original inward bill
  returnDate: string;  // 'YYYY-MM-DD'
  rateBasis?: 'P' | 'S'; // P = Purchase Rate, S = Selling Rate
  discountPct?: number;
  lrNo?: string;
  lrDate?: string;
  transportName?: string;
  remarks?: string;
  operatorId?: string;
  lineItems: PurchaseReturnLineItemInput[];
}

export interface PurchaseReturnResult {
  success: boolean;
  returnId?: string;
  returnNo?: string;
  netAmount?: number;
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
 * Creates Purchase Return atomically in Drizzle ORM.
 * Replicates PRETPRE.PRG.
 */
export async function createPurchaseReturn(
  input: PurchaseReturnInput
): Promise<PurchaseReturnResult> {
  try {
    if (!input.supplierId) throw new Error('Supplier is mandatory');
    if (!input.lineItems || input.lineItems.length === 0) {
      throw new Error('At least one return item is required');
    }

    const supplier = db.query.suppliers.findFirst({
      where: eq(suppliers.id, input.supplierId),
    }).sync();
    if (!supplier) throw new Error('Supplier not found');

    const allTaxSlabs = db.select().from(taxSlabs).all();
    const taxMap = new Map(allTaxSlabs.map((t) => [t.code, t]));

    let totalGross = 0;
    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    // Validate stock availability before transaction
    for (const [idx, item] of input.lineItems.entries()) {
      const lineNum = idx + 1;
      if (item.quantity <= 0) {
        throw new Error(`Line ${lineNum}: Quantity must be greater than zero`);
      }
      if (item.purchaseRate <= 0) {
        throw new Error(`Line ${lineNum}: Purchase rate must be greater than zero`);
      }
      if (item.freeQuantity !== undefined && item.freeQuantity < 0) {
        throw new Error(`Line ${lineNum}: Free quantity cannot be negative`);
      }
      const totalReturnUnits = item.quantity + (item.freeQuantity ?? 0);

      const batch = db.query.productBatches.findFirst({
        where: eq(productBatches.id, item.batchId),
      }).sync();

      if (!batch) throw new Error(`Line ${lineNum}: Batch not found: ${item.batchNo}`);
      if (batch.stockQty < totalReturnUnits) {
        throw new Error(
          `Line ${lineNum}: Insufficient stock to return! Available: ${batch.stockQty}, Requested: ${totalReturnUnits}`
        );
      }

      const gross = roundToPaise(item.quantity * item.purchaseRate);
      const disc = roundToPaise((gross * ((input.discountPct ?? 0) / 100)));
      const taxable = gross - disc;

      const slab = taxMap.get(item.taxCode);
      const cgst = slab ? roundToPaise((taxable * (slab.cgstRate / 100))) : 0;
      const sgst = slab ? roundToPaise((taxable * (slab.sgstRate / 100))) : 0;

      totalGross += gross;
      totalTaxable += taxable;
      totalCgst += cgst;
      totalSgst += sgst;
    }

    const netAmount = Math.round(totalTaxable + totalCgst + totalSgst + totalIgst);
    const existingPr = db.select({ returnNo: purchaseReturns.returnNo }).from(purchaseReturns).all();
    const prSet = new Set(existingPr.map((p) => p.returnNo));
    let prCounter = existingPr.length + 1;
    let returnNo = `PR-${prCounter.toString().padStart(6, '0')}`;
    while (prSet.has(returnNo)) {
      prCounter++;
      returnNo = `PR-${prCounter.toString().padStart(6, '0')}`;
    }
    const returnId = crypto.randomUUID();

    withDbRetry(() => {
      db.transaction((tx) => {
      // 1. Insert Purchase Return Header
      tx.insert(purchaseReturns).values({
        id: returnId,
        returnNo,
        returnDate: input.returnDate,
        supplierId: input.supplierId,
        purchaseId: input.purchaseId || null,
        totalGrossAmount: totalGross,
        discountAmount: totalGross - totalTaxable,
        taxableAmount: totalTaxable,
        cgstAmount: totalCgst,
        sgstAmount: totalSgst,
        igstAmount: totalIgst,
        roundOff: 0,
        netAmount,
        adjustedAmount: 0,
        balanceAmount: netAmount,
        isFullyAdjusted: false,
        lrNo: input.lrNo || null,
        lrDate: input.lrDate || null,
        transportName: input.transportName || null,
        remarks: input.remarks || null,
      }).run();

      // 2. Insert Items & Decrement Inventory
      for (const [idx, item] of input.lineItems.entries()) {
        const totalUnits = item.quantity + (item.freeQuantity ?? 0);
        const slab = taxMap.get(item.taxCode);
        const gross = roundToPaise(item.quantity * item.purchaseRate);
        const taxable = gross;
        const cgst = slab ? roundToPaise((taxable * (slab.cgstRate / 100))) : 0;
        const sgst = slab ? roundToPaise((taxable * (slab.sgstRate / 100))) : 0;

        tx.insert(purchaseReturnItems).values({
          id: crypto.randomUUID(),
          purchaseReturnId: returnId,
          sortOrder: idx + 1,
          productId: item.productId,
          batchId: item.batchId,
          batchNo: item.batchNo,
          expiryDate: item.expiryDate,
          quantity: item.quantity,
          freeQuantity: item.freeQuantity ?? 0,
          purchaseRate: item.purchaseRate,
          mrp: item.mrp,
          taxableAmount: taxable,
          taxCode: item.taxCode,
          cgstRate: slab?.cgstRate ?? 0,
          cgstAmount: cgst,
          sgstRate: slab?.sgstRate ?? 0,
          sgstAmount: sgst,
          igstRate: 0,
          igstAmount: 0,
          netAmount: taxable + cgst + sgst,
        }).run();

        // Decrement Batch Stock
        tx.update(productBatches)
          .set({
            stockQty: sql`${productBatches.stockQty} - ${totalUnits}`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(productBatches.id, item.batchId))
          .run();

        // Decrement Master Stock On Hand
        tx.update(products)
          .set({
            totalStockOnHand: sql`${products.totalStockOnHand} - ${totalUnits}`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(products.id, item.productId))
          .run();
      }

      // 3. Debit Supplier Payable Balance
      tx.update(suppliers)
        .set({
          currentBalance: sql`${suppliers.currentBalance} - ${netAmount}`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(suppliers.id, input.supplierId))
        .run();

      // 4. If linked to an original purchase bill, reduce its balance
      if (input.purchaseId) {
        tx.update(purchases)
          .set({
            balanceAmount: sql`MAX(0, ${purchases.balanceAmount} - ${netAmount})`,
            paymentStatus: sql`CASE WHEN (${purchases.balanceAmount} - ${netAmount}) <= 0 THEN 'PAID' ELSE 'PARTIAL' END`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(purchases.id, input.purchaseId))
          .run();
      }

      // 5. Issue Debit Note Voucher
      const existingDn = db.select({ noteNo: debitNotes.noteNo }).from(debitNotes).all();
      const dnSet = new Set(existingDn.map((d) => d.noteNo));
      let dnCounter = existingDn.length + 1;
      let debitNoteNo = `DN-${dnCounter.toString().padStart(6, '0')}`;
      while (dnSet.has(debitNoteNo)) {
        dnCounter++;
        debitNoteNo = `DN-${dnCounter.toString().padStart(6, '0')}`;
      }

      tx.insert(debitNotes).values({
        id: crypto.randomUUID(),
        noteNo: debitNoteNo,
        date: input.returnDate,
        partyType: 'SUPPLIER',
        partyId: input.supplierId,
        noteType: 'PURCHASE_RETURN',
        referenceInvoiceId: input.purchaseId || null,
        taxableAmount: totalTaxable,
        cgstAmount: totalCgst,
        sgstAmount: totalSgst,
        igstAmount: totalIgst,
        totalAmount: netAmount,
        adjustedAmount: 0,
        balanceAmount: netAmount,
        status: 'OPEN',
        remarks: `Auto-generated debit note for Purchase Return ${returnNo}`,
      }).run();

      // 6. Audit Log
      tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        action: 'PURCHASE_RETURN_CREATE',
        entityType: 'purchase_return',
        entityId: returnId,
        userId: input.operatorId ?? 'SYSTEM',
        newValues: JSON.stringify({ returnNo, supplierId: input.supplierId, netAmount }),
        remarks: `Purchase Return ${returnNo} executed. Stock deducted and supplier debited.`,
      }).run();
    });
  });

    safeRevalidatePath('/stock');
    safeRevalidatePath('/stock/returns');

    return { success: true, returnId, returnNo, netAmount };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Loads recent purchase bills for a supplier to link returns.
 */
export async function getSupplierPurchasesForReturn(supplierId: string) {
  return await db.query.purchases.findMany({
    where: eq(purchases.supplierId, supplierId),
    orderBy: [desc(purchases.inwardDate)],
    with: { items: true },
    limit: 10,
  });
}
