import { describe, it, expect } from 'vitest';
import { getCompanyWiseReports } from '@/app/reports/companies/actions';
import { getSalesmanPerformance } from '@/app/reports/salesmen/actions';
import { generateGstr1Export } from '@/app/reports/gst/export/actions';
import { getStockMovementAnalysis } from '@/app/reports/stock-movement/actions';
import { getComparativeAnalytics } from '@/app/reports/comparative/actions';

describe('Reports Hub Extensions (5.3, 5.5, 5.7, 5.8, 5.9 Parity)', () => {
  it('1. generates company-wise sales & stock statements', async () => {
    const compRes = await getCompanyWiseReports();
    expect(compRes.success).toBe(true);
    expect(compRes.companyReports.length).toBeGreaterThan(0);
  });

  it('2. calculates salesman commission and target volumes', async () => {
    const smRes = await getSalesmanPerformance();
    expect(smRes.success).toBe(true);
    expect(smRes.salesmenPerformance.length).toBeGreaterThan(0);
  });

  it('3. compiles statutory GSTR-1 & 3B JSON schema', async () => {
    const gstRes = await generateGstr1Export('2026-09-01', '2026-09-30');
    expect(gstRes.success).toBe(true);
    expect(gstRes.summary).toBeDefined();
    expect(gstRes.gstr1JsonString).toContain('gstin');
  });

  it('4. performs ABC inventory velocity analysis', async () => {
    const abcRes = await getStockMovementAnalysis();
    expect(abcRes.success).toBe(true);
    expect(abcRes.stockMovement.length).toBeGreaterThan(0);
  });

  it('5. generates month-on-month comparative analytics', async () => {
    const compRes = await getComparativeAnalytics();
    expect(compRes.success).toBe(true);
    expect(compRes.comparisons.length).toBe(6);
  });
});
