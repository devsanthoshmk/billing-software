'use server';

import { db, sqlite } from '@/lib/db';
import {
  chequeRegister,
  customerReceipts,
  customerReceiptAllocations,
  customerOutstandings,
  supplierPayments,
  supplierPaymentAllocations,
  ChequeRecord,
} from '@/lib/db/schema/ledgers';
import { customers, suppliers } from '@/lib/db/schema/masters';
import { purchases } from '@/lib/db/schema/transactions';
import { auditLogs } from '@/lib/db/schema/system';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';

export interface ChequeFilter {
  type?: 'ALL' | 'INCOMING' | 'OUTGOING';
  status?: 'ALL' | 'RECEIVED' | 'ISSUED' | 'DEPOSITED' | 'CLEARED' | 'DISHONORED' | 'CANCELLED';
  partyId?: string;
  startDate?: string;
  endDate?: string;
  searchQuery?: string;
}

export interface DishonorChequeInput {
  chequeId: string;
  dishonorDate: string;
  dishonorReason: 'INSUFFICIENT_FUNDS' | 'SIGNATURE_MISMATCH' | 'STOP_PAYMENT' | 'EXPIRED' | 'OTHER' | string;
  dishonorCharge?: number;
  remarks?: string;
}

export interface NewChequeInput {
  chequeType: 'INCOMING' | 'OUTGOING';
  chequeNo: string;
  chequeDate: string;
  amount: number;
  bankName: string;
  branchName?: string;
  isLocalCheque?: boolean;
  partyType: 'CUSTOMER' | 'SUPPLIER';
  partyId: string;
  partyName: string;
  remarks?: string;
}

