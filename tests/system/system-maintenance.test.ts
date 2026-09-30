import { describe, it, expect } from 'vitest';
import { createDatabaseBackupSnapshot, getExistingBackups } from '@/app/system/backup/actions';
import { runSystemRecalculation } from '@/app/system/recalculate/actions';
import { executeMonthEndClosing } from '@/app/system/month-end/actions';
import { generateTallyXmlExport } from '@/app/system/tally-export/actions';
import { runDatabaseDiagnostics } from '@/app/system/diagnostics/actions';
import { getSupervisorSettings, updateSupervisorSettings } from '@/app/system/supervisor/actions';

describe('System Maintenance & Supervisor Extensions (6.1, 6.2, 6.4, 6.6, 6.8, 7.0 Parity)', () => {
  it('1. takes atomic database snapshot and lists archives', async () => {
    const backupRes = await createDatabaseBackupSnapshot('ADMIN_TEST');
    expect(backupRes.success).toBe(true);
    expect(backupRes.fileName).toContain('siva_erp_backup_');

    const listRes = await getExistingBackups();
    expect(listRes.success).toBe(true);
    expect(listRes.backups.length).toBeGreaterThan(0);
  });

  it('2. executes database balance and stock rollup recalculation', async () => {
    const recalcRes = await runSystemRecalculation('ADMIN_TEST');
    expect(recalcRes.success).toBe(true);
    expect(recalcRes.totalProducts).toBeGreaterThan(0);
    expect(recalcRes.totalCustomers).toBeGreaterThan(0);
  });

  it('3. executes month-end period lock routine', async () => {
    const monthRes = await executeMonthEndClosing('2026-08', 'ADMIN_TEST');
    expect(monthRes.success).toBe(true);
    expect(monthRes.closedMonth).toBe('2026-08');
  });

  it('4. compiles Tally Prime XML export envelope', async () => {
    const tallyRes = await generateTallyXmlExport('2026-09-01', '2026-09-30');
    expect(tallyRes.success).toBe(true);
    expect(tallyRes.xmlContent).toContain('<ENVELOPE>');
    expect(tallyRes.xmlContent).toContain('</ENVELOPE>');
  });

  it('5. runs SQLite PRAGMA diagnostics and integrity audit', async () => {
    const diagRes = await runDatabaseDiagnostics();
    expect(diagRes.success).toBe(true);
    expect(diagRes.integrityPassed).toBe(true);
    expect(diagRes.tableCounts).toBeDefined();
  });

  it('6. updates supervisor security parameters and access gates', async () => {
    const getRes = await getSupervisorSettings();
    expect(getRes.success).toBe(true);
    expect(getRes.controls).toBeDefined();

    const updateRes = await updateSupervisorSettings({
      allowRateModification: true,
      allowOutstandingOverride: false,
      allowCollectionEdit: false,
      allowInvoiceCancellation: true,
      enforceCreditLimit: true,
      enforceLicenseExpiryBlock: true,
      enforceNegativeMarginBlock: true,
      operator: 'ADMIN',
    });
    expect(updateRes.success).toBe(true);
  });
});
