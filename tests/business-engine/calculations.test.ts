import { describe, it, expect } from 'vitest';
import {
  roundToPaise,
  roundToRupee,
  calculateSchemeFreeQty,
  calculateLineItem,
  determineCashDiscountPct,
  calculateInvoiceTotals,
  CashDiscountSlabConfig,
} from '../../src/lib/business-engine';

describe('Calculations Engine (Features F07, F08, F09, F10)', () => {
  describe('Precision and Rounding Helpers', () => {
    it('roundToPaise rounds half-up to 2 decimals', () => {
      expect(roundToPaise(10.554)).toBe(10.55);
      expect(roundToPaise(10.555)).toBe(10.56);
      expect(roundToPaise(7.49925)).toBe(7.50);
      expect(roundToPaise(0.0006)).toBe(0.00);
      expect(roundToPaise(0.005)).toBe(0.01);
    });

    it('roundToRupee rounds to nearest whole rupee', () => {
      expect(roundToRupee(100.49)).toBe(100);
      expect(roundToRupee(100.50)).toBe(101);
      expect(roundToRupee(100.00)).toBe(100);
    });
  });

  describe('Feature F08: Scheme Free Goods Formula', () => {
    it('returns 0 when threshold is 0 or negative', () => {
      expect(calculateSchemeFreeQty(20, 0, 1)).toBe(0);
      expect(calculateSchemeFreeQty(20, -5, 1)).toBe(0);
    });

    it('returns 0 when freeQty is 0 or negative', () => {
      expect(calculateSchemeFreeQty(20, 10, 0)).toBe(0);
      expect(calculateSchemeFreeQty(20, 10, -1)).toBe(0);
    });

    it('returns 0 when quantity is 0 or negative', () => {
      expect(calculateSchemeFreeQty(0, 10, 1)).toBe(0);
      expect(calculateSchemeFreeQty(-5, 10, 1)).toBe(0);
    });

    it('handles large volume linear scaling', () => {
      // 10,000 ordered on 10+1 scheme
      expect(calculateSchemeFreeQty(10000, 10, 1)).toBe(1000);
    });

    it('handles non-unitary ratio (scheme 5+2, qty 12)', () => {
      // floor(12 / 5) * 2 = 2 * 2 = 4
      expect(calculateSchemeFreeQty(12, 5, 2)).toBe(4);
    });

    it('returns 0 when isReplacement is true', () => {
      expect(calculateSchemeFreeQty(100, 10, 1, true)).toBe(0);
    });
  });

  describe('Feature F07 & F09: Line Item Calculation', () => {
    it('throws error when quantity <= 0', () => {
      expect(() =>
        calculateLineItem({
          quantity: 0,
          sellingRate: 50,
          taxPct: 12,
        })
      ).toThrow('Quantity must be greater than zero');

      expect(() =>
        calculateLineItem({
          quantity: -1,
          sellingRate: 50,
          taxPct: 12,
        })
      ).toThrow('Quantity must be greater than zero');
    });

    it('throws error when selling rate is negative', () => {
      expect(() =>
        calculateLineItem({
          quantity: 1,
          sellingRate: -10,
          taxPct: 12,
        })
      ).toThrow('Selling rate cannot be negative');
    });

    it('throws error when trade discount is out of [0, 100]', () => {
      expect(() =>
        calculateLineItem({
          quantity: 1,
          sellingRate: 50,
          tradeDiscountPct: -1,
          taxPct: 12,
        })
      ).toThrow('Trade discount percentage must be between 0 and 100');

      expect(() =>
        calculateLineItem({
          quantity: 1,
          sellingRate: 50,
          tradeDiscountPct: 101,
          taxPct: 12,
        })
      ).toThrow('Trade discount percentage must be between 0 and 100');
    });

    it('handles 100% trade discount', () => {
      const line = calculateLineItem({
        quantity: 10,
        sellingRate: 20,
        tradeDiscountPct: 100,
        taxPct: 18,
      });
      expect(line.grossAmount).toBe(200.00);
      expect(line.discountAmount).toBe(200.00);
      expect(line.taxableAmount).toBe(0.00);
      expect(line.totalTaxAmount).toBe(0.00);
      expect(line.netAmount).toBe(0.00);
    });

    it('handles 0% trade discount with intra-state GST', () => {
      const line = calculateLineItem({
        quantity: 10,
        sellingRate: 25.50,
        tradeDiscountPct: 0,
        taxCode: '02',
        taxPct: 12.0,
        isInterstate: false,
      });
      expect(line.grossAmount).toBe(255.00);
      expect(line.discountAmount).toBe(0.00);
      expect(line.taxableAmount).toBe(255.00);
      expect(line.cgstRate).toBe(6.0);
      expect(line.sgstRate).toBe(6.0);
      expect(line.cgstAmount).toBe(15.30);
      expect(line.sgstAmount).toBe(15.30);
      expect(line.igstAmount).toBe(0.00);
      expect(line.totalTaxAmount).toBe(30.60);
      expect(line.netAmount).toBe(285.60);
    });

    it('handles inter-state outstation 100% IGST', () => {
      const line = calculateLineItem({
        quantity: 50,
        sellingRate: 100,
        tradeDiscountPct: 10,
        taxCode: '03',
        taxPct: 18.0,
        isInterstate: true,
      });
      expect(line.grossAmount).toBe(5000.00);
      expect(line.discountAmount).toBe(500.00);
      expect(line.taxableAmount).toBe(4500.00);
      expect(line.cgstAmount).toBe(0.00);
      expect(line.sgstAmount).toBe(0.00);
      expect(line.igstRate).toBe(18.0);
      expect(line.igstAmount).toBe(810.00);
      expect(line.totalTaxAmount).toBe(810.00);
      expect(line.netAmount).toBe(5310.00);
    });

    it('handles certified tax-exempt customer flag', () => {
      const line = calculateLineItem({
        quantity: 20,
        sellingRate: 15,
        taxCode: '02',
        taxPct: 12.0,
        isTaxExemptCustomer: true,
      });
      expect(line.taxableAmount).toBe(300.00);
      expect(line.cgstAmount).toBe(0.00);
      expect(line.sgstAmount).toBe(0.00);
      expect(line.igstAmount).toBe(0.00);
      expect(line.totalTaxAmount).toBe(0.00);
      expect(line.netAmount).toBe(300.00);
    });

    it('handles 1-paise micro base without NaN or floating artifacts', () => {
      const line = calculateLineItem({
        quantity: 1,
        sellingRate: 0.01,
        taxPct: 12.0,
        isInterstate: false,
      });
      expect(line.grossAmount).toBe(0.01);
      expect(line.taxableAmount).toBe(0.01);
      // 0.01 * 0.06 = 0.0006 -> 0.00
      expect(line.cgstAmount).toBe(0.00);
      expect(line.sgstAmount).toBe(0.00);
      expect(line.netAmount).toBe(0.01);
    });
  });

  describe('Feature F10: Cash Discount Slabs & Invoice Header Totals', () => {
    const slabs: CashDiscountSlabConfig[] = [
      { thresholdAmount: 5000, discountPct: 2.0 },
      { thresholdAmount: 10000, discountPct: 3.5 },
    ];

    it('determineCashDiscountPct evaluates slabs descending by threshold', () => {
      expect(determineCashDiscountPct(2000, slabs)).toBe(0);
      expect(determineCashDiscountPct(5000, slabs)).toBe(2.0); // Exact boundary
      expect(determineCashDiscountPct(7500, slabs)).toBe(2.0);
      expect(determineCashDiscountPct(10000, slabs)).toBe(3.5); // Exact boundary
      expect(determineCashDiscountPct(15000, slabs)).toBe(3.5);
      expect(determineCashDiscountPct(5000, [])).toBe(0);
      expect(determineCashDiscountPct(5000, undefined)).toBe(0);
    });

    it('throws error when invoice has 0 line items', () => {
      expect(() =>
        calculateInvoiceTotals({ lineItems: [] })
      ).toThrow('Invoice must contain at least 1 line item');
    });

    it('throws error when cash discount percentage is invalid', () => {
      const line = calculateLineItem({ quantity: 1, sellingRate: 100, taxPct: 0 });
      expect(() =>
        calculateInvoiceTotals({
          lineItems: [line],
          cashDiscountPct: -5,
        })
      ).toThrow('Cash discount percentage must be between 0 and 100');

      expect(() =>
        calculateInvoiceTotals({
          lineItems: [line],
          cashDiscountPct: 105,
        })
      ).toThrow('Cash discount percentage must be between 0 and 100');
    });

    it('aggregates multi-line invoice with multiple GST slabs, charges, TCS, and round-off', () => {
      // Line 1: 100 units @ 28.00, Scheme 10+1, 12% GST
      const line1 = calculateLineItem({
        id: 'L1',
        productName: 'Paracetamol 650',
        quantity: 100,
        sellingRate: 28.00,
        scheme: { threshold: 10, freeQty: 1 },
        taxCode: '02',
        taxPct: 12.0,
        isInterstate: false,
      });

      // Line 2: 50 units @ 20.00, 5% GST
      const line2 = calculateLineItem({
        id: 'L2',
        productName: 'Amoxicillin 250',
        quantity: 50,
        sellingRate: 20.00,
        taxCode: '05',
        taxPct: 5.0,
        isInterstate: false,
      });

      // Line 3: Nil tax item
      const line3 = calculateLineItem({
        id: 'L3',
        productName: 'Surgical Gloves',
        quantity: 10,
        sellingRate: 15.00,
        taxCode: '01',
        taxPct: 0.0,
        isInterstate: false,
      });

      const totals = calculateInvoiceTotals({
        lineItems: [line1, line2, line3],
        cashDiscountPct: 2.0,
        freightCharges: 50.00,
        boxCharges: 10.00,
        serviceCharges: 5.00,
        tcsPct: 0.075,
        isTcsApplicable: true,
      });

      // Subtotals:
      // Line 1 gross: 2800.00, tax: 168+168 = 336.00
      // Line 2 gross: 1000.00, tax: 25+25 = 50.00
      // Line 3 gross: 150.00, tax: 0
      // Total Gross: 3950.00
      expect(totals.totalGross).toBe(3950.00);
      expect(totals.totalLineDiscount).toBe(0.00);
      expect(totals.subtotalTaxable).toBe(3950.00);

      // Cash discount 2%: 3950.00 * 2% = 79.00
      expect(totals.cashDiscountAmount).toBe(79.00);
      expect(totals.netTaxableAmount).toBe(3871.00);

      // Taxes:
      expect(totals.totalCgst).toBe(193.00); // 168 + 25
      expect(totals.totalSgst).toBe(193.00); // 168 + 25
      expect(totals.totalTax).toBe(386.00);

      // Exempted:
      expect(totals.exemptedTurnover).toBe(150.00);

      // Charges:
      expect(totals.totalCharges).toBe(65.00); // 50 + 10 + 5

      // TCS: Base = 3871.00 (net taxable) + 386.00 (tax) + 65.00 (charges) = 4322.00
      // TCS Amount = round(4322.00 * 0.075%, 2) = round(3.2415, 2) = 3.24
      expect(totals.tcsAmount).toBe(3.24);

      // Unrounded = 4322.00 + 3.24 = 4325.24
      expect(totals.unroundedTotal).toBe(4325.24);
      expect(totals.grandTotal).toBe(4325.00);
      expect(totals.roundOffAmount).toBe(-0.24);

      // Invariant check: delta within [-0.50, +0.50]
      expect(totals.roundOffAmount).toBeGreaterThanOrEqual(-0.50);
      expect(totals.roundOffAmount).toBeLessThanOrEqual(0.50);

      // Quantity & Item counts:
      expect(totals.totalItemsCount).toBe(3);
      expect(totals.totalBilledQuantity).toBe(160); // 100 + 50 + 10
      expect(totals.totalFreeQuantity).toBe(10); // 10 free from Line 1
      expect(totals.totalUnits).toBe(170);

      // Tax breakdown:
      expect(totals.taxBreakdown.length).toBe(3);
    });

    it('evaluates cash discount automatically from slabs when explicit pct is omitted', () => {
      const line = calculateLineItem({
        quantity: 100,
        sellingRate: 60.00, // 6000 gross
        taxPct: 0,
      });

      const totals = calculateInvoiceTotals({
        lineItems: [line],
        cashDiscountSlabs: slabs, // 5000 -> 2%, 10000 -> 3.5%
      });

      expect(totals.cashDiscountPct).toBe(2.0);
      expect(totals.cashDiscountAmount).toBe(120.00);
      expect(totals.netTaxableAmount).toBe(5880.00);
      expect(totals.grandTotal).toBe(5880.00);
    });

    it('sets TCS to 0 when isTcsApplicable is false even if tcsPct is passed', () => {
      const line = calculateLineItem({
        quantity: 10,
        sellingRate: 100,
        taxPct: 0,
      });

      const totals = calculateInvoiceTotals({
        lineItems: [line],
        tcsPct: 0.1,
        isTcsApplicable: false,
      });

      expect(totals.tcsAmount).toBe(0.00);
    });
  });
});
