import { describe, it, expect } from 'vitest';
import {
  allocateStockFIFO,
  BatchStock,
  allocateCustomerPayment,
  OpenBill,
  roundToPaise,
} from '../../src/lib/business-engine';

// Utility: Generate all permutations of an array
function getPermutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const current = arr[i];
    const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
    const subPerms = getPermutations(remaining);
    for (const p of subPerms) {
      result.push([current, ...p]);
    }
  }
  return result;
}

// Utility: Fisher-Yates shuffle with deterministic PRNG seed
function shuffleArray<T>(arr: T[], seed: number = 42): T[] {
  const copy = [...arr];
  let s = seed;
  const pseudoRandom = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(pseudoRandom() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

describe('Adversarial Fuzzing: fifoAllocation Determinism & Tie-Breaking (Feature F12)', () => {
  it('Fuzz 1: All 120 permutations of 5 batches with identical expiry date yield strictly identical single-MRP allocation', () => {
    // 5 batches sharing the exact same earliest expiry date, but different batchNo and MRPs
    const batches: BatchStock[] = [
      {
        id: 'bat-03',
        batchNo: 'BN-03',
        expiryDate: '2026-10-31',
        stockQty: 25,
        mrp: 60.00,
        sellingRate: 50.00,
        purchaseRate: 40.00,
        isBlocked: false,
      },
      {
        id: 'bat-01',
        batchNo: 'BN-01', // Lowest batchNo -> must win tie-breaker and establish primaryMrp = 50.00
        expiryDate: '2026-10-31',
        stockQty: 20,
        mrp: 50.00,
        sellingRate: 42.00,
        purchaseRate: 35.00,
        isBlocked: false,
      },
      {
        id: 'bat-02',
        batchNo: 'BN-02', // Matches primaryMrp = 50.00, second in line after BN-01
        expiryDate: '2026-10-31',
        stockQty: 30,
        mrp: 50.00,
        sellingRate: 42.00,
        purchaseRate: 35.00,
        isBlocked: false,
      },
      {
        id: 'bat-04',
        batchNo: 'BN-04',
        expiryDate: '2026-10-31',
        stockQty: 15,
        mrp: 75.00,
        sellingRate: 65.00,
        purchaseRate: 55.00,
        isBlocked: false,
      },
      {
        id: 'bat-05',
        batchNo: 'BN-05',
        expiryDate: '2026-10-31',
        stockQty: 10,
        mrp: 50.00, // Third batch matching primaryMrp = 50.00
        sellingRate: 42.00,
        purchaseRate: 35.00,
        isBlocked: false,
      },
    ];

    const permutations = getPermutations(batches);
    expect(permutations.length).toBe(120);

    // Compute baseline result using canonical order
    const baseline = allocateStockFIFO(batches, 35, 10, {
      systemDate: '2026-01-01',
      enforceSingleMrp: true,
    });

    expect(baseline.success).toBe(true);
    expect(baseline.totalAllocatedQty).toBe(45);
    expect(baseline.distinctMrps).toEqual([50.00]);
    // Must have chosen BN-01 (stock 20) and BN-02 (takes 25 of 30)
    expect(baseline.allocations.length).toBe(2);
    expect(baseline.allocations[0].batchNo).toBe('BN-01');
    expect(baseline.allocations[0].totalAllocatedQty).toBe(20);
    expect(baseline.allocations[1].batchNo).toBe('BN-02');
    expect(baseline.allocations[1].totalAllocatedQty).toBe(25);

    // Assert that every single one of the 120 permutations produces EXACTLY the same outcome
    for (let pIdx = 0; pIdx < permutations.length; pIdx++) {
      const permuted = permutations[pIdx];
      const result = allocateStockFIFO(permuted, 35, 10, {
        systemDate: '2026-01-01',
        enforceSingleMrp: true,
      });

      expect(result.success).toBe(baseline.success);
      expect(result.totalAllocatedQty).toBe(baseline.totalAllocatedQty);
      expect(result.distinctMrps).toEqual(baseline.distinctMrps);
      expect(result.allocations.length).toBe(baseline.allocations.length);

      for (let aIdx = 0; aIdx < result.allocations.length; aIdx++) {
        expect(result.allocations[aIdx].batchId).toBe(baseline.allocations[aIdx].batchId);
        expect(result.allocations[aIdx].batchNo).toBe(baseline.allocations[aIdx].batchNo);
        expect(result.allocations[aIdx].totalAllocatedQty).toBe(baseline.allocations[aIdx].totalAllocatedQty);
        expect(result.allocations[aIdx].allocatedBilledQty).toBe(baseline.allocations[aIdx].allocatedBilledQty);
        expect(result.allocations[aIdx].allocatedFreeQty).toBe(baseline.allocations[aIdx].allocatedFreeQty);
        expect(result.allocations[aIdx].remainingBatchStock).toBe(baseline.allocations[aIdx].remainingBatchStock);
        expect(result.allocations[aIdx].grossAmount).toBe(baseline.allocations[aIdx].grossAmount);
      }
    }
  });

  it('Fuzz 2: Tertiary tie-breaker determinism when batches share both expiryDate AND batchNo', () => {
    // 4 batches with identical expiry date AND identical batchNo, differing only by primary key ID
    const batches: BatchStock[] = [
      {
        id: 'BAT-SPLIT-D',
        batchNo: 'LOT-999',
        expiryDate: '2026-12-31',
        stockQty: 10,
        mrp: 100.00,
        sellingRate: 80.00,
        purchaseRate: 70.00,
      },
      {
        id: 'BAT-SPLIT-A', // Lowest ID -> must win tertiary tie-breaker
        batchNo: 'LOT-999',
        expiryDate: '2026-12-31',
        stockQty: 15,
        mrp: 100.00,
        sellingRate: 80.00,
        purchaseRate: 70.00,
      },
      {
        id: 'BAT-SPLIT-C',
        batchNo: 'LOT-999',
        expiryDate: '2026-12-31',
        stockQty: 20,
        mrp: 100.00,
        sellingRate: 80.00,
        purchaseRate: 70.00,
      },
      {
        id: 'BAT-SPLIT-B',
        batchNo: 'LOT-999',
        expiryDate: '2026-12-31',
        stockQty: 25,
        mrp: 100.00,
        sellingRate: 80.00,
        purchaseRate: 70.00,
      },
    ];

    const permutations = getPermutations(batches);
    expect(permutations.length).toBe(24);

    const baseline = allocateStockFIFO(batches, 30, 0, { systemDate: '2026-01-01' });
    expect(baseline.allocations[0].batchId).toBe('BAT-SPLIT-A'); // 15 units
    expect(baseline.allocations[1].batchId).toBe('BAT-SPLIT-B'); // 15 of 25 units

    for (const perm of permutations) {
      const res = allocateStockFIFO(perm, 30, 0, { systemDate: '2026-01-01' });
      expect(res.allocations[0].batchId).toBe('BAT-SPLIT-A');
      expect(res.allocations[1].batchId).toBe('BAT-SPLIT-B');
      expect(res.allocations.length).toBe(2);
    }
  });

  it('Fuzz 3: 500 random shuffles of 12 multi-cluster batches preserve strict FEFO chronology and conservation', () => {
    // 12 batches across 3 date clusters, with multiple MRPs within each cluster
    const clusterBatches: BatchStock[] = [];
    const dates = ['2026-06-30', '2026-09-30', '2026-12-31'];
    let counter = 1;

    for (const d of dates) {
      for (let b = 1; b <= 4; b++) {
        clusterBatches.push({
          id: `ID-${String(counter).padStart(3, '0')}`,
          batchNo: `B-${String(counter).padStart(3, '0')}`,
          expiryDate: d,
          stockQty: 10 + b * 2, // 12, 14, 16, 18
          mrp: 50 + (b % 2) * 10, // 50 or 60
          sellingRate: 40 + (b % 2) * 8,
          purchaseRate: 30 + (b % 2) * 5,
        });
        counter++;
      }
    }

    const baseline = allocateStockFIFO(clusterBatches, 80, 20, { systemDate: '2026-01-01' });
    expect(baseline.success).toBe(true);
    expect(baseline.totalAllocatedQty).toBe(100);

    for (let run = 1; run <= 500; run++) {
      const shuffled = shuffleArray(clusterBatches, run * 31);
      const res = allocateStockFIFO(shuffled, 80, 20, { systemDate: '2026-01-01' });

      expect(res.success).toBe(true);
      expect(res.totalAllocatedQty).toBe(100);
      expect(res.totalAllocatedBilledQty).toBe(80);
      expect(res.totalAllocatedFreeQty).toBe(20);
      expect(res.allocations.length).toBe(baseline.allocations.length);

      // Verify strict chronological non-decreasing expiryDate across slices
      for (let i = 1; i < res.allocations.length; i++) {
        expect(res.allocations[i].expiryDate >= res.allocations[i - 1].expiryDate).toBe(true);
      }

      // Verify identical batch allocation sequence
      for (let i = 0; i < res.allocations.length; i++) {
        expect(res.allocations[i].batchId).toBe(baseline.allocations[i].batchId);
        expect(res.allocations[i].totalAllocatedQty).toBe(baseline.allocations[i].totalAllocatedQty);
      }
    }
  });

  it('Fuzz 4: Fractional stock allocation under 100 permutations avoids floating point drift', () => {
    const fractionalBatches: BatchStock[] = [
      {
        id: 'FRAC-1',
        batchNo: 'FB-01',
        expiryDate: '2026-08-15',
        stockQty: 10.25,
        mrp: 50.00,
        sellingRate: 40.00,
        purchaseRate: 30.00,
      },
      {
        id: 'FRAC-2',
        batchNo: 'FB-02',
        expiryDate: '2026-08-15',
        stockQty: 15.50,
        mrp: 50.00,
        sellingRate: 40.00,
        purchaseRate: 30.00,
      },
      {
        id: 'FRAC-3',
        batchNo: 'FB-03',
        expiryDate: '2026-09-15',
        stockQty: 20.75,
        mrp: 50.00,
        sellingRate: 40.00,
        purchaseRate: 30.00,
      },
    ];

    const perms = getPermutations(fractionalBatches);
    for (const p of perms) {
      const res = allocateStockFIFO(p, 18.25, 4.50, { systemDate: '2026-01-01' });
      expect(res.success).toBe(true);
      expect(res.totalAllocatedQty).toBe(22.75);
      expect(res.totalAllocatedBilledQty).toBe(18.25);
      expect(res.totalAllocatedFreeQty).toBe(4.50);
      expect(res.unallocatedQty).toBe(0);

      // Verify conservation
      let sumAllocated = 0;
      for (const a of res.allocations) {
        sumAllocated += a.totalAllocatedQty;
      }
      expect(sumAllocated).toBe(22.75);
    }
  });
});

describe('Adversarial Fuzzing: ledgerAllocation Cash Discount Threshold Sweeps (Feature F13)', () => {
  it('Fuzz 5: Micro-step payment sweep around cash discount threshold (0.00 to 1,200.00)', () => {
    // Bill has balance 1,000.00 with prompt discount 50.00. Net balance needed = 950.00.
    const bill: OpenBill = {
      id: 'BILL-SWEEP-1',
      invoiceId: 'INV-S1',
      invoiceNo: 'S-101',
      invoiceDate: '2026-06-01',
      dueDate: '2026-06-25',
      originalAmount: 1000.00,
      paidAmount: 0.00,
      balanceAmount: 1000.00,
      cashDiscountEligible: 50.00,
    };

    // Critical test points around:
    // - 0.00 (zero payment)
    // - 50.00 (token boundary: <= 50.00 gets 0 discount, > 50.00 gets 50.00 discount)
    // - 950.00 (net balance threshold: < 950 is partial, >= 950 is full settlement)
    // - 1000.00 (gross balance)
    // - 1200.00 (advance surplus)
    const testPayments = [
      0.00,
      0.01,
      1.00,
      10.00,
      49.00,
      49.99,
      50.00, // Token threshold upper limit: must NOT grant discount
      50.01, // Substantial partial: grants 50.00 discount
      50.02,
      50.10,
      51.00,
      100.00,
      250.00,
      500.00,
      750.00,
      949.00,
      949.90,
      949.99, // Net threshold lower limit: partial settlement leaving 0.01 balance
      950.00, // Exact net balance: full settlement
      950.01, // Advance surplus of 0.01
      950.50,
      999.99,
      1000.00,
      1150.00,
    ];

    for (const payment of testPayments) {
      const result = allocateCustomerPayment([bill], payment, {
        applyCashDiscount: true,
        receiptDate: '2026-06-10', // Within due date
      });

      const line = result.allocatedBills[0];

      // Invariant 1: Total Money Conservation
      const moneySum = roundToPaise(result.totalAllocatedAmount + result.unallocatedAmount);
      expect(moneySum).toBe(roundToPaise(payment));

      // Invariant 2: Header Discount === Line Item Discount Sum
      expect(result.totalDiscountGranted).toBe(line.discountGranted);

      // Invariant 3: Balance Deduction Identity
      const expectedBalance = roundToPaise(line.previousBalanceAmount - (line.allocatedAmount + line.discountGranted));
      expect(line.newBalanceAmount).toBe(expectedBalance);

      // Invariant 4: Cumulative Paid Amount Identity (types.ts:483)
      const expectedPaid = roundToPaise(line.previousPaidAmount + line.allocatedAmount + line.discountGranted);
      expect(line.newPaidAmount).toBe(expectedPaid);

      // Invariant 5: Non-negative Balances and Allocations
      expect(line.newBalanceAmount).toBeGreaterThanOrEqual(0);
      expect(line.allocatedAmount).toBeGreaterThanOrEqual(0);
      expect(line.allocatedAmount).toBeLessThanOrEqual(payment);

      // Threshold-Specific Invariants:
      if (payment === 0.00) {
        expect(line.allocatedAmount).toBe(0.00);
        expect(line.discountGranted).toBe(0.00);
        expect(line.newBalanceAmount).toBe(1000.00);
        expect(line.status).toBe('OPEN');
        expect(line.isFullySettled).toBe(false);
      } else if (payment <= 50.00) {
        // Token Payment Protection: <= discountToApply grants 0 discount
        expect(line.discountGranted).toBe(0.00);
        expect(result.totalDiscountGranted).toBe(0.00);
        expect(line.allocatedAmount).toBe(payment);
        expect(line.newBalanceAmount).toBe(roundToPaise(1000.00 - payment));
        expect(line.status).toBe('PARTIALLY_PAID');
        expect(line.isFullySettled).toBe(false);
      } else if (payment > 50.00 && payment < 950.00) {
        // Substantial Partial Payment: grants prompt discount
        expect(line.discountGranted).toBe(50.00);
        expect(result.totalDiscountGranted).toBe(50.00);
        expect(line.allocatedAmount).toBe(payment);
        expect(line.newBalanceAmount).toBe(roundToPaise(1000.00 - (payment + 50.00)));
        expect(line.status).toBe('PARTIALLY_PAID');
        expect(line.isFullySettled).toBe(false);
      } else if (payment >= 950.00) {
        // Full Settlement Case
        expect(line.discountGranted).toBe(50.00);
        expect(result.totalDiscountGranted).toBe(50.00);
        expect(line.allocatedAmount).toBe(950.00);
        expect(line.newBalanceAmount).toBe(0.00);
        expect(line.status).toBe('PAID');
        expect(line.isFullySettled).toBe(true);

        // Advance surplus
        const expectedSurplus = roundToPaise(payment - 950.00);
        expect(result.unallocatedAmount).toBe(expectedSurplus);
      }
    }
  });

  it('Fuzz 6: Multi-bill cascading across 5 complex bills with varied credit adjustments and due dates', () => {
    const bills: OpenBill[] = [
      {
        id: 'B1-PROMPT',
        invoiceId: 'INV-1',
        invoiceNo: '101',
        invoiceDate: '2026-05-01',
        dueDate: '2026-05-25',
        originalAmount: 500.00,
        paidAmount: 0.00,
        balanceAmount: 500.00,
        cashDiscountEligible: 25.00, // Net: 475.00
      },
      {
        id: 'B2-PARTIAL-CD',
        invoiceId: 'INV-2',
        invoiceNo: '102',
        invoiceDate: '2026-05-05',
        dueDate: '2026-05-25',
        originalAmount: 1500.00,
        paidAmount: 300.00,
        balanceAmount: 1200.00,
        cashDiscountEligible: 60.00, // Net: 1140.00
      },
      {
        id: 'B3-CREDIT-NOTE',
        invoiceId: 'INV-3',
        invoiceNo: '103',
        invoiceDate: '2026-05-10',
        dueDate: '2026-05-30',
        originalAmount: 2000.00,
        paidAmount: 0.00,
        balanceAmount: 800.00, // 1200 was adjusted by Credit Note / Sales Return
        cashDiscountEligible: 0.00, // Net: 800.00
      },
      {
        id: 'B4-ALREADY-ZERO',
        invoiceId: 'INV-4',
        invoiceNo: '104',
        invoiceDate: '2026-05-12',
        dueDate: '2026-05-30',
        originalAmount: 800.00,
        paidAmount: 800.00,
        balanceAmount: 0.00, // Already fully settled
        cashDiscountEligible: 0.00,
      },
      {
        id: 'B5-OVERDUE',
        invoiceId: 'INV-5',
        invoiceNo: '105',
        invoiceDate: '2026-04-01',
        dueDate: '2026-04-20', // Due date expired relative to receiptDate 2026-05-15
        originalAmount: 2500.00,
        paidAmount: 0.00,
        balanceAmount: 2500.00,
        cashDiscountEligible: 100.00, // Ineligible due to overdue date! Net: 2500.00
      },
    ];

    // Total net balance needed across all active bills:
    // B1: 475.00
    // B2: 1140.00
    // B3: 800.00
    // B4: 0.00
    // B5: 2500.00 (overdue -> no discount)
    // Sum = 475 + 1140 + 800 + 0 + 2500 = 4915.00

    // Sweep 200 payment amounts from 5.00 to 6,000.00 in increments of 30.12
    for (let step = 1; step <= 200; step++) {
      const payment = roundToPaise(step * 30.12);
      const result = allocateCustomerPayment(bills, payment, {
        applyCashDiscount: true,
        receiptDate: '2026-05-15',
      });

      // 1. Money conservation
      expect(roundToPaise(result.totalAllocatedAmount + result.unallocatedAmount)).toBe(payment);

      // 2. Header discount equals sum of line discounts
      const sumLineDiscounts = result.allocatedBills.reduce((s, b) => s + b.discountGranted, 0);
      expect(result.totalDiscountGranted).toBe(roundToPaise(sumLineDiscounts));

      // 3. Bill 4 (Already Zero) must remain 0 allocated and settled
      const bill4Res = result.allocatedBills.find((b) => b.billId === 'B4-ALREADY-ZERO')!;
      expect(bill4Res.allocatedAmount).toBe(0.00);
      expect(bill4Res.newBalanceAmount).toBe(0.00);
      expect(bill4Res.isFullySettled).toBe(true);

      // 4. Bill 5 (Overdue) must NEVER receive any cash discount
      const bill5Res = result.allocatedBills.find((b) => b.billId === 'B5-OVERDUE')!;
      expect(bill5Res.discountGranted).toBe(0.00);

      // 5. Bill 3 (Credit Note adjusted) must NEVER fabricate phantom paid amounts
      const bill3Res = result.allocatedBills.find((b) => b.billId === 'B3-CREDIT-NOTE')!;
      expect(bill3Res.newPaidAmount).toBe(roundToPaise(bill3Res.previousPaidAmount + bill3Res.allocatedAmount));
      if (bill3Res.isFullySettled) {
        // Even when fully settled, cumulative cash paid should be 800, NOT originalAmount 2000!
        expect(bill3Res.newPaidAmount).toBe(800.00);
      }

      // 6. Counts consistency
      expect(result.settledBillCount + result.partiallySettledBillCount + result.unsettledBillCount).toBe(bills.length);
    }
  });

  it('Fuzz 7: Monte Carlo fuzzing over 500 randomized ledger scenarios', () => {
    let seed = 1234567;
    const pseudoRandom = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let iter = 1; iter <= 500; iter++) {
      const billCount = 3 + Math.floor(pseudoRandom() * 6); // 3 to 8 bills
      const randomBills: OpenBill[] = [];

      for (let b = 1; b <= billCount; b++) {
        const origAmt = roundToPaise(100 + pseudoRandom() * 4000);
        const hasPriorPayment = pseudoRandom() > 0.6;
        const prevPaid = hasPriorPayment ? roundToPaise(pseudoRandom() * (origAmt * 0.5)) : 0.00;
        const hasCreditNote = pseudoRandom() > 0.7;
        const creditNoteAdj = hasCreditNote ? roundToPaise(pseudoRandom() * (origAmt - prevPaid) * 0.4) : 0.00;
        const balance = roundToPaise(Math.max(0, origAmt - prevPaid - creditNoteAdj));
        const cdEligible = pseudoRandom() > 0.5 ? roundToPaise(Math.min(balance * 0.05, 100)) : 0.00;

        randomBills.push({
          id: `RB-${iter}-${b}`,
          invoiceId: `INV-${iter}-${b}`,
          invoiceNo: `INV-${String(b).padStart(3, '0')}`,
          invoiceDate: `2026-05-${String(b).padStart(2, '0')}`,
          dueDate: `2026-05-${String(b + 10).padStart(2, '0')}`,
          originalAmount: origAmt,
          paidAmount: prevPaid,
          balanceAmount: balance,
          cashDiscountEligible: cdEligible,
        });
      }

      // Random incoming payment
      const paymentAmount = roundToPaise(pseudoRandom() * 15000);
      const res = allocateCustomerPayment(randomBills, paymentAmount, {
        applyCashDiscount: true,
        receiptDate: '2026-05-15',
      });

      // Assert Invariants
      expect(roundToPaise(res.totalAllocatedAmount + res.unallocatedAmount)).toBe(paymentAmount);

      const sumDiscounts = roundToPaise(res.allocatedBills.reduce((s, x) => s + x.discountGranted, 0));
      expect(res.totalDiscountGranted).toBe(sumDiscounts);

      for (const allocated of res.allocatedBills) {
        expect(allocated.newPaidAmount).toBe(
          roundToPaise(allocated.previousPaidAmount + allocated.allocatedAmount + allocated.discountGranted)
        );
        const expectedRemBalance = Math.max(
          0,
          roundToPaise(allocated.previousBalanceAmount - (allocated.allocatedAmount + allocated.discountGranted))
        );
        expect(allocated.newBalanceAmount).toBe(expectedRemBalance);
        expect(allocated.newBalanceAmount).toBeGreaterThanOrEqual(0);
        expect(allocated.isFullySettled).toBe(allocated.newBalanceAmount === 0);
      }
    }
  });

  it('Fuzz 8: Shuffled open bill arrays produce deterministic FIFO sorting and allocations', () => {
    const bills: OpenBill[] = [];
    for (let i = 1; i <= 10; i++) {
      bills.push({
        id: `B-DET-${i}`,
        invoiceId: `INV-DET-${i}`,
        invoiceNo: `10${i}`,
        invoiceDate: `2026-05-${String(i).padStart(2, '0')}`,
        dueDate: `2026-05-${String(i + 15).padStart(2, '0')}`,
        originalAmount: 1000.00,
        paidAmount: 0.00,
        balanceAmount: 1000.00,
        cashDiscountEligible: 50.00,
      });
    }

    const baseline = allocateCustomerPayment(bills, 3500.00, { applyCashDiscount: true });

    for (let s = 1; s <= 50; s++) {
      // Shuffle the open bills
      const shuffledBills = shuffleArray(bills, s * 17);
      const res = allocateCustomerPayment(shuffledBills, 3500.00, { applyCashDiscount: true });

      expect(res.totalAllocatedAmount).toBe(baseline.totalAllocatedAmount);
      expect(res.totalDiscountGranted).toBe(baseline.totalDiscountGranted);
      expect(res.unallocatedAmount).toBe(baseline.unallocatedAmount);
      expect(res.settledBillCount).toBe(baseline.settledBillCount);
      expect(res.partiallySettledBillCount).toBe(baseline.partiallySettledBillCount);

      // Verify identical sequential allocation order
      for (let idx = 0; idx < res.allocatedBills.length; idx++) {
        expect(res.allocatedBills[idx].billId).toBe(baseline.allocatedBills[idx].billId);
        expect(res.allocatedBills[idx].allocatedAmount).toBe(baseline.allocatedBills[idx].allocatedAmount);
        expect(res.allocatedBills[idx].discountGranted).toBe(baseline.allocatedBills[idx].discountGranted);
        expect(res.allocatedBills[idx].newBalanceAmount).toBe(baseline.allocatedBills[idx].newBalanceAmount);
      }
    }
  });
});