export async function getChequeRegister(filter?: ChequeFilter): Promise<ChequeRecord[]> {
  let query = `
    SELECT 
      id,
      cheque_type AS chequeType,
      cheque_no AS chequeNo,
      cheque_date AS chequeDate,
      amount,
      bank_name AS bankName,
      branch_name AS branchName,
      is_local_cheque AS isLocalCheque,
      party_type AS partyType,
      party_id AS partyId,
      party_name AS partyName,
      receipt_id AS receiptId,
      payment_id AS paymentId,
      status,
      deposit_date AS depositDate,
      clearance_date AS clearanceDate,
      dishonor_date AS dishonorDate,
      dishonor_reason AS dishonorReason,
      remarks,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM cheque_register
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filter?.type && filter.type !== 'ALL') {
    query += ` AND cheque_type = ?`;
    params.push(filter.type);
  }
  if (filter?.status && filter.status !== 'ALL') {
    query += ` AND status = ?`;
    params.push(filter.status);
  }
  if (filter?.partyId) {
    query += ` AND party_id = ?`;
    params.push(filter.partyId);
  }
  if (filter?.startDate) {
    query += ` AND cheque_date >= ?`;
    params.push(filter.startDate);
  }
  if (filter?.endDate) {
    query += ` AND cheque_date <= ?`;
    params.push(filter.endDate);
  }
  if (filter?.searchQuery && filter.searchQuery.trim()) {
    const q = `%${filter.searchQuery.trim()}%`;
    query += ` AND (cheque_no LIKE ? OR party_name LIKE ? OR bank_name LIKE ?)`;
    params.push(q, q, q);
  }

  query += ` ORDER BY cheque_date DESC, created_at DESC`;

  return sqlite.prepare(query).all(...params) as ChequeRecord[];
}

export async function depositCheque(chequeId: string, depositDate: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cheque = sqlite.prepare('SELECT * FROM cheque_register WHERE id = ?').get(chequeId) as any;
    if (!cheque) {
      return { success: false, error: 'Cheque record not found' };
    }
    if (cheque.status === 'CLEARED') {
      return { success: false, error: 'Cheque is already cleared' };
    }
    if (cheque.status === 'DISHONORED') {
      return { success: false, error: 'Cheque is already dishonored' };
    }

    db.transaction((tx) => {
      tx.update(chequeRegister)
        .set({
          status: 'DEPOSITED',
          depositDate,
        })
        .where(eq(chequeRegister.id, chequeId))
        .run();

      if (cheque.receipt_id) {
        tx.update(customerReceipts)
          .set({ chequeStatus: 'DEPOSITED' })
          .where(eq(customerReceipts.id, cheque.receipt_id))
          .run();
      }

      tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        userId: 'ADMIN',
        action: 'CHEQUE_DEPOSIT',
        entityType: 'collection',
        entityId: chequeId,
        remarks: `Deposited cheque ${cheque.cheque_no} on ${depositDate}`,
      }).run();
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error depositing cheque:', err);
    return { success: false, error: err.message || 'Failed to deposit cheque' };
  }
}

export async function clearCheque(chequeId: string, clearanceDate: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cheque = sqlite.prepare('SELECT * FROM cheque_register WHERE id = ?').get(chequeId) as any;
    if (!cheque) {
      return { success: false, error: 'Cheque record not found' };
    }
    if (cheque.status === 'DISHONORED') {
      return { success: false, error: 'Cannot clear a dishonored cheque' };
    }

    db.transaction((tx) => {
      tx.update(chequeRegister)
        .set({
          status: 'CLEARED',
          clearanceDate,
        })
        .where(eq(chequeRegister.id, chequeId))
        .run();

      if (cheque.receipt_id) {
        tx.update(customerReceipts)
          .set({
            chequeStatus: 'CLEARED',
            clearanceDate,
          })
          .where(eq(customerReceipts.id, cheque.receipt_id))
          .run();
      }

      if (cheque.payment_id) {
        tx.update(supplierPayments)
          .set({
            chequeStatus: 'PASSED',
            clearanceDate,
          })
          .where(eq(supplierPayments.id, cheque.payment_id))
          .run();
      }

      tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        userId: 'ADMIN',
        action: 'CHEQUE_CLEARANCE',
        entityType: 'collection',
        entityId: chequeId,
        remarks: `Cleared cheque ${cheque.cheque_no} on ${clearanceDate}`,
      }).run();
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error clearing cheque:', err);
    return { success: false, error: err.message || 'Failed to clear cheque' };
  }
}

/**
 * Dishonor Cheque Routine (1-to-1 Parity with CHQRET.PRG)
 * Reverses customer receipt, restores open invoice balances, and increases customer AR balance + penalty fee.
 */
export async function dishonorCheque(input: DishonorChequeInput): Promise<{
  success: boolean;
  restoredBillsCount: number;
  newClosingBalance: number;
  error?: string;
}> {
  try {
    const cheque = sqlite.prepare('SELECT * FROM cheque_register WHERE id = ?').get(input.chequeId) as any;
    if (!cheque) {
      return { success: false, restoredBillsCount: 0, newClosingBalance: 0, error: 'Cheque not found' };
    }
    if (cheque.status === 'DISHONORED') {
      return { success: false, restoredBillsCount: 0, newClosingBalance: 0, error: 'Cheque is already dishonored' };
    }
    if (cheque.cheque_type !== 'INCOMING' || !cheque.receipt_id) {
      return { success: false, restoredBillsCount: 0, newClosingBalance: 0, error: 'Only incoming customer cheques can be dishonored via CHQRET routine' };
    }

    const receipt = sqlite.prepare('SELECT * FROM customer_receipts WHERE id = ?').get(cheque.receipt_id) as any;
    if (!receipt) {
      return { success: false, restoredBillsCount: 0, newClosingBalance: 0, error: 'Associated customer receipt voucher not found' };
    }

    const customer = sqlite.prepare('SELECT id, name, closing_balance FROM customers WHERE id = ?').get(receipt.customer_id) as any;
    if (!customer) {
      return { success: false, restoredBillsCount: 0, newClosingBalance: 0, error: 'Associated customer account not found' };
    }

    const allocs = sqlite.prepare('SELECT * FROM customer_receipt_allocations WHERE receipt_id = ?').all(receipt.id) as any[];
    const charge = Number(input.dishonorCharge || 0);
    let restoredCount = 0;
    let finalCustBalance = 0;

    db.transaction((tx) => {
      // 1. Update Cheque Register
      const note = `Bounced: ${input.dishonorReason}${charge > 0 ? ` (Return Fee: Rs. ${charge})` : ''}`;
      const remarks = cheque.remarks ? `${cheque.remarks} | ${note}` : note;

      tx.update(chequeRegister)
        .set({
          status: 'DISHONORED',
          dishonorDate: input.dishonorDate,
          dishonorReason: input.dishonorReason,
          remarks,
        })
        .where(eq(chequeRegister.id, input.chequeId))
        .run();

      // 2. Update Customer Receipt status
      tx.update(customerReceipts)
        .set({ chequeStatus: 'DISHONORED' })
        .where(eq(customerReceipts.id, receipt.id))
        .run();

      // 3. Restore each Open Bill's Outstandings
      for (const a of allocs) {
        const out = sqlite.prepare(`
          SELECT id, original_amount, paid_amount, balance_amount, cash_discount_given
          FROM customer_outstandings WHERE id = ?
        `).get(a.outstanding_id) as any;

        if (out) {
          const applied = a.allocated_amount + (a.discount_amount || 0);
          const newPaid = Math.max(0, Number((out.paid_amount - applied).toFixed(2)));
          const newBal = Number((out.balance_amount + applied).toFixed(2));
          const newStatus = newBal >= out.original_amount ? 'OPEN' : 'PARTIALLY_PAID';
          const newDisc = Math.max(0, Number(((out.cash_discount_given || 0) - (a.discount_amount || 0)).toFixed(2)));

          tx.update(customerOutstandings)
            .set({
              paidAmount: newPaid,
              balanceAmount: newBal,
              status: newStatus,
              cashDiscountGiven: newDisc,
            })
            .where(eq(customerOutstandings.id, out.id))
            .run();

          restoredCount++;
        }
      }

      // 4. Restore Customer Closing Balance + Charge
      const totalReversal = receipt.total_amount + receipt.discount_allowed + charge;
      finalCustBalance = Number((customer.closing_balance + totalReversal).toFixed(2));

      tx.update(customers)
        .set({ closingBalance: finalCustBalance })
        .where(eq(customers.id, customer.id))
        .run();

      // 5. Audit Log
      tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        userId: 'ADMIN',
        action: 'CHEQUE_DISHONOR',
        entityType: 'collection',
        entityId: input.chequeId,
        remarks: `Dishonored cheque ${cheque.cheque_no} (Rs. ${cheque.amount}). Restored ${restoredCount} bill(s). Penalty: Rs. ${charge}. New AR Balance: Rs. ${finalCustBalance}`,
      }).run();
    });

    return {
      success: true,
      restoredBillsCount: restoredCount,
      newClosingBalance: finalCustBalance,
    };
  } catch (err: any) {
    console.error('Error dishonoring cheque:', err);
    return {
      success: false,
      restoredBillsCount: 0,
      newClosingBalance: 0,
      error: err.message || 'Failed to dishonor cheque',
    };
  }
}

export async function cancelCheque(chequeId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cheque = sqlite.prepare('SELECT * FROM cheque_register WHERE id = ?').get(chequeId) as any;
    if (!cheque) {
      return { success: false, error: 'Cheque record not found' };
    }
    if (cheque.status === 'CANCELLED') {
      return { success: false, error: 'Cheque is already cancelled' };
    }

    db.transaction((tx) => {
      tx.update(chequeRegister)
        .set({
          status: 'CANCELLED',
          remarks: cheque.remarks ? `${cheque.remarks} | Cancelled: ${reason}` : `Cancelled: ${reason}`,
        })
        .where(eq(chequeRegister.id, chequeId))
        .run();

      // If tied to outgoing supplier payment, revert purchase balances
      if (cheque.payment_id) {
        const payment = sqlite.prepare('SELECT * FROM supplier_payments WHERE id = ?').get(cheque.payment_id) as any;
        if (payment) {
          const allocs = sqlite.prepare('SELECT * FROM supplier_payment_allocations WHERE payment_id = ?').all(payment.id) as any[];
          for (const a of allocs) {
            const pur = sqlite.prepare('SELECT paid_amount, balance_amount FROM purchases WHERE id = ?').get(a.purchase_id) as any;
            if (pur) {
              const applied = a.allocated_amount + (a.discount_amount || 0);
              const newPaid = Math.max(0, Number((pur.paid_amount - applied).toFixed(2)));
              const newBal = Number((pur.balance_amount + applied).toFixed(2));
              tx.update(purchases)
                .set({
                  paidAmount: newPaid,
                  balanceAmount: newBal,
                  paymentStatus: newPaid === 0 ? 'UNPAID' : 'PARTIAL',
                })
                .where(eq(purchases.id, a.purchase_id))
                .run();
            }
          }

          const supplier = sqlite.prepare('SELECT current_balance FROM suppliers WHERE id = ?').get(payment.supplier_id) as any;
          if (supplier) {
            const revertAmt = payment.total_amount + payment.discount_received;
            tx.update(suppliers)
              .set({ currentBalance: Number((supplier.current_balance + revertAmt).toFixed(2)) })
              .where(eq(suppliers.id, payment.supplier_id))
              .run();
          }

          tx.update(supplierPayments)
            .set({ chequeStatus: 'CANCELLED' })
            .where(eq(supplierPayments.id, payment.id))
            .run();
        }
      }

      tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        userId: 'ADMIN',
        action: 'CHEQUE_CANCEL',
        entityType: 'payment',
        entityId: chequeId,
        remarks: `Cancelled cheque ${cheque.cheque_no}: ${reason}`,
      }).run();
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error cancelling cheque:', err);
    return { success: false, error: err.message || 'Failed to cancel cheque' };
  }
}

export async function recordIndependentCheque(input: NewChequeInput): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const id = crypto.randomUUID();
    sqlite.prepare(`
      INSERT INTO cheque_register (
        id, cheque_type, cheque_no, cheque_date, amount, bank_name, branch_name,
        is_local_cheque, party_type, party_id, party_name, status, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.chequeType,
      input.chequeNo.trim(),
      input.chequeDate,
      input.amount,
      input.bankName.trim(),
      input.branchName?.trim() || null,
      input.isLocalCheque ? 1 : 0,
      input.partyType,
      input.partyId,
      input.partyName.trim(),
      input.chequeType === 'INCOMING' ? 'RECEIVED' : 'ISSUED',
      input.remarks || null
    );

    return { success: true, id };
  } catch (err: any) {
    console.error('Error recording independent cheque:', err);
    return { success: false, error: err.message || 'Failed to record cheque' };
  }
}
