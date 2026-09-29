import { describe, it, expect } from 'vitest';
import {
  getDailySalesReport,
} from '../../src/lib/reports/dailySalesQueries';
import {
  getStockValuationSummary,
  getStockLedger,
  getShortExpiryReport,
} from '../../src/lib/reports/stockQueries';
import {
  getGstr1B2bInvoices,
  getGstr1B2cSummary,
  getGstr1HsnSummary,
  getGstr3bMonthlySummary,
} from '../../src/lib/reports/gstQueries';

/**
 * Business Reports Tests (Features F29, F30, F31)
 * These reports query live DB data; tests verify:
 * 1. Return types match their contracts (shape/field assertions)
 * 2. Numeric values are non-negative
 * 3. Aggregation math is internally consistent
 */

describe('Milestone 5 — Feature F29: Daily Sales Report', () => {
  const TEST_DATE = '2096-12-01'; // Far future → guaranteed zero-data, but valid shape

  it('returns a valid DailySalesReportData shape for a zero-activity date', () => {
    const report = getDailySalesReport({ reportDate: TEST_DATE });
    expect(report).toBeDefined();
    expect(report.summary).toBeDefined();
    expect(report.cashierBreakdown).toBeDefined();
    expect(Array.isArray(report.cashierBreakdown)).toBe(true);
  });

  it('summary has all required numeric fields', () => {
    const report = getDailySalesReport({ reportDate: TEST_DATE });
    const s = report.summary;
    expect(typeof s.totalInvoicesCount).toBe('number');
    expect(typeof s.totalGrossSales).toBe('number');
    expect(typeof s.totalNetSales).toBe('number');
    expect(typeof s.totalTaxCollected).toBe('number');
    expect(typeof s.cashSalesAmount).toBe('number');
    expect(typeof s.creditSalesAmount).toBe('number');
    expect(typeof s.chequeSalesAmount).toBe('number');
    expect(typeof s.netCashInDrawer).toBe('number');
    expect(typeof s.collectionsCount).toBe('number');
  });

  it('zero-data date returns all-zero numeric fields (no NaN/undefined)', () => {
    const report = getDailySalesReport({ reportDate: TEST_DATE });
    const s = report.summary;
    expect(s.totalInvoicesCount).toBeGreaterThanOrEqual(0);
    expect(s.totalGrossSales).toBeGreaterThanOrEqual(0);
    expect(s.totalNetSales).toBeGreaterThanOrEqual(0);
    expect(s.totalTaxCollected).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(s.netCashInDrawer)).toBe(false);
    expect(Number.isNaN(s.totalGrossSales)).toBe(false);
  });

  it('netSales ≤ grossSales (discounts reduce the total)', () => {
    const report = getDailySalesReport({ reportDate: TEST_DATE });
    const s = report.summary;
    expect(s.totalNetSales).toBeLessThanOrEqual(s.totalGrossSales);
  });

  it('cashSales + creditSales + chequeSales ≈ netSales (rounding tolerance)', () => {
    const report = getDailySalesReport({ reportDate: TEST_DATE });
    const s = report.summary;
    const sum = s.cashSalesAmount + s.creditSalesAmount + s.chequeSalesAmount;
    // Must be within ±1 of netSales (round-off can differ)
    expect(Math.abs(sum - s.totalNetSales)).toBeLessThanOrEqual(1);
  });

  it('report date field matches the requested date', () => {
    const report = getDailySalesReport({ reportDate: TEST_DATE });
    expect(report.summary.reportDate).toBe(TEST_DATE);
  });
});

