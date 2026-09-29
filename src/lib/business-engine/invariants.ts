/**
 * Pure TypeScript Domain Invariant Guards (Feature F11)
 * Enforces pricing bounds, DPCO ceilings, drug license validity, batch expiry, and customer credit exposure.
 * Parity: INVPRE.PRG, PURCHASE.PRG, PROAED.PRG, PERCAED.PRG
 */

import {
  BusinessValidationContext,
  ValidationResult,
  InvariantViolation,
  LineItemPricingContext,
  CustomerValidationContext,
} from './types';

/**
 * Pure function to calculate difference in whole days between two ISO date strings (target - reference).
 * Positive if target is in the future; negative if target is in the past.
 */
export function calculateDateDiffInDays(targetDateIso: string, referenceDateIso: string): number {
  const target = new Date(targetDateIso + 'T00:00:00Z').getTime();
  const reference = new Date(referenceDateIso + 'T00:00:00Z').getTime();
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((target - reference) / msPerDay);
}

/**
 * Validates line-item pricing invariants (Negative Margin, Zero Rate, MRP Bounds).
 * Pure function matching INVPRE.PRG:1710, 1726 and PURCHASE.PRG:2186, 2190.
 */
export function validateLineItemPricing(
  pricing: LineItemPricingContext,
  bypassNegativeMargin: boolean = false
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  // 1. Zero Selling Rate Guard (INVPRE.PRG:1726, PURCHASE.PRG:2183)
  if (!pricing.isReplacement && pricing.sellingRate <= 0) {
    violations.push({
      code: 'ZERO_SELLING_RATE',
      severity: 'ERROR',
      message: 'Selling Rate is Zero! Line item rate must be greater than zero.',
      field: 'sellingRate',
      canBypass: false,
      isBypassed: false,
      details: { sellingRate: pricing.sellingRate },
    });
  }

  // 2. Zero / Negative Purchase Rate Guard (PURCHASE.PRG:2179)
  if (pricing.purchaseRate <= 0) {
    violations.push({
      code: 'ZERO_PURCHASE_RATE',
      severity: 'ERROR',
      message: 'Purchase Rate is Zero or negative!',
      field: 'purchaseRate',
      canBypass: false,
      isBypassed: false,
      details: { purchaseRate: pricing.purchaseRate },
    });
  }

  // 3. Zero / Negative MRP Guard (PURCHASE.PRG:2186)
  if (pricing.mrp <= 0) {
    violations.push({
      code: 'ZERO_OR_NEGATIVE_MRP',
      severity: 'ERROR',
      message: 'MRP is Zero! Maximum Retail Price must be strictly positive.',
      field: 'mrp',
      canBypass: false,
      isBypassed: false,
      details: { mrp: pricing.mrp },
    });
  }

  // 4. MRP Bounds: Selling Rate exceeds MRP (PURCHASE.PRG:2190)
  if (pricing.mrp > 0 && pricing.sellingRate > pricing.mrp) {
    violations.push({
      code: 'SELLING_RATE_EXCEEDS_MRP',
      severity: 'ERROR',
      message: `Selling Rate (Rs. ${pricing.sellingRate.toFixed(2)}) cannot exceed MRP (Rs. ${pricing.mrp.toFixed(2)}) under DPCO statutory rules!`,
      field: 'sellingRate',
      canBypass: false,
      isBypassed: false,
      details: { sellingRate: pricing.sellingRate, mrp: pricing.mrp },
    });
  }

  // 5. Purchase Rate exceeds MRP
  if (pricing.mrp > 0 && pricing.purchaseRate > pricing.mrp) {
    violations.push({
      code: 'PURCHASE_RATE_EXCEEDS_MRP',
      severity: 'ERROR',
      message: `Purchase Rate (Rs. ${pricing.purchaseRate.toFixed(2)}) cannot exceed MRP (Rs. ${pricing.mrp.toFixed(2)})!`,
      field: 'purchaseRate',
      canBypass: false,
      isBypassed: false,
      details: { purchaseRate: pricing.purchaseRate, mrp: pricing.mrp },
    });
  }

  // 6. Negative Margin Alert / Guard (INVPRE.PRG:1710)
  // Selling Rate < Purchase Rate
  if (pricing.sellingRate > 0 && pricing.purchaseRate > 0 && pricing.sellingRate < pricing.purchaseRate) {
    const marginAmount = Number((pricing.sellingRate - pricing.purchaseRate).toFixed(2));
    const marginPct = Number(((marginAmount / pricing.sellingRate) * 100).toFixed(2));

    violations.push({
      code: 'NEGATIVE_MARGIN',
      severity: bypassNegativeMargin ? 'WARNING' : 'ERROR',
      message: `Rate is less than Purchase Rate! Selling Rate: Rs. ${pricing.sellingRate.toFixed(2)}, Cost: Rs. ${pricing.purchaseRate.toFixed(2)} (Margin: ${marginPct}%).`,
      field: 'sellingRate',
      canBypass: true,
      isBypassed: bypassNegativeMargin,
      details: {
        sellingRate: pricing.sellingRate,
        purchaseRate: pricing.purchaseRate,
        marginAmount,
        marginPct,
      },
    });
  }

  return violations;
}

