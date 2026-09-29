/**
 * Pure TypeScript Bill-by-Bill Customer Payment Allocation Engine (Feature F13)
 * Parity: COLENTY3.PRG:220–226, 487, CUSTCDX.CDX (tag cbildt), CUSLED.DAT (EXAMT)
 */

import {
  OpenBill,
  AllocatedBillResult,
  PaymentAllocationResult,
  PaymentAllocationOptions,
  BillSettlementStatus,
  OpenPurchaseBill,
  AllocatedPurchaseBillResult,
  SupplierPaymentAllocationResult,
} from './types';
import { roundToPaise } from './calculations';

/**
 * Pure TypeScript Bill-by-Bill Customer Payment Allocation Engine.
 * 
 * Implements 1-to-1 parity with FoxPro 2.6 collection routines:
 * - COLENTY3.PRG:220–226, 487 (FIFO bill-by-bill allocation)
 * - CUSTCDX.CDX: tag cbildt (CCODE + DTOS(INVDT) ascending sequence)
 * - CUSLED.DAT: EXAMT (unallocated excess collection funds retained as advance credit)
 * 
 * @param openBills Array of open customer bills (customerOutstandings)
 * @param paymentAmount Total incoming collection money (CAMT)
 * @param options Allocation options (cash discounts, sort order)
 * @returns Complete allocation breakdown and remaining advance funds
 */
