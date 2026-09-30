'use server';

import { db } from '@/lib/db';
import { customers, customerOutstandings, areas, salesmen } from '@/lib/db/schema';
import { eq, and, gt, desc } from 'drizzle-orm';
import { calculateDateDiffInDays } from '@/lib/business-engine/invariants';

export async function getCustomerAgeingAnalysis(areaId?: string) {
  try {
    const areasList = await db.query.areas.findMany({
      where: eq(areas.isActive, true),
      orderBy: [areas.name],
    });

    const custs = await db.query.customers.findMany({
      where: eq(customers.isActive, true),
      with: {
        area: true,
        salesman: true,
        outstandings: {
          where: gt(customerOutstandings.balanceAmount, 0),
          orderBy: [customerOutstandings.invoiceDate],
        },
      },
      orderBy: [desc(customers.closingBalance)],
    });

    const currentDate = '2026-09-28';

    const ageingRows: any[] = [];
    for (const c of custs) {
      if (areaId && areaId.trim() && c.areaId !== areaId) continue;
      if (c.outstandings.length === 0 && (c.closingBalance || 0) <= 0) continue;

      let bucket0_30 = 0;
      let bucket31_60 = 0;
      let bucket61_90 = 0;
      let bucket91_plus = 0;
      let overdueAmount = 0;

      for (const bill of c.outstandings) {
        const days = calculateDateDiffInDays(bill.dueDate, currentDate);
        const billDays = calculateDateDiffInDays(bill.invoiceDate, currentDate);

        if (billDays <= 30) bucket0_30 += bill.balanceAmount;
        else if (billDays <= 60) bucket31_60 += bill.balanceAmount;
        else if (billDays <= 90) bucket61_90 += bill.balanceAmount;
        else bucket91_plus += bill.balanceAmount;

        if (days > 0) {
          overdueAmount += bill.balanceAmount;
        }
      }

      // 18% annual overdue interest (1.5% per month)
      const estimatedInterest = Math.round((bucket91_plus * 0.18 * 90) / 365 + (bucket61_90 * 0.18 * 45) / 365);

      ageingRows.push({
        customerId: c.id,
        code: c.code,
        name: c.name,
        area: c.area?.name || 'LOCAL',
        salesman: c.salesman?.name || 'DIRECT',
        creditLimit: c.creditLimit,
        creditDays: c.creditDays,
        closingBalance: c.closingBalance,
        bucket0_30,
        bucket31_60,
        bucket61_90,
        bucket91_plus,
        overdueAmount,
        estimatedInterest,
        billsCount: c.outstandings.length,
      });
    }

    return { success: true, areas: areasList, ageing: ageingRows };
  } catch (err: any) {
    console.error('getCustomerAgeingAnalysis error:', err);
    return { success: false, error: err.message, areas: [], ageing: [] };
  }
}
