'use server';

import { db } from '@/lib/db';
import { products, productBatches, auditLogs } from '@/lib/db/schema';
import { eq, like, or } from 'drizzle-orm';
import { roundToPaise } from '@/lib/business-engine/calculations';

export async function searchBatchesForRackManagement(query?: string) {
  try {
    const prods = await db.query.products.findMany({
      where: eq(products.isActive, true),
      with: {
        company: true,
        batches: {
          where: eq(productBatches.isActive, true),
        },
      },
      orderBy: [products.name],
      limit: 50,
    });

    const rows: any[] = [];
    for (const p of prods) {
      if (query && query.trim()) {
        const q = query.toLowerCase().trim();
        const matches = p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.rackLocation || '').toLowerCase().includes(q);
        if (!matches) continue;
      }

      for (const b of p.batches) {
        rows.push({
          productId: p.id,
          productCode: p.code,
          productName: p.name,
          companyName: p.company?.name || 'GENERIC',
          packaging: p.packaging,
          rackLocation: p.rackLocation || 'UNASSIGNED',
          batchId: b.id,
          batchNo: b.batchNo,
          expiryDate: b.expiryDate,
          purchaseRate: b.purchaseRate,
          sellingRate: b.sellingRate,
          secondaryRate: b.secondaryRate || b.sellingRate,
          mrp: b.mrp,
          stockQty: b.stockQty,
        });
      }
    }

    return { success: true, batches: rows };
  } catch (err: any) {
    console.error('searchBatchesForRackManagement error:', err);
    return { success: false, error: err.message, batches: [] };
  }
}

export async function updateBatchRackAndRates(input: {
  batchId: string;
  productId: string;
  rackLocation: string;
  sellingRate: number;
  secondaryRate: number;
  mrp: number;
  operator: string;
}) {
  try {
    if (input.sellingRate > input.mrp) {
      return { success: false, error: 'Selling Rate cannot exceed MRP (DPCO Violation)' };
    }

    const currentBatch = await db.query.productBatches.findFirst({
      where: eq(productBatches.id, input.batchId),
    });

    if (!currentBatch) {
      return { success: false, error: 'Batch not found' };
    }

    // Update Product Rack Location
    await db
      .update(products)
      .set({ rackLocation: input.rackLocation.toUpperCase().trim() })
      .where(eq(products.id, input.productId));

    // Update Batch Rates
    await db
      .update(productBatches)
      .set({
        sellingRate: roundToPaise(input.sellingRate),
        secondaryRate: roundToPaise(input.secondaryRate),
        mrp: roundToPaise(input.mrp),
      })
      .where(eq(productBatches.id, input.batchId));

    // Audit log
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId: input.operator || 'ADMIN',
      action: 'RATE_OVERRIDE',
      entityType: 'batch',
      entityId: input.batchId,
      oldValues: JSON.stringify({
        sellingRate: currentBatch.sellingRate,
        mrp: currentBatch.mrp,
      }),
      newValues: JSON.stringify({
        rackLocation: input.rackLocation,
        sellingRate: input.sellingRate,
        mrp: input.mrp,
      }),
      remarks: `Rate/Rack modified for batch ${currentBatch.batchNo}`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('updateBatchRackAndRates error:', err);
    return { success: false, error: err.message };
  }
}
