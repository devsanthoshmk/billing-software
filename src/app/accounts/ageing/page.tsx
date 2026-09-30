'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { getCustomerAgeingAnalysis } from './actions';

export default function CustomerAgeingPage() {
  const [areas, setAreas] = useState<any[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [ageingList, setAgeingList] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (area = '') => {
    setLoading(true);
    setError(null);
    const res = await getCustomerAgeingAnalysis(area);
    if (res.success) {
      setAreas(res.areas);
      setAgeingList(res.ageing);
      setSelectedIndex(0);
    } else {
      setError(res.error || 'Failed to calculate customer ageing');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const actions: DosAction[] = [
    {
      keyLabel: 'F8',
      label: 'Print Ageing',
      variant: 'primary',
      disabled: ageingList.length === 0,
      onClick: () => window.print(),
    },
    {
      keyLabel: 'F5',
      label: 'Refresh',
      onClick: () => loadData(selectedAreaId),
    },
  ];

  const totalOutstanding = ageingList.reduce((acc, it) => acc + (it.closingBalance || 0), 0);
  const totalOverdue = ageingList.reduce((acc, it) => acc + it.overdueAmount, 0);

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="Customer Overdue Ageing"
        subtitle="Bill-by-bill receivables ageing and overdue analysis"
        breadcrumbs={['ACCOUNTS', 'OVERDUE AGEING']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Total Receivable: ₹ {totalOutstanding.toFixed(2)} | Overdue: ₹ {totalOverdue.toFixed(2)}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1 border border-black">
              [ERROR] {error}
            </div>
          )}

          {/* Header Controls */}
          <div className="bg-brand-surface border border-brand-border p-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="font-bold text-brand-ink whitespace-nowrap">Filter by Area / Route:</label>
              <select
                value={selectedAreaId}
                onChange={(e) => {
                  setSelectedAreaId(e.target.value);
                  loadData(e.target.value);
                }}
                className="w-72 bg-white border border-brand-border px-2 py-1 font-bold"
              >
                <option value="">-- All Areas / Routes --</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 text-[11px]">
              <span className="bg-green-100 px-2 py-0.5 border border-green-400 font-bold text-green-900">
                0-30d: Current
              </span>
              <span className="bg-yellow-100 px-2 py-0.5 border border-yellow-400 font-bold text-yellow-900">
                31-60d: Due
              </span>
              <span className="bg-amber-100 px-2 py-0.5 border border-amber-400 font-bold text-amber-900">
                61-90d: Overdue
              </span>
              <span className="bg-red-100 px-2 py-0.5 border border-red-400 font-bold text-red-900">
                90d+: Critical
              </span>
            </div>
          </div>

          {/* Ageing Table */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="w-20 px-2 py-1 text-left">CODE</th>
                  <th className="px-2 py-1 text-left">CUSTOMER NAME</th>
                  <th className="w-24 px-2 py-1 text-left">AREA</th>
                  <th className="w-24 px-2 py-1 text-right">0 - 30 DAYS</th>
                  <th className="w-24 px-2 py-1 text-right">31 - 60 DAYS</th>
                  <th className="w-24 px-2 py-1 text-right">61 - 90 DAYS</th>
                  <th className="w-24 px-2 py-1 text-right">91+ DAYS</th>
                  <th className="w-24 px-2 py-1 text-right">TOTAL DUES</th>
                  <th className="w-20 px-2 py-1 text-right">EST. INT</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-gray-500 font-bold">
                      Loading customer ageing analysis...
                    </td>
                  </tr>
                ) : ageingList.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-green-700 font-bold">
                      No outstanding dues found.
                    </td>
                  </tr>
                ) : (
                  ageingList.map((row, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <tr
                        key={row.customerId}
                        onClick={() => setSelectedIndex(idx)}
                        className={`border-b border-gray-200 cursor-pointer ${
                          isSelected ? 'bg-cyan-100 font-bold' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        }`}
                      >
                        <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-1 font-bold">{row.code}</td>
                        <td className="px-2 py-1 font-bold">{row.name}</td>
                        <td className="px-2 py-1 text-gray-600">{row.area}</td>
                        <td className="px-2 py-1 text-right text-green-700">₹ {row.bucket0_30.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right text-yellow-700">₹ {row.bucket31_60.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right text-amber-700 font-bold">
                          ₹ {row.bucket61_90.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-right text-red-600 font-bold">
                          ₹ {row.bucket91_plus.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-right font-bold text-brand-amber">
                          ₹ {row.closingBalance.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-right text-gray-600 font-mono">
                          ₹ {row.estimatedInterest.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DosWindow>
    </div>
  );
}
