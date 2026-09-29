import { describe, it, expect } from 'vitest';
import {
  allocateStockFIFO,
  analyzeBatchMrps,
  BatchStock,
  allocateCustomerPayment,
  OpenBill,
} from '../../src/lib/business-engine';

describe('Adversarial Stress Testing: FEFO Batch Allocation Fragmentation (Feature F12)', () => {
  // Generator for batches
  function generateBatches(count: number): BatchStock[] {
    const batches: BatchStock[] = [];
    for (let i = 1; i <= count; i++) {
      const month = String(((i - 1) % 12) + 1).padStart(2, '0');
      const year = 2026 + Math.floor((i - 1) / 12);
      batches.push({
        id: `BAT-ID-${String(i).padStart(3, '0')}`,
        batchNo: `BN-${String(i).padStart(3, '0')}`,
        expiryDate: `${year}-${month}-15`,
        purchaseRate: 20 + i,
        sellingRate: 30 + i,
        mrp: 40 + i,
        stockQty: 10 + (i % 5) * 5, // 10, 15, 20, 25, 30 ...
        isBlocked: false,
      });
    }
    return batches;
  }

  it('Stress 1: Allocates large quantity fragmented across 12 small batches in strict FEFO sequence', () => {
    // 12 batches with strictly ascending expiry dates
    const batches = generateBatches(12);
    // Total stock in 12 batches:
    // i=1: 15, i=2: 20, i=3: 25, i=4: 30, i=5: 10, i=6: 15, i=7: 20, i=8: 25, i=9: 30, i=10: 10, i=11: 15, i=12: 20
    const totalAvailable = batches.reduce((sum, b) => sum + b.stockQty, 0);
    expect(totalAvailable).toBe(235);

    // Shuffle input batches to test sorting robustness
    const shuffled = [...batches].sort(() => Math.random() - 0.5);

    // Request 140 billed + 25 free = 165 total (will span across ~9 batches)
    const requestedBilled = 140;
    const requestedFree = 25;
    const totalRequired = requestedBilled + requestedFree;

    const result = allocateStockFIFO(shuffled, requestedBilled, requestedFree, {
      systemDate: '2025-12-01',
    });

    expect(result.success).toBe(true);
    expect(result.isPartiallyAllocated).toBe(false);
    expect(result.totalAllocatedQty).toBe(totalRequired);
    expect(result.totalAllocatedBilledQty).toBe(requestedBilled);
    expect(result.totalAllocatedFreeQty).toBe(requestedFree);
    expect(result.unallocatedQty).toBe(0);

    // Stock Conservation Check across every allocated batch slice
    let accumulatedBilled = 0;
    let accumulatedFree = 0;
    let accumulatedTotal = 0;

    for (let idx = 0; idx < result.allocations.length; idx++) {
      const slice = result.allocations[idx];
      const originalBatch = batches.find((b) => b.id === slice.batchId)!;

      // Invariant: sum of billed + free in slice === totalAllocatedQty
      expect(slice.allocatedBilledQty + slice.allocatedFreeQty).toBe(slice.totalAllocatedQty);

      // Invariant: remainingBatchStock + totalAllocatedQty === original stockQty
      expect(slice.remainingBatchStock + slice.totalAllocatedQty).toBe(originalBatch.stockQty);

      // Invariant: grossAmount === billedQty * sellingRate
      expect(slice.grossAmount).toBe(Number((slice.allocatedBilledQty * slice.sellingRate).toFixed(2)));

      accumulatedBilled += slice.allocatedBilledQty;
      accumulatedFree += slice.allocatedFreeQty;
      accumulatedTotal += slice.totalAllocatedQty;

      // Invariant: strict FEFO ordering (expiryDate non-decreasing)
      if (idx > 0) {
        const prevSlice = result.allocations[idx - 1];
        expect(slice.expiryDate >= prevSlice.expiryDate).toBe(true);
      }
    }

    expect(accumulatedBilled).toBe(requestedBilled);
    expect(accumulatedFree).toBe(requestedFree);
    expect(accumulatedTotal).toBe(totalRequired);
    // Verifying it fragmented across at least 8 batches
    expect(result.allocations.length).toBeGreaterThanOrEqual(8);
  });

  it('Stress 2: Conservation under stock shortage across 15 fragmented batches with partial allocation', () => {
    const batches = generateBatches(15);
    const totalAvailable = batches.reduce((sum, b) => sum + b.stockQty, 0);

    // Request more than available: totalAvailable + 50
    const requestedBilled = totalAvailable;
    const requestedFree = 50;

    const result = allocateStockFIFO(batches, requestedBilled, requestedFree, {
      systemDate: '2025-12-01',
      allowPartialAllocation: true,
    });

    expect(result.success).toBe(false);
    expect(result.isPartiallyAllocated).toBe(true);
    expect(result.totalAllocatedQty).toBe(totalAvailable);
    expect(result.unallocatedQty).toBe(50);
    expect(result.totalAllocatedBilledQty).toBe(requestedBilled);
    expect(result.totalAllocatedFreeQty).toBe(0);
    expect(result.unallocatedFreeQty).toBe(50);

    // All 15 batches must be completely drained
    expect(result.allocations.length).toBe(15);
    for (const slice of result.allocations) {
      expect(slice.remainingBatchStock).toBe(0);
    }
  });

  it('Stress 3: Strict FIFO sequence tie-breaker with identical expiry dates across 10 batches', () => {
    const batches: BatchStock[] = [];
    // 10 batches all expiring on the exact same date
    for (let i = 1; i <= 10; i++) {
      batches.push({
        id: `BAT-ID-${String(i).padStart(3, '0')}`,
        batchNo: `LOT-${String(11 - i).padStart(3, '0')}`, // Reverse batch numbers: LOT-010 down to LOT-001
        expiryDate: '2027-06-30',
        purchaseRate: 20,
        sellingRate: 30,
        mrp: 40,
        stockQty: 5,
      });
    }

    // Allocate 15 units (should take 3 batches)
    const result = allocateStockFIFO(batches, 15, 0, {
      systemDate: '2026-01-01',
    });

    expect(result.success).toBe(true);
    expect(result.allocations.length).toBe(3);
    // Batch numbers should be in ascending tie-breaker order: LOT-001, LOT-002, LOT-003
    expect(result.allocations[0].batchNo).toBe('LOT-001');
    expect(result.allocations[1].batchNo).toBe('LOT-002');
    expect(result.allocations[2].batchNo).toBe('LOT-003');
  });

  it('Stress 4: Expired and blocked batches are completely ignored in multi-batch pool', () => {
    const batches: BatchStock[] = [
      { id: 'b-exp1', batchNo: 'EXP-1', expiryDate: '2025-01-01', stockQty: 50, sellingRate: 10, purchaseRate: 8, mrp: 15 },
      { id: 'b-exp2', batchNo: 'EXP-2', expiryDate: '2025-12-31', stockQty: 50, sellingRate: 10, purchaseRate: 8, mrp: 15 },
      { id: 'b-blk1', batchNo: 'BLK-1', expiryDate: '2027-01-01', stockQty: 50, sellingRate: 10, purchaseRate: 8, mrp: 15, isBlocked: true },
      { id: 'b-act1', batchNo: 'ACT-1', expiryDate: '2026-06-01', stockQty: 20, sellingRate: 10, purchaseRate: 8, mrp: 15 },
      { id: 'b-act2', batchNo: 'ACT-2', expiryDate: '2026-08-01', stockQty: 30, sellingRate: 10, purchaseRate: 8, mrp: 15 },
    ];

    const result = allocateStockFIFO(batches, 40, 0, {
      systemDate: '2026-01-01',
      excludeExpired: true,
    });

    expect(result.success).toBe(true);
    expect(result.allocations.length).toBe(2);
    expect(result.allocations.map((a) => a.batchNo)).toEqual(['ACT-1', 'ACT-2']);
    expect(result.allocations[0].allocatedBilledQty).toBe(20);
    expect(result.allocations[1].allocatedBilledQty).toBe(20);
  });

  it('Stress 5: Fractional / decimal stock allocation precision across batch slices', () => {
    const batches: BatchStock[] = [
      { id: 'b1', batchNo: 'BN-DEC1', expiryDate: '2026-06-01', stockQty: 12.5, sellingRate: 100, purchaseRate: 80, mrp: 120 },
      { id: 'b2', batchNo: 'BN-DEC2', expiryDate: '2026-07-01', stockQty: 25.5, sellingRate: 100, purchaseRate: 80, mrp: 120 },
    ];

    // Request: 10.25 billed + 3.50 free = 13.75 total
    const result = allocateStockFIFO(batches, 10.25, 3.5, { systemDate: '2026-01-01' });

    expect(result.success).toBe(true);
    expect(result.totalAllocatedQty).toBe(13.75);
    expect(result.totalAllocatedBilledQty).toBe(10.25);
    expect(result.totalAllocatedFreeQty).toBe(3.5);
    expect(result.unallocatedQty).toBe(0);

    // Slice 1: Takes all 12.5 (10.25 billed + 2.25 free)
    expect(result.allocations[0].allocatedBilledQty).toBe(10.25);
    expect(result.allocations[0].allocatedFreeQty).toBe(2.25);
    expect(result.allocations[0].remainingBatchStock).toBe(0);

    // Slice 2: Takes remaining 1.25 (0 billed + 1.25 free)
    expect(result.allocations[1].allocatedBilledQty).toBe(0);
    expect(result.allocations[1].allocatedFreeQty).toBe(1.25);
    expect(result.allocations[1].remainingBatchStock).toBe(24.25);
  });
});