/**
 * Validates Customer Regulatory Drug License (INVPRE.PRG:374-378).
 */
export function validateCustomerDrugLicense(
  customer: CustomerValidationContext,
  systemDate: string,
  isScheduleHProduct: boolean = false,
  bypassDlExpiry: boolean = false,
  nearExpiryThresholdDays: number = 30
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  // Check for missing Drug License on Schedule H/H1 drugs
  const hasDlNumber = Boolean(
    (customer.dlNo20b && customer.dlNo20b.trim()) ||
    (customer.dlNo21b && customer.dlNo21b.trim())
  );
  if (isScheduleHProduct && !hasDlNumber) {
    violations.push({
      code: 'DRUG_LICENSE_MISSING',
      severity: 'ERROR',
      message: 'Customer does not have a valid Form 20B/21B Drug License recorded for Schedule H/H1 sale!',
      field: 'dlNo20b',
      canBypass: false,
      isBypassed: false,
    });
  }

  // Expiry Date Validation
  if (customer.dlExpiryDate) {
    const daysUntilExpiry = calculateDateDiffInDays(customer.dlExpiryDate, systemDate);

    if (daysUntilExpiry < 0) {
      // License has expired (INVPRE.PRG:378)
      violations.push({
        code: 'DRUG_LICENSE_EXPIRED',
        severity: bypassDlExpiry ? 'WARNING' : 'ERROR',
        message: `This party Drug License has been expired! Expired on ${customer.dlExpiryDate} (${Math.abs(daysUntilExpiry)} days ago).`,
        field: 'dlExpiryDate',
        canBypass: true,
        isBypassed: bypassDlExpiry,
        details: { dlExpiryDate: customer.dlExpiryDate, systemDate, daysExpired: Math.abs(daysUntilExpiry) },
      });
    } else if (daysUntilExpiry <= nearExpiryThresholdDays) {
      // Near expiry warning (INVPRE.PRG:374)
      violations.push({
        code: 'DRUG_LICENSE_NEAR_EXPIRY',
        severity: 'WARNING',
        message: `This party Drug License expires on ${customer.dlExpiryDate} (in ${daysUntilExpiry} days)!`,
        field: 'dlExpiryDate',
        canBypass: true,
        isBypassed: true,
        details: { dlExpiryDate: customer.dlExpiryDate, daysUntilExpiry },
      });
    }
  }

  return violations;
}

/**
 * Validates Customer Credit Exposure (PERCAED.PRG:118, INVPRE.PRG:396-420).
 */
export function validateCustomerCreditLimit(
  customer: CustomerValidationContext,
  newInvoiceTotal: number,
  paymentTerms: 'C' | 'R' | 'H',
  bypassCreditLimitOverride: boolean = false
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  // Cash transactions do not consume credit limit
  if (paymentTerms === 'C') {
    return violations;
  }

  const isBypassed = bypassCreditLimitOverride || Boolean(customer.bypassCreditLimit);

  // Credit Limit Ceiling Check
  if (customer.creditLimit > 0) {
    const totalExposure = Number((customer.closingBalance + newInvoiceTotal).toFixed(2));
    if (totalExposure > customer.creditLimit) {
      const excessAmount = Number((totalExposure - customer.creditLimit).toFixed(2));
      violations.push({
        code: 'CREDIT_LIMIT_EXCEEDED',
        severity: isBypassed ? 'WARNING' : 'ERROR',
        message: `Customer credit limit exceeded! Current Balance: Rs. ${customer.closingBalance.toFixed(2)}, New Bill: Rs. ${newInvoiceTotal.toFixed(2)}, Total: Rs. ${totalExposure.toFixed(2)}, Limit: Rs. ${customer.creditLimit.toFixed(2)} (Excess: Rs. ${excessAmount.toFixed(2)}).`,
        field: 'creditLimit',
        canBypass: true,
        isBypassed,
        details: {
          closingBalance: customer.closingBalance,
          newInvoiceTotal,
          totalExposure,
          creditLimit: customer.creditLimit,
          excessAmount,
        },
      });
    }
  }

  // Credit Days Overdue Check
  if (customer.creditDays && customer.oldestOverdueDays && customer.oldestOverdueDays > customer.creditDays) {
    violations.push({
      code: 'CREDIT_DAYS_OVERDUE',
      severity: isBypassed ? 'WARNING' : 'ERROR',
      message: `Customer has overdue invoices pending for ${customer.oldestOverdueDays} days (Credit term: ${customer.creditDays} days)!`,
      field: 'creditDays',
      canBypass: true,
      isBypassed,
      details: {
        creditDays: customer.creditDays,
        oldestOverdueDays: customer.oldestOverdueDays,
      },
    });
  }

  return violations;
}

