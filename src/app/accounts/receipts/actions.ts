'use server';

import { db, sqlite } from '@/lib/db';
import {
  customerReceipts,
  customerReceiptAllocations,
  customerOutstandings,
  chequeRegister,
} from '@/lib/db/schema/ledgers';
import { customers } from '@/lib/db/schema/masters';
import { auditLogs, systemConfig } from '@/lib/db/schema/system';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { allocateCustomerPayment, OpenBill } from '@/lib/business-engine';
import { checkDateIsClosed } from '@/app/system/day-end/actions';
import crypto from 'crypto';

export interface CustomerReceiptLineInput {
  outstandingId: string;
  invoiceId: string;
  allocatedAmount: number;
  discountAmount?: number;
}

export interface CustomerReceiptInput {
  customerId: string;
  receiptDate: string; // 'YYYY-MM-DD'
  paymentMode: 'CASH' | 'CHEQUE' | 'NEFT_RTGS' | 'UPI' | 'CREDIT_NOTE_ADJUSTMENT';
  totalAmount: number;
  discountAllowed?: number;
  referenceNo?: string;
  referenceDate?: string;
  bankName?: string;
  branchName?: string;
  narration?: string;
  operatorId?: string;
  allocations?: CustomerReceiptLineInput[];
}

export interface ReceiptResult {
  success: boolean;
  receiptId?: string;
  receiptNo?: string;
  unallocatedAmount?: number;
  error?: string;
}

export async function getCustomersLookup(): Promise<{ id: string; code: string; name: string; closingBalance: number; creditLimit: number; address: string }[]> {
  const rows = sqlite.prepare(`
    SELECT id, code, name, closing_balance AS closingBalance, credit_limit AS creditLimit, address_line1 AS address
    FROM customers
    WHERE is_blocked = 0
    ORDER BY name ASC
  `).all() as any[];
  return rows.map(r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    closingBalance: Number(r.closingBalance || 0),
    creditLimit: Number(r.creditLimit || 0),
    address: r.address || '',
  }));
}

export async function getNextReceiptNo(): Promise<string> {
  const row = sqlite.prepare(`
    SELECT receipt_no FROM customer_receipts 
    ORDER BY receipt_no DESC LIMIT 1
  `).get() as { receipt_no?: string } | undefined;

  if (!row || !row.receipt_no) {
    return 'RCT-000101';
  }

  const match = row.receipt_no.match(/RCT-(\d+)/);
  if (match) {
    const nextNum = parseInt(match[1], 10) + 1;
    return `RCT-${String(nextNum).padStart(6, '0')}`;
  }

  const countRow = sqlite.prepare('SELECT COUNT(*) as count FROM customer_receipts').get() as { count: number };
  return `RCT-${String(countRow.count + 101).padStart(6, '0')}`;
}

export async function getCustomerOutstandings(customerId: string): Promise<OpenBill[]> {
  const rows = sqlite.prepare(`
    SELECT 
      id,
      invoice_id AS invoiceId,
      invoice_no AS invoiceNo,
      invoice_date AS invoiceDate,
      due_date AS dueDate,
      original_amount AS originalAmount,
      paid_amount AS paidAmount,
      balance_amount AS balanceAmount,
      cash_discount_eligible AS cashDiscountEligible
    FROM customer_outstandings
    WHERE customer_id = ? AND balance_amount > 0
    ORDER BY invoice_date ASC, invoice_no ASC
  `).all(customerId) as any[];

  return rows.map(r => ({
    id: r.id,
    invoiceId: r.invoiceId,
    invoiceNo: r.invoiceNo,
    invoiceDate: r.invoiceDate,
    dueDate: r.dueDate,
    originalAmount: Number(r.originalAmount),
    paidAmount: Number(r.paidAmount),
    balanceAmount: Number(r.balanceAmount),
    cashDiscountEligible: Number(r.cashDiscountEligible || 0),
  }));
}