describe('Milestone 5 — Feature F30: Stock Valuation & Short Expiry Reports', () => {
  it('getStockValuationSummary returns a valid summary shape', () => {
    const summary = getStockValuationSummary('2026-04-01');
    expect(summary).toBeDefined();
    expect(typeof summary.totalActiveProducts).toBe('number');
    expect(typeof summary.totalActiveBatches).toBe('number');
    expect(typeof summary.totalStockUnits).toBe('number');
    expect(typeof summary.totalValuationCost).toBe('number');
    expect(typeof summary.totalValuationMrp).toBe('number');
    expect(typeof summary.potentialGrossProfit).toBe('number');
    expect(typeof summary.potentialProfitMarginPct).toBe('number');
  });

  it('stock valuation fields are non-negative', () => {
    const summary = getStockValuationSummary('2026-04-01');
    expect(summary.totalActiveProducts).toBeGreaterThanOrEqual(0);
    expect(summary.totalActiveBatches).toBeGreaterThanOrEqual(0);
    expect(summary.totalStockUnits).toBeGreaterThanOrEqual(0);
    expect(summary.totalValuationCost).toBeGreaterThanOrEqual(0);
    expect(summary.totalValuationMrp).toBeGreaterThanOrEqual(0);
  });

  it('profit = MRP valuation - cost valuation', () => {
    const summary = getStockValuationSummary('2026-04-01');
    const expectedProfit = Number((summary.totalValuationMrp - summary.totalValuationCost).toFixed(2));
    expect(Math.abs(summary.potentialGrossProfit - expectedProfit)).toBeLessThan(0.01);
  });

  it('margin% is between 0 and 100 when MRP > 0', () => {
    const summary = getStockValuationSummary('2026-04-01');
    if (summary.totalValuationMrp > 0) {
      expect(summary.potentialProfitMarginPct).toBeGreaterThanOrEqual(0);
      expect(summary.potentialProfitMarginPct).toBeLessThanOrEqual(100);
    }
  });

  it('getStockLedger returns an array', () => {
    const ledger = getStockLedger();
    expect(Array.isArray(ledger)).toBe(true);
  });

  it('stock ledger rows have required fields', () => {
    const ledger = getStockLedger();
    if (ledger.length > 0) {
      const row = ledger[0] as any;
      expect(row).toHaveProperty('productId');
      expect(row).toHaveProperty('productName');
      expect(typeof row.stockQty === 'number' || typeof row.stockQty === 'undefined').toBe(true);
    }
  });

  it('getShortExpiryReport returns an array', () => {
    const report = getShortExpiryReport('2026-04-01', 90); // asOfDate, 90-day lookahead
    expect(Array.isArray(report)).toBe(true);
  });

  it('short-expiry rows have expiry date fields', () => {
    const report = getShortExpiryReport('2000-01-01', 36500); // 100-year lookahead from 2000 to catch anything
    if (report.length > 0) {
      const row = report[0] as any;
      expect(row).toHaveProperty('expiryDate');
      expect(row).toHaveProperty('batchNo');
    }
  });
});

describe('Milestone 5 — Feature F31: Statutory GST Reports (GSTR-1 & GSTR-3B)', () => {
  const START = '2096-01-01';
  const END = '2096-03-31';

  it('getGstr1B2bInvoices returns an array', () => {
    const result = getGstr1B2bInvoices(START, END);
    expect(Array.isArray(result)).toBe(true);
  });

  it('B2B rows have required GST fields', () => {
    const result = getGstr1B2bInvoices(START, END);
    if (result.length > 0) {
      const row = result[0] as any;
      expect(row).toHaveProperty('invoiceNo');
      expect(row).toHaveProperty('customerGstin');
      expect(row).toHaveProperty('totalInvoiceValue');
      expect(row).toHaveProperty('taxableValue');
    }
  });

  it('getGstr1B2cSummary returns an array', () => {
    const result = getGstr1B2cSummary(START, END);
    expect(Array.isArray(result)).toBe(true);
  });

  it('B2C summary rows have taxRatePct and taxableValue', () => {
    const result = getGstr1B2cSummary(START, END);
    if (result.length > 0) {
      const row = result[0] as any;
      expect(row).toHaveProperty('taxRatePct');
      expect(row).toHaveProperty('taxableValue');
    }
  });

  it('getGstr1HsnSummary returns an array', () => {
    const result = getGstr1HsnSummary(START, END);
    expect(Array.isArray(result)).toBe(true);
  });

  it('HSN summary rows have hsnCode and totalTax', () => {
    const result = getGstr1HsnSummary(START, END);
    if (result.length > 0) {
      const row = result[0] as any;
      expect(row).toHaveProperty('hsnCode');
      expect(row).toHaveProperty('totalTax');
    }
  });

  it('getGstr3bMonthlySummary returns a valid shape', () => {
    const result = getGstr3bMonthlySummary(START, END, 'JAN-MAR 2096');
    expect(result).toBeDefined();
    // Verify key fields exist on the returned object
    expect(result).toHaveProperty('outwardTaxableTurnover');
    expect(result).toHaveProperty('outwardCgst');
    expect(result).toHaveProperty('outwardSgst');
    expect(result).toHaveProperty('outwardIgst');
    expect(result).toHaveProperty('totalOutwardTaxLiability');
    expect(result).toHaveProperty('inputCgstItc');
    expect(result).toHaveProperty('inputSgstItc');
    expect(result).toHaveProperty('inputIgstItc');
    expect(result).toHaveProperty('totalEligibleItc');
    expect(result).toHaveProperty('totalNetTaxPayable');
  });

  it('GSTR-3B numeric fields are non-negative', () => {
    const result = getGstr3bMonthlySummary(START, END, 'JAN-MAR 2096') as any;
    const numericFields = [
      'outwardTaxableTurnover',
      'outwardCgst',
      'outwardSgst',
      'outwardIgst',
      'totalOutwardTaxLiability',
      'inputCgstItc',
      'inputSgstItc',
      'inputIgstItc',
      'totalEligibleItc',
      'netCgstPayable',
      'netSgstPayable',
      'netIgstPayable',
      'totalNetTaxPayable',
      'excessItcCarryforward',
    ];
    for (const field of numericFields) {
      expect(typeof result[field]).toBe('number');
      expect(result[field]).toBeGreaterThanOrEqual(0);
    }
  });
});
