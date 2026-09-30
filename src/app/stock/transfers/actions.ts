'use server';

import { db } from '@/lib/db';
import { products, productBatches, auditLogs } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function getStockTransferInitialData() {
  try {
    const prods = await db.query.products.findMany({
      where: eq(products.isActive, true),
      with: {
        batches: {
          where: eq(productBatches.isActive, true),
        },
      },
      orderBy: [products.name],
    });

    return { success: true, products: prods };
  } catch (err: any) {
    console.error('getStockTransferInitialData error:', err);
    return { success: false, error: err.message, products: [] };
  }
}

export async function recordStockTransfer(input: {
  transferDate: string;
  sourceDepot: string;
  destinationDepot: string;
  transfers: {
    productId: string;
    batchId: string;
    batchNo: string;
    quantity: number;
    destinationRack?: string;
  }[];
  operator: string;
}) {
  try {
    if (!input.transfers || input.transfers.length === 0) {
      return { success: false, error: 'No items to transfer' };
    }

    const transferRef = `TRF-${Date.now().toString().slice(-6)}`;

    for (const t of input.transfers) {
      const batch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, t.batchId),
      });

      if (!batch || batch.stockQty < t.quantity) {
        return {
          success: false,
          error: `Insufficient stock in batch ${t.batchNo}. Available: ${batch?.stockQty || 0}`,
        };
      }

      // Decrement source batch stock
      await db
        .update(productBatches)
        .set({
          stockQty: batch.stockQty - t.quantity,
        })
        .where(eq(productBatches.id, t.batchId));

      // Create / update destination batch record
      const destBatchNo = `${batch.batchNo}-${input.destinationDepot.slice(0, 3).toUpperCase()}`;
      const existingDest = await db.query.productBatches.findFirst({
        where: eq(productBatches.batchNo, destBatchNo),
      });

      if (existingDest) {
        await db
          .update(productBatches)
          .set({
            stockQty: existingDest.stockQty + t.quantity,
          })
          .where(eq(productBatches.id, existingDest.id));
      } else {
        await db.insert(productBatches).values({
          id: crypto.randomUUID(),
          productId: t.productId,
          batchNo: destBatchNo,
          expiryDate: batch.expiryDate,
          purchaseRate: batch.purchaseRate,
          sellingRate: batch.sellingRate,
          secondaryRate: batch.secondaryRate,
          mrp: batch.mrp,
          stockQty: t.quantity,
          taxCode: batch.taxCode,
          schemeThreshold: batch.schemeThreshold,
          schemeFreeQty: batch.schemeFreeQty,
        });
      }

      // Log in audit trail
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        userId: input.operator || 'ADMIN',
        action: 'STOCK_TRANSFER',
        entityType: 'batch',
        entityId: t.batchId,
        oldValues: JSON.stringify({ source: input.sourceDepot, stock: batch.stockQty }),
        newValues: JSON.stringify({
          dest: input.destinationDepot,
          qty: t.quantity,
          transferRef,
        }),
        remarks: `Transferred ${t.quantity} units of ${t.batchNo} from ${input.sourceDepot} to ${input.destinationDepot}`,
      });
    }

    return { success: true, transferRef, totalItems: input.transfers.length };
  } catch (err: any) {
    console.error('recordStockTransfer error:', err);
    return { success: false, error: err.message };
  }
}
