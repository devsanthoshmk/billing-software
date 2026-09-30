'use server';

import { db } from '@/lib/db';
import { invoices, purchases, salesReturns } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { roundToPaise } from '@/lib/business-engine/calculations';

export async function getComparativeAnalytics() {
  try {
    // Generate monthly aggregated buckets for current fiscal year
    const months = [
      { name: 'April 2026', key: '2026-04' },
      { name: 'May 2026', key: '2026-05' },
      { name: 'June 2026', key: '2026-06' },
      { name: 'July 2026', key: '2026-07' },
      { name: 'August 2026', key: '2026-08' },
      { name: 'September 2026', key: '2026-09' },
    ];

    const monthlyComparisons: any[] = [];
    for (const m of months) {
      const sales = await db
        .select({
          totalSales: sql<number>`COALESCE(SUM(${invoices.netAmount}), 0)`,
          billsCount: sql<number>`COALESCE(COUNT(${invoices.id}), 0)`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.isCancelled, false),
            sql`${invoices.invoiceDate} LIKE ${m.key + '%'}`
          )
        );

      const purch = await db
        .select({
          totalPurch: sql<number>`COALESCE(SUM(${purchases.netAmount}), 0)`,
        })
        .from(purchases)
        .where(
          and(
            eq(purchases.status, 'VERIFIED'),
            sql`${purchases.inwardDate} LIKE ${m.key + '%'}`
          )
        );

      const sData = sales[0] || { totalSales: 0, billsCount: 0 };
      const pData = purch[0] || { totalPurch: 0 };
      const grossMargin = roundToPaise(sData.totalSales - pData.totalPurch);

      monthlyComparisons.push({
        month: m.name,
        monthKey: m.key,
        billsCount: sData.billsCount,
        salesTurnover: sData.totalSales,
        purchaseTurnover: pData.totalPurch,
        grossMargin,
      });
    }

    return { success: true, comparisons: monthlyComparisons };
  } catch (err: any) {
    console.error('getComparativeAnalytics error:', err);
    return { success: false, error: err.message, comparisons: [] };
  }
}