export async function recordCustomerReceipt(input: CustomerReceiptInput): Promise<ReceiptResult> {
  try {
    // 1. Guard against closed business date
    const dateCheck = await checkDateIsClosed(input.receiptDate);
    if (dateCheck.isClosed) {
      return {
        success: false,
        error: `Business date ${input.receiptDate} has already been closed on ${dateCheck.closedAt}. Backdated entries prohibited.`,
      };
    }

    // 2. Validate Customer
    const customer = sqlite.prepare('SELECT id, name, is_blocked, closing_balance FROM customers WHERE id = ?').get(input.customerId) as any;
    if (!customer) {
      return { success: false, error: 'Customer not found' };
    }
    if (customer.is_blocked) {
      return { success: false, error: 'Customer is blocked for financial transactions' };
    }

    if (input.totalAmount <= 0) {
      return { success: false, error: 'Receipt collection amount must be strictly positive' };
    }

    if (input.paymentMode === 'CHEQUE') {
      if (!input.referenceNo || !input.referenceNo.trim()) {
        return { success: false, error: 'Cheque number is mandatory for cheque payment mode' };
      }
      if (!input.referenceDate) {
        return { success: false, error: 'Cheque date is mandatory for cheque payment mode' };
      }
      if (!input.bankName || !input.bankName.trim()) {
        return { success: false, error: 'Drawn Bank Name is mandatory for cheque payment mode' };
      }
    }

    const openBills = await getCustomerOutstandings(input.customerId);
    let finalAllocations: CustomerReceiptLineInput[] = [];
    let unallocatedAmount = 0;

    if (!input.allocations || input.allocations.length === 0) {
      // Auto-allocate FIFO
      const allocResult = allocateCustomerPayment(openBills, input.totalAmount, {
        applyCashDiscount: (input.discountAllowed || 0) > 0,
        receiptDate: input.receiptDate,
        sortStrategy: 'FIFO',
      });
      finalAllocations = allocResult.allocatedBills
        .filter(b => b.allocatedAmount > 0 || b.discountGranted > 0)
        .map(b => ({
          outstandingId: b.billId,
          invoiceId: b.invoiceId,
          allocatedAmount: b.allocatedAmount,
          discountAmount: b.discountGranted,
        }));
      unallocatedAmount = allocResult.unallocatedAmount;
    } else {
      // User manual line allocation
      let sumAllocated = 0;
      for (const alloc of input.allocations) {
        if (alloc.allocatedAmount > 0 || (alloc.discountAmount || 0) > 0) {
          finalAllocations.push({
            outstandingId: alloc.outstandingId,
            invoiceId: alloc.invoiceId,
            allocatedAmount: Number(alloc.allocatedAmount || 0),
            discountAmount: Number(alloc.discountAmount || 0),
          });
          sumAllocated += Number(alloc.allocatedAmount || 0);
        }
      }
      unallocatedAmount = Math.max(0, Number((input.totalAmount - sumAllocated).toFixed(2)));
    }

    const receiptId = crypto.randomUUID();
    const receiptNo = await getNextReceiptNo();
    const totalDiscount = Number((input.discountAllowed || 0).toFixed(2));
    const isCheque = input.paymentMode === 'CHEQUE';

    // 3. Atomic Database Transaction
    db.transaction((tx) => {
      // Insert Receipt Voucher
      tx.insert(customerReceipts).values({
        id: receiptId,
        receiptNo,
        receiptDate: input.receiptDate,
        customerId: input.customerId,
        paymentMode: input.paymentMode,
        totalAmount: input.totalAmount,
        discountAllowed: totalDiscount,
        referenceNo: input.referenceNo?.trim() || null,
        referenceDate: input.referenceDate || null,
        bankName: input.bankName?.trim() || null,
        branchName: input.branchName?.trim() || null,
        chequeStatus: isCheque ? 'IN_HAND' : 'NOT_APPLICABLE',
        unallocatedAmount,
        narration: input.narration || null,
        dayEndLocked: false,
      }).run();

      // Insert Allocations & Update Customer Outstandings
      for (const line of finalAllocations) {
        const allocId = crypto.randomUUID();
        tx.insert(customerReceiptAllocations).values({
          id: allocId,
          receiptId,
          outstandingId: line.outstandingId,
          invoiceId: line.invoiceId,
          allocatedAmount: line.allocatedAmount,
          discountAmount: line.discountAmount || 0,
        }).run();

        // Update Outstanding Record
        const currentOut = sqlite.prepare(`
          SELECT paid_amount, balance_amount, cash_discount_given 
          FROM customer_outstandings WHERE id = ?
        `).get(line.outstandingId) as any;

        if (currentOut) {
          const applied = line.allocatedAmount + (line.discountAmount || 0);
          const newPaid = Number((currentOut.paid_amount + applied).toFixed(2));
          const newBal = Number(Math.max(0, currentOut.balance_amount - applied).toFixed(2));
          const newStatus = newBal <= 0 ? 'PAID' : 'PARTIALLY_PAID';
          const newDisc = Number(((currentOut.cash_discount_given || 0) + (line.discountAmount || 0)).toFixed(2));

          tx.update(customerOutstandings)
            .set({
              paidAmount: newPaid,
              balanceAmount: newBal,
              status: newStatus,
              lastPaymentDate: input.receiptDate,
              cashDiscountGiven: newDisc,
            })
            .where(eq(customerOutstandings.id, line.outstandingId))
            .run();
        }
      }

      // Update Customer Closing Balance (AR deduction)
      const totalRelief = input.totalAmount + totalDiscount;
      const currentCustBal = Number(customer.closing_balance || 0);
      const newCustBal = Number((currentCustBal - totalRelief).toFixed(2));

      tx.update(customers)
        .set({
          closingBalance: newCustBal,
        })
        .where(eq(customers.id, input.customerId))
        .run();

      // If Cheque, insert into Cheque Register
      if (isCheque) {
        const chqId = crypto.randomUUID();
        tx.insert(chequeRegister).values({
          id: chqId,
          chequeType: 'INCOMING',
          chequeNo: input.referenceNo!.trim(),
          chequeDate: input.referenceDate!,
          amount: input.totalAmount,
          bankName: input.bankName!.trim(),
          branchName: input.branchName?.trim() || null,
          isLocalCheque: true,
          partyType: 'CUSTOMER',
          partyId: input.customerId,
          partyName: customer.name,
          receiptId,
          status: 'RECEIVED',
          remarks: `Collection Receipt ${receiptNo}`,
        }).run();
      }

      // Audit Log
      tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        userId: input.operatorId || 'ADMIN',
        action: 'CUSTOMER_RECEIPT_CREATE',
        entityType: 'collection',
        entityId: receiptId,
        remarks: `Receipt ${receiptNo} for Rs. ${input.totalAmount} from ${customer.name}`,
      }).run();
    });

    return {
      success: true,
      receiptId,
      receiptNo,
      unallocatedAmount,
    };
  } catch (err: any) {
    console.error('Error recording customer receipt:', err);
    return {
      success: false,
      error: err.message || 'Failed to record customer receipt',
    };
  }
}

