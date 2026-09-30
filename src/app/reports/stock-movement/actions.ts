'use server';

import { db } from '@/lib/db';
import { products, productBatches, invoiceItems, invoices } from '@/lib/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { roundToPaise } from '@/lib/business-engine/calculations';

export async function getStockMovementAnalysis() {
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
    });

    const rows: any[] = [];
    for (const p of prods) {
      let totalStockOnHand = 0;
      let totalStockValue = 0;
      for (const b of p.batches) {
        totalStockOnHand += b.stockQty;
        totalStockValue += roundToPaise(b.stockQty * b.purchaseRate);
      }

      // Query sales velocity
      const salesResult = await db
        .select({
          totalSoldQty: sql<number>`COALESCE(SUM(${invoiceItems.quantity}), 0)`,
          totalSalesVal: sql<number>`COALESCE(SUM(${invoiceItems.netAmount}), 0)`,
        })
        .from(invoiceItems)
        .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
        .where(
          and(
            eq(invoiceItems.productId, p.id),
            eq(invoices.isCancelled, false)
          )
        );

      const sales = salesResult[0] || { totalSoldQty: 0, totalSalesVal: 0 };

      // ABC Classification: Fast (> 50 units sold), Slow (1-50 units sold), Non-Moving (0 units sold)
      let velocityTier: 'FAST' | 'SLOW' | 'NON_MOVING' = 'NON_MOVING';
      if (sales.totalSoldQty >= 50) velocityTier = 'FAST';
      else if (sales.totalSoldQty > 0) velocityTier = 'SLOW';

      rows.push({
        productId: p.id,
        code: p.code,
        name: p.name,
        company: p.company?.name || '',
        packaging: p.packaging,
        rackLocation: p.rackLocation || 'UNASSIGNED',
        totalStockOnHand,
        totalStockValue,
        totalSoldQty: sales.totalSoldQty,
        totalSalesVal: sales.totalSalesVal,
        velocityTier,
        lastSaleDate: p.lastSaleDate || 'NO RECENT SALE',
      });
    }

    // Sort by sales turnover descending
    rows.sort((a, b) => b.totalSalesVal - a.totalSalesVal);

    return { success: true, stockMovement: rows };
  } catch (err: any) {
    console.error('getStockMovementAnalysis error:', err);
    return { success: false, error: err.message, stockMovement: [] };
  }
}
