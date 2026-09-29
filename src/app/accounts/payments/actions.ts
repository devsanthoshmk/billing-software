'use server';

import { db, sqlite } from '@/lib/db';
import {
  supplierPayments,
  supplierPaymentAllocations,
  chequeRegister,
} from '@/lib/db/schema/ledgers';
import { suppliers } from '@/lib/db/schema/masters';
import { purchases } from '@/lib/db/schema/transactions';
import { auditLogs } from '@/lib/db/schema/system';
import { eq, desc } from 'drizzle-orm';
import { allocateSupplierPayment, OpenPurchaseBill } from '@/lib/business-engine';
import { checkDateIsClosed } from '@/app/system/day-end/actions';
import crypto from 'crypto';

export interface SupplierPaymentLineInput {
  purchaseId: string;
  allocatedAmount: number;
  discountAmount?: number;
}

export interface SupplierPaymentInput {
  supplierId: string;
  paymentDate: string; // 'YYYY-MM-DD'
  paymentMode: 'CASH' | 'CHEQUE' | 'NEFT_RTGS' | 'UPI' | 'DEBIT_NOTE_ADJUSTMENT' | 'DD';
  totalAmount: number;
  discountReceived?: number;
  referenceNo?: string;
  referenceDate?: string;
  bankName?: string;
  bankAccountNo?: string;
  narration?: string;
  operatorId?: string;
  allocations?: SupplierPaymentLineInput[];
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  paymentNo?: string;
  unallocatedAmount?: number;
  error?: string;
}

export async function getSuppliersLookup(): Promise<{ id: string; code: string; name: string; currentBalance: number; gstin: string; address: string }[]> {
  const rows = sqlite.prepare(`
    SELECT id, code, name, current_balance AS currentBalance, gstin, address_line1 AS address
    FROM suppliers
    WHERE is_blocked = 0
    ORDER BY name ASC
  `).all() as any[];
  return rows.map(r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    currentBalance: Number(r.currentBalance || 0),
    gstin: r.gstin || '',
    address: r.address || '',
  }));
}

export async function getNextPaymentNo(): Promise<string> {
  const row = sqlite.prepare(`
    SELECT payment_no FROM supplier_payments 
    ORDER BY payment_no DESC LIMIT 1
  `).get() as { payment_no?: string } | undefined;

  if (!row || !row.payment_no) {
    return 'PMT-000101';
  }

  const match = row.payment_no.match(/PMT-(\d+)/);
  if (match) {
    const nextNum = parseInt(match[1], 10) + 1;
    return `PMT-${String(nextNum).padStart(6, '0')}`;
  }

  const countRow = sqlite.prepare('SELECT COUNT(*) as count FROM supplier_payments').get() as { count: number };
  return `PMT-${String(countRow.count + 101).padStart(6, '0')}`;
}

export async function getSupplierOutstandings(supplierId: string): Promise<OpenPurchaseBill[]> {
  const rows = sqlite.prepare(`
    SELECT 
      id,
      inward_no AS inwardNo,
      supplier_bill_no AS supplierBillNo,
      inward_date AS inwardDate,
      due_date AS dueDate,
      net_amount AS netAmount,
      paid_amount AS paidAmount,
      balance_amount AS balanceAmount
    FROM purchases
    WHERE supplier_id = ? 
      AND balance_amount > 0 
      AND status != 'CANCELLED'
    ORDER BY inward_date ASC, inward_no ASC
  `).all(supplierId) as any[];

  return rows.map(r => ({
    id: r.id,
    inwardNo: r.inwardNo,
    supplierBillNo: r.supplierBillNo,
    inwardDate: r.inwardDate,
    dueDate: r.dueDate,
    netAmount: Number(r.netAmount),
    paidAmount: Number(r.paidAmount),
    balanceAmount: Number(r.balanceAmount),
  }));
}

