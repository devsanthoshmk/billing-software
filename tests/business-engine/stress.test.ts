import { describe, it, expect } from 'vitest';
import {
  roundToPaise,
  roundToRupee,
  calculateSchemeFreeQty,
  calculateLineItem,
  determineCashDiscountPct,
  calculateInvoiceTotals,
  calculateDateDiffInDays,
  validateLineItemPricing,
  validateCustomerDrugLicense,
  validateCustomerCreditLimit,
  validateBusinessInvariants,
  LineItemInput,
  LineItemCalculationResult,
} from '../../src/lib/business-engine';

describe('Milestone 2 Adversarial Stress & Boundary Fuzzing Suite', () => {
  // =========================================================================
  // 1. EXTREME RATES & FRACTIONAL PAISE VALUES (Rounding & Invariant Checks)
  // =========================================================================
  describe('1. Extreme Rates & Fractional Paise Values', () => {
    it('evaluates IEEE-754 precision boundary numbers ending in .005 and .015', () => {
      // Test known floating point edge cases where standard float arithmetic fails without epsilon
      const cases = [
        { input: 1.005, expected: 1.01 },
        { input: 2.005, expected: 2.01 },
        { input: 10.555, expected: 10.56 },
        { input: 100.015, expected: 100.02 },
        { input: 1250.355, expected: 1250.36 },
        { input: 0.005, expected: 0.01 },
        { input: 0.004999, expected: 0.00 },
        { input: 99.995, expected: 100.00 },
      ];

      for (const { input, expected } of cases) {
        expect(roundToPaise(input)).toBe(expected);
      }
    });

    it('fuzzes 500 fractional paise rate values ensuring arithmetic identity: taxable + discount === gross', () => {
      // Generate varying rates with 3 decimal places
      for (let i = 1; i <= 500; i++) {
        const rate = Number((i * 0.173).toFixed(3));
        const qty = (i % 23) + 1;
        const discountPct = Number(((i % 15) * 1.5).toFixed(1));

        const item = calculateLineItem({
          quantity: qty,
          sellingRate: rate,
          tradeDiscountPct: discountPct,
          taxPct: 12.0,
        });

        // Exact paise identity
        const reconstructedGross = roundToPaise(item.taxableAmount + item.discountAmount);
        expect(reconstructedGross).toBe(item.grossAmount);
        expect(item.netAmount).toBe(roundToPaise(item.taxableAmount + item.totalTaxAmount));
      }
    });

    it('preserves paise identity across rupee round-off: unroundedTotal + roundOffAmount === grandTotal', () => {
      // Fuzz 500 unrounded totals between 0.01 and 10000.99
      for (let i = 1; i <= 500; i++) {
        const unrounded = Number((i * 19.37 + 0.01).toFixed(2));
        const grandTotal = roundToRupee(unrounded);
        const roundOff = roundToPaise(grandTotal - unrounded);

        // Invariant 1: roundOff must be bounded strictly within [-0.50, +0.50]
        expect(roundOff).toBeGreaterThanOrEqual(-0.50);
        expect(roundOff).toBeLessThanOrEqual(0.50);

        // Invariant 2: sum must strictly restore the grandTotal
        expect(roundToPaise(unrounded + roundOff)).toBe(grandTotal);
      }
    });

    it('handles micro-rates (0.01) and large transactions (99,999,999.99) without overflow or NaN', () => {
      // Smallest positive currency unit
      const microItem = calculateLineItem({
        quantity: 1,
        sellingRate: 0.01,
        taxPct: 18.0,
      });
      expect(microItem.grossAmount).toBe(0.01);
      expect(microItem.taxableAmount).toBe(0.01);
      expect(microItem.totalTaxAmount).toBe(0.00); // 0.01 * 9% = 0.0009 -> 0.00
      expect(microItem.netAmount).toBe(0.01);

      // Large enterprise transaction
      const largeItem = calculateLineItem({
        quantity: 10000,
        sellingRate: 9999.99,
        tradeDiscountPct: 5.0,
        taxPct: 18.0,
      });
      expect(largeItem.grossAmount).toBe(99999900.00);
      expect(largeItem.discountAmount).toBe(4999995.00);
      expect(largeItem.taxableAmount).toBe(94999905.00);
      expect(largeItem.cgstAmount).toBe(8549991.45);
      expect(largeItem.sgstAmount).toBe(8549991.45);
      expect(largeItem.totalTaxAmount).toBe(17099982.90);
      expect(largeItem.netAmount).toBe(112099887.90);
    });

    it('aggregates 200 line items with fractional paise without drift or paise loss', () => {
      const items: LineItemCalculationResult[] = [];
      let expectedSumGross = 0;
      let expectedSumDiscount = 0;
      let expectedSumTaxable = 0;

      for (let i = 1; i <= 200; i++) {
        const item = calculateLineItem({
          id: `item-${i}`,
          quantity: (i % 7) + 1,
          sellingRate: Number((13.33 + (i * 0.07)).toFixed(2)),
          tradeDiscountPct: (i % 5) * 2,
          taxCode: '02',
          taxPct: 12.0,
        });
        items.push(item);
        expectedSumGross = roundToPaise(expectedSumGross + item.grossAmount);
        expectedSumDiscount = roundToPaise(expectedSumDiscount + item.discountAmount);
        expectedSumTaxable = roundToPaise(expectedSumTaxable + item.taxableAmount);
      }

      const totals = calculateInvoiceTotals({
        lineItems: items,
        cashDiscountPct: 2.0,
      });

      expect(totals.totalGross).toBe(expectedSumGross);
      expect(totals.totalLineDiscount).toBe(expectedSumDiscount);
      expect(totals.subtotalTaxable).toBe(expectedSumTaxable);
      expect(totals.netTaxableAmount).toBe(roundToPaise(totals.subtotalTaxable - totals.cashDiscountAmount));
    });

    it('tests boundary discounts: 0% and 100% discount', () => {
      const zeroDisc = calculateLineItem({
        quantity: 10,
        sellingRate: 50.00,
        tradeDiscountPct: 0,
        taxPct: 12.0,
      });
      expect(zeroDisc.discountAmount).toBe(0.00);
      expect(zeroDisc.taxableAmount).toBe(500.00);

      const fullDisc = calculateLineItem({
        quantity: 10,
        sellingRate: 50.00,
        tradeDiscountPct: 100,
        taxPct: 12.0,
      });
      expect(fullDisc.discountAmount).toBe(500.00);
      expect(fullDisc.taxableAmount).toBe(0.00);
      expect(fullDisc.totalTaxAmount).toBe(0.00);
      expect(fullDisc.netAmount).toBe(0.00);

      // Negative or >100% discount must throw
      expect(() => calculateLineItem({ quantity: 1, sellingRate: 10, tradeDiscountPct: -1, taxPct: 0 })).toThrow();
      expect(() => calculateLineItem({ quantity: 1, sellingRate: 10, tradeDiscountPct: 100.01, taxPct: 0 })).toThrow();
    });

    it('tests tiered cash discount slab lookups at exact threshold boundaries and unsorted inputs', () => {
      // Unsorted slabs
      const slabs = [
        { thresholdAmount: 1000, discountPct: 2.0 },
        { thresholdAmount: 5000, discountPct: 3.5 },
        { thresholdAmount: 2500, discountPct: 3.0 },
      ];

      // Below first threshold
      expect(determineCashDiscountPct(999.99, slabs)).toBe(0);
      // Exact threshold boundary 1
      expect(determineCashDiscountPct(1000.00, slabs)).toBe(2.0);
      // Between slab 1 and slab 2
      expect(determineCashDiscountPct(2499.99, slabs)).toBe(2.0);
      // Exact threshold boundary 2
      expect(determineCashDiscountPct(2500.00, slabs)).toBe(3.0);
      // Exact threshold boundary 3
      expect(determineCashDiscountPct(5000.00, slabs)).toBe(3.5);
      // Far above highest slab
      expect(determineCashDiscountPct(100000.00, slabs)).toBe(3.5);

      // Empty or undefined slabs
      expect(determineCashDiscountPct(5000, [])).toBe(0);
      expect(determineCashDiscountPct(5000, undefined)).toBe(0);
    });
  });

  // =========================================================================
  // 2. SCHEME GOODS WITH PRIME RATIOS AND MASSIVE QUANTITIES
  // =========================================================================
  describe('2. Scheme Goods with Prime Ratios & Massive Quantities', () => {
    // Prime scheme configurations: [threshold, freeQty]
    const primeSchemes = [
      { threshold: 7, freeQty: 3 },
      { threshold: 11, freeQty: 5 },
      { threshold: 13, freeQty: 7 },
      { threshold: 17, freeQty: 2 },
      { threshold: 19, freeQty: 3 },
      { threshold: 23, freeQty: 5 },
      { threshold: 97, freeQty: 13 },
    ];

    it.each(primeSchemes)(
      'evaluates prime scheme $threshold + $freeQty at boundary thresholds and multiples',
      ({ threshold, freeQty }) => {
        // Just below first threshold -> 0 free
        expect(calculateSchemeFreeQty(threshold - 1, threshold, freeQty)).toBe(0);

        // Exactly first threshold -> exactly freeQty
        expect(calculateSchemeFreeQty(threshold, threshold, freeQty)).toBe(freeQty);

        // Just above first threshold -> still freeQty
        expect(calculateSchemeFreeQty(threshold + 1, threshold, freeQty)).toBe(freeQty);

        // Multiple steps: 2x, 5x, 10x
        for (const multiplier of [2, 5, 10, 25]) {
          const baseQty = threshold * multiplier;
          expect(calculateSchemeFreeQty(baseQty - 1, threshold, freeQty)).toBe((multiplier - 1) * freeQty);
          expect(calculateSchemeFreeQty(baseQty, threshold, freeQty)).toBe(multiplier * freeQty);
          expect(calculateSchemeFreeQty(baseQty + 1, threshold, freeQty)).toBe(multiplier * freeQty);
        }
      }
    );

    it('evaluates massive quantities up to 100,000,000 units on prime schemes without precision loss', () => {
      // 100,000,000 on scheme 17 + 5:
      // floor(100,000,000 / 17) = 5,882,352. Free = 5,882,352 * 5 = 29,411,760
      expect(calculateSchemeFreeQty(100000000, 17, 5)).toBe(29411760);

      // 50,000,000 on scheme 97 + 13:
      // floor(50,000,000 / 97) = 515,463. Free = 515,463 * 13 = 6,701,019
      expect(calculateSchemeFreeQty(50000000, 97, 13)).toBe(6701019);
    });

    it('strictly overrides scheme to 0 free goods when isReplacement is true, even on massive quantities', () => {
      expect(calculateSchemeFreeQty(1000000, 10, 1, true)).toBe(0);
      expect(calculateSchemeFreeQty(97000, 97, 13, true)).toBe(0);

      const line = calculateLineItem({
        quantity: 1000,
        sellingRate: 50.00,
        taxPct: 0,
        scheme: { threshold: 10, freeQty: 1 },
        isReplacement: true,
      });
      expect(line.calculatedFreeQty).toBe(0);
      expect(line.totalUnits).toBe(1000);
      expect(line.isReplacement).toBe(true);
    });

    it('verifies scheme goods are 0-cost to customer and do not inflate grossAmount or tax', () => {
      // 100 units on 10 + 2 scheme = 20 free units. Total units = 120.
      const lineWithScheme = calculateLineItem({
        quantity: 100,
        sellingRate: 20.00,
        taxPct: 12.0,
        scheme: { threshold: 10, freeQty: 2 },
      });

      const lineWithoutScheme = calculateLineItem({
        quantity: 100,
        sellingRate: 20.00,
        taxPct: 12.0,
      });

      expect(lineWithScheme.calculatedFreeQty).toBe(20);
      expect(lineWithScheme.totalUnits).toBe(120);
      // Both lines must have identical financial charges
      expect(lineWithScheme.grossAmount).toBe(lineWithoutScheme.grossAmount);
      expect(lineWithScheme.taxableAmount).toBe(lineWithoutScheme.taxableAmount);
      expect(lineWithScheme.totalTaxAmount).toBe(lineWithoutScheme.totalTaxAmount);
      expect(lineWithScheme.netAmount).toBe(lineWithoutScheme.netAmount);
    });

    it('rejects or neutralizes invalid scheme parameters', () => {
      // Threshold <= 0
      expect(calculateSchemeFreeQty(100, 0, 2)).toBe(0);
      expect(calculateSchemeFreeQty(100, -5, 2)).toBe(0);
      // FreeQty <= 0
      expect(calculateSchemeFreeQty(100, 10, 0)).toBe(0);
      expect(calculateSchemeFreeQty(100, 10, -1)).toBe(0);
      // Quantity <= 0
      expect(calculateSchemeFreeQty(0, 10, 1)).toBe(0);
      expect(calculateSchemeFreeQty(-10, 10, 1)).toBe(0);
    });
  });

  // =========================================================================
  // 3. STATUTORY GST SPLITS UNDER EDGE CASES (1-paise base, mixed slabs)
  // =========================================================================
  describe('3. Statutory GST Splits Under Edge Cases', () => {
    it('tests 1-paise base (taxable 0.01) across statutory GST slabs (0%, 5%, 12%, 18%, 28%)', () => {
      const slabs = [
        { code: '01', pct: 0, expectedIntraTax: 0, expectedInterTax: 0 },
        { code: '02', pct: 5, expectedIntraTax: 0, expectedInterTax: 0 },   // 0.01 * 2.5% = 0.00025 -> 0.00
        { code: '03', pct: 12, expectedIntraTax: 0, expectedInterTax: 0 },  // 0.01 * 6% = 0.0006 -> 0.00
        { code: '04', pct: 18, expectedIntraTax: 0, expectedInterTax: 0 },  // 0.01 * 9% = 0.0009 -> 0.00
        { code: '05', pct: 28, expectedIntraTax: 0, expectedInterTax: 0 },  // 0.01 * 14% = 0.0014 -> 0.00
      ];

      for (const { code, pct, expectedIntraTax, expectedInterTax } of slabs) {
        // Intrastate
        const intra = calculateLineItem({
          quantity: 1,
          sellingRate: 0.01,
          taxCode: code,
          taxPct: pct,
          isInterstate: false,
        });
        expect(intra.taxableAmount).toBe(0.01);
        expect(intra.totalTaxAmount).toBe(expectedIntraTax);
        expect(intra.netAmount).toBe(0.01);

        // Interstate
        const inter = calculateLineItem({
          quantity: 1,
          sellingRate: 0.01,
          taxCode: code,
          taxPct: pct,
          isInterstate: true,
        });
        expect(inter.taxableAmount).toBe(0.01);
        expect(inter.totalTaxAmount).toBe(expectedInterTax);
        expect(inter.netAmount).toBe(0.01);
      }
    });

    it('tests exact rounding transition threshold for intrastate 18% GST (CGST 9%, SGST 9%)', () => {
      // At 9% CGST: 0.05 * 0.09 = 0.0045 -> rounds to 0.00
      const belowTransition = calculateLineItem({
        quantity: 1,
        sellingRate: 0.05,
        taxCode: '04',
        taxPct: 18.0,
        isInterstate: false,
      });
      expect(belowTransition.cgstAmount).toBe(0.00);
      expect(belowTransition.sgstAmount).toBe(0.00);
      expect(belowTransition.totalTaxAmount).toBe(0.00);

      // At 9% CGST: 0.06 * 0.09 = 0.0054 -> rounds to 0.01
      const atTransition = calculateLineItem({
        quantity: 1,
        sellingRate: 0.06,
        taxCode: '04',
        taxPct: 18.0,
        isInterstate: false,
      });
      expect(atTransition.cgstAmount).toBe(0.01);
      expect(atTransition.sgstAmount).toBe(0.01);
      expect(atTransition.totalTaxAmount).toBe(0.02);
      expect(atTransition.netAmount).toBe(0.08); // 0.06 + 0.02
    });

    it('enforces intrastate 50/50 statutory symmetry (cgstRate === sgstRate and cgstAmount === sgstAmount)', () => {
      const taxRates = [5.0, 12.0, 18.0, 28.0];
      for (const taxPct of taxRates) {
        for (let amount = 1; amount <= 100; amount += 7.37) {
          const line = calculateLineItem({
            quantity: 1,
            sellingRate: Number(amount.toFixed(2)),
            taxPct,
            isInterstate: false,
          });
          expect(line.cgstRate).toBe(line.sgstRate);
          expect(line.cgstAmount).toBe(line.sgstAmount);
          expect(line.igstRate).toBe(0);
          expect(line.igstAmount).toBe(0);
          expect(line.totalTaxAmount).toBe(roundToPaise(line.cgstAmount + line.sgstAmount));
        }
      }
    });

    it('verifies interstate vs intrastate toggling behavior', () => {
      const lineParams: LineItemInput = {
        quantity: 15,
        sellingRate: 43.75,
        tradeDiscountPct: 3.5,
        taxCode: '04',
        taxPct: 18.0,
      };

      const intra = calculateLineItem({ ...lineParams, isInterstate: false });
      const inter = calculateLineItem({ ...lineParams, isInterstate: true });

      // Taxable amounts must be identical
      expect(intra.taxableAmount).toBe(inter.taxableAmount);

      // Intra has CGST and SGST, Inter has IGST
      expect(intra.cgstRate).toBe(9.0);
      expect(intra.sgstRate).toBe(9.0);
      expect(intra.igstRate).toBe(0);
      expect(inter.cgstRate).toBe(0);
      expect(inter.sgstRate).toBe(0);
      expect(inter.igstRate).toBe(18.0);

      // Any difference between (CGST + SGST) and IGST can be at most 0.01 due to independent split rounding
      const diff = roundToPaise(Math.abs(intra.totalTaxAmount - inter.totalTaxAmount));
      expect(diff).toBeLessThanOrEqual(0.01);
    });

    it('evaluates mixed statutory slabs on single invoice and validates slab breakdown fidelity', () => {
      const items: LineItemCalculationResult[] = [
        calculateLineItem({ id: '1', quantity: 10, sellingRate: 10.00, taxCode: '01', taxPct: 0 }),    // Exempt
        calculateLineItem({ id: '2', quantity: 20, sellingRate: 15.00, taxCode: '02', taxPct: 5.0 }),  // 5%
        calculateLineItem({ id: '3', quantity: 5,  sellingRate: 40.00, taxCode: '02', taxPct: 5.0 }),  // 5% (second item same slab)
        calculateLineItem({ id: '4', quantity: 10, sellingRate: 50.00, taxCode: '03', taxPct: 12.0 }), // 12%
        calculateLineItem({ id: '5', quantity: 4,  sellingRate: 100.00, taxCode: '04', taxPct: 18.0 }),// 18%
        calculateLineItem({ id: '6', quantity: 2,  sellingRate: 200.00, taxCode: '05', taxPct: 28.0 }),// 28%
      ];

      const totals = calculateInvoiceTotals({ lineItems: items });

      // Exempted turnover must equal 100.00
      expect(totals.exemptedTurnover).toBe(100.00);

      // Breakdown should have 5 distinct slab keys
      expect(totals.taxBreakdown.length).toBe(5);

      // Check 5% slab aggregated correctly (300 + 200 = 500 taxable)
      const slab5 = totals.taxBreakdown.find((s) => s.taxCode === '02' && s.taxPct === 5.0);
      expect(slab5).toBeDefined();
      expect(slab5?.taxableAmount).toBe(500.00);
      expect(slab5?.cgstAmount).toBe(12.50);
      expect(slab5?.sgstAmount).toBe(12.50);
      expect(slab5?.totalTaxAmount).toBe(25.00);

      // Verify sum of slab taxes matches totalTax
      const sumSlabTax = totals.taxBreakdown.reduce((acc, s) => roundToPaise(acc + s.totalTaxAmount), 0);
      expect(sumSlabTax).toBe(totals.totalTax);
    });

    it('customer tax exemption flag overrides product taxPct and produces 0 tax', () => {
      const item = calculateLineItem({
        quantity: 50,
        sellingRate: 100.00,
        taxCode: '04',
        taxPct: 18.0,
        isTaxExemptCustomer: true,
      });

      expect(item.taxPct).toBe(0);
      expect(item.cgstAmount).toBe(0);
      expect(item.sgstAmount).toBe(0);
      expect(item.igstAmount).toBe(0);
      expect(item.totalTaxAmount).toBe(0);
      expect(item.netAmount).toBe(5000.00);
    });
  });

  // =========================================================================
  // 4. DPCO BOUNDARY TESTS (Statutory MRP Ceilings & Margins)
  // =========================================================================
  describe('4. DPCO Boundary Tests', () => {
    it('permits selling rate exactly equal to MRP (boundary ceiling compliant)', () => {
      const violations = validateLineItemPricing({
        sellingRate: 100.00,
        purchaseRate: 80.00,
        mrp: 100.00,
      });

      const exceedViolations = violations.filter((v) => v.code === 'SELLING_RATE_EXCEEDS_MRP');
      expect(exceedViolations.length).toBe(0);
      expect(violations.length).toBe(0);
    });

    it('blocks selling rate 0.01 above MRP as critical statutory DPCO violation', () => {
      const violations = validateLineItemPricing({
        sellingRate: 100.01,
        purchaseRate: 80.00,
        mrp: 100.00,
      });

      const violation = violations.find((v) => v.code === 'SELLING_RATE_EXCEEDS_MRP');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('ERROR');
      expect(violation?.canBypass).toBe(false);
      expect(violation?.isBypassed).toBe(false);
    });

    it('permits purchase rate exactly equal to MRP (zero wholesale margin ceiling)', () => {
      const violations = validateLineItemPricing({
        sellingRate: 100.00,
        purchaseRate: 100.00,
        mrp: 100.00,
      });

      expect(violations.filter((v) => v.code === 'PURCHASE_RATE_EXCEEDS_MRP').length).toBe(0);
      expect(violations.filter((v) => v.code === 'SELLING_RATE_EXCEEDS_MRP').length).toBe(0);
      expect(violations.filter((v) => v.code === 'NEGATIVE_MARGIN').length).toBe(0);
    });

    it('blocks purchase rate 0.01 above MRP', () => {
      const violations = validateLineItemPricing({
        sellingRate: 90.00,
        purchaseRate: 100.01,
        mrp: 100.00,
      });

      const pExceed = violations.find((v) => v.code === 'PURCHASE_RATE_EXCEEDS_MRP');
      expect(pExceed).toBeDefined();
      expect(pExceed?.severity).toBe('ERROR');
      expect(pExceed?.canBypass).toBe(false);
    });

    it('handles negative margin boundary: sellingRate = purchaseRate vs sellingRate = purchaseRate - 0.01', () => {
      // Exact equality: no negative margin
      const equalViolations = validateLineItemPricing({
        sellingRate: 50.00,
        purchaseRate: 50.00,
        mrp: 60.00,
      });
      expect(equalViolations.filter((v) => v.code === 'NEGATIVE_MARGIN').length).toBe(0);

      // 1 paisa below cost: triggers negative margin
      const belowViolations = validateLineItemPricing({
        sellingRate: 49.99,
        purchaseRate: 50.00,
        mrp: 60.00,
      });
      const neg = belowViolations.find((v) => v.code === 'NEGATIVE_MARGIN');
      expect(neg).toBeDefined();
      expect(neg?.severity).toBe('ERROR');
      expect(neg?.canBypass).toBe(true);

      // Supervisor bypass lowers severity to WARNING
      const bypassed = validateLineItemPricing(
        { sellingRate: 49.99, purchaseRate: 50.00, mrp: 60.00 },
        true
      );
      const negBypassed = bypassed.find((v) => v.code === 'NEGATIVE_MARGIN');
      expect(negBypassed?.severity).toBe('WARNING');
      expect(negBypassed?.isBypassed).toBe(true);
    });

    it('blocks zero and negative MRP values', () => {
      expect(
        validateLineItemPricing({ sellingRate: 10, purchaseRate: 8, mrp: 0 }).some(
          (v) => v.code === 'ZERO_OR_NEGATIVE_MRP'
        )
      ).toBe(true);

      expect(
        validateLineItemPricing({ sellingRate: 10, purchaseRate: 8, mrp: -15 }).some(
          (v) => v.code === 'ZERO_OR_NEGATIVE_MRP'
        )
      ).toBe(true);
    });
  });

  // =========================================================================
  // 5. DRUG LICENSE BOUNDARY TESTS (Expiry Dates, Leap Years, Schedule H)
  // =========================================================================
  describe('5. Drug License Boundary Tests', () => {
    it('exact expiry date boundary: valid on the day of expiry (warning only), expired next day (error)', () => {
      const customer = {
        dlNo20b: '20B/1234',
        dlNo21b: '21B/5678',
        dlExpiryDate: '2026-09-28',
        creditLimit: 50000,
        closingBalance: 10000,
      };

      // Exact day of expiry: days diff is 0. Valid on that day, triggers near-expiry WARNING.
      const onExpiryDate = validateCustomerDrugLicense(customer, '2026-09-28');
      expect(onExpiryDate.length).toBe(1);
      expect(onExpiryDate[0].code).toBe('DRUG_LICENSE_NEAR_EXPIRY');
      expect(onExpiryDate[0].severity).toBe('WARNING');
      expect(onExpiryDate.some((v) => v.code === 'DRUG_LICENSE_EXPIRED')).toBe(false);

      // Day after expiry: days diff is -1. Expired! Triggers ERROR.
      const dayAfterExpiry = validateCustomerDrugLicense(customer, '2026-09-29');
      expect(dayAfterExpiry.length).toBe(1);
      expect(dayAfterExpiry[0].code).toBe('DRUG_LICENSE_EXPIRED');
      expect(dayAfterExpiry[0].severity).toBe('ERROR');
      expect(dayAfterExpiry[0].canBypass).toBe(true);

      // Day before expiry: days diff is 1. Near expiry WARNING.
      const dayBeforeExpiry = validateCustomerDrugLicense(customer, '2026-09-27');
      expect(dayBeforeExpiry.length).toBe(1);
      expect(dayBeforeExpiry[0].code).toBe('DRUG_LICENSE_NEAR_EXPIRY');
      expect(dayBeforeExpiry[0].severity).toBe('WARNING');
    });

    it('evaluates leap year dates accurately across Feb 28, Feb 29, and March 1', () => {
      // Leap year 2024
      expect(calculateDateDiffInDays('2024-02-29', '2024-02-28')).toBe(1);
      expect(calculateDateDiffInDays('2024-03-01', '2024-02-29')).toBe(1);
      expect(calculateDateDiffInDays('2024-03-01', '2024-02-28')).toBe(2);

      // Non-leap year 2025
      expect(calculateDateDiffInDays('2025-03-01', '2025-02-28')).toBe(1);

      // Leap year DL expiry
      const leapCustomer = {
        dlNo20b: '20B/LEAP',
        dlExpiryDate: '2024-02-29',
        creditLimit: 0,
        closingBalance: 0,
      };

      // On leap day
      const onLeapDay = validateCustomerDrugLicense(leapCustomer, '2024-02-29');
      expect(onLeapDay.some((v) => v.code === 'DRUG_LICENSE_NEAR_EXPIRY')).toBe(true);
      expect(onLeapDay.some((v) => v.code === 'DRUG_LICENSE_EXPIRED')).toBe(false);

      // Day after leap day (March 1, 2024) -> Expired
      const afterLeapDay = validateCustomerDrugLicense(leapCustomer, '2024-03-01');
      expect(afterLeapDay.some((v) => v.code === 'DRUG_LICENSE_EXPIRED')).toBe(true);
    });

    it('enforces Form 20B/21B check strictly on Schedule H drugs, including whitespace edge cases', () => {
      const cases = [
        { dl20b: '', dl21b: '', isSchedH: true, shouldPass: false },
        { dl20b: '   ', dl21b: '\t\n  ', isSchedH: true, shouldPass: false },
        { dl20b: undefined, dl21b: undefined, isSchedH: true, shouldPass: false },
        { dl20b: 'MH-20B-123', dl21b: '', isSchedH: true, shouldPass: true },
        { dl20b: '', dl21b: 'MH-21B-456', isSchedH: true, shouldPass: true },
        { dl20b: 'MH-20B-123', dl21b: 'MH-21B-456', isSchedH: true, shouldPass: true },
        // Non-Schedule H sale does not require 20B/21B
        { dl20b: '', dl21b: '', isSchedH: false, shouldPass: true },
      ];

      for (const c of cases) {
        const violations = validateCustomerDrugLicense(
          {
            dlNo20b: c.dl20b,
            dlNo21b: c.dl21b,
            dlExpiryDate: '2028-12-31',
            creditLimit: 10000,
            closingBalance: 0,
          },
          '2026-09-28',
          c.isSchedH
        );

        const hasMissing = violations.some((v) => v.code === 'DRUG_LICENSE_MISSING');
        if (c.shouldPass) {
          expect(hasMissing).toBe(false);
        } else {
          expect(hasMissing).toBe(true);
          const violation = violations.find((v) => v.code === 'DRUG_LICENSE_MISSING');
          expect(violation?.severity).toBe('ERROR');
          expect(violation?.canBypass).toBe(false);
        }
      }
    });

    it('supports supervisor bypass for expired DL, transitioning severity and overall validity', () => {
      const expiredCustomer = {
        dlNo20b: '20B/EXP',
        dlExpiryDate: '2026-01-01',
        creditLimit: 100000,
        closingBalance: 10000,
      };

      // Unbypassed
      const resUnbypassed = validateBusinessInvariants({
        systemDate: '2026-09-28',
        customer: expiredCustomer,
      });
      expect(resUnbypassed.isValid).toBe(false);
      expect(resUnbypassed.hasErrors).toBe(true);
      expect(resUnbypassed.violations.find((v) => v.code === 'DRUG_LICENSE_EXPIRED')?.severity).toBe('ERROR');

      // Bypassed
      const resBypassed = validateBusinessInvariants({
        systemDate: '2026-09-28',
        customer: expiredCustomer,
        overrides: { bypassDlExpiry: true },
      });
      expect(resBypassed.isValid).toBe(true);
      expect(resBypassed.hasErrors).toBe(false);
      expect(resBypassed.hasWarnings).toBe(true);
      expect(resBypassed.violations.find((v) => v.code === 'DRUG_LICENSE_EXPIRED')?.severity).toBe('WARNING');
    });

    it('respects nearExpiryThresholdDays configuration parameter', () => {
      const customer = {
        dlNo20b: '20B/TEST',
        dlExpiryDate: '2026-11-15', // 48 days from 2026-09-28
        creditLimit: 0,
        closingBalance: 0,
      };

      // Default threshold (30 days): 48 days is NOT near expiry
      const resDefault = validateCustomerDrugLicense(customer, '2026-09-28');
      expect(resDefault.length).toBe(0);

      // Custom threshold (60 days): 48 days IS near expiry
      const res60 = validateCustomerDrugLicense(customer, '2026-09-28', false, false, 60);
      expect(res60.length).toBe(1);
      expect(res60[0].code).toBe('DRUG_LICENSE_NEAR_EXPIRY');
    });
  });

  // =========================================================================
  // 6. INTEGRATED INVARIANT ORCHESTRATION & COMPOSITE TRANSACTIONS
  // =========================================================================
  describe('6. Master Business Invariant Orchestration & Credit Limits', () => {
    it('blocks transaction if customer, product, or batch is marked as blocked', () => {
      const blockedCustomerRes = validateBusinessInvariants({
        systemDate: '2026-09-28',
        customer: { isBlocked: true, creditLimit: 0, closingBalance: 0 },
      });
      expect(blockedCustomerRes.isValid).toBe(false);
      expect(blockedCustomerRes.violations.some((v) => v.code === 'CUSTOMER_BLOCKED')).toBe(true);

      const blockedProductRes = validateBusinessInvariants({
        systemDate: '2026-09-28',
        product: { isBlocked: true },
      });
      expect(blockedProductRes.isValid).toBe(false);
      expect(blockedProductRes.violations.some((v) => v.code === 'PRODUCT_BLOCKED')).toBe(true);

      const blockedBatchRes = validateBusinessInvariants({
        systemDate: '2026-09-28',
        batch: { batchNo: 'B-BLK', expiryDate: '2028-12-31', isBlocked: true },
      });
      expect(blockedBatchRes.isValid).toBe(false);
      expect(blockedBatchRes.violations.some((v) => v.code === 'BATCH_BLOCKED')).toBe(true);
    });

    it('cash sales bypass credit limit and credit days overdue checks entirely', () => {
      const customer = {
        creditLimit: 10000,
        closingBalance: 15000, // Already exceeded
        creditDays: 30,
        oldestOverdueDays: 90, // Severely overdue
      };

      // Credit terms ('R'): blocks bill
      const creditViolations = validateCustomerCreditLimit(customer, 5000, 'R');
      expect(creditViolations.length).toBe(2);
      expect(creditViolations.some((v) => v.code === 'CREDIT_LIMIT_EXCEEDED')).toBe(true);
      expect(creditViolations.some((v) => v.code === 'CREDIT_DAYS_OVERDUE')).toBe(true);

      // Cash terms ('C'): completely bypassed
      const cashViolations = validateCustomerCreditLimit(customer, 5000, 'C');
      expect(cashViolations.length).toBe(0);
    });

    it('blocks transaction if physical stock shortage exists (requested + free > available)', () => {
      const res = validateBusinessInvariants({
        systemDate: '2026-09-28',
        batch: {
          batchNo: 'B-STOCK',
          expiryDate: '2028-12-31',
          availableStock: 50,
          requestedQty: 45,
          freeQty: 10, // Needed = 55 > 50
        },
      });
      expect(res.isValid).toBe(false);
      expect(res.violations.some((v) => v.code === 'INSUFFICIENT_STOCK')).toBe(true);
    });

    it('customer advance credit (negative closing balance) offsets new invoice exposure', () => {
      const customer = {
        creditLimit: 5000,
        closingBalance: -2000, // Rs. 2000 customer advance credit
        creditDays: 30,
      };

      // New bill Rs. 6000: net exposure is -2000 + 6000 = 4000 <= 5000 (Compliant!)
      const violations = validateCustomerCreditLimit(customer, 6000, 'R');
      expect(violations.length).toBe(0);

      // New bill Rs. 7500: net exposure is -2000 + 7500 = 5500 > 5000 (Exceeds by 500)
      const exceededViolations = validateCustomerCreditLimit(customer, 7500, 'R');
      expect(exceededViolations.length).toBe(1);
      expect(exceededViolations[0].code).toBe('CREDIT_LIMIT_EXCEEDED');
      expect(exceededViolations[0].details?.excessAmount).toBe(500.00);
    });

    it('computes large multi-year date differences without drift across multiple leap years', () => {
      // 10 years: 2020-01-01 to 2030-01-01 (includes 2020, 2024, 2028 leap years = 365*10 + 3 = 3653 days)
      expect(calculateDateDiffInDays('2030-01-01', '2020-01-01')).toBe(3653);
      // Reverse direction: negative
      expect(calculateDateDiffInDays('2020-01-01', '2030-01-01')).toBe(-3653);
    });

    it('handles extreme volume transaction: 10,000,000 units at 0.01 rate', () => {
      const item = calculateLineItem({
        quantity: 10000000,
        sellingRate: 0.01,
        taxPct: 18.0,
      });

      expect(item.grossAmount).toBe(100000.00);
      expect(item.taxableAmount).toBe(100000.00);
      expect(item.cgstAmount).toBe(9000.00);
      expect(item.sgstAmount).toBe(9000.00);
      expect(item.totalTaxAmount).toBe(18000.00);
      expect(item.netAmount).toBe(118000.00);
    });
  });
});
