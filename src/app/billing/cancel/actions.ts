'use server';

import { db } from '@/lib/db';
import { invoices, invoiceItems, productBatches, customers, customerOutstandings, auditLogs } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { roundToPaise } from '@/lib/business-engine/calculations';

export async function searchInvoicesForCancellation(invoiceNo?: string) {
  try {
    let whereClause = eq(invoices.isCancelled, false);
    if (invoiceNo && invoiceNo.trim()) {
      whereClause = and(eq(invoices.invoiceNo, invoiceNo.trim()), eq(invoices.isCancelled, false)) as any;
    }

    const rows = await db
      .select({
        id: invoices.id,
        invoiceNo: invoices.invoiceNo,
        invoiceDate: invoices.invoiceDate,
        customerId: invoices.customerId,
        netAmount: invoices.netAmount,
        totalQuantity: invoices.totalQuantity,
        totalItemsCount: invoices.totalItemsCount,
        dayEndLocked: invoices.dayEndLocked,
        status: invoices.status,
        customerCode: customers.code,
        customerName: customers.name,
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(whereClause)
      .orderBy(desc(invoices.invoiceDate))
      .limit(30);

    return { success: true, invoices: rows };
  } catch (err: any) {
    console.error('searchInvoicesForCancellation error:', err);
    return { success: false, error: err.message, invoices: [] };
  }
}

export async function cancelInvoice(input: {
  invoiceId: string;
  reason: string;
  operator: string;
}) {
  try {
    const inv = await db.query.invoices.findFirst({
      where: eq(invoices.id, input.invoiceId),
      with: {
        items: true,
        customer: true,
      },
    });

    if (!inv) {
      return { success: false, error: 'Invoice not found' };
    }

    if (inv.dayEndLocked) {
      return { success: false, error: 'Cannot cancel invoice: Day-End routine has already closed this period.' };
    }

    if (inv.isCancelled) {
      return { success: false, error: 'Invoice is already cancelled.' };
    }

    // 1. Revert Inventory Stock for all line items
    for (const item of inv.items) {
      const batch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, item.batchId),
      });
      if (batch) {
        const totalReturnQty = item.quantity + item.freeQuantity;
        await db
          .update(productBatches)
          .set({
            stockQty: batch.stockQty + totalReturnQty,
          })
          .where(eq(productBatches.id, item.batchId));
      }
    }

    // 2. Revert Customer Ledger Balance
    if (inv.customer) {
      const newBal = roundToPaise(inv.customer.closingBalance - inv.netAmount);
      await db
        .update(customers)
        .set({ closingBalance: newBal })
        .where(eq(customers.id, inv.customerId));
    }

    // 3. Mark Outstandings record cancelled
    await db
      .update(customerOutstandings)
      .set({
        status: 'PAID', // mark resolved/closed so it doesn't appear in outstanding dues
        balanceAmount: 0,
      })
      .where(eq(customerOutstandings.invoiceId, inv.id));

    // 4. Update Invoice Status
    await db
      .update(invoices)
      .set({
        status: 'CANCELLED',
        isCancelled: true,
        cancelledAt: new Date().toISOString(),
        cancelledReason: input.reason || 'VOIDED BY OPERATOR',
      })
      .where(eq(invoices.id, inv.id));

    // 5. Write to System Audit Log
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId: input.operator || 'ADMIN',
      action: 'INVOICE_CANCEL',
      entityType: 'invoice',
      entityId: inv.id,
      oldValues: JSON.stringify({ invoiceNo: inv.invoiceNo, netAmount: inv.netAmount, itemsCount: inv.items.length }),
      newValues: JSON.stringify({ isCancelled: true, reason: input.reason }),
      remarks: `Invoice ${inv.invoiceNo} cancelled and stock rolled back.`,
    });

    return { success: true, invoiceNo: inv.invoiceNo, amountReversed: inv.netAmount };
  } catch (err: any) {
    console.error('cancelInvoice error:', err);
    return { success: false, error: err.message };
  }
}
