'use server';

import { db } from '@/lib/db';
import { customers, customerReceipts, customerOutstandings, customerReceiptAllocations } from '@/lib/db/schema';
import { eq, gt, and } from 'drizzle-orm';
import { roundToPaise } from '@/lib/business-engine/calculations';

export async function getUnallocatedReceipts() {
  try {
    const unallocated = await db
      .select({
        receiptId: customerReceipts.id,
        receiptNo: customerReceipts.receiptNo,
        receiptDate: customerReceipts.receiptDate,
        paymentMode: customerReceipts.paymentMode,
        totalAmount: customerReceipts.totalAmount,
        unallocatedAmount: customerReceipts.unallocatedAmount,
        customerId: customerReceipts.customerId,
        customerCode: customers.code,
        customerName: customers.name,
      })
      .from(customerReceipts)
      .innerJoin(customers, eq(customerReceipts.customerId, customers.id))
      .where(gt(customerReceipts.unallocatedAmount, 0))
      .orderBy(customerReceipts.receiptDate);

    return { success: true, receipts: unallocated };
  } catch (err: any) {
    console.error('getUnallocatedReceipts error:', err);
    return { success: false, error: err.message, receipts: [] };
  }
}

export async function autoAllocateOnAccountReceipt(receiptId: string) {
  try {
    const receipt = await db.query.customerReceipts.findFirst({
      where: eq(customerReceipts.id, receiptId),
    });

    if (!receipt || receipt.unallocatedAmount <= 0) {
      return { success: false, error: 'No unallocated amount available on this receipt' };
    }

    // Find open outstandings for this customer
    const openBills = await db.query.customerOutstandings.findMany({
      where: and(
        eq(customerOutstandings.customerId, receipt.customerId),
        gt(customerOutstandings.balanceAmount, 0)
      ),
      orderBy: [customerOutstandings.invoiceDate], // FIFO allocation
    });

    if (openBills.length === 0) {
      return { success: false, error: 'No open unpaid invoices found for this customer' };
    }

    let remainingReceiptAmt = receipt.unallocatedAmount;
    let allocatedTotal = 0;

    for (const bill of openBills) {
      if (remainingReceiptAmt <= 0) break;

      const toAllocate = Math.min(bill.balanceAmount, remainingReceiptAmt);

      await db.insert(customerReceiptAllocations).values({
        id: crypto.randomUUID(),
        receiptId: receipt.id,
        outstandingId: bill.id,
        invoiceId: bill.invoiceId,
        allocatedAmount: toAllocate,
        discountAmount: 0,
      });

      const newBillBal = roundToPaise(bill.balanceAmount - toAllocate);
      const newBillPaid = roundToPaise(bill.paidAmount + toAllocate);

      await db
        .update(customerOutstandings)
        .set({
          balanceAmount: newBillBal,
          paidAmount: newBillPaid,
          status: newBillBal <= 0 ? 'PAID' : 'PARTIALLY_PAID',
          lastPaymentDate: receipt.receiptDate,
        })
        .where(eq(customerOutstandings.id, bill.id));

      remainingReceiptAmt = roundToPaise(remainingReceiptAmt - toAllocate);
      allocatedTotal = roundToPaise(allocatedTotal + toAllocate);
    }

    // Update unallocated balance on receipt
    await db
      .update(customerReceipts)
      .set({
        unallocatedAmount: remainingReceiptAmt,
      })
      .where(eq(customerReceipts.id, receipt.id));

    return {
      success: true,
      allocatedTotal,
      remainingUnallocated: remainingReceiptAmt,
    };
  } catch (err: any) {
    console.error('autoAllocateOnAccountReceipt error:', err);
    return { success: false, error: err.message };
  }
}