describe('Adversarial Stress Testing: Multi-MRP Detection & Filtering (Feature F12)', () => {
  it('detects uniform MRP correctly across 10 batches (hasMultiMrp = false)', () => {
    const batches: BatchStock[] = [];
    for (let i = 1; i <= 10; i++) {
      batches.push({
        id: `B${i}`,
        batchNo: `BN-${i}`,
        expiryDate: `2026-${String(i).padStart(2, '0')}-01`,
        purchaseRate: 20,
        sellingRate: 30,
        mrp: 50.00, // Identical MRP
        stockQty: 10,
      });
    }

    const analysis = analyzeBatchMrps(batches);
    expect(analysis.hasMultiMrp).toBe(false);
    expect(analysis.distinctMrps).toEqual([50.00]);
    expect(analysis.mrpStockMap[50.00]).toBe(100);

    const allocResult = allocateStockFIFO(batches, 35, 0, { systemDate: '2025-01-01' });
    expect(allocResult.hasMultiMrp).toBe(false);
    expect(allocResult.distinctMrps).toEqual([50.00]);
    expect(allocResult.requiresMrpSelectionPrompt).toBe(false);
    expect(allocResult.availableMrps).toEqual([50.00]);
  });

  it('detects multi-MRP across 15 batches with 4 distinct MRP values', () => {
    const mrpList = [45.00, 50.00, 55.00, 60.00];
    const batches: BatchStock[] = [];
    for (let i = 1; i <= 15; i++) {
      const mrp = mrpList[(i - 1) % 4];
      batches.push({
        id: `B${i}`,
        batchNo: `BN-${i}`,
        expiryDate: `2026-${String(((i - 1) % 12) + 1).padStart(2, '0')}-15`,
        purchaseRate: 20,
        sellingRate: mrp - 5,
        mrp,
        stockQty: 10,
      });
    }

    const analysis = analyzeBatchMrps(batches);
    expect(analysis.hasMultiMrp).toBe(true);
    expect(analysis.distinctMrps).toEqual([45.00, 50.00, 55.00, 60.00]);
    expect(analysis.mrpStockMap[45.00]).toBe(40); // i = 1, 5, 9, 13
    expect(analysis.mrpStockMap[50.00]).toBe(40); // i = 2, 6, 10, 14
    expect(analysis.mrpStockMap[55.00]).toBe(40); // i = 3, 7, 11, 15
    expect(analysis.mrpStockMap[60.00]).toBe(30); // i = 4, 8, 12

    // Allocation spanning across batches with differing MRPs
    const allocResult = allocateStockFIFO(batches, 50, 0, { systemDate: '2025-01-01' });
    expect(allocResult.requiresMrpSelectionPrompt).toBe(true);
    expect(allocResult.hasMultiMrp).toBe(true);
    expect(allocResult.availableMrps).toEqual([45.00, 50.00, 55.00, 60.00]);
    expect(allocResult.distinctMrps.length).toBeGreaterThan(1);
  });

  it('isolates target MRP strictly when targetMrp filter is specified', () => {
    const batches: BatchStock[] = [
      { id: 'b1', batchNo: 'BN1', expiryDate: '2026-02-01', stockQty: 20, mrp: 40.00, sellingRate: 35, purchaseRate: 25 },
      { id: 'b2', batchNo: 'BN2', expiryDate: '2026-03-01', stockQty: 20, mrp: 50.00, sellingRate: 42, purchaseRate: 30 },
      { id: 'b3', batchNo: 'BN3', expiryDate: '2026-04-01', stockQty: 30, mrp: 50.00, sellingRate: 42, purchaseRate: 30 },
      { id: 'b4', batchNo: 'BN4', expiryDate: '2026-05-01', stockQty: 20, mrp: 60.00, sellingRate: 50, purchaseRate: 38 },
    ];

    const result = allocateStockFIFO(batches, 35, 0, {
      systemDate: '2026-01-01',
      targetMrp: 50.00,
    });

    expect(result.success).toBe(true);
    expect(result.allocations.length).toBe(2);
    expect(result.allocations.every((a) => a.mrp === 50.00)).toBe(true);
    expect(result.hasMultiMrp).toBe(false);
    expect(result.distinctMrps).toEqual([50.00]);
    expect(result.totalAllocatedQty).toBe(35);
  });

  it('Challenge 4 (Determinism Probe): enforceSingleMrp tie-breaking when earliest batches have identical expiry but differing MRP', () => {
    // Two batches with the same earliest expiry date, but differing batchNo and MRP
    const batch1: BatchStock = {
      id: 'bat-02',
      batchNo: 'B-02',
      expiryDate: '2026-06-30',
      stockQty: 20,
      mrp: 60.00,
      sellingRate: 50.00,
      purchaseRate: 40.00,
    };
    const batch2: BatchStock = {
      id: 'bat-01',
      batchNo: 'B-01', // Lower batchNo, should win deterministic tie-breaker
      expiryDate: '2026-06-30',
      stockQty: 20,
      mrp: 50.00,
      sellingRate: 40.00,
      purchaseRate: 30.00,
    };

    // Passing [batch1, batch2] vs [batch2, batch1]
    const resA = allocateStockFIFO([batch1, batch2], 10, 0, {
      systemDate: '2026-01-01',
      enforceSingleMrp: true,
    });
    const resB = allocateStockFIFO([batch2, batch1], 10, 0, {
      systemDate: '2026-01-01',
      enforceSingleMrp: true,
    });

    // In a deterministic FIFO engine, the chosen primary MRP must be independent of input array order!
    // Since B-01 < B-02, batch2 should be the primary batch in both cases.
    expect(resA.allocations[0].batchNo).toBe(resB.allocations[0].batchNo);
    expect(resA.distinctMrps).toEqual(resB.distinctMrps);
  });
});