export function allocateCustomerPayment(
  openBills: OpenBill[],
  paymentAmount: number,
  options: PaymentAllocationOptions = {}
): PaymentAllocationResult {
  // 1. Invariant Guard: Reject negative collection payments
  if (paymentAmount < 0) {
    throw new Error('Payment amount cannot be negative');
  }

  const roundedPayment = roundToPaise(paymentAmount);

  // 2. Clone and Sort bills according to chosen strategy (Default: FIFO)
  const sortedBills = [...openBills];
  const strategy = options.sortStrategy ?? 'FIFO';

  if (strategy === 'FIFO') {
    sortedBills.sort((a, b) => {
      // Primary: invoiceDate ASC
      const dateComparison = a.invoiceDate.localeCompare(b.invoiceDate);
      if (dateComparison !== 0) return dateComparison;
      // Secondary: invoiceNo ASC (natural numerical or alphabetical tie-breaker)
      return a.invoiceNo.localeCompare(b.invoiceNo, undefined, { numeric: true });
    });
  } else if (strategy === 'LIFO') {
    sortedBills.sort((a, b) => {
      const dateComparison = b.invoiceDate.localeCompare(a.invoiceDate);
      if (dateComparison !== 0) return dateComparison;
      return b.invoiceNo.localeCompare(a.invoiceNo, undefined, { numeric: true });
    });
  }
  // 'NONE' retains incoming array sequence

  let remainingFunds = roundedPayment;
  let totalAllocated = 0.00;
  let totalDiscounts = 0.00;
  let settledCount = 0;
  let partialCount = 0;
  let unsettledCount = 0;

  const allocatedBills: AllocatedBillResult[] = [];

  // 3. Sequential Allocation Loop
  for (const bill of sortedBills) {
    // Determine effective prior balance with paise precision
    const prevPaid = roundToPaise(bill.paidAmount);
    const origAmt = roundToPaise(bill.originalAmount);
    const effectivePrevBalance = roundToPaise(
      typeof bill.balanceAmount === 'number'
        ? bill.balanceAmount
        : Math.max(0, origAmt - prevPaid)
    );

    // If bill is already 0 balance or negative, mark PAID and do not allocate additional funds
    if (effectivePrevBalance <= 0) {
      allocatedBills.push({
        billId: bill.id,
        invoiceId: bill.invoiceId,
        invoiceNo: bill.invoiceNo,
        invoiceDate: bill.invoiceDate,
        originalAmount: origAmt,
        previousPaidAmount: prevPaid,
        previousBalanceAmount: 0.00,
        allocatedAmount: 0.00,
        discountGranted: 0.00,
        newPaidAmount: prevPaid,
        newBalanceAmount: 0.00,
        status: 'PAID',
        isFullySettled: true,
      });
      settledCount++;
      continue;
    }

    // Evaluate Cash Discount Eligibility if requested
    let discountToApply = 0.00;
    if (options.applyCashDiscount && bill.cashDiscountEligible && bill.cashDiscountEligible > 0) {
      const isEligibleDate = options.receiptDate 
        ? options.receiptDate <= bill.dueDate 
        : true;
      if (isEligibleDate) {
        discountToApply = roundToPaise(bill.cashDiscountEligible);
      }
    }

    // Amount needed from payment funds after discount
    const netBalanceNeeded = roundToPaise(Math.max(0, effectivePrevBalance - discountToApply));

    if (remainingFunds <= 0) {
      // Funds exhausted: bill remains completely unpaid in this transaction
      allocatedBills.push({
        billId: bill.id,
        invoiceId: bill.invoiceId,
        invoiceNo: bill.invoiceNo,
        invoiceDate: bill.invoiceDate,
        originalAmount: origAmt,
        previousPaidAmount: prevPaid,
        previousBalanceAmount: effectivePrevBalance,
        allocatedAmount: 0.00,
        discountGranted: 0.00,
        newPaidAmount: prevPaid,
        newBalanceAmount: effectivePrevBalance,
        status: prevPaid > 0 ? 'PARTIALLY_PAID' : 'OPEN',
        isFullySettled: false,
      });
      if (prevPaid > 0) {
        partialCount++;
      } else {
        unsettledCount++;
      }
      continue;
    }

    if (remainingFunds >= netBalanceNeeded) {
      // FULL SETTLEMENT CASE
      const allocatedForThisBill = netBalanceNeeded;
      remainingFunds = roundToPaise(remainingFunds - allocatedForThisBill);
      totalAllocated = roundToPaise(totalAllocated + allocatedForThisBill);
      totalDiscounts = roundToPaise(totalDiscounts + discountToApply);

      // Observation O3 Fix: Strictly compute cumulative paid amount according to types.ts:483
      // Prevents phantom payment creation on bills adjusted by credit notes or sales returns
      const newPaid = roundToPaise(prevPaid + allocatedForThisBill + discountToApply);
      const newBalance = 0.00;

      allocatedBills.push({
        billId: bill.id,
        invoiceId: bill.invoiceId,
        invoiceNo: bill.invoiceNo,
        invoiceDate: bill.invoiceDate,
        originalAmount: origAmt,
        previousPaidAmount: prevPaid,
        previousBalanceAmount: effectivePrevBalance,
        allocatedAmount: allocatedForThisBill,
        discountGranted: discountToApply,
        newPaidAmount: newPaid,
        newBalanceAmount: newBalance,
        status: 'PAID',
        isFullySettled: true,
      });
      settledCount++;
    } else {
      // PARTIAL SETTLEMENT CASE
      const allocatedForThisBill = remainingFunds;
      remainingFunds = 0.00;
      totalAllocated = roundToPaise(totalAllocated + allocatedForThisBill);

      // Observation O2 Fix (Strategy A): Token payment protection
      // Cash discount cannot be absorbed by a token remittance (allocatedForThisBill <= discountToApply).
      // For substantial partial payments (> discountToApply), prompt discount is granted.
      const discountGranted = allocatedForThisBill > discountToApply ? discountToApply : 0.00;

      // Observation O1 Fix: Maintain strict accounting equality between header and line items
      totalDiscounts = roundToPaise(totalDiscounts + discountGranted);

      const effectiveTotalApplied = roundToPaise(allocatedForThisBill + discountGranted);
      const newPaid = roundToPaise(prevPaid + effectiveTotalApplied);
      const newBalance = roundToPaise(effectivePrevBalance - effectiveTotalApplied);

      const isFullyCleared = newBalance <= 0;
      const status: BillSettlementStatus = isFullyCleared ? 'PAID' : 'PARTIALLY_PAID';

      allocatedBills.push({
        billId: bill.id,
        invoiceId: bill.invoiceId,
        invoiceNo: bill.invoiceNo,
        invoiceDate: bill.invoiceDate,
        originalAmount: origAmt,
        previousPaidAmount: prevPaid,
        previousBalanceAmount: effectivePrevBalance,
        allocatedAmount: allocatedForThisBill,
        discountGranted: discountGranted,
        // Observation O3 Fix: Use newPaid consistently to avoid fabricating paid amounts
        newPaidAmount: newPaid,
        newBalanceAmount: Math.max(0, newBalance),
        status,
        isFullySettled: isFullyCleared,
      });

      if (isFullyCleared) {
        settledCount++;
      } else {
        partialCount++;
      }
    }
  }

  return {
    totalPaymentAmount: roundedPayment,
    totalAllocatedAmount: totalAllocated,
    totalDiscountGranted: totalDiscounts,
    unallocatedAmount: remainingFunds, // Surplus advance funds (EXAMT)
    settledBillCount: settledCount,
    partiallySettledBillCount: partialCount,
    unsettledBillCount: unsettledCount,
    allocatedBills,
  };
}

