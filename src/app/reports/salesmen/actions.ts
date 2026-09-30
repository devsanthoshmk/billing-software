'use server';

import { db } from '@/lib/db';
import { salesmen, invoices, areas } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { roundToPaise } from '@/lib/business-engine/calculations';

export async function getSalesmanPerformance(startDate = '2026-09-01', endDate = '2026-09-30') {
  try {
    const smList = await db.query.salesmen.findMany({
      where: eq(salesmen.isActive, true),
      orderBy: [salesmen.name],
    });

    const reportRows: any[] = [];
    for (const sm of smList) {
      // Query sales performance
      const salesResult = await db
        .select({
          billsCount: sql<number>`COALESCE(COUNT(${invoices.id}), 0)`,
          grossTurnover: sql<number>`COALESCE(SUM(${invoices.subtotalGross}), 0)`,
          netTurnover: sql<number>`COALESCE(SUM(${invoices.netAmount}), 0)`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.salesmanId, sm.id),
            eq(invoices.isCancelled, false)
          )
        );

      const data = salesResult[0] || { billsCount: 0, grossTurnover: 0, netTurnover: 0 };
      const commissionRate = sm.localCommissionPct || 1.5;
      const commissionEarned = roundToPaise((data.netTurnover * commissionRate) / 100);

      reportRows.push({
        salesmanId: sm.id,
        code: sm.code,
        name: sm.name,
        phone: sm.phone || '-',
        localCommissionPct: sm.localCommissionPct,
        billsCount: data.billsCount,
        grossTurnover: data.grossTurnover,
        netTurnover: data.netTurnover,
        commissionEarned,
      });
    }

    return { success: true, salesmenPerformance: reportRows };
  } catch (err: any) {
    console.error('getSalesmanPerformance error:', err);
    return { success: false, error: err.message, salesmenPerformance: [] };
  }
}
