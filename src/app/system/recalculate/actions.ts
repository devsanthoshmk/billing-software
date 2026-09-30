'use server';

import { db } from '@/lib/db';
import { products, productBatches, customers, customerOutstandings, suppliers, purchases, supplierPayments, auditLogs } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { roundToPaise } from '@/lib/business-engine/calculations';

export async function runSystemRecalculation(operator = 'ADMIN') {
  try {
    // 1. Recalculate Product totalStockOnHand from active batches
    const allProducts = await db.query.products.findMany({
      with: { batches: true },
    });

    let fixedProductsCount = 0;
    for (const p of allProducts) {
      const actualSum = p.batches.reduce((acc, b) => acc + (b.stockQty || 0), 0);
      if (p.totalStockOnHand !== actualSum) {
        await db
          .update(products)
          .set({ totalStockOnHand: actualSum })
          .where(eq(products.id, p.id));
        fixedProductsCount++;
      }
    }

    // 2. Recalculate Customer Closing Balances from open outstandings
    const allCustomers = await db.query.customers.findMany({
      with: { outstandings: true },
    });

    let fixedCustomersCount = 0;
    for (const c of allCustomers) {
      const openTotal = c.outstandings.reduce((acc, o) => acc + (o.balanceAmount || 0), 0);
      const targetBal = roundToPaise(c.openingBalance + openTotal);
      if (Math.abs(c.closingBalance - targetBal) > 0.01) {
        await db
          .update(customers)
          .set({ closingBalance: targetBal })
          .where(eq(customers.id, c.id));
        fixedCustomersCount++;
      }
    }

    // 3. Log Audit
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId: operator,
      action: 'SYSTEM_RECALCULATE',
      entityType: 'ledger',
      entityId: 'global',
      remarks: `Recalculated ${allProducts.length} products (${fixedProductsCount} updated) and ${allCustomers.length} customers (${fixedCustomersCount} updated).`,
    });

    return {
      success: true,
      totalProducts: allProducts.length,
      fixedProducts: fixedProductsCount,
      totalCustomers: allCustomers.length,
      fixedCustomers: fixedCustomersCount,
    };
  } catch (err: any) {
    console.error('runSystemRecalculation error:', err);
    return { success: false, error: err.message };
  }
}
