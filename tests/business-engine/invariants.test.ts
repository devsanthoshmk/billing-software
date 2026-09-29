import { describe, it, expect } from 'vitest';
import {
  calculateDateDiffInDays,
  validateLineItemPricing,
  validateCustomerDrugLicense,
  validateCustomerCreditLimit,
  validateBusinessInvariants,
  BusinessValidationContext,
} from '../../src/lib/business-engine';

describe('Domain Invariant Guards Engine (Feature F11)', () => {
  describe('calculateDateDiffInDays', () => {
    it('computes days accurately across months and leap years', () => {
      expect(calculateDateDiffInDays('2026-09-28', '2026-09-28')).toBe(0);
      expect(calculateDateDiffInDays('2026-10-08', '2026-09-28')).toBe(10);
      expect(calculateDateDiffInDays('2026-08-28', '2026-09-28')).toBe(-31);
    });
  });

  describe('validateLineItemPricing', () => {
    it('detects negative margin and allows supervisor bypass', () => {
      const violationsUnbypassed = validateLineItemPricing(
        { sellingRate: 20.00, purchaseRate: 25.00, mrp: 30.00 },
        false
      );
      expect(violationsUnbypassed.length).toBe(1);
      expect(violationsUnbypassed[0].code).toBe('NEGATIVE_MARGIN');
      expect(violationsUnbypassed[0].severity).toBe('ERROR');
      expect(violationsUnbypassed[0].canBypass).toBe(true);

      const violationsBypassed = validateLineItemPricing(
        { sellingRate: 20.00, purchaseRate: 25.00, mrp: 30.00 },
        true
      );
      expect(violationsBypassed[0].severity).toBe('WARNING');
      expect(violationsBypassed[0].isBypassed).toBe(true);
    });

    it('blocks zero selling rate on regular items, allows on replacement sample', () => {
      const regularViolations = validateLineItemPricing({
        sellingRate: 0,
        purchaseRate: 10,
        mrp: 20,
      });
      expect(regularViolations.some((v) => v.code === 'ZERO_SELLING_RATE')).toBe(true);

      const replacementViolations = validateLineItemPricing({
        sellingRate: 0,
        purchaseRate: 10,
        mrp: 20,
        isReplacement: true,
      });
      expect(replacementViolations.some((v) => v.code === 'ZERO_SELLING_RATE')).toBe(false);
    });

    it('blocks zero or negative purchase rate', () => {
      const violations = validateLineItemPricing({
        sellingRate: 15,
        purchaseRate: 0,
        mrp: 25,
      });
      expect(violations.some((v) => v.code === 'ZERO_PURCHASE_RATE')).toBe(true);
    });

    it('blocks zero or negative MRP', () => {
      const zeroMrp = validateLineItemPricing({ sellingRate: 15, purchaseRate: 10, mrp: 0 });
      expect(zeroMrp.some((v) => v.code === 'ZERO_OR_NEGATIVE_MRP')).toBe(true);

      const negMrp = validateLineItemPricing({ sellingRate: 15, purchaseRate: 10, mrp: -5 });
      expect(negMrp.some((v) => v.code === 'ZERO_OR_NEGATIVE_MRP')).toBe(true);
    });

    it('blocks selling rate or purchase rate exceeding MRP (DPCO rule)', () => {
      const sellExceeds = validateLineItemPricing({ sellingRate: 55, purchaseRate: 40, mrp: 50 });
      expect(sellExceeds.some((v) => v.code === 'SELLING_RATE_EXCEEDS_MRP')).toBe(true);

      const purchExceeds = validateLineItemPricing({ sellingRate: 45, purchaseRate: 52, mrp: 50 });
      expect(purchExceeds.some((v) => v.code === 'PURCHASE_RATE_EXCEEDS_MRP')).toBe(true);
    });
  });

  describe('validateCustomerDrugLicense', () => {
    it('flags expired drug license with ERROR (bypassed to WARNING if overridden)', () => {
      const customer = {
        dlExpiryDate: '2026-08-31',
        creditLimit: 0,
        closingBalance: 0,
      };
      const unbypassed = validateCustomerDrugLicense(customer, '2026-09-28', false, false);
      expect(unbypassed.some((v) => v.code === 'DRUG_LICENSE_EXPIRED' && v.severity === 'ERROR')).toBe(true);

      const bypassed = validateCustomerDrugLicense(customer, '2026-09-28', false, true);
      expect(bypassed.some((v) => v.code === 'DRUG_LICENSE_EXPIRED' && v.severity === 'WARNING')).toBe(true);
    });

    it('warns when drug license is near expiry (within 30 days)', () => {
      const customer = {
        dlExpiryDate: '2026-10-15', // 17 days away
        creditLimit: 0,
        closingBalance: 0,
      };
      const violations = validateCustomerDrugLicense(customer, '2026-09-28', false, false, 30);
      expect(violations.some((v) => v.code === 'DRUG_LICENSE_NEAR_EXPIRY' && v.severity === 'WARNING')).toBe(true);
    });

    it('enforces drug license presence for Schedule H/H1 sales', () => {
      const customer = {
        dlNo20b: null,
        dlNo21b: '',
        creditLimit: 0,
        closingBalance: 0,
      };
      const violations = validateCustomerDrugLicense(customer, '2026-09-28', true);
      expect(violations.some((v) => v.code === 'DRUG_LICENSE_MISSING' && v.severity === 'ERROR')).toBe(true);
    });
  });

  describe('validateCustomerCreditLimit', () => {
    it('exempts cash transactions from credit limit checks', () => {
      const customer = {
        creditLimit: 50000,
        closingBalance: 60000,
      };
      const violations = validateCustomerCreditLimit(customer, 20000, 'C');
      expect(violations.length).toBe(0);
    });

    it('triggers CREDIT_LIMIT_EXCEEDED on credit sales exceeding ceiling', () => {
      const customer = {
        creditLimit: 100000,
        closingBalance: 85000,
      };
      const violations = validateCustomerCreditLimit(customer, 20000, 'R');
      expect(violations.some((v) => v.code === 'CREDIT_LIMIT_EXCEEDED' && v.severity === 'ERROR')).toBe(true);
      expect(violations[0].details?.excessAmount).toBe(5000);
    });

    it('allows bypass of credit limit when customer flag or override is set', () => {
      const customer = {
        creditLimit: 100000,
        closingBalance: 120000,
        bypassCreditLimit: true,
      };
      const violations = validateCustomerCreditLimit(customer, 10000, 'R');
      expect(violations.some((v) => v.code === 'CREDIT_LIMIT_EXCEEDED' && v.severity === 'WARNING')).toBe(true);
    });

    it('triggers CREDIT_DAYS_OVERDUE when customer has overdue pending bills', () => {
      const customer = {
        creditLimit: 100000,
        closingBalance: 10000,
        creditDays: 30,
        oldestOverdueDays: 45,
      };
      const violations = validateCustomerCreditLimit(customer, 5000, 'R');
      expect(violations.some((v) => v.code === 'CREDIT_DAYS_OVERDUE')).toBe(true);
    });
  });

  describe('Master validateBusinessInvariants', () => {
    it('aggregates all checks and validates batch expiry and stock shortage', () => {
      const context: BusinessValidationContext = {
        systemDate: '2026-09-28',
        lineItem: {
          sellingRate: 50,
          purchaseRate: 40,
          mrp: 60,
        },
        customer: {
          code: 'CUST01',
          name: 'Apollo Pharmacy',
          creditLimit: 50000,
          closingBalance: 10000,
          dlExpiryDate: '2027-12-31',
        },
        transaction: {
          paymentTerms: 'R',
          newInvoiceTotal: 5000,
        },
        batch: {
          batchNo: 'B2026',
          expiryDate: '2026-08-31', // Expired!
          availableStock: 10,
          requestedQty: 15,
          freeQty: 2,
        },
      };

      const result = validateBusinessInvariants(context);
      expect(result.isValid).toBe(false);
      expect(result.hasErrors).toBe(true);

      const codes = result.violations.map((v) => v.code);
      expect(codes).toContain('BATCH_EXPIRED');
      expect(codes).toContain('INSUFFICIENT_STOCK');
    });

    it('detects blocked customer, product, and batch', () => {
      const context: BusinessValidationContext = {
        systemDate: '2026-09-28',
        customer: {
          code: 'C01',
          creditLimit: 1000,
          closingBalance: 0,
          isBlocked: true,
        },
        product: {
          isBlocked: true,
        },
        batch: {
          batchNo: 'BAT-BLK',
          expiryDate: '2027-01-01',
          isBlocked: true,
        },
      };

      const result = validateBusinessInvariants(context);
      expect(result.isValid).toBe(false);
      const codes = result.violations.map((v) => v.code);
      expect(codes).toContain('CUSTOMER_BLOCKED');
      expect(codes).toContain('PRODUCT_BLOCKED');
      expect(codes).toContain('BATCH_BLOCKED');
    });
  });
});
