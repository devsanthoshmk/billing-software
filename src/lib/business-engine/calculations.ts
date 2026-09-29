/**
 * Sales Invoicing & Billing Calculation Engine
 * Replicating FoxPro 2.6 PRG business rules (INVPRE.PRG, AINVPRE.PRG, PROCFILE.PRG)
 * Features F07, F08, F09, F10
 */

import {
  LineItemInput,
  LineItemCalculationResult,
  CashDiscountSlabConfig,
  TaxSlabBreakdown,
  InvoiceTotalsInput,
  InvoiceTotalsResult,
} from './types';

// ============================================================================
// Precision & Rounding Utilities
// ============================================================================

/**
 * Financial round-half-up to 2 decimal places (Paise precision).
 * Uses Number.EPSILON to guarantee correct arithmetic rounding at binary representation boundaries.
 */
export function roundToPaise(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Rupee round-half-up to nearest whole integer rupee (FoxPro PROCFILE.PRG:2356 parity).
 */
export function roundToRupee(amount: number): number {
  return Math.round(amount);
}


// ============================================================================
// Feature F08: Scheme / Bonus Free Goods Formula
// ============================================================================

/**
 * Computes bonus free units based on the authentic Indian pharma formula:
 * FreeQty = floor(BilledQty / SchemeThreshold) * SchemeFreeQty
 * 
 * Parity: INVPRE.PRG:589 `int(mqty / qy) * fqy`
 * 
 * Rules:
 * - If isReplacement is true, returns 0 (replacement items receive no bonus goods).
 * - If threshold <= 0 or freeQty <= 0 or quantity <= 0, returns 0.
 */
export function calculateSchemeFreeQty(
  quantity: number,
  threshold: number,
  freeQty: number,
  isReplacement: boolean = false
): number {
  if (isReplacement || threshold <= 0 || freeQty <= 0 || quantity <= 0) {
    return 0;
  }
  return Math.floor(quantity / threshold) * freeQty;
}


// ============================================================================
// Feature F07, F08, F09: Line Item Calculation
// ============================================================================

/**
 * Pure calculation function for a single sales invoice line item.
 * 
 * Features:
 * - F07: Gross amount calculation and product trade discount deduction.
 * - F08: Scheme free goods calculation with replacement override.
 * - F09: Statutory GST tax calculation (intra-state 50/50 split vs inter-state 100% IGST, tax exemption).
 */
export function calculateLineItem(params: LineItemInput): LineItemCalculationResult {
  const {
    id,
    productId,
    batchId,
    productName,
    quantity,
    sellingRate,
    purchaseRate,
    mrp,
    tradeDiscountPct = 0,
    taxCode = '02',
    taxPct,
    isInterstate = false,
    isTaxExemptCustomer = false,
    scheme = null,
    isReplacement = false,
  } = params;

  // Validation guards
  if (quantity <= 0) {
    throw new Error('Quantity must be greater than zero');
  }
  if (sellingRate < 0) {
    throw new Error('Selling rate cannot be negative');
  }
  if (tradeDiscountPct < 0 || tradeDiscountPct > 100) {
    throw new Error('Trade discount percentage must be between 0 and 100');
  }

  // 1. Bonus scheme free goods calculation (F08)
  const calculatedFreeQty = scheme
    ? calculateSchemeFreeQty(quantity, scheme.threshold, scheme.freeQty, isReplacement)
    : 0;
  const totalUnits = quantity + calculatedFreeQty;

  // 2. Gross calculation (F07)
  const grossAmount = roundToPaise(quantity * sellingRate);

  // 3. Product trade discount deduction (F07)
  const discountAmount = roundToPaise((grossAmount * tradeDiscountPct) / 100);
  const taxableAmount = roundToPaise(grossAmount - discountAmount);

  // 4. Statutory GST calculation (F09)
  let cgstRate = 0;
  let sgstRate = 0;
  let igstRate = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  const isExempt = isTaxExemptCustomer || taxPct === 0 || taxCode === '01';

  if (!isExempt) {
    if (isInterstate) {
      igstRate = taxPct;
      igstAmount = roundToPaise((taxableAmount * igstRate) / 100);
    } else {
      cgstRate = roundToPaise(taxPct / 2);
      sgstRate = roundToPaise(taxPct / 2);
      cgstAmount = roundToPaise((taxableAmount * cgstRate) / 100);
      sgstAmount = roundToPaise((taxableAmount * sgstRate) / 100);
    }
  }

  const totalTaxAmount = roundToPaise(cgstAmount + sgstAmount + igstAmount);
  const netAmount = roundToPaise(taxableAmount + totalTaxAmount);

  return {
    id,
    productId,
    batchId,
    productName,
    quantity,
    calculatedFreeQty,
    totalUnits,
    isReplacement,
    sellingRate,
    mrp,
    purchaseRate,
    grossAmount,
    tradeDiscountPct,
    discountAmount,
    taxableAmount,
    taxCode,
    taxPct: isExempt ? 0 : taxPct,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    totalTaxAmount,
    netAmount,
  };
}


// ============================================================================
// Feature F10: Cash Discount Slabs & Invoice Header Totals
// ============================================================================

/**
 * Evaluates cash discount slabs from HFILE.DAT (SLAP1, SLAP2, DISC1, DISC2).
 */
export function determineCashDiscountPct(
  taxableSubtotal: number,
  slabs?: CashDiscountSlabConfig[]
): number {
  if (!slabs || slabs.length === 0) return 0;

  // Sort descending by threshold
  const sorted = [...slabs].sort((a, b) => b.thresholdAmount - a.thresholdAmount);

  for (const slab of sorted) {
    if (slab.thresholdAmount > 0 && taxableSubtotal >= slab.thresholdAmount) {
      return slab.discountPct;
    }
  }

  return 0;
}

/**
 * Pure calculation function for entire sales invoice header totals (Feature F10).
 * 
 * Mathematical Workflow:
 * 1. Aggregate line item turnouts: totalGross, totalLineDiscount, subtotalTaxable.
 * 2. Determine Cash Discount (from explicit pct or tiered slabs).
 * 3. Deduct Cash Discount: netTaxableAmount = subtotalTaxable - cashDiscountAmount.
 * 4. Aggregate Taxes across individual tax slabs (CGST, SGST, IGST).
 * 5. Add Logistics Charges (freight, box, service charges).
 * 6. Compute TCS (Tax Collected at Source) on gross receivable if customer is eligible.
 * 7. Unrounded Total = netTaxableAmount + totalTax + totalCharges + tcsAmount.
 * 8. Grand Total = roundToRupee(unroundedTotal).
 * 9. Round-Off Amount = roundToPaise(grandTotal - unroundedTotal).
 */
export function calculateInvoiceTotals(params: InvoiceTotalsInput): InvoiceTotalsResult {
  const {
    lineItems,
    cashDiscountPct: explicitCashDiscPct,
    cashDiscountSlabs,
    freightCharges = 0,
    boxCharges = 0,
    serviceCharges = 0,
    tcsPct = 0,
    isTcsApplicable = false,
  } = params;

  if (!lineItems || lineItems.length === 0) {
    throw new Error('Invoice must contain at least 1 line item');
  }

  // 1. Line Aggregations
  let totalGross = 0;
  let totalLineDiscount = 0;
  let subtotalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalBilledQuantity = 0;
  let totalFreeQuantity = 0;
  let exemptedTurnover = 0;

  const slabMap = new Map<string, TaxSlabBreakdown>();

  for (const item of lineItems) {
    totalGross += item.grossAmount;
    totalLineDiscount += item.discountAmount;
    subtotalTaxable += item.taxableAmount;
    totalCgst += item.cgstAmount;
    totalSgst += item.sgstAmount;
    totalIgst += item.igstAmount;
    totalBilledQuantity += item.quantity;
    totalFreeQuantity += item.calculatedFreeQty;

    if (item.taxPct === 0 || item.taxCode === '01') {
      exemptedTurnover += item.taxableAmount;
    }

    // Accumulate tax slab breakdowns
    const key = `${item.taxCode}_${item.taxPct}`;
    if (!slabMap.has(key)) {
      slabMap.set(key, {
        taxCode: item.taxCode,
        taxPct: item.taxPct,
        taxableAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalTaxAmount: 0,
      });
    }
    const slab = slabMap.get(key)!;
    slab.taxableAmount = roundToPaise(slab.taxableAmount + item.taxableAmount);
    slab.cgstAmount = roundToPaise(slab.cgstAmount + item.cgstAmount);
    slab.sgstAmount = roundToPaise(slab.sgstAmount + item.sgstAmount);
    slab.igstAmount = roundToPaise(slab.igstAmount + item.igstAmount);
    slab.totalTaxAmount = roundToPaise(slab.cgstAmount + slab.sgstAmount + slab.igstAmount);
  }

  totalGross = roundToPaise(totalGross);
  totalLineDiscount = roundToPaise(totalLineDiscount);
  subtotalTaxable = roundToPaise(subtotalTaxable);
  totalCgst = roundToPaise(totalCgst);
  totalSgst = roundToPaise(totalSgst);
  totalIgst = roundToPaise(totalIgst);
  exemptedTurnover = roundToPaise(exemptedTurnover);
  const totalTax = roundToPaise(totalCgst + totalSgst + totalIgst);

  // 2. Cash Discount (F10)
  const cashDiscountPct = explicitCashDiscPct !== undefined
    ? explicitCashDiscPct
    : determineCashDiscountPct(subtotalTaxable, cashDiscountSlabs);

  if (cashDiscountPct < 0 || cashDiscountPct > 100) {
    throw new Error('Cash discount percentage must be between 0 and 100');
  }

  const cashDiscountAmount = roundToPaise((subtotalTaxable * cashDiscountPct) / 100);
  const netTaxableAmount = roundToPaise(subtotalTaxable - cashDiscountAmount);

  // 3. Logistics & Supplementary Charges
  const totalCharges = roundToPaise(freightCharges + boxCharges + serviceCharges);

  // 4. Tax Collected at Source (TCS) (INVPRE.PRG:2480)
  let tcsAmount = 0;
  if (isTcsApplicable && tcsPct > 0) {
    // Statutory base includes net taxable turnover, taxes, and logistics
    const tcsBase = roundToPaise(netTaxableAmount + totalTax + totalCharges);
    tcsAmount = roundToPaise((tcsBase * tcsPct) / 100);
  }

  // 5. Unrounded Total & Whole Rupee Round-Off (PROCFILE.PRG:2356)
  const unroundedTotal = roundToPaise(netTaxableAmount + totalTax + totalCharges + tcsAmount);
  const grandTotal = roundToRupee(unroundedTotal);
  const roundOffAmount = roundToPaise(grandTotal - unroundedTotal);

  return {
    totalGross,
    totalLineDiscount,
    subtotalTaxable,
    cashDiscountPct,
    cashDiscountAmount,
    netTaxableAmount,
    totalCgst,
    totalSgst,
    totalIgst,
    totalTax,
    taxBreakdown: Array.from(slabMap.values()),
    exemptedTurnover,
    freightCharges,
    boxCharges,
    serviceCharges,
    totalCharges,
    tcsPct,
    tcsAmount,
    unroundedTotal,
    grandTotal,
    roundOffAmount,
    totalItemsCount: lineItems.length,
    totalBilledQuantity,
    totalFreeQuantity,
    totalUnits: totalBilledQuantity + totalFreeQuantity,
  };
}