export async function recordSupplierPayment(input: SupplierPaymentInput): Promise<PaymentResult> {
  try {
    // 1. Guard against closed date
    const dateCheck = await checkDateIsClosed(input.paymentDate);
    if (dateCheck.isClosed) {
      return {
        success: false,
        error: `Business date ${input.paymentDate} has already been closed on ${dateCheck.closedAt}. Backdated entries prohibited.`,
      };
    }

    // 2. Validate Supplier
    const supplier = sqlite.prepare('SELECT id, name, is_blocked, current_balance FROM suppliers WHERE id = ?').get(input.supplierId) as any;
    if (!supplier) {
      return { success: false, error: 'Supplier not found' };
    }
    if (supplier.is_blocked) {
      return { success: false, error: 'Supplier account is blocked' };
    }

    if (input.totalAmount <= 0) {
      return { success: false, error: 'Payment disbursement amount must be strictly positive' };
    }

    if (input.paymentMode === 'CHEQUE') {
      if (!input.referenceNo || !input.referenceNo.trim()) {
        return { success: false, error: 'Cheque number is mandatory for cheque payment mode' };
      }
      if (!input.bankName || !input.bankName.trim()) {
        return { success: false, error: 'Issuing Bank Name is mandatory for cheque payment mode' };
      }
    }

    const openPurchases = await getSupplierOutstandings(input.supplierId);
    let finalAllocations: SupplierPaymentLineInput[] = [];
    let unallocatedAmount = 0;

    if (!input.allocations || input.allocations.length === 0) {
      // Auto-allocate FIFO
      const allocResult = allocateSupplierPayment(openPurchases, input.totalAmount, {
        sortStrategy: 'FIFO',
      });
      finalAllocations = allocResult.allocatedBills
        .filter(b => b.allocatedAmount > 0 || b.discountGranted > 0)
        .map(b => ({
          purchaseId: b.purchaseId,
          allocatedAmount: b.allocatedAmount,
          discountAmount: b.discountGranted,
        }));
      unallocatedAmount = allocResult.unallocatedAmount;
    } else {
      let sumAllocated = 0;
      for (const alloc of input.allocations) {
        if (alloc.allocatedAmount > 0 || (alloc.discountAmount || 0) > 0) {
          finalAllocations.push({
            purchaseId: alloc.purchaseId,
            allocatedAmount: Number(alloc.allocatedAmount || 0),
            discountAmount: Number(alloc.discountAmount || 0),
          });
          sumAllocated += Number(alloc.allocatedAmount || 0);
        }
      }
      unallocatedAmount = Math.max(0, Number((input.totalAmount - sumAllocated).toFixed(2)));
    }

    const paymentId = crypto.randomUUID();
    const paymentNo = await getNextPaymentNo();
    const totalDiscount = Number((input.discountReceived || 0).toFixed(2));
    const isCheque = input.paymentMode === 'CHEQUE';

    // 3. Atomic Database Transaction
    db.transaction((tx) => {
      // Insert Payment Voucher
      tx.insert(supplierPayments).values({
        id: paymentId,
        paymentNo,
        paymentDate: input.paymentDate,
        supplierId: input.supplierId,
        paymentMode: input.paymentMode,
        totalAmount: input.totalAmount,
        discountReceived: totalDiscount,
        referenceNo: input.referenceNo?.trim() || null,
        referenceDate: input.referenceDate || null,
        bankName: input.bankName?.trim() || null,
        bankAccountNo: input.bankAccountNo?.trim() || null,
        chequeStatus: isCheque ? 'ISSUED' : 'NOT_APPLICABLE',
        unallocatedAmount,
        narration: input.narration || null,
        dayEndLocked: false,
      }).run();

      // Allocations & Purchase Balance updates
      for (const line of finalAllocations) {
        const allocId = crypto.randomUUID();
        tx.insert(supplierPaymentAllocations).values({
          id: allocId,
          paymentId,
          purchaseId: line.purchaseId,
          allocatedAmount: line.allocatedAmount,
          discountAmount: line.discountAmount || 0,
        }).run();

        const currentPur = sqlite.prepare(`
          SELECT paid_amount, balance_amount FROM purchases WHERE id = ?
        `).get(line.purchaseId) as any;

        if (currentPur) {
          const applied = line.allocatedAmount + (line.discountAmount || 0);
          const newPaid = Number((currentPur.paid_amount + applied).toFixed(2));
          const newBal = Number(Math.max(0, currentPur.balance_amount - applied).toFixed(2));
          const newStatus = newBal <= 0 ? 'PAID' : 'PARTIAL';

          tx.update(purchases)
            .set({
              paidAmount: newPaid,
              balanceAmount: newBal,
              paymentStatus: newStatus,
            })
            .where(eq(purchases.id, line.purchaseId))
            .run();
        }
      }

      // Update Supplier currentBalance (AP reduction)
      const totalRelief = input.totalAmount + totalDiscount;
      const currentSupBal = Number(supplier.current_balance || 0);
      const newSupBal = Number((currentSupBal - totalRelief).toFixed(2));

      tx.update(suppliers)
        .set({
          currentBalance: newSupBal,
        })
        .where(eq(suppliers.id, input.supplierId))
        .run();

      // If Cheque, insert into Cheque Register
      if (isCheque) {
        const chqId = crypto.randomUUID();
        tx.insert(chequeRegister).values({
          id: chqId,
          chequeType: 'OUTGOING',
          chequeNo: input.referenceNo!.trim(),
          chequeDate: input.referenceDate || input.paymentDate,
          amount: input.totalAmount,
          bankName: input.bankName!.trim(),
          branchName: input.bankAccountNo?.trim() || null,
          isLocalCheque: true,
          partyType: 'SUPPLIER',
          partyId: input.supplierId,
          partyName: supplier.name,
          paymentId,
          status: 'ISSUED',
          remarks: `Supplier Payment Voucher ${paymentNo}`,
        }).run();
      }

      // Audit Log
      tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        userId: input.operatorId || 'ADMIN',
        action: 'SUPPLIER_PAYMENT_CREATE',
        entityType: 'payment',
        entityId: paymentId,
        remarks: `Payment ${paymentNo} of Rs. ${input.totalAmount} to ${supplier.name}`,
      }).run();
    });

    return {
      success: true,
      paymentId,
      paymentNo,
      unallocatedAmount,
    };
  } catch (err: any) {
    console.error('Error recording supplier payment:', err);
    return {
      success: false,
      error: err.message || 'Failed to record supplier payment',
    };
  }
}

