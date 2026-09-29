'use server';

import { db } from '../../../lib/db';
import { products, productBatches } from '../../../lib/db/schema/masters';
import { auditLogs } from '../../../lib/db/schema/system';
import { eq, sql, desc, asc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {}
}

export type AdjustmentReason =
  | 'DAMAGE'        // Broken goods -> moved to quarantineQty
  | 'EXPIRED'       // Expired stock pulled from shelf -> moved to quarantineQty
  | 'THEFT_SHRINK'  // Pilferage / Unaccounted loss -> direct deduction
  | 'LAB_LOSS'      // Testing / Sample loss -> direct deduction
  | 'FOUND'         // Physical excess found -> stock increment
  | 'DATA_FIX';     // Data entry error correction

export interface StockAdjustmentLineInput {
  productId: string;
  batchId: string;
  systemQty: number;
  physicalCountQty: number;
  reason: AdjustmentReason;
  remarks?: string;
}

export interface StockAdjustmentInput {
  adjustmentDate: string; // 'YYYY-MM-DD'
  operatorId?: string;
  adjustments: StockAdjustmentLineInput[];
}

export interface ReconcileResult {
  success: boolean;
  adjustedCount?: number;
  auditEntries?: any[];
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
 * Physical Count Reconciliation Action.
 * Replicates ADJDTL.PRG / EXPADJMT.PRG.
 */
export async function reconcileStockCount(
  input: StockAdjustmentInput
): Promise<ReconcileResult> {
  try {
    if (!input.adjustments || input.adjustments.length === 0) {
      throw new Error('At least one item required for stock adjustment');
    }

    const auditEntries: any[] = [];

    withDbRetry(() => {
      db.transaction((tx) => {
      for (const adj of input.adjustments) {
        const batch = tx.query.productBatches.findFirst({
          where: eq(productBatches.id, adj.batchId),
        }).sync();

        if (!batch) throw new Error(`Batch not found: ${adj.batchId}`);

        const systemQty = batch.stockQty;
        const variance = adj.physicalCountQty - systemQty;

        if (variance === 0) continue; // No variance

        if (variance > 0) {
          // EXCESS (Stock Found): Increase saleable stock
          tx.update(productBatches)
            .set({
              stockQty: sql`${productBatches.stockQty} + ${variance}`,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(productBatches.id, adj.batchId))
            .run();

          tx.update(products)
            .set({
              totalStockOnHand: sql`${products.totalStockOnHand} + ${variance}`,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(products.id, adj.productId))
            .run();
        } else {
          // SHORTAGE: Deficit
          const absDeficit = Math.abs(variance);

          if (batch.stockQty < absDeficit) {
            throw new Error(
              `Cannot adjust shortage exceeding available batch stock! Stock: ${batch.stockQty}, Deficit: ${absDeficit}`
            );
          }

          if (adj.reason === 'DAMAGE' || adj.reason === 'EXPIRED') {
            // Move from saleable stock to quarantine
            tx.update(productBatches)
              .set({
                stockQty: sql`${productBatches.stockQty} - ${absDeficit}`,
                quarantineQty: sql`${productBatches.quarantineQty} + ${absDeficit}`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
              })
              .where(eq(productBatches.id, adj.batchId))
              .run();
          } else {
            // Direct write-off (THEFT_SHRINK, LAB_LOSS, DATA_FIX)
            tx.update(productBatches)
              .set({
                stockQty: sql`${productBatches.stockQty} - ${absDeficit}`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
              })
              .where(eq(productBatches.id, adj.batchId))
              .run();
          }

          // Decrement product totalStockOnHand
          tx.update(products)
            .set({
              totalStockOnHand: sql`${products.totalStockOnHand} - ${absDeficit}`,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(products.id, adj.productId))
            .run();
        }

        auditEntries.push({
          batchId: adj.batchId,
          productId: adj.productId,
          systemQty,
          physicalQty: adj.physicalCountQty,
          variance,
          reason: adj.reason,
        });

        // Audit Log Entry
        tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          action: 'STOCK_ADJUSTMENT',
          entityType: 'batch',
          entityId: adj.batchId,
          userId: input.operatorId || 'SYSTEM',
          oldValues: JSON.stringify({ stockQty: systemQty, quarantineQty: batch.quarantineQty }),
          newValues: JSON.stringify({
            physicalCountQty: adj.physicalCountQty,
            variance,
            reason: adj.reason,
          }),
          remarks: `Physical count reconciliation: ${adj.reason} (${variance > 0 ? '+' : ''}${variance} units). ${adj.remarks ?? ''}`,
        }).run();
      }
    });
  });

    safeRevalidatePath('/stock');
    safeRevalidatePath('/stock/adjustments');

    return {
      success: true,
      adjustedCount: auditEntries.length,
      auditEntries,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- Part B: Batch Rate Modification ---

export interface RateModificationInput {
  batchId: string;
  purchaseRate: number;
  sellingRate: number;
  secondaryRate?: number;
  mrp: number;
  reason?: string;
  operatorId?: string;
  supervisorBypass?: boolean;
}

export interface RateModificationResult {
  success: boolean;
  batchId?: string;
  oldValues?: any;
  newValues?: any;
  error?: string;
}

/**
 * Modifies rates for an individual batch subject to strict pricing bounds.
 * Parity with RATEADD.PRG, PURCHASE.PRG:2186, INVPRE.PRG:1710.
 */
export async function modifyBatchRates(
  input: RateModificationInput
): Promise<RateModificationResult> {
  try {
    if (input.purchaseRate <= 0) throw new Error('Purchase Rate is Zero or negative!');
    if (input.sellingRate <= 0) throw new Error('Selling Rate is Zero!');
    if (input.mrp <= 0) throw new Error('MRP is Zero!');
    if (input.sellingRate > input.mrp) {
      throw new Error(
        `Selling Rate (Rs. ${input.sellingRate.toFixed(2)}) cannot exceed MRP (Rs. ${input.mrp.toFixed(2)}) under DPCO regulations!`
      );
    }
    if (input.purchaseRate > input.mrp) {
      throw new Error(
        `Purchase Rate (Rs. ${input.purchaseRate.toFixed(2)}) cannot exceed MRP (Rs. ${input.mrp.toFixed(2)})!`
      );
    }
    if (input.sellingRate < input.purchaseRate && !input.supervisorBypass) {
      throw new Error(
        `Rate is less than Purchase Rate! Negative margin prohibited without supervisor override.`
      );
    }

    const batch = db.query.productBatches.findFirst({
      where: eq(productBatches.id, input.batchId),
    }).sync();

    if (!batch) throw new Error(`Batch not found: ${input.batchId}`);

    const oldValues = {
      purchaseRate: batch.purchaseRate,
      sellingRate: batch.sellingRate,
      secondaryRate: batch.secondaryRate,
      mrp: batch.mrp,
    };

    const newValues = {
      purchaseRate: input.purchaseRate,
      sellingRate: input.sellingRate,
      secondaryRate: input.secondaryRate ?? batch.secondaryRate ?? 0,
      mrp: input.mrp,
    };

    withDbRetry(() => {
      db.transaction((tx) => {
        tx.update(productBatches)
          .set({
            ...newValues,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(productBatches.id, input.batchId))
          .run();

        tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          action: 'RATE_MODIFICATION',
          entityType: 'batch',
          entityId: input.batchId,
          userId: input.operatorId || 'SYSTEM',
          oldValues: JSON.stringify(oldValues),
          newValues: JSON.stringify(newValues),
          remarks: `Rate modified: ${input.reason || 'General price revision'}`,
        }).run();
      });
    });

    safeRevalidatePath('/stock');
    safeRevalidatePath('/stock/adjustments');
    safeRevalidatePath('/masters/products');

    return {
      success: true,
      batchId: input.batchId,
      oldValues,
      newValues,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Loads all batches with their product info for reconciliation and rate adjustments.
 */
export async function getBatchesWithProducts() {
  const batches = await db.query.productBatches.findMany({
    orderBy: [asc(productBatches.batchNo)],
    with: {
      product: true,
    },
  });

  return batches;
}
