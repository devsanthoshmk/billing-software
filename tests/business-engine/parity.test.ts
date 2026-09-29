import { describe, it, expect } from 'vitest';
import {
  calculateLineItem,
  calculateInvoiceTotals,
  validateLineItemPricing,
  allocateStockFIFO,
  analyzeBatchMrps,
  allocateCustomerPayment,
  OpenBill,
  BatchStock,
} from '../../src/lib/business-engine';

describe('Milestone 2 FoxPro 2.6 Calculation Parity Test Suite (28 Test Vectors)', () => {
  // =========================================================================
  // CATEGORY 1: Feature F07 — Line Item Gross & Trade Discounts (INVPRE.PRG)
  // =========================================================================
  describe('F07: Line Item Gross & Trade Discounts', () => {
    it('V01: Standard integer unit gross (INVPRE.PRG:574)', () => {
      const line = calculateLineItem({
        quantity: 10,
        sellingRate: 15.00,
        taxPct: 0,
      });
      expect(line.grossAmount).toBe(150.00);
      expect(line.taxableAmount).toBe(150.00);
    });

    it('V02: Real pharmaceutical catalog pricing (CC GO TAB in MEDIMAST.DAT)', () => {
      // 45 units @ 9.40 standard selling rate
      const line = calculateLineItem({
        quantity: 45,
        sellingRate: 9.40,
        taxPct: 0,
      });
      expect(line.grossAmount).toBe(423.00);
      expect(line.taxableAmount).toBe(423.00);
    });

    it('V03: Multi-unit bulk trade discount deduction (INVPRE.PRG:1741)', () => {
      // 100 units @ 22.40 with 5% trade discount
      const line = calculateLineItem({
        quantity: 100,
        sellingRate: 22.40,
        tradeDiscountPct: 5.0,
        taxPct: 0,
      });
      expect(line.grossAmount).toBe(2240.00);
      expect(line.discountAmount).toBe(112.00);
      expect(line.taxableAmount).toBe(2128.00);
    });

    it('V04: Half-up paise rounding boundary on micro-paise trade discount', () => {
      // 3 units @ 33.33 = 99.99 with 7.5% discount -> 7.49925 rounds to 7.50
      const line = calculateLineItem({
        quantity: 3,
        sellingRate: 33.33,
        tradeDiscountPct: 7.5,
        taxPct: 0,
      });
      expect(line.grossAmount).toBe(99.99);
      expect(line.discountAmount).toBe(7.50);
      expect(line.taxableAmount).toBe(92.49);
    });
  });

  // =========================================================================
  // CATEGORY 2: Feature F08 — Scheme Bonus Free Goods Formula (INVPRE.PRG:589)
  // =========================================================================
  describe('F08: Scheme / Bonus Free Goods Formula', () => {
    it('V05: Standard scheme bonus truncation (Scheme 10+1, Order 25 units)', () => {
      const line = calculateLineItem({
        quantity: 25,
        sellingRate: 20.00,
        taxPct: 0,
        scheme: { threshold: 10, freeQty: 1 },
      });
      expect(line.calculatedFreeQty).toBe(2); // floor(25/10) * 1 = 2
      expect(line.totalUnits).toBe(27);
      expect(line.grossAmount).toBe(500.00); // 25 * 20.00 (free goods are 0 price)
    });

    it('V06: Real catalog 100% bonus scheme (CANDOZOL EAR DROPS 5+5, Order 12)', () => {
      const line = calculateLineItem({
        quantity: 12,
        sellingRate: 11.30,
        taxPct: 0,
        scheme: { threshold: 5, freeQty: 5 },
      });
      expect(line.calculatedFreeQty).toBe(10); // floor(12/5) * 5 = 10
      expect(line.totalUnits).toBe(22);
      expect(line.grossAmount).toBe(135.60); // 12 * 11.30
    });

    it('V07: Order quantity one unit below qualifying threshold (Scheme 10+1, Order 9)', () => {
      const line = calculateLineItem({
        quantity: 9,
        sellingRate: 10.00,
        taxPct: 0,
        scheme: { threshold: 10, freeQty: 1 },
      });
      expect(line.calculatedFreeQty).toBe(0);
      expect(line.totalUnits).toBe(9);
    });

    it('V08: Replacement item scheme bonus override (INVPRE.PRG:591, mreplt==.T.)', () => {
      const line = calculateLineItem({
        quantity: 30,
        sellingRate: 10.00,
        taxPct: 0,
        scheme: { threshold: 10, freeQty: 1 },
        isReplacement: true,
      });
      expect(line.calculatedFreeQty).toBe(0);
      expect(line.totalUnits).toBe(30);
    });
  });

  // =========================================================================
  // CATEGORY 3: Feature F09 — Statutory GST Calculations (TFILE.DAT & INVPRE.PRG)
  // =========================================================================
  describe('F09: Statutory GST Calculations', () => {
    it('V09: 5% GST Intra-State 50/50 split (TFILE.DAT Code 05: 2.5% CGST + 2.5% SGST)', () => {
      const line = calculateLineItem({
        quantity: 10,
        sellingRate: 100.00,
        taxCode: '05',
        taxPct: 5.0,
        isInterstate: false,
      });
      expect(line.taxableAmount).toBe(1000.00);
      expect(line.cgstRate).toBe(2.5);
      expect(line.sgstRate).toBe(2.5);
      expect(line.cgstAmount).toBe(25.00);
      expect(line.sgstAmount).toBe(25.00);
      expect(line.igstAmount).toBe(0.00);
      expect(line.totalTaxAmount).toBe(50.00);
      expect(line.netAmount).toBe(1050.00);
    });

    it('V10: 12% GST Verbatim FoxPro Invoice Sample (PROCFILE.PRG:416)', () => {
      const line = calculateLineItem({
        quantity: 100,
        sellingRate: 22.40,
        taxCode: '02',
        taxPct: 12.0,
        isInterstate: false,
      });
      expect(line.taxableAmount).toBe(2240.00);
      expect(line.cgstRate).toBe(6.0);
      expect(line.sgstRate).toBe(6.0);
      expect(line.cgstAmount).toBe(134.40);
      expect(line.sgstAmount).toBe(134.40);
      expect(line.igstAmount).toBe(0.00);
      expect(line.totalTaxAmount).toBe(268.80);
      expect(line.netAmount).toBe(2508.80);
    });

    it('V11: 18% GST Outstation Inter-State 100% IGST (TFILE.DAT Code 03, LO==O)', () => {
      const line = calculateLineItem({
        quantity: 15,
        sellingRate: 100.00,
        taxCode: '03',
        taxPct: 18.0,
        isInterstate: true,
      });
      expect(line.taxableAmount).toBe(1500.00);
      expect(line.cgstAmount).toBe(0.00);
      expect(line.sgstAmount).toBe(0.00);
      expect(line.igstRate).toBe(18.0);
      expect(line.igstAmount).toBe(270.00);
      expect(line.totalTaxAmount).toBe(270.00);
      expect(line.netAmount).toBe(1770.00);
    });

    it('V12: 28% Maximum Statutory GST Intra-State (TFILE.DAT Code 04: 14% + 14%)', () => {
      const line = calculateLineItem({
        quantity: 5,
        sellingRate: 100.00,
        taxCode: '04',
        taxPct: 28.0,
        isInterstate: false,
      });
      expect(line.taxableAmount).toBe(500.00);
      expect(line.cgstRate).toBe(14.0);
      expect(line.sgstRate).toBe(14.0);
      expect(line.cgstAmount).toBe(70.00);
      expect(line.sgstAmount).toBe(70.00);
      expect(line.igstAmount).toBe(0.00);
      expect(line.totalTaxAmount).toBe(140.00);
      expect(line.netAmount).toBe(640.00);
    });

    it('V13: Tax-Exempt Customer Route (CUSTMAST.DAT NOTAX==.T.)', () => {
      const line = calculateLineItem({
        quantity: 10,
        sellingRate: 100.00,
        taxCode: '02',
        taxPct: 12.0,
        isInterstate: false,
        isTaxExemptCustomer: true,
      });
      expect(line.taxableAmount).toBe(1000.00);
      expect(line.cgstAmount).toBe(0.00);
      expect(line.sgstAmount).toBe(0.00);
      expect(line.igstAmount).toBe(0.00);
      expect(line.totalTaxAmount).toBe(0.00);
      expect(line.netAmount).toBe(1000.00);
    });
  });

  // =========================================================================
  // CATEGORY 4: Feature F10 — Invoice Net, TCS & Nearest Rupee Round-Off
  // =========================================================================
  describe('F10: Invoice Net, TCS & Nearest Rupee Round-Off', () => {
    it('V14: Rupee round-up matching PROCFILE.PRG:418 (+0.20 paise)', () => {
      // Item matching V10: Net is 2508.80
      const line = calculateLineItem({
        quantity: 100,
        sellingRate: 22.40,
        taxCode: '02',
        taxPct: 12.0,
      });
      const totals = calculateInvoiceTotals({ lineItems: [line] });
      expect(totals.unroundedTotal).toBe(2508.80);
      expect(totals.grandTotal).toBe(2509.00);
      expect(totals.roundOffAmount).toBe(0.20);
    });

    it('V15: Rupee round-down (-0.35 paise)', () => {
      // Line item yielding 1250.35 unrounded total
      const line = calculateLineItem({
        quantity: 1,
        sellingRate: 1250.35,
        taxPct: 0,
      });
      const totals = calculateInvoiceTotals({ lineItems: [line] });
      expect(totals.unroundedTotal).toBe(1250.35);
      expect(totals.grandTotal).toBe(1250.00);
      expect(totals.roundOffAmount).toBe(-0.35);
    });

    it('V16: Exact half-rupee boundary round-half-up (+0.50 paise)', () => {
      const line = calculateLineItem({
        quantity: 1,
        sellingRate: 1000.50,
        taxPct: 0,
      });
      const totals = calculateInvoiceTotals({ lineItems: [line] });
      expect(totals.unroundedTotal).toBe(1000.50);
      expect(totals.grandTotal).toBe(1001.00);
      expect(totals.roundOffAmount).toBe(0.50);
    });

    it('V17: Statutory TCS Calculation (INVPRE.PRG:2480, TCSPER=0.075%)', () => {
      const line = calculateLineItem({
        quantity: 1000,
        sellingRate: 100.00,
        taxPct: 0,
      });
      const totals = calculateInvoiceTotals({
        lineItems: [line],
        tcsPct: 0.075,
        isTcsApplicable: true,
      });
      expect(totals.subtotalTaxable).toBe(100000.00);
      expect(totals.tcsAmount).toBe(75.00);
      expect(totals.grandTotal).toBe(100075.00);
    });
  });

  // =========================================================================
  // CATEGORY 5: Feature F11 — Domain Invariant & Boundary Guards
  // =========================================================================
  describe('F11: Domain Invariant Guards', () => {
    it('V18: Negative margin alert (Rate is less than Purchase Rate! INVPRE.PRG:1710)', () => {
      const violations = validateLineItemPricing({
        sellingRate: 10.00,
        purchaseRate: 12.00,
        mrp: 20.00,
      });
      const codes = violations.map((v) => v.code);
      expect(codes).toContain('NEGATIVE_MARGIN');
      const marginViolation = violations.find((v) => v.code === 'NEGATIVE_MARGIN');
      expect(marginViolation?.severity).toBe('ERROR');
      expect(marginViolation?.canBypass).toBe(true);
    });

    it('V19: Zero selling rate guard (Rate is Zero! INVPRE.PRG:1726)', () => {
      const violations = validateLineItemPricing({
        sellingRate: 0.00,
        purchaseRate: 5.00,
        mrp: 10.00,
      });
      const codes = violations.map((v) => v.code);
      expect(codes).toContain('ZERO_SELLING_RATE');
    });

    it('V20: Zero or negative MRP guard (MRP is Zero! PURCHASE.PRG:2186)', () => {
      const violations = validateLineItemPricing({
        sellingRate: 15.00,
        purchaseRate: 10.00,
        mrp: 0.00,
      });
      const codes = violations.map((v) => v.code);
      expect(codes).toContain('ZERO_OR_NEGATIVE_MRP');
    });

    it('V21: Selling rate exceeds MRP guard (MRP is less than Selling Rate! PURCHASE.PRG:2190)', () => {
      const violations = validateLineItemPricing({
        sellingRate: 15.00,
        purchaseRate: 10.00,
        mrp: 14.00,
      });
      const codes = violations.map((v) => v.code);
      expect(codes).toContain('SELLING_RATE_EXCEEDS_MRP');
    });
  });

  // =========================================================================
  // CATEGORY 6: Feature F12 — Inventory FIFO Allocation & Multi-MRP Detection
  // =========================================================================
  describe('F12: Inventory FIFO Allocation & Multi-MRP Detection', () => {
    it('V22: Single batch full fulfillment using earliest expiry (INVPRE.PRG:1225)', () => {
      const batches: BatchStock[] = [
        { id: 'b2', batchNo: 'BAT2', expiryDate: '2027-01-01', stockQty: 100, sellingRate: 10, purchaseRate: 8, mrp: 15 },
        { id: 'b1', batchNo: 'BAT1', expiryDate: '2026-06-01', stockQty: 50, sellingRate: 10, purchaseRate: 8, mrp: 15 },
      ];
      const result = allocateStockFIFO(batches, 30, 0, { systemDate: '2026-01-01' });
      expect(result.success).toBe(true);
      expect(result.allocations.length).toBe(1);
      expect(result.allocations[0].batchNo).toBe('BAT1');
      expect(result.allocations[0].allocatedBilledQty).toBe(30);
      expect(result.allocations[0].remainingBatchStock).toBe(20);
    });

    it('V23: Multi-batch partial split across expiration dates (INVPRE.PRG:601)', () => {
      const batches: BatchStock[] = [
        { id: 'b1', batchNo: 'BAT1', expiryDate: '2025-06-01', stockQty: 20, sellingRate: 10, purchaseRate: 8, mrp: 15 },
        { id: 'b2', batchNo: 'BAT2', expiryDate: '2026-06-01', stockQty: 50, sellingRate: 10, purchaseRate: 8, mrp: 15 },
      ];
      // System date set before both batches so neither is expired
      const result = allocateStockFIFO(batches, 35, 0, { systemDate: '2025-01-01' });
      expect(result.success).toBe(true);
      expect(result.allocations.length).toBe(2);
      expect(result.allocations[0]).toMatchObject({ batchNo: 'BAT1', allocatedBilledQty: 20, remainingBatchStock: 0 });
      expect(result.allocations[1]).toMatchObject({ batchNo: 'BAT2', allocatedBilledQty: 15, remainingBatchStock: 35 });
      expect(result.totalAllocatedBilledQty).toBe(35);
      expect(result.unallocatedQty).toBe(0);
    });

    it('V24: Multi-MRP product stock split detection (DIFMRP.PRG:82)', () => {
      const batches: BatchStock[] = [
        { id: 'b1', batchNo: 'B1', stockQty: 10, mrp: 50.00, expiryDate: '2026-12-31', sellingRate: 40, purchaseRate: 30 },
        { id: 'b2', batchNo: 'B2', stockQty: 20, mrp: 55.00, expiryDate: '2027-12-31', sellingRate: 45, purchaseRate: 35 },
      ];
      const analysis = analyzeBatchMrps(batches);
      expect(analysis.hasMultiMrp).toBe(true);
      expect(analysis.distinctMrps).toEqual([50.00, 55.00]);

      // When allocating across both batches
      const result = allocateStockFIFO(batches, 25, 0, { systemDate: '2026-01-01' });
      expect(result.hasMultiMrp).toBe(true);
      expect(result.distinctMrps).toEqual([50.00, 55.00]);
    });
  });

  // =========================================================================
  // CATEGORY 7: Feature F13 — Bill-by-Bill Payment Allocation Engine (COLENTY3.PRG)
  // =========================================================================
  describe('F13: Bill-by-Bill Customer Payment Allocation Engine', () => {
    it('V25: Exact single bill full settlement (COLENTY3.PRG:220)', () => {
      const openBills: OpenBill[] = [
        {
          id: 'BILL-01',
          invoiceId: 'INV-01',
          invoiceNo: '1001',
          invoiceDate: '2026-05-01',
          dueDate: '2026-05-22',
          originalAmount: 5000.00,
          paidAmount: 0.00,
          balanceAmount: 5000.00,
        },
      ];

      const result = allocateCustomerPayment(openBills, 5000.00);

      expect(result.totalAllocatedAmount).toBe(5000.00);
      expect(result.unallocatedAmount).toBe(0.00);
      expect(result.settledBillCount).toBe(1);
      expect(result.partiallySettledBillCount).toBe(0);

      const billResult = result.allocatedBills[0];
      expect(billResult.allocatedAmount).toBe(5000.00);
      expect(billResult.newPaidAmount).toBe(5000.00);
      expect(billResult.newBalanceAmount).toBe(0.00);
      expect(billResult.status).toBe('PAID');
      expect(billResult.isFullySettled).toBe(true);
    });

    it('V26: Multi-bill FIFO cascading settlement with partial split (COLENTY3.PRG:220)', () => {
      const openBills: OpenBill[] = [
        {
          id: 'BILL-01',
          invoiceId: 'INV-01',
          invoiceNo: '1001',
          invoiceDate: '2026-01-10', // Earliest bill
          dueDate: '2026-01-31',
          originalAmount: 2000.00,
          paidAmount: 0.00,
          balanceAmount: 2000.00,
        },
        {
          id: 'BILL-02',
          invoiceId: 'INV-02',
          invoiceNo: '1002',
          invoiceDate: '2026-02-15', // Later bill
          dueDate: '2026-03-08',
          originalAmount: 3000.00,
          paidAmount: 0.00,
          balanceAmount: 3000.00,
        },
      ];

      // Payment of 3500: should pay 2000 to Bill 1 (PAID) and 1500 to Bill 2 (PARTIALLY_PAID)
      const result = allocateCustomerPayment(openBills, 3500.00);

      expect(result.totalPaymentAmount).toBe(3500.00);
      expect(result.totalAllocatedAmount).toBe(3500.00);
      expect(result.unallocatedAmount).toBe(0.00);
      expect(result.settledBillCount).toBe(1);
      expect(result.partiallySettledBillCount).toBe(1);

      expect(result.allocatedBills[0].billId).toBe('BILL-01');
      expect(result.allocatedBills[0].allocatedAmount).toBe(2000.00);
      expect(result.allocatedBills[0].newBalanceAmount).toBe(0.00);
      expect(result.allocatedBills[0].status).toBe('PAID');

      expect(result.allocatedBills[1].billId).toBe('BILL-02');
      expect(result.allocatedBills[1].allocatedAmount).toBe(1500.00);
      expect(result.allocatedBills[1].newBalanceAmount).toBe(1500.00);
      expect(result.allocatedBills[1].status).toBe('PARTIALLY_PAID');
    });

    it('V27: Real production transaction allocation (SUPPMT1.DAT / CUSOUT.DAT)', () => {
      // Historical real records: AN/45 (5250.00) and AN/60 (2700.00)
      const openBills: OpenBill[] = [
        {
          id: 'REC-02',
          invoiceId: 'INV-AN45',
          invoiceNo: 'AN/45/2021-2',
          invoiceDate: '2021-05-10',
          dueDate: '2021-05-31',
          originalAmount: 5250.00,
          paidAmount: 0.00,
          balanceAmount: 5250.00,
        },
        {
          id: 'REC-03',
          invoiceId: 'INV-AN60',
          invoiceNo: 'AN/60/2021-2',
          invoiceDate: '2021-05-19',
          dueDate: '2021-06-09',
          originalAmount: 2700.00,
          paidAmount: 0.00,
          balanceAmount: 2700.00,
        },
      ];

      // Payment of 6000.00
      const result = allocateCustomerPayment(openBills, 6000.00);

      expect(result.totalAllocatedAmount).toBe(6000.00);
      expect(result.unallocatedAmount).toBe(0.00);

      // Bill 1: 5250.00 allocated -> PAID
      expect(result.allocatedBills[0].allocatedAmount).toBe(5250.00);
      expect(result.allocatedBills[0].newBalanceAmount).toBe(0.00);
      expect(result.allocatedBills[0].status).toBe('PAID');

      // Bill 2: 750.00 allocated -> PARTIALLY_PAID (2700 - 750 = 1950 balance)
      expect(result.allocatedBills[1].allocatedAmount).toBe(750.00);
      expect(result.allocatedBills[1].newBalanceAmount).toBe(1950.00);
      expect(result.allocatedBills[1].status).toBe('PARTIALLY_PAID');
    });

    it('V28: Advance surplus collection (CUSLED.DAT EXAMT)', () => {
      const openBills: OpenBill[] = [
        {
          id: 'BILL-01',
          invoiceId: 'INV-01',
          invoiceNo: '1001',
          invoiceDate: '2026-06-01',
          dueDate: '2026-06-22',
          originalAmount: 1000.00,
          paidAmount: 0.00,
          balanceAmount: 1000.00,
        },
      ];

      // Customer pays 1500 against 1000 open bill
      const result = allocateCustomerPayment(openBills, 1500.00);

      expect(result.totalPaymentAmount).toBe(1500.00);
      expect(result.totalAllocatedAmount).toBe(1000.00);
      expect(result.unallocatedAmount).toBe(500.00); // 500 advance credit!
      expect(result.settledBillCount).toBe(1);
      expect(result.allocatedBills[0].status).toBe('PAID');
    });
  });
});