/**
 * Master Business Invariant Validation Orchestrator.
 * Aggregates all pricing, regulatory, batch, and credit checks into a single unified result.
 */
export function validateBusinessInvariants(context: BusinessValidationContext): ValidationResult {
  const violations: InvariantViolation[] = [];

  // 1. Line Item Pricing Validations
  if (context.lineItem) {
    const bypassMargin = Boolean(context.overrides?.bypassNegativeMargin);
    violations.push(...validateLineItemPricing(context.lineItem, bypassMargin));
  }

  // 2. Customer Master Validations
  if (context.customer) {
    if (context.customer.isBlocked) {
      violations.push({
        code: 'CUSTOMER_BLOCKED',
        severity: 'ERROR',
        message: `Customer "${context.customer.name || context.customer.code}" is marked as BLOCKED in customer master!`,
        field: 'isBlocked',
        canBypass: false,
        isBypassed: false,
      });
    }

    // Drug License Checks
    const isSchedule = Boolean(context.transaction?.isScheduleHProduct);
    const bypassDl = Boolean(context.overrides?.bypassDlExpiry);
    const dlThreshold = context.overrides?.dlNearExpiryDaysThreshold ?? 30;
    violations.push(
      ...validateCustomerDrugLicense(context.customer, context.systemDate, isSchedule, bypassDl, dlThreshold)
    );

    // Credit Exposure Checks
    if (context.transaction) {
      const bypassCredit = Boolean(context.overrides?.bypassCreditLimit);
      violations.push(
        ...validateCustomerCreditLimit(
          context.customer,
          context.transaction.newInvoiceTotal,
          context.transaction.paymentTerms,
          bypassCredit
        )
      );
    }
  }

  // 3. Product Master Validations
  if (context.product?.isBlocked) {
    violations.push({
      code: 'PRODUCT_BLOCKED',
      severity: 'ERROR',
      message: 'Product is marked as BLOCKED from sales in master catalog!',
      field: 'isBlocked',
      canBypass: false,
      isBypassed: false,
    });
  }

  // 4. Batch Level Validations
  if (context.batch) {
    if (context.batch.isBlocked) {
      violations.push({
        code: 'BATCH_BLOCKED',
        severity: 'ERROR',
        message: `Batch "${context.batch.batchNo}" is marked as BLOCKED!`,
        field: 'isBlocked',
        canBypass: false,
        isBypassed: false,
      });
    }

    if (context.batch.expiryDate) {
      const daysToBatchExpiry = calculateDateDiffInDays(context.batch.expiryDate, context.systemDate);
      if (daysToBatchExpiry <= 0) {
        violations.push({
          code: 'BATCH_EXPIRED',
          severity: 'ERROR',
          message: `Batch "${context.batch.batchNo}" expired on ${context.batch.expiryDate}! Expired stock cannot be sold.`,
          field: 'expiryDate',
          canBypass: false,
          isBypassed: false,
          details: { expiryDate: context.batch.expiryDate, systemDate: context.systemDate },
        });
      } else {
        const batchThreshold = context.overrides?.batchNearExpiryDaysThreshold ?? 90;
        if (daysToBatchExpiry <= batchThreshold) {
          violations.push({
            code: 'BATCH_NEAR_EXPIRY',
            severity: 'WARNING',
            message: `Batch "${context.batch.batchNo}" is near expiry (${daysToBatchExpiry} days remaining until ${context.batch.expiryDate})!`,
            field: 'expiryDate',
            canBypass: true,
            isBypassed: true,
            details: { expiryDate: context.batch.expiryDate, daysToBatchExpiry },
          });
        }
      }
    }

    // Physical Stock Shortage check
    if (
      context.batch.availableStock !== undefined &&
      context.batch.requestedQty !== undefined
    ) {
      const needed = context.batch.requestedQty + (context.batch.freeQty ?? 0);
      if (needed > context.batch.availableStock) {
        violations.push({
          code: 'INSUFFICIENT_STOCK',
          severity: 'ERROR',
          message: `Only ${context.batch.availableStock} Quantity(ies) is/are available in this batch (Requested: ${needed})!`,
          field: 'availableStock',
          canBypass: false,
          isBypassed: false,
          details: { availableStock: context.batch.availableStock, requestedTotal: needed },
        });
      }
    }
  }

  // Active unbypassed errors block validity
  const activeErrors = violations.filter((v) => v.severity === 'ERROR' && !v.isBypassed);
  const activeWarnings = violations.filter((v) => v.severity === 'WARNING');

  return {
    isValid: activeErrors.length === 0,
    hasErrors: activeErrors.length > 0,
    hasWarnings: activeWarnings.length > 0,
    violations,
  };
}
