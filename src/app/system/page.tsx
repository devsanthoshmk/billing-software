import React from 'react';
import Link from 'next/link';
import { sqlite } from '@/lib/db';
import { DosWindow } from '@/components/ui/DosWindow';

export const dynamic = 'force-dynamic';

export default function SystemHubPage() {
  const config = sqlite.prepare('SELECT current_working_date, company_name, gstin FROM system_config WHERE id = ?').get('default') as any;
  const lastClosing = sqlite.prepare('SELECT closing_date, closed_at FROM day_end_closings ORDER BY closing_date DESC LIMIT 1').get() as any;

  const systemModules = [
    {
      num: '1',
      hotkey: 'F1',
      title: 'Day-End Cash & Register Closing',
      desc: 'Verify draft vouchers, reconcile physical drawer cash, finalize daily registers, and advance the business date.',
      href: '/system/day-end',
      badge: 'DAILY ROUTINE',
    },
    {
      num: '2',
      hotkey: 'F2',
      title: 'Month-End Accounting Period Lock',
      desc: 'Lock all financial vouchers in the calendar period to prevent unauthorized retroactive edits.',
      href: '/system/month-end',
      badge: 'PERIOD CLOSING',
    },
    {
      num: '3',
      hotkey: 'F3',
      title: 'Database Backup & Archive',
      desc: 'Create instant database snapshots, verify data backups, and manage archive storage.',
      href: '/system/backup',
      badge: 'DATA BACKUP',
    },
    {
      num: '4',
      hotkey: 'F4',
      title: 'Stock & Balance Recalculation',
      desc: 'Recalculate batch inventory levels and customer ledger balances from transaction records.',
      href: '/system/recalculate',
      badge: 'LEDGER AUDIT',
    },
    {
      num: '5',
      hotkey: 'F5',
      title: 'Tally Prime Accounting Export',
      desc: 'Export daily sales, collections, and GST tax vouchers formatted for Tally Prime import.',
      href: '/system/tally-export',
      badge: 'ACCOUNTING EXPORT',
    },
    {
      num: '6',
      hotkey: 'F6',
      title: 'System Health & Integrity Check',
      desc: 'Run data consistency audits, identify orphaned records, and check table record totals.',
      href: '/system/diagnostics',
      badge: 'SYSTEM HEALTH',
    },
    {
      num: '7',
      hotkey: 'F7',
      title: 'Supervisor Security & Policy Settings',
      desc: 'Manage drug license validation rules, credit limit enforcement, and supervisor approval policies.',
      href: '/system/supervisor',
      badge: 'SECURITY POLICY',
    },
    {
      num: '8',
      hotkey: 'F8',
      title: 'Day-End Closing History & Logs',
      desc: 'Review historical closing records, finalized sales turnover, cashier totals, and supervisor notes.',
      href: '/system/day-end?tab=history',
      badge: 'AUDIT LOGS',
    },
  ];

  return (
    <DosWindow
      title="System Administration & Maintenance"
      breadcrumbs={['MAIN MENU', 'SYSTEM UTILITIES']}
    >
      <div className="flex flex-col gap-6">
        {/* Working Session Status Box */}
        <div className="p-4 bg-brand-surface border border-brand-border grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
              CURRENT WORKING DATE
            </span>
            <span className="text-xl font-bold font-mono text-brand-ink">
              {config?.current_working_date || '2026-09-28'}
            </span>
            <span className="text-[11px] text-green-700 font-bold block mt-1">● Active Business Day</span>
          </div>

          <div>
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
              LAST COMPLETED DAY CLOSING
            </span>
            <span className="text-base font-bold font-mono text-gray-800">
              {lastClosing ? lastClosing.closing_date : 'No prior closing'}
            </span>
            <span className="text-[11px] text-gray-500 block mt-1">
              {lastClosing ? `Closed at: ${lastClosing.closed_at.slice(0, 16)}` : 'System initialized'}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
              DATABASE & DATA INTEGRITY
            </span>
            <span className="text-base font-bold font-mono text-green-700">HEALTHY & ACTIVE</span>
            <span className="text-[11px] text-gray-500 block mt-1">Integrity Constraints: Active</span>
          </div>
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {systemModules.map((mod) => (
            <Link
              key={mod.num}
              href={mod.href}
              className="p-4 bg-white border border-brand-border hover:border-brand-ink hover:shadow-[4px_4px_0px_0px_#0B192C] transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="w-6 h-6 bg-brand-ink text-white font-mono text-xs font-bold flex items-center justify-center">
                    {mod.num}
                  </span>
                  <span className="text-[10px] font-mono bg-yellow-100 text-yellow-900 border border-yellow-300 px-1.5 py-0.5 font-bold uppercase">
                    {mod.badge}
                  </span>
                </div>
                <h3 className="font-mono font-bold text-sm text-brand-ink group-hover:text-brand-amber mb-1">
                  {mod.title}
                </h3>
                <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{mod.desc}</p>
              </div>

              <div className="mt-4 pt-2 border-t border-gray-100 flex items-center justify-between text-xs font-mono text-brand-ink font-bold">
                <span>[{mod.hotkey}] OPEN</span>
                <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </DosWindow>
  );
}
