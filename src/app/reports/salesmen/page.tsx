'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { getSalesmanPerformance } from './actions';

export default function SalesmanReportsPage() {
  const [performanceList, setPerformanceList] = useState<any[]>([]);
  const [startDate, setStartDate] = useState<string>('2026-09-01');
  const [endDate, setEndDate] = useState<string>('2026-09-30');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (s = startDate, e = endDate) => {
    setLoading(true);
    setError(null);
    const res = await getSalesmanPerformance(s, e);
    if (res.success) {
      setPerformanceList(res.salesmenPerformance);
    } else {
      setError(res.error || 'Failed to load salesman performance');
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
      disabled: performanceList.length === 0,
      onClick: () => window.print(),
    },
    {
      keyLabel: 'F5',
      label: 'Refresh',
      onClick: () => loadData(startDate, endDate),
    },
  ];

  const totalNet = performanceList.reduce((acc, sm) => acc + (sm.netTurnover || 0), 0);
  const totalComm = performanceList.reduce((acc, sm) => acc + (sm.commissionEarned || 0), 0);

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="Sales Representative Commission & Performance"
        subtitle="Sales representative performance, target achievements, and commission calculations"
        breadcrumbs={['REPORTS', 'SALES COMMISSION']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Total Sales Turnover: ₹ {totalNet.toFixed(2)} | Commission Payable: ₹ {totalComm.toFixed(2)}
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
              <label className="font-bold text-brand-ink">From:</label>
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
              [CALCULATE COMMISSION]
            </button>
          </div>

          {/* Table */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="w-20 px-2 py-1 text-left">CODE</th>
                  <th className="px-2 py-1 text-left">SALES REPRESENTATIVE</th>
                  <th className="w-28 px-2 py-1 text-left">PHONE</th>
                  <th className="w-24 px-2 py-1 text-center">COMM %</th>
                  <th className="w-24 px-2 py-1 text-center">BILLS COUNT</th>
                  <th className="w-32 px-2 py-1 text-right">GROSS SALES</th>
                  <th className="w-32 px-2 py-1 text-right">NET SALES</th>
                  <th className="w-32 px-2 py-1 text-right">COMMISSION EARNED</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-500 font-bold">
                      Loading sales performance and commission data...
                    </td>
                  </tr>
                ) : performanceList.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-500 font-bold">
                      No sales representative records found.
                    </td>
                  </tr>
                ) : (
                  performanceList.map((sm, idx) => (
                    <tr key={sm.salesmanId} className={`border-b border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                      <td className="px-2 py-1 font-bold">{sm.code}</td>
                      <td className="px-2 py-1 font-bold text-brand-ink">{sm.name}</td>
                      <td className="px-2 py-1 text-gray-600">{sm.phone}</td>
                      <td className="px-2 py-1 text-center font-bold">{sm.localCommissionPct}%</td>
                      <td className="px-2 py-1 text-center font-mono">{sm.billsCount}</td>
                      <td className="px-2 py-1 text-right text-gray-600">₹ {sm.grossTurnover.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right font-bold text-brand-ink">
                        ₹ {sm.netTurnover.toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right font-bold text-brand-amber">
                        ₹ {sm.commissionEarned.toFixed(2)}
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
