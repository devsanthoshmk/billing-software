import React from 'react';
import Link from 'next/link';
import { DosWindow } from '@/components/ui/DosWindow';

export default function ReportsHubPage() {
  const reportCategories = [
    {
      num: '1',
      hotkey: 'F1',
      title: 'Daily Sales Register',
      desc: 'Bill-wise sales register, operator breakdowns, statutory GST tax slabs abstract, and cash collection reconciliation.',
      href: '/reports/daily-sales',
      tag: 'DAILY TURNOVER',
    },
    {
      num: '2',
      hotkey: 'F2',
      title: 'Stock Valuation Statement',
      desc: 'Real-time closing stock statement evaluated at purchase cost and MRP, gross profit margins, and reorder alerts.',
      href: '/reports/stock',
      tag: 'INVENTORY ASSETS',
    },
    {
      num: '3',
      hotkey: 'F3',
      title: 'Short-Expiry & Expired Stock Alert',
      desc: 'Near-expiry batches filtered by 30, 60, 90, and 180-day horizons with batch valuation and risk status.',
      href: '/reports/expiry',
      tag: 'DRUG SAFETY',
    },
    {
      num: '4',
      hotkey: 'F4',
      title: 'Company-Wise Sales & Stock',
      desc: 'Manufacturer-level secondary sales, turnover volume, active SKU counts, and brand holding inventory valuation.',
      href: '/reports/companies',
      tag: 'MANUFACTURERS',
    },
    {
      num: '5',
      hotkey: 'F5',
      title: 'Sales Representative Commission & Performance',
      desc: 'Field representative sales volume, target completion rates, tier commissions, and collection targets.',
      href: '/reports/salesmen',
      tag: 'SALES FORCE',
    },
    {
      num: '6',
      hotkey: 'F6',
      title: 'GST Returns Data Export',
      desc: 'Official GSTR-1 and GSTR-3B B2B, B2C, and HSN summary table generation with JSON and CSV exports.',
      href: '/reports/gst/export',
      tag: 'TAX COMPLIANCE',
    },
    {
      num: '7',
      hotkey: 'F7',
      title: 'Fast, Slow & Non-Moving Stock Analysis',
      desc: 'Inventory velocity analysis, turnover ratios, and slow-moving or dead stock identification.',
      href: '/reports/stock-movement',
      tag: 'INVENTORY VELOCITY',
    },
    {
      num: '8',
      hotkey: 'F8',
      title: 'Monthly & Yearly Sales Comparison',
      desc: 'Month-on-month and year-to-date comparative revenue, inward purchasing, and trading margins.',
      href: '/reports/comparative',
      tag: 'PERIOD COMPARISON',
    },
  ];

  return (
    <DosWindow
      title="Reports & Analytics Hub"
      breadcrumbs={['MAIN MENU', 'REPORTS HUB']}
    >
      <div className="flex flex-col gap-6">
        {/* Banner */}
        <div className="p-3 bg-brand-surface border border-brand-border flex items-center justify-between">
          <div>
            <span className="font-mono font-bold text-sm text-brand-ink">
              MediSys Pharma ERP — Reports & Management Information System
            </span>
            <p className="text-xs text-gray-600 mt-0.5">
              Select an analytical report or statutory schedule to preview, print, or export to CSV.
            </p>
          </div>
          <span className="font-mono text-xs bg-brand-ink text-white px-2 py-1 font-bold">
            REPORTS HUB
          </span>
        </div>

        {/* Report Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{cat.desc}</p>
              </div>

              <div className="mt-4 pt-2 border-t border-gray-100 flex items-center justify-between text-xs font-mono text-brand-ink font-bold">
                <span className="text-gray-400 group-hover:text-brand-ink">[{cat.hotkey}]</span>
                <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </DosWindow>
  );
}