export async function getCustomerReceipts(filter?: {
  customerId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<any[]> {
  let query = `
    SELECT 
      cr.id,
      cr.receipt_no AS receiptNo,
      cr.receipt_date AS receiptDate,
      cr.customer_id AS customerId,
      c.code AS customerCode,
      c.name AS customerName,
      cr.payment_mode AS paymentMode,
      cr.total_amount AS totalAmount,
      cr.discount_allowed AS discountAllowed,
      cr.reference_no AS referenceNo,
      cr.reference_date AS referenceDate,
      cr.bank_name AS bankName,
      cr.branch_name AS branchName,
      cr.cheque_status AS chequeStatus,
      cr.clearance_date AS clearanceDate,
      cr.unallocated_amount AS unallocatedAmount,
      cr.narration,
      cr.day_end_locked AS dayEndLocked,
      cr.created_at AS createdAt
    FROM customer_receipts cr
    JOIN customers c ON c.id = cr.customer_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (filter?.customerId) {
    query += ` AND cr.customer_id = ?`;
    params.push(filter.customerId);
  }
  if (filter?.startDate) {
    query += ` AND cr.receipt_date >= ?`;
    params.push(filter.startDate);
  }
  if (filter?.endDate) {
    query += ` AND cr.receipt_date <= ?`;
    params.push(filter.endDate);
  }
  query += ` ORDER BY cr.receipt_date DESC, cr.receipt_no DESC`;

  return sqlite.prepare(query).all(...params) as any[];
}

export async function deleteCustomerReceipt(receiptId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const receipt = sqlite.prepare('SELECT * FROM customer_receipts WHERE id = ?').get(receiptId) as any;
    if (!receipt) {
      return { success: false, error: 'Receipt not found' };
    }
    if (receipt.day_end_locked) {
      return { success: false, error: 'Receipt is locked by day-end closing and cannot be deleted' };
    }

    const allocs = sqlite.prepare('SELECT * FROM customer_receipt_allocations WHERE receipt_id = ?').all(receiptId) as any[];

    db.transaction((tx) => {
      // Revert allocations
      for (const a of allocs) {
        const out = sqlite.prepare('SELECT paid_amount, balance_amount, original_amount, cash_discount_given FROM customer_outstandings WHERE id = ?').get(a.outstanding_id) as any;
        if (out) {
          const revertAmt = a.allocated_amount + (a.discount_amount || 0);
          const newPaid = Math.max(0, Number((out.paid_amount - revertAmt).toFixed(2)));
          const newBal = Number((out.balance_amount + revertAmt).toFixed(2));
          const newStatus = newPaid === 0 ? 'OPEN' : 'PARTIALLY_PAID';
          const newDisc = Math.max(0, Number(((out.cash_discount_given || 0) - (a.discount_amount || 0)).toFixed(2)));

          tx.update(customerOutstandings)
            .set({
              paidAmount: newPaid,
              balanceAmount: newBal,
              status: newStatus,
              cashDiscountGiven: newDisc,
            })
            .where(eq(customerOutstandings.id, a.outstanding_id))
            .run();
        }
      }

      // Revert Customer balance
      const customer = sqlite.prepare('SELECT closing_balance FROM customers WHERE id = ?').get(receipt.customer_id) as any;
      if (customer) {
        const totalRevert = receipt.total_amount + receipt.discount_allowed;
        const newBal = Number((customer.closing_balance + totalRevert).toFixed(2));
        tx.update(customers)
          .set({ closingBalance: newBal })
          .where(eq(customers.id, receipt.customer_id))
          .run();
      }

      // Remove cheque register entry if any
      tx.delete(chequeRegister).where(eq(chequeRegister.receiptId, receiptId)).run();

      // Delete allocations and receipt
      tx.delete(customerReceiptAllocations).where(eq(customerReceiptAllocations.receiptId, receiptId)).run();
      tx.delete(customerReceipts).where(eq(customerReceipts.id, receiptId)).run();

      // Audit Log
      tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        userId: 'ADMIN',
        action: 'CUSTOMER_RECEIPT_DELETE',
        entityType: 'collection',
        entityId: receiptId,
        remarks: `Reversed receipt ${receipt.receipt_no} for Rs. ${receipt.total_amount}`,
      }).run();
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error deleting customer receipt:', err);
    return { success: false, error: err.message || 'Failed to delete receipt' };
  }
}