describe('Adversarial Stress Testing: Bill-by-Bill Customer Ledger Payment Allocation (Feature F13)', () => {
  // Helper to generate 25 open invoices
  function generateOpenBills(count: number = 25): OpenBill[] {
    const bills: OpenBill[] = [];
    for (let i = 1; i <= count; i++) {
      const month = String(((i - 1) % 12) + 1).padStart(2, '0');
      const day = String(((i * 3) % 25) + 1).padStart(2, '0');
      const invDate = `2026-${month}-${day}`;
      // Due date 21 days later
      const dueDayNum = ((i * 3) % 25) + 1 + 21;
      const dueMonth = dueDayNum > 28 ? String(((i - 1) % 12) + 2).padStart(2, '0') : month;
      const dueDay = String(dueDayNum > 28 ? dueDayNum - 28 : dueDayNum).padStart(2, '0');
      const dueDate = `2026-${dueMonth}-${dueDay}`;

      const origAmt = 1000 + i * 150; // 1150, 1300, 1450...
      const prevPaid = i % 4 === 0 ? 300 : 0; // Every 4th bill has prior partial payment
      const balance = origAmt - prevPaid;
      const cdEligible = i % 2 === 0 ? 50 : 0; // Even bills eligible for cash discount

      bills.push({
        id: `BILL-${String(i).padStart(3, '0')}`,
        invoiceId: `INV-${String(i).padStart(3, '0')}`,
        invoiceNo: `${1000 + i}`,
        invoiceDate: invDate,
        dueDate,
        originalAmount: origAmt,
        paidAmount: prevPaid,
        balanceAmount: balance,
        cashDiscountEligible: cdEligible,
        cashDiscountPct: cdEligible > 0 ? 2.5 : 0,
      });
    }
    return bills;
  }

  it('Stress 1: Shuffled 25 open bills are sorted in strict chronological FIFO order', () => {
    const bills = generateOpenBills(25);
    const shuffled = [...bills].sort(() => Math.random() - 0.5);

    // Pay a small amount that only clears the first 2 chronological bills
    const result = allocateCustomerPayment(shuffled, 2000.00);

    // Verify chronological sequence in allocatedBills
    for (let idx = 0; idx < result.allocatedBills.length - 1; idx++) {
      const curr = result.allocatedBills[idx];
      const next = result.allocatedBills[idx + 1];
      const cmp = curr.invoiceDate.localeCompare(next.invoiceDate);
      if (cmp === 0) {
        expect(curr.invoiceNo.localeCompare(next.invoiceNo, undefined, { numeric: true })).toBeLessThanOrEqual(0);
      } else {
        expect(cmp).toBeLessThanOrEqual(0);
      }
    }
  });

  it('Stress 2: Exact payment matching the first bill in 25 open bills', () => {
    const bills = generateOpenBills(25);
    // Find the chronologically earliest bill
    const sorted = [...bills].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.invoiceNo.localeCompare(b.invoiceNo));
    const firstBill = sorted[0];

    const result = allocateCustomerPayment(bills, firstBill.balanceAmount);

    expect(result.totalAllocatedAmount).toBe(firstBill.balanceAmount);
    expect(result.unallocatedAmount).toBe(0.00);
    expect(result.settledBillCount).toBe(1);

    const allocatedFirst = result.allocatedBills.find((b) => b.billId === firstBill.id)!;
    expect(allocatedFirst.status).toBe('PAID');
    expect(allocatedFirst.newBalanceAmount).toBe(0.00);
    expect(allocatedFirst.isFullySettled).toBe(true);

    // All subsequent bills must have 0 allocated
    for (const b of result.allocatedBills.slice(1)) {
      expect(b.allocatedAmount).toBe(0.00);
      expect(b.status).not.toBe('PAID');
    }
  });

  it('Stress 3: Partial payment cascading across 25 open bills leaves intermediate bill PARTIALLY_PAID', () => {
    const bills = generateOpenBills(25);
    const sorted = [...bills].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.invoiceNo.localeCompare(b.invoiceNo));

    // Pay sum of first 5 bills + half of 6th bill
    const sumFirst5 = sorted.slice(0, 5).reduce((s, b) => s + b.balanceAmount, 0);
    const half6th = Math.floor(sorted[5].balanceAmount / 2);
    const totalPayment = sumFirst5 + half6th;

    const result = allocateCustomerPayment(bills, totalPayment);

    expect(result.totalPaymentAmount).toBe(totalPayment);
    expect(result.totalAllocatedAmount).toBe(totalPayment);
    expect(result.unallocatedAmount).toBe(0.00);

    // First 5 bills PAID
    for (let i = 0; i < 5; i++) {
      expect(result.allocatedBills[i].status).toBe('PAID');
      expect(result.allocatedBills[i].newBalanceAmount).toBe(0.00);
    }
    // 6th bill PARTIALLY_PAID
    expect(result.allocatedBills[5].status).toBe('PARTIALLY_PAID');
    expect(result.allocatedBills[5].allocatedAmount).toBe(half6th);
    expect(result.allocatedBills[5].newBalanceAmount).toBe(sorted[5].balanceAmount - half6th);

    // Cumulative status count: 5 settled + (1 newly partially paid + 6 prior partially paid) = 7 partially settled
    expect(result.settledBillCount).toBe(5);
    expect(result.partiallySettledBillCount).toBe(7);
    expect(result.unsettledBillCount).toBe(13);
    expect(result.settledBillCount + result.partiallySettledBillCount + result.unsettledBillCount).toBe(25);

    // Remaining bills: allocatedAmount === 0
    for (let i = 6; i < 25; i++) {
      expect(result.allocatedBills[i].allocatedAmount).toBe(0.00);
    }
  });

  it('Stress 4: Excess advance collection (EXAMT) retains unallocated customer surplus credit across 25 bills', () => {
    const bills = generateOpenBills(25);
    const totalBalance = bills.reduce((sum, b) => sum + b.balanceAmount, 0);

    const paymentAmount = totalBalance + 15432.50; // Excess 15,432.50
    const result = allocateCustomerPayment(bills, paymentAmount);

    expect(result.totalPaymentAmount).toBe(paymentAmount);
    expect(result.totalAllocatedAmount).toBe(totalBalance);
    expect(result.unallocatedAmount).toBe(15432.50); // EXAMT
    expect(result.settledBillCount).toBe(25);
    expect(result.partiallySettledBillCount).toBe(0);
    expect(result.unsettledBillCount).toBe(0);

    for (const slice of result.allocatedBills) {
      expect(slice.status).toBe('PAID');
      expect(slice.newBalanceAmount).toBe(0.00);
      expect(slice.isFullySettled).toBe(true);
    }
  });

  it('Stress 5: Prompt cash discount evaluates due date correctly across mixed prompt and overdue bills', () => {
    const bills: OpenBill[] = [
      {
        id: 'B-OVERDUE',
        invoiceId: 'INV-1',
        invoiceNo: '101',
        invoiceDate: '2026-04-01',
        dueDate: '2026-04-15', // Overdue relative to receiptDate 2026-04-20
        originalAmount: 1000.00,
        paidAmount: 0,
        balanceAmount: 1000.00,
        cashDiscountEligible: 50.00,
      },
      {
        id: 'B-PROMPT',
        invoiceId: 'INV-2',
        invoiceNo: '102',
        invoiceDate: '2026-04-10',
        dueDate: '2026-04-25', // Valid prompt receipt!
        originalAmount: 1000.00,
        paidAmount: 0,
        balanceAmount: 1000.00,
        cashDiscountEligible: 50.00,
      },
    ];

    // Pay 1000 + 950 = 1950.00 on 2026-04-20
    const result = allocateCustomerPayment(bills, 1950.00, {
      applyCashDiscount: true,
      receiptDate: '2026-04-20',
    });

    // Overdue bill B-OVERDUE: NO discount granted, full 1000 allocated
    expect(result.allocatedBills[0].billId).toBe('B-OVERDUE');
    expect(result.allocatedBills[0].discountGranted).toBe(0.00);
    expect(result.allocatedBills[0].allocatedAmount).toBe(1000.00);
    expect(result.allocatedBills[0].status).toBe('PAID');

    // Prompt bill B-PROMPT: 50 discount granted, 950 allocated
    expect(result.allocatedBills[1].billId).toBe('B-PROMPT');
    expect(result.allocatedBills[1].discountGranted).toBe(50.00);
    expect(result.allocatedBills[1].allocatedAmount).toBe(950.00);
    expect(result.allocatedBills[1].status).toBe('PAID');

    expect(result.totalDiscountGranted).toBe(50.00);
    expect(result.totalAllocatedAmount).toBe(1950.00);
    expect(result.unallocatedAmount).toBe(0.00);
  });

  describe('Adversarial Challenges & Counterexamples (Feature F13 Invariant Violations)', () => {
    it('Counterexample 1: totalDiscountGranted header vs line item mismatch on partial settlement', () => {
      // Invariant: Header totalDiscountGranted must equal sum of discountGranted on all bill lines
      const bill: OpenBill = {
        id: 'B1',
        invoiceId: 'INV1',
        invoiceNo: '101',
        invoiceDate: '2026-05-01',
        dueDate: '2026-05-25',
        originalAmount: 1000.00,
        paidAmount: 0,
        balanceAmount: 1000.00,
        cashDiscountEligible: 50.00,
      };

      // Customer pays 400 (partial payment)
      const result = allocateCustomerPayment([bill], 400.00, {
        applyCashDiscount: true,
        receiptDate: '2026-05-10',
      });

      const sumDiscountsInLines = result.allocatedBills.reduce((s, b) => s + b.discountGranted, 0);

      // Demonstrates Bug 1: Line item granted 50.00 discount, but result.totalDiscountGranted is 0.00!
      // This test captures the exact violation:
      expect({
        headerTotalDiscount: result.totalDiscountGranted,
        lineItemDiscountsSum: sumDiscountsInLines,
        newBalance: result.allocatedBills[0].newBalanceAmount,
      }).toEqual({
        headerTotalDiscount: 50.00, // Should be 50.00 if discount was granted
        lineItemDiscountsSum: 50.00,
        newBalance: 550.00,
      });
    });

    it('Counterexample 2: Phantom payment creation when bill has credit note/return balance reduction', () => {
      // Invariant: types.ts:483: newPaidAmount === previousPaidAmount + allocatedAmount + discountGranted
      const bill: OpenBill = {
        id: 'B-CN',
        invoiceId: 'INV-10',
        invoiceNo: '1010',
        invoiceDate: '2026-01-01',
        dueDate: '2026-01-25',
        originalAmount: 10000.00,
        paidAmount: 0.00, // No cash paid yet
        balanceAmount: 4000.00, // 6000 was adjusted by Credit Note / Sales Return
      };

      // Customer pays remaining 4000.00 balance
      const result = allocateCustomerPayment([bill], 4000.00);

      const billResult = result.allocatedBills[0];
      const expectedPaid = billResult.previousPaidAmount + billResult.allocatedAmount + billResult.discountGranted;

      // Demonstrates Bug 3: Hardcoded `newPaid = origAmt` sets newPaidAmount to 10000 instead of 4000!
      expect(billResult.newPaidAmount).toBe(expectedPaid); // Expected: 4000, Actual: 10000 (creates 6000 phantom paid)
    });

    it('Counterexample 3: Token partial payment absorbs full cash discount', () => {
      // Invariant: A token partial payment of 1 rupee should not grant 50 rupees discount
      const bill: OpenBill = {
        id: 'B1',
        invoiceId: 'INV1',
        invoiceNo: '101',
        invoiceDate: '2026-05-01',
        dueDate: '2026-05-25',
        originalAmount: 1000.00,
        paidAmount: 0,
        balanceAmount: 1000.00,
        cashDiscountEligible: 50.00,
      };

      // Customer pays only 1.00 rupee
      const result = allocateCustomerPayment([bill], 1.00, {
        applyCashDiscount: true,
        receiptDate: '2026-05-10',
      });

      // Demonstrates Bug 2: Customer pays 1.00, gets 50.00 discount granted, reducing debt by 51.00!
      // In proper accounting, paying 1.00 does not clear 51.00 of debt.
      expect(result.allocatedBills[0].discountGranted).toBe(0.00); // Should be 0 (or proportional) on partial settlement
    });
  });
});
