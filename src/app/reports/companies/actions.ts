'use server';

import { db } from '@/lib/db';
import { companies, products, productBatches, invoiceItems, invoices } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { roundToPaise } from '@/lib/business-engine/calculations';

export async function getCompanyWiseReports(startDate = '2026-09-01', endDate = '2026-09-30') {
  try {
    const compList = await db.query.companies.findMany({
      where: eq(companies.isActive, true),
      with: {
        products: {
          with: {
            batches: true,
          },
        },
      },
      orderBy: [companies.name],
    });

    const reportRows: any[] = [];
    for (const c of compList) {
      const productIds = c.products.map((p) => p.id);
      let totalStockOnHand = 0;
      let totalStockValue = 0;

      for (const p of c.products) {
        for (const b of p.batches) {
          totalStockOnHand += b.stockQty;
          totalStockValue += roundToPaise(b.stockQty * b.purchaseRate);
        }
      }

      // Query sales for these products
      const sales = await db
        .select({
          totalBilledQty: sql<number>`COALESCE(SUM(${invoiceItems.quantity}), 0)`,
          totalSalesValue: sql<number>`COALESCE(SUM(${invoiceItems.netAmount}), 0)`,
        })
        .from(invoiceItems)
        .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
        .where(
          and(
            eq(invoices.isCancelled, false),
            sql`${invoiceItems.productId} IN (SELECT id FROM products WHERE company_id = ${c.id})`
          )
        );

      const salesData = sales[0] || { totalBilledQty: 0, totalSalesValue: 0 };

      reportRows.push({
        companyId: c.id,
        code: c.code,
        name: c.name,
        productsCount: c.products.length,
        totalStockOnHand,
        totalStockValue,
        totalBilledQty: salesData.totalBilledQty,
        totalSalesValue: salesData.totalSalesValue,
      });
    }

    return { success: true, companyReports: reportRows };
  } catch (err: any) {
    console.error('getCompanyWiseReports error:', err);
    return { success: false, error: err.message, companyReports: [] };
  }
}