/**
 * Direct alias for allocateCustomerPayment matching PROJECT.md interface contract.
 */
export const allocateCustomerReceipt = allocateCustomerPayment;

/**
 * Pure TypeScript Bill-by-Bill Supplier Payment Allocation Engine (Feature F27)
 * Parity: PMTENTY.PRG:181–187, SUPOUT.DAT, SUPLED.DAT
 *
 * @param openPurchases Array of open inward purchase bills
 * @param paymentAmount Total disbursement money (PAMT)
 * @param options Allocation options (sortStrategy)
 * @returns Complete allocation breakdown and remaining advance funds
 */
export function allocateSupplierPayment(
  openPurchases: OpenPurchaseBill[],
  paymentAmount: number,
  options: { sortStrategy?: 'FIFO' | 'LIFO' | 'NONE' } = {}
): SupplierPaymentAllocationResult {
  if (paymentAmount < 0) {
    throw new Error('Payment amount cannot be negative');
  }

  const roundedPayment = roundToPaise(paymentAmount);
  const sortedBills = [...openPurchases];
  const strategy = options.sortStrategy ?? 'FIFO';

  if (strategy === 'FIFO') {
    sortedBills.sort((a, b) => {
      const dateComparison = a.inwardDate.localeCompare(b.inwardDate);
      if (dateComparison !== 0) return dateComparison;
      return a.inwardNo.localeCompare(b.inwardNo, undefined, { numeric: true });
    });
  } else if (strategy === 'LIFO') {
    sortedBills.sort((a, b) => {
      const dateComparison = b.inwardDate.localeCompare(a.inwardDate);
      if (dateComparison !== 0) return dateComparison;
      return b.inwardNo.localeCompare(a.inwardNo, undefined, { numeric: true });
    });
  }

  let remainingFunds = roundedPayment;
  let totalAllocated = 0.00;
  let totalDiscounts = 0.00;
  let settledCount = 0;
  let partialCount = 0;
  let unsettledCount = 0;

  const allocatedBills: AllocatedPurchaseBillResult[] = [];

  for (const bill of sortedBills) {
    const prevPaid = roundToPaise(bill.paidAmount);
    const origAmt = roundToPaise(bill.netAmount);
    const effectivePrevBalance = roundToPaise(
      typeof bill.balanceAmount === 'number'
        ? bill.balanceAmount
        : Math.max(0, origAmt - prevPaid)
    );

    if (effectivePrevBalance <= 0) {
      allocatedBills.push({
        purchaseId: bill.id,
        inwardNo: bill.inwardNo,
        supplierBillNo: bill.supplierBillNo,
        inwardDate: bill.inwardDate,
        originalAmount: origAmt,
        previousPaidAmount: prevPaid,
        previousBalanceAmount: 0.00,
        allocatedAmount: 0.00,
        discountGranted: 0.00,
        newPaidAmount: prevPaid,
        newBalanceAmount: 0.00,
        status: 'PAID',
        isFullySettled: true,
      });
      settledCount++;
      continue;
    }

    const discountToApply = roundToPaise(bill.discountEligible || 0);
    const netBalanceNeeded = roundToPaise(Math.max(0, effectivePrevBalance - discountToApply));

    if (remainingFunds <= 0) {
      allocatedBills.push({
        purchaseId: bill.id,
        inwardNo: bill.inwardNo,
        supplierBillNo: bill.supplierBillNo,
        inwardDate: bill.inwardDate,
        originalAmount: origAmt,
        previousPaidAmount: prevPaid,
        previousBalanceAmount: effectivePrevBalance,
        allocatedAmount: 0.00,
        discountGranted: 0.00,
        newPaidAmount: prevPaid,
        newBalanceAmount: effectivePrevBalance,
        status: prevPaid > 0 ? 'PARTIAL' : 'UNPAID',
        isFullySettled: false,
      });
      if (prevPaid > 0) {
        partialCount++;
      } else {
        unsettledCount++;
      }
      continue;
    }

    if (remainingFunds >= netBalanceNeeded) {
      const allocatedForThisBill = netBalanceNeeded;
      remainingFunds = roundToPaise(remainingFunds - allocatedForThisBill);
      totalAllocated = roundToPaise(totalAllocated + allocatedForThisBill);
      totalDiscounts = roundToPaise(totalDiscounts + discountToApply);

      const newPaid = roundToPaise(prevPaid + allocatedForThisBill + discountToApply);
      const newBalance = 0.00;

      allocatedBills.push({
        purchaseId: bill.id,
        inwardNo: bill.inwardNo,
        supplierBillNo: bill.supplierBillNo,
        inwardDate: bill.inwardDate,
        originalAmount: origAmt,
        previousPaidAmount: prevPaid,
        previousBalanceAmount: effectivePrevBalance,
        allocatedAmount: allocatedForThisBill,
        discountGranted: discountToApply,
        newPaidAmount: newPaid,
        newBalanceAmount: newBalance,
        status: 'PAID',
        isFullySettled: true,
      });
      settledCount++;
    } else {
      const allocatedForThisBill = remainingFunds;
      remainingFunds = 0.00;
      totalAllocated = roundToPaise(totalAllocated + allocatedForThisBill);

      const discountGranted = allocatedForThisBill > discountToApply ? discountToApply : 0.00;
      totalDiscounts = roundToPaise(totalDiscounts + discountGranted);

      const effectiveTotalApplied = roundToPaise(allocatedForThisBill + discountGranted);
      const newPaid = roundToPaise(prevPaid + effectiveTotalApplied);
      const newBalance = roundToPaise(effectivePrevBalance - effectiveTotalApplied);

      const isFullyCleared = newBalance <= 0;
      const status: 'UNPAID' | 'PARTIAL' | 'PAID' = isFullyCleared ? 'PAID' : 'PARTIAL';

      allocatedBills.push({
        purchaseId: bill.id,
        inwardNo: bill.inwardNo,
        supplierBillNo: bill.supplierBillNo,
        inwardDate: bill.inwardDate,
        originalAmount: origAmt,
        previousPaidAmount: prevPaid,
        previousBalanceAmount: effectivePrevBalance,
        allocatedAmount: allocatedForThisBill,
        discountGranted,
        newPaidAmount: newPaid,
        newBalanceAmount: Math.max(0, newBalance),
        status,
        isFullySettled: isFullyCleared,
      });

      if (isFullyCleared) {
        settledCount++;
      } else {
        partialCount++;
      }
    }
  }

  return {
    totalPaymentAmount: roundedPayment,
    totalAllocatedAmount: totalAllocated,
    totalDiscountEarned: totalDiscounts,
    unallocatedAmount: remainingFunds,
    settledBillCount: settledCount,
    partiallySettledBillCount: partialCount,
    unsettledBillCount: unsettledCount,
    allocatedBills,
  };
}
