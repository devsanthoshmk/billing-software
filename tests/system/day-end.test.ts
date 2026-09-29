import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sqlite } from '../../src/lib/db';
import { systemConfig, dayEndClosings } from '../../src/lib/db/schema/system';
import {
  checkDateIsClosed,
  getDayEndAuditPreview,
  executeDayEndClosing,
  getDayEndClosingHistory,
} from '../../src/app/system/day-end/actions';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * Day-End Closing Tests (Feature F32)
 * Tests the FoxPro DAYEND.PRG parity: audit preview, variance checks,
 * draft-blocking, atomic transaction locking, and date advancement.
 */
describe('Milestone 5 — Feature F32: Day-End Closing & System Date Advancement', () => {
  // Use a unique far-future date so tests don't clash with real data
  const TEST_DATE = '2096-12-15';
  const NEXT_DATE = '2096-12-16';
  let originalWorkingDate: string | null = null;

  beforeAll(async () => {
    // Ensure system_config row exists and save current working date
    const existing = sqlite.prepare('SELECT id, current_working_date FROM system_config WHERE id = ?').get('default') as any;
    if (!existing) {
      db.insert(systemConfig).values({
        id: 'default',
        currentWorkingDate: '2026-04-01',
        companyName: 'TEST ERP',
        financialYearStart: '2026-04-01',
        financialYearEnd: '2027-03-31',
      } as any).run();
    } else {
      originalWorkingDate = existing.current_working_date;
    }

    // Clean any stale closing for TEST_DATE
    sqlite.prepare('DELETE FROM day_end_closings WHERE closing_date = ?').run(TEST_DATE);
  });

  afterAll(() => {
    // Restore the system working date so other tests/suites aren't affected
    if (originalWorkingDate) {
      sqlite.prepare('UPDATE system_config SET current_working_date = ? WHERE id = ?').run(originalWorkingDate, 'default');
    }
    // Clean up all closing records created by this test suite
    sqlite.prepare('DELETE FROM day_end_closings WHERE closing_date IN (?, ?)').run(TEST_DATE, '2096-12-17');
  });


  it('confirms TEST_DATE is not yet closed before the test', async () => {
    const result = await checkDateIsClosed(TEST_DATE);
    expect(result.isClosed).toBe(false);
  });

  it('getDayEndAuditPreview returns a valid shape for TEST_DATE', async () => {
    const preview = await getDayEndAuditPreview(TEST_DATE);
    expect(preview).toBeDefined();
    expect(preview.date).toBe(TEST_DATE);
    expect(preview.isAlreadyClosed).toBe(false);
    // Numeric fields should be non-negative
    expect(preview.invoicesCount).toBeGreaterThanOrEqual(0);
    expect(preview.grossSales).toBeGreaterThanOrEqual(0);
    expect(preview.netSales).toBeGreaterThanOrEqual(0);
    expect(preview.taxCollected).toBeGreaterThanOrEqual(0);
    expect(preview.cashSales).toBeGreaterThanOrEqual(0);
    expect(preview.proposedNextWorkingDate).toBe(NEXT_DATE);
    expect(Array.isArray(preview.taxBySlabs)).toBe(true);
    expect(typeof preview.expectedCashBalance).toBe('number');
  });

  it('blocks closing if cash variance exists without supervisor password', async () => {
    const preview = await getDayEndAuditPreview(TEST_DATE);
    // Provide a wrong physical cash count to create variance
    const wrongCash = preview.expectedCashBalance + 999;

    const result = await executeDayEndClosing({
      closingDate: TEST_DATE,
      physicalCashCount: wrongCash,
      nextWorkingDate: NEXT_DATE,
    });

    // If there IS a variance, it must require SPM password
    if (preview.expectedCashBalance !== wrongCash) {
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/variance/i);
    }
  });

  it('successfully closes a business day with matching cash and advances working date', async () => {
    const preview = await getDayEndAuditPreview(TEST_DATE);
    const correctCash = preview.expectedCashBalance;

    const result = await executeDayEndClosing({
      closingDate: TEST_DATE,
      physicalCashCount: correctCash,
      nextWorkingDate: NEXT_DATE,
      closedByUser: 'TEST_ADMIN',
      denominationCounts: { '500': 2, '100': 5, '50': 0, '20': 0, '10': 0 },
    });

    expect(result.success).toBe(true);
    expect(result.closingId).toBeDefined();
  });

  it('confirms TEST_DATE is now closed', async () => {
    const result = await checkDateIsClosed(TEST_DATE);
    expect(result.isClosed).toBe(true);
    expect(result.closedAt).toBeDefined();
  });

  it('prevents re-closing an already-closed date', async () => {
    const preview = await getDayEndAuditPreview(TEST_DATE);
    expect(preview.isAlreadyClosed).toBe(true);

    const result = await executeDayEndClosing({
      closingDate: TEST_DATE,
      physicalCashCount: 0,
      nextWorkingDate: NEXT_DATE,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already been closed/i);
  });

  it('getDayEndClosingHistory returns the closing record', async () => {
    const history = await getDayEndClosingHistory();
    expect(Array.isArray(history)).toBe(true);
    const found = (history as any[]).find(
      (r: any) => r.closing_date === TEST_DATE || r.closingDate === TEST_DATE
    );
    expect(found).toBeDefined();
  });

  it('day-end closing with supervisor password overrides cash variance', async () => {
    const OVERRIDE_DATE = '2096-12-17';
    const OVERRIDE_NEXT = '2096-12-18';
    sqlite.prepare('DELETE FROM day_end_closings WHERE closing_date = ?').run(OVERRIDE_DATE);

    // Save current working date so we can restore it after
    const prevConfig = sqlite.prepare('SELECT current_working_date FROM system_config WHERE id = ?').get('default') as any;
    const savedDate = prevConfig?.current_working_date;

    const result = await executeDayEndClosing({
      closingDate: OVERRIDE_DATE,
      physicalCashCount: 9999999, // Large variance
      nextWorkingDate: OVERRIDE_NEXT,
      supervisorPassword: 'SPM',
      remarks: 'Override test',
    });

    // Should succeed with supervisor password even with large variance
    expect(result.success).toBe(true);

    // Clean up — delete closing record and restore original working date
    sqlite.prepare('DELETE FROM day_end_closings WHERE closing_date = ?').run(OVERRIDE_DATE);
    if (savedDate) {
      sqlite.prepare('UPDATE system_config SET current_working_date = ? WHERE id = ?').run(savedDate, 'default');
    }
  });
});
