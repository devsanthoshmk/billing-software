import React from 'react';
import Link from 'next/link';
import { DosWindow } from '@/components/ui/DosWindow';

export default function ReportsHubPage() {
  const reportCategories = [
    {
      num: '1',
      hotkey: 'F1',
      title: 'DAILY SALES & CASHIER REGISTER [XDAYSAL]',
      desc: 'Bill-wise sales register, operator breakdowns, statutory 5-slab tax abstract & cash drawer reconciliation.',
      href: '/reports/daily-sales',
      tag: 'DAILY TURNOVER',
    },
    {
      num: '2',
      hotkey: 'F2',
      title: 'STOCK VALUATION & INVENTORY LEDGER [CLOSTK]',
      desc: 'Real-time closing stock statement evaluated at cost and MRP, potential gross margins & low-stock reorder alerts.',
      href: '/reports/stock',
      tag: 'INVENTORY ASSETS',
    },
    {
      num: '3',
      hotkey: 'F3',
      title: 'SHORT-EXPIRY & EXPIRED STOCK [EXPSTK]',
      desc: 'Near-expiry batches filtered by 30/60/90/180-day thresholds with critical risk color flags and batch valuation.',
      href: '/reports/expiry',
      tag: 'DRUG SAFETY',
    },
    {
      num: '4',
      hotkey: 'F4',
      title: 'STATUTORY GST RETURNS (GSTR-1 & 3B) [GSTMENU]',
      desc: 'Government-ready GSTR-1 (B2B, B2C, Notes, HSN Summary) and GSTR-3B tax liability vs eligible ITC reconciliation.',
      href: '/reports/gst',
      tag: 'STATUTORY COMPLIANCE',
    },
    {
      num: '5',
      hotkey: 'F5',
      title: 'CUSTOMER COLLECTIONS & RECEIVABLES [CUSOUT]',
      desc: 'Audit register of customer receipts, unallocated advance funds, and bill-by-bill outstanding balances.',
      href: '/accounts/receipts?tab=register',
      tag: 'ACCOUNTS RECEIVABLE',
    },
    {
      num: '6',
      hotkey: 'F6',
      title: 'SUPPLIER DISBURSEMENTS & PAYABLES [SUPOUT]',
      desc: 'Audit register of supplier disbursements, cash discounts earned, and purchase bill payments.',
      href: '/accounts/payments?tab=register',
      tag: 'ACCOUNTS PAYABLE',
    },
  ];

  return (
    <DosWindow
      title="BUSINESS REPORTS GENERATION MENU [REPMENU]"
      breadcrumbs={['MAIN MENU', 'REPORTS HUB']}
    >
      <div className="flex flex-col gap-6">
        {/* Banner */}
        <div className="p-3 bg-brand-surface border border-brand-border flex items-center justify-between">
          <div>
            <span className="font-mono font-bold text-sm text-brand-ink">
              SIVA WHOLESALE & PHARMACY ERP — STATUTORY & FINANCIAL AUDIT HUB
            </span>
            <p className="text-xs text-gray-600 mt-0.5">
              Select an analytical report or statutory schedule to preview, print on continuous stationery, or export to CSV.
            </p>
          </div>
          <span className="font-mono text-xs bg-brand-ink text-white px-2 py-1 font-bold">
            REPMENU.PRG v2.6
          </span>
        </div>

        {/* Report Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportCategories.map((cat) => (
            <Link
              key={cat.num}
              href={cat.href}
              className="p-4 bg-white border border-brand-border hover:border-brand-ink hover:shadow-[4px_4px_0px_0px_#0B192C] transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="w-6 h-6 bg-brand-ink text-white font-mono text-xs font-bold flex items-center justify-center">
                    {cat.num}
                  </span>
                  <span className="text-[10px] font-mono bg-blue-50 text-blue-800 px-1.5 py-0.5 border border-blue-200 font-bold uppercase">
                    {cat.tag}
                  </span>
                </div>
                <h3 className="font-mono font-bold text-sm text-brand-ink group-hover:text-brand-amber mb-1">
                  {cat.title}
                </h3>
                <p className="text-xs text-gray-600 leading-relaxed">{cat.desc}</p>
              </div>

              <div className="mt-4 pt-2 border-t border-gray-100 flex items-center justify-between text-xs font-mono text-brand-ink font-bold">
                <span className="text-gray-400 group-hover:text-brand-ink">Press [{cat.num}] or [{cat.hotkey}]</span>
                <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </DosWindow>
  );
}
