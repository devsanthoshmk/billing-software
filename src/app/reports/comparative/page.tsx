'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { getComparativeAnalytics } from './actions';

export default function ComparativeReportsPage() {
  const [comparisons, setComparisons] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const res = await getComparativeAnalytics();
    if (res.success) {
      setComparisons(res.comparisons);
    } else {
      setError(res.error || 'Failed to generate comparative report');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const actions: DosAction[] = [
    {
      keyLabel: 'F8',
      label: 'Print Statement',
      variant: 'primary',
      disabled: comparisons.length === 0,
      onClick: () => window.print(),
    },
    {
      keyLabel: 'F5',
      label: 'Refresh',
      onClick: loadData,
    },
  ];

  const totalSalesYtd = comparisons.reduce((acc, it) => acc + (it.salesTurnover || 0), 0);
  const totalPurchYtd = comparisons.reduce((acc, it) => acc + (it.purchaseTurnover || 0), 0);

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="Monthly & Yearly Sales Comparison"
        subtitle="Month-on-month and year-to-date sales, inward purchases, and gross margins"
        breadcrumbs={['REPORTS', 'MONTHLY SALES COMPARISON']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            YTD Sales: ₹ {totalSalesYtd.toFixed(2)} | YTD Purchases: ₹ {totalPurchYtd.toFixed(2)}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1 border border-black">
              [ERROR] {error}
            </div>
          )}

          {/* Table */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="w-36 px-2 py-1 text-left">FINANCIAL MONTH</th>
                  <th className="w-24 px-2 py-1 text-center">BILLS GENERATED</th>
                  <th className="w-36 px-2 py-1 text-right">SALES TURNOVER</th>
                  <th className="w-36 px-2 py-1 text-right">PURCHASE INWARD</th>
                  <th className="w-36 px-2 py-1 text-right">GROSS TRADING MARGIN</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-500 font-bold">
                      Loading monthly comparative analytics...
                    </td>
                  </tr>
                ) : comparisons.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-500 font-bold">
                      No financial period data found.
                    </td>
                  </tr>
                ) : (
                  comparisons.map((row, idx) => (
                    <tr key={idx} className={`border-b border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                      <td className="px-2 py-1 font-bold text-brand-ink">{row.month}</td>
                      <td className="px-2 py-1 text-center font-mono">{row.billsCount}</td>
                      <td className="px-2 py-1 text-right font-bold text-brand-ink">
                        ₹ {row.salesTurnover.toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right text-gray-700">
                        ₹ {row.purchaseTurnover.toFixed(2)}
                      </td>
                      <td className={`px-2 py-1 text-right font-bold ${row.grossMargin >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        ₹ {row.grossMargin.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DosWindow>
    </div>
  );
}