export async function getSupplierPayments(filter?: {
  supplierId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<any[]> {
  let query = `
    SELECT 
      sp.id,
      sp.payment_no AS paymentNo,
      sp.payment_date AS paymentDate,
      sp.supplier_id AS supplierId,
      sup.code AS supplierCode,
      sup.name AS supplierName,
      sp.payment_mode AS paymentMode,
      sp.total_amount AS totalAmount,
      sp.discount_received AS discountReceived,
      sp.reference_no AS referenceNo,
      sp.reference_date AS referenceDate,
      sp.bank_name AS bankName,
      sp.bank_account_no AS bankAccountNo,
      sp.cheque_status AS chequeStatus,
      sp.clearance_date AS clearanceDate,
      sp.unallocated_amount AS unallocatedAmount,
      sp.narration,
      sp.day_end_locked AS dayEndLocked,
      sp.created_at AS createdAt
    FROM supplier_payments sp
    JOIN suppliers sup ON sup.id = sp.supplier_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (filter?.supplierId) {
    query += ` AND sp.supplier_id = ?`;
    params.push(filter.supplierId);
  }
  if (filter?.startDate) {
    query += ` AND sp.payment_date >= ?`;
    params.push(filter.startDate);
  }
  if (filter?.endDate) {
    query += ` AND sp.payment_date <= ?`;
    params.push(filter.endDate);
  }
  query += ` ORDER BY sp.payment_date DESC, sp.payment_no DESC`;

  return sqlite.prepare(query).all(...params) as any[];
}

export async function deleteSupplierPayment(paymentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const payment = sqlite.prepare('SELECT * FROM supplier_payments WHERE id = ?').get(paymentId) as any;
    if (!payment) {
      return { success: false, error: 'Payment voucher not found' };
    }
    if (payment.day_end_locked) {
      return { success: false, error: 'Payment is locked by day-end closing and cannot be deleted' };
    }

    const allocs = sqlite.prepare('SELECT * FROM supplier_payment_allocations WHERE payment_id = ?').all(paymentId) as any[];

    db.transaction((tx) => {
      // Revert purchase bill balances
      for (const a of allocs) {
        const pur = sqlite.prepare('SELECT paid_amount, balance_amount, net_amount FROM purchases WHERE id = ?').get(a.purchase_id) as any;
        if (pur) {
          const revertAmt = a.allocated_amount + (a.discount_amount || 0);
          const newPaid = Math.max(0, Number((pur.paid_amount - revertAmt).toFixed(2)));
          const newBal = Number((pur.balance_amount + revertAmt).toFixed(2));
          const newStatus = newPaid === 0 ? 'UNPAID' : 'PARTIAL';

          tx.update(purchases)
            .set({
              paidAmount: newPaid,
              balanceAmount: newBal,
              paymentStatus: newStatus,
            })
            .where(eq(purchases.id, a.purchase_id))
            .run();
        }
      }

      // Revert Supplier balance
      const supplier = sqlite.prepare('SELECT current_balance FROM suppliers WHERE id = ?').get(payment.supplier_id) as any;
      if (supplier) {
        const totalRevert = payment.total_amount + payment.discount_received;
        const newBal = Number((supplier.current_balance + totalRevert).toFixed(2));
        tx.update(suppliers)
          .set({ currentBalance: newBal })
          .where(eq(suppliers.id, payment.supplier_id))
          .run();
      }

      // Delete cheque register entry
      tx.delete(chequeRegister).where(eq(chequeRegister.paymentId, paymentId)).run();

      // Delete allocations & payment voucher
      tx.delete(supplierPaymentAllocations).where(eq(supplierPaymentAllocations.paymentId, paymentId)).run();
      tx.delete(supplierPayments).where(eq(supplierPayments.id, paymentId)).run();

      // Audit Log
      tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        userId: 'ADMIN',
        action: 'SUPPLIER_PAYMENT_DELETE',
        entityType: 'payment',
        entityId: paymentId,
        remarks: `Reversed payment voucher ${payment.payment_no} of Rs. ${payment.total_amount}`,
      }).run();
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error deleting supplier payment:', err);
    return { success: false, error: err.message || 'Failed to delete payment' };
  }
}
