import { describe, it, expect } from 'vitest';
import {
  allocateCustomerPayment,
  OpenBill,
} from '../../src/lib/business-engine';

describe('Bill-by-Bill Customer Ledger Payment Allocation Engine (Feature F13)', () => {
  it('throws error when payment amount is negative', () => {
    expect(() => allocateCustomerPayment([], -100)).toThrow('Payment amount cannot be negative');
  });

  it('handles 0 payment amount cleanly', () => {
    const bills: OpenBill[] = [
      {
        id: 'B1',
        invoiceId: 'INV1',
        invoiceNo: '101',
        invoiceDate: '2026-05-01',
        dueDate: '2026-05-20',
        originalAmount: 1000,
        paidAmount: 0,
        balanceAmount: 1000,
      },
    ];
    const result = allocateCustomerPayment(bills, 0);
    expect(result.totalPaymentAmount).toBe(0);
    expect(result.totalAllocatedAmount).toBe(0);
    expect(result.unallocatedAmount).toBe(0);
    expect(result.unsettledBillCount).toBe(1);
    expect(result.allocatedBills[0].status).toBe('OPEN');
  });

  it('settles exact payment on single bill', () => {
    const bills: OpenBill[] = [
      {
        id: 'B1',
        invoiceId: 'INV1',
        invoiceNo: '101',
        invoiceDate: '2026-05-01',
        dueDate: '2026-05-20',
        originalAmount: 2500.50,
        paidAmount: 0,
        balanceAmount: 2500.50,
      },
    ];
    const result = allocateCustomerPayment(bills, 2500.50);
    expect(result.totalAllocatedAmount).toBe(2500.50);
    expect(result.unallocatedAmount).toBe(0.00);
    expect(result.settledBillCount).toBe(1);
    expect(result.allocatedBills[0]).toMatchObject({
      allocatedAmount: 2500.50,
      newPaidAmount: 2500.50,
      newBalanceAmount: 0.00,
      status: 'PAID',
      isFullySettled: true,
    });
  });

  it('retains surplus as unallocated advance credit (EXAMT)', () => {
    const bills: OpenBill[] = [
      {
        id: 'B1',
        invoiceId: 'INV1',
        invoiceNo: '101',
        invoiceDate: '2026-05-01',
        dueDate: '2026-05-20',
        originalAmount: 1000.00,
        paidAmount: 0,
        balanceAmount: 1000.00,
      },
    ];
    const result = allocateCustomerPayment(bills, 1800.00);
    expect(result.totalAllocatedAmount).toBe(1000.00);
    expect(result.unallocatedAmount).toBe(800.00); // EXAMT
    expect(result.settledBillCount).toBe(1);
    expect(result.allocatedBills[0].status).toBe('PAID');
  });

  it('cascades payments in FIFO chronological order and handles partial settlements', () => {
    const bills: OpenBill[] = [
      {
        id: 'B-FEB',
        invoiceId: 'INV-2',
        invoiceNo: '1002',
        invoiceDate: '2026-02-10',
        dueDate: '2026-03-01',
        originalAmount: 3000.00,
        paidAmount: 0,
        balanceAmount: 3000.00,
      },
      {
        id: 'B-JAN',
        invoiceId: 'INV-1',
        invoiceNo: '1001',
        invoiceDate: '2026-01-15', // Earliest bill
        dueDate: '2026-02-05',
        originalAmount: 2000.00,
        paidAmount: 0,
        balanceAmount: 2000.00,
      },
      {
        id: 'B-MAR',
        invoiceId: 'INV-3',
        invoiceNo: '1003',
        invoiceDate: '2026-03-20',
        dueDate: '2026-04-10',
        originalAmount: 1500.00,
        paidAmount: 0,
        balanceAmount: 1500.00,
      },
    ];

    // Payment: 3500.00
    // FIFO Order: B-JAN (2000) -> B-FEB (3000) -> B-MAR (1500)
    // Allocation:
    // B-JAN gets 2000 (PAID, bal 0)
    // B-FEB gets 1500 (PARTIALLY_PAID, bal 1500)
    // B-MAR gets 0 (OPEN, bal 1500)
    const result = allocateCustomerPayment(bills, 3500.00);

    expect(result.totalPaymentAmount).toBe(3500.00);
    expect(result.totalAllocatedAmount).toBe(3500.00);
    expect(result.unallocatedAmount).toBe(0.00);
    expect(result.settledBillCount).toBe(1);
    expect(result.partiallySettledBillCount).toBe(1);
    expect(result.unsettledBillCount).toBe(1);

    expect(result.allocatedBills[0].billId).toBe('B-JAN');
    expect(result.allocatedBills[0].allocatedAmount).toBe(2000.00);
    expect(result.allocatedBills[0].newBalanceAmount).toBe(0.00);
    expect(result.allocatedBills[0].status).toBe('PAID');

    expect(result.allocatedBills[1].billId).toBe('B-FEB');
    expect(result.allocatedBills[1].allocatedAmount).toBe(1500.00);
    expect(result.allocatedBills[1].newBalanceAmount).toBe(1500.00);
    expect(result.allocatedBills[1].status).toBe('PARTIALLY_PAID');

    expect(result.allocatedBills[2].billId).toBe('B-MAR');
    expect(result.allocatedBills[2].allocatedAmount).toBe(0.00);
    expect(result.allocatedBills[2].newBalanceAmount).toBe(1500.00);
    expect(result.allocatedBills[2].status).toBe('OPEN');
  });

  it('handles prior partial payments correctly', () => {
    const bills: OpenBill[] = [
      {
        id: 'B1',
        invoiceId: 'INV1',
        invoiceNo: '101',
        invoiceDate: '2026-05-01',
        dueDate: '2026-05-20',
        originalAmount: 5000.00,
        paidAmount: 2000.00, // 2000 already paid
        balanceAmount: 3000.00, // 3000 remaining
      },
    ];

    // Pay 3000 to fully clear
    const result = allocateCustomerPayment(bills, 3000.00);
    expect(result.settledBillCount).toBe(1);
    expect(result.allocatedBills[0].allocatedAmount).toBe(3000.00);
    expect(result.allocatedBills[0].newPaidAmount).toBe(5000.00);
    expect(result.allocatedBills[0].newBalanceAmount).toBe(0.00);
    expect(result.allocatedBills[0].status).toBe('PAID');
  });

  it('evaluates prompt payment cash discount incentive when within due date', () => {
    const bills: OpenBill[] = [
      {
        id: 'B1',
        invoiceId: 'INV1',
        invoiceNo: '101',
        invoiceDate: '2026-05-01',
        dueDate: '2026-05-21',
        originalAmount: 1000.00,
        paidAmount: 0,
        balanceAmount: 1000.00,
        cashDiscountEligible: 20.00, // 2% prompt discount = 20
        cashDiscountPct: 2.0,
      },
    ];

    // Customer pays 980 on 2026-05-15 (before due date 2026-05-21)
    const result = allocateCustomerPayment(bills, 980.00, {
      applyCashDiscount: true,
      receiptDate: '2026-05-15',
    });

    expect(result.totalAllocatedAmount).toBe(980.00);
    expect(result.totalDiscountGranted).toBe(20.00);
    expect(result.unallocatedAmount).toBe(0.00);
    expect(result.settledBillCount).toBe(1);

    expect(result.allocatedBills[0].discountGranted).toBe(20.00);
    expect(result.allocatedBills[0].newBalanceAmount).toBe(0.00);
    expect(result.allocatedBills[0].status).toBe('PAID');
    expect(result.allocatedBills[0].isFullySettled).toBe(true);
  });

  it('does not apply cash discount if payment date is after due date', () => {
    const bills: OpenBill[] = [
      {
        id: 'B1',
        invoiceId: 'INV1',
        invoiceNo: '101',
        invoiceDate: '2026-05-01',
        dueDate: '2026-05-21',
        originalAmount: 1000.00,
        paidAmount: 0,
        balanceAmount: 1000.00,
        cashDiscountEligible: 20.00,
      },
    ];

    // Customer pays 980 on 2026-05-25 (overdue!)
    const result = allocateCustomerPayment(bills, 980.00, {
      applyCashDiscount: true,
      receiptDate: '2026-05-25',
    });

    expect(result.totalDiscountGranted).toBe(0.00);
    expect(result.allocatedBills[0].discountGranted).toBe(0.00);
    expect(result.allocatedBills[0].allocatedAmount).toBe(980.00);
    expect(result.allocatedBills[0].newBalanceAmount).toBe(20.00);
    expect(result.allocatedBills[0].status).toBe('PARTIALLY_PAID');
  });

  it('supports LIFO sort strategy', () => {
    const bills: OpenBill[] = [
      {
        id: 'B-OLD',
        invoiceId: 'INV-1',
        invoiceNo: '101',
        invoiceDate: '2026-01-01',
        dueDate: '2026-01-20',
        originalAmount: 1000.00,
        paidAmount: 0,
        balanceAmount: 1000.00,
      },
      {
        id: 'B-NEW',
        invoiceId: 'INV-2',
        invoiceNo: '102',
        invoiceDate: '2026-06-01',
        dueDate: '2026-06-20',
        originalAmount: 1000.00,
        paidAmount: 0,
        balanceAmount: 1000.00,
      },
    ];

    const result = allocateCustomerPayment(bills, 1000.00, {
      sortStrategy: 'LIFO',
    });

    expect(result.allocatedBills[0].billId).toBe('B-NEW');
    expect(result.allocatedBills[0].status).toBe('PAID');
    expect(result.allocatedBills[1].billId).toBe('B-OLD');
    expect(result.allocatedBills[1].status).toBe('OPEN');
  });
});
