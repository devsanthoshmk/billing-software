'use server';

import { db } from '@/lib/db';
import { systemConfig, invoices, purchases, customerReceipts, supplierPayments, auditLogs } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export async function executeMonthEndClosing(closingMonth: string, operator = 'ADMIN') {
  try {
    const config = await db.query.systemConfig.findFirst();

    // Lock all transactions up to end of this month
    await db
      .update(invoices)
      .set({ dayEndLocked: true })
      .where(sql`${invoices.invoiceDate} LIKE ${closingMonth + '%'}`);

    await db
      .update(purchases)
      .set({ dayEndLocked: true })
      .where(sql`${purchases.inwardDate} LIKE ${closingMonth + '%'}`);

    await db
      .update(customerReceipts)
      .set({ dayEndLocked: true })
      .where(sql`${customerReceipts.receiptDate} LIKE ${closingMonth + '%'}`);

    await db
      .update(supplierPayments)
      .set({ dayEndLocked: true })
      .where(sql`${supplierPayments.paymentDate} LIKE ${closingMonth + '%'}`);

    // Log Audit
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId: operator,
      action: 'MONTH_END_CLOSE',
      entityType: 'financial_period',
      entityId: closingMonth,
      remarks: `Month-End closing finalized for period ${closingMonth}. All ledger vouchers locked against retroactive edits.`,
    });

    return { success: true, closedMonth: closingMonth };
  } catch (err: any) {
    console.error('executeMonthEndClosing error:', err);
    return { success: false, error: err.message };
  }
}
