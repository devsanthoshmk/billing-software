'use server';

import { db } from '@/lib/db';
import { products, productBatches, companies } from '@/lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';

export async function getMultiMrpProducts() {
  try {
    const prods = await db.query.products.findMany({
      where: eq(products.isActive, true),
      with: {
        company: true,
        batches: {
          where: and(eq(productBatches.isActive, true), gt(productBatches.stockQty, 0)),
        },
      },
      orderBy: [products.name],
    });

    // Find products that have more than 1 distinct MRP across in-stock batches
    const multiMrpList: any[] = [];
    for (const p of prods) {
      const distinctMrps = Array.from(new Set(p.batches.map((b) => b.mrp)));
      if (distinctMrps.length > 1) {
        multiMrpList.push({
          productId: p.id,
          code: p.code,
          name: p.name,
          company: p.company?.name || 'GENERIC',
          packaging: p.packaging,
          distinctMrpCount: distinctMrps.length,
          mrpRange: `₹ ${Math.min(...distinctMrps).toFixed(2)} - ₹ ${Math.max(...distinctMrps).toFixed(2)}`,
          batches: p.batches.map((b) => ({
            batchId: b.id,
            batchNo: b.batchNo,
            expiryDate: b.expiryDate,
            purchaseRate: b.purchaseRate,
            sellingRate: b.sellingRate,
            mrp: b.mrp,
            stockQty: b.stockQty,
          })),
        });
      }
    }

    return { success: true, multiMrpProducts: multiMrpList };
  } catch (err: any) {
    console.error('getMultiMrpProducts error:', err);
    return { success: false, error: err.message, multiMrpProducts: [] };
  }
}
