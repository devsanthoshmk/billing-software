'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { getCompanyWiseReports } from './actions';

export default function CompanyReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [startDate, setStartDate] = useState<string>('2026-09-01');
  const [endDate, setEndDate] = useState<string>('2026-09-30');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (s = startDate, e = endDate) => {
    setLoading(true);
    setError(null);
    const res = await getCompanyWiseReports(s, e);
    if (res.success) {
      setReports(res.companyReports);
    } else {
      setError(res.error || 'Failed to generate company reports');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const actions: DosAction[] = [
    {
      keyLabel: 'F8',
      label: 'Print Report',
      variant: 'primary',
      disabled: reports.length === 0,
      onClick: () => window.print(),
    },
    {
      keyLabel: 'F5',
      label: 'Refresh',
      onClick: () => loadData(startDate, endDate),
    },
  ];

  const totalSalesVal = reports.reduce((acc, r) => acc + (r.totalSalesValue || 0), 0);
  const totalStockVal = reports.reduce((acc, r) => acc + (r.totalStockValue || 0), 0);

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="Company-Wise Sales & Stock"
        subtitle="Manufacturer-level turnover, secondary sales, and inventory valuation"
        breadcrumbs={['REPORTS', 'COMPANY SALES & STOCK']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Companies: {reports.length} | Total Sales: ₹ {totalSalesVal.toFixed(2)} | Stock Valuation: ₹ {totalStockVal.toFixed(2)}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1 border border-black">
              [ERROR] {error}
            </div>
          )}

          {/* Date Controls */}
          <div className="bg-brand-surface border border-brand-border p-2 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="font-bold text-brand-ink">Period From:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white border border-brand-border px-2 py-1 font-bold"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="font-bold text-brand-ink">To:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white border border-brand-border px-2 py-1 font-bold"
              />
            </div>

            <button
              type="button"
              onClick={() => loadData(startDate, endDate)}
              className="bg-brand-ink text-white font-bold px-4 py-1 border border-black hover:bg-brand-amber cursor-pointer"
            >
              [GENERATE REPORT]
            </button>
          </div>

          {/* Table */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="w-20 px-2 py-1 text-left">CODE</th>
                  <th className="px-2 py-1 text-left">MANUFACTURER COMPANY</th>
                  <th className="w-24 px-2 py-1 text-center">SKUS</th>
                  <th className="w-28 px-2 py-1 text-right">UNITS SOLD</th>
                  <th className="w-32 px-2 py-1 text-right">SALES TURNOVER</th>
                  <th className="w-28 px-2 py-1 text-right">STOCK ON HAND</th>
                  <th className="w-32 px-2 py-1 text-right">STOCK VALUATION</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-500 font-bold">
                      Loading company sales & stock data...
                    </td>
                  </tr>
                ) : reports.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-500 font-bold">
                      No company records found for the selected period.
                    </td>
                  </tr>
                ) : (
                  reports.map((r, idx) => (
                    <tr key={r.companyId} className={`border-b border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                      <td className="px-2 py-1 font-bold">{r.code}</td>
                      <td className="px-2 py-1 font-bold">{r.name}</td>
                      <td className="px-2 py-1 text-center">{r.productsCount}</td>
                      <td className="px-2 py-1 text-right">{r.totalBilledQty}</td>
                      <td className="px-2 py-1 text-right font-bold text-brand-ink">
                        ₹ {r.totalSalesValue.toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right">{r.totalStockOnHand}</td>
                      <td className="px-2 py-1 text-right font-bold text-brand-amber">
                        ₹ {r.totalStockValue.toFixed(2)}
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
