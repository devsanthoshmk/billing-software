'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DosWindow } from '@/components/ui/DosWindow';
import { fetchShortExpiryReport } from '../actions';
import { ShortExpiryRow } from '@/lib/reports';

export default function ExpiryReportPage() {
  const [asOfDate, setAsOfDate] = useState<string>('2026-09-28');
  const [daysWindow, setDaysWindow] = useState<number>(90);
  const [batches, setBatches] = useState<ShortExpiryRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadReport = useCallback(() => {
    setLoading(true);
    setErrorMsg(null);
    fetchShortExpiryReport(asOfDate, daysWindow)
      .then(setBatches)
      .catch((e) => setErrorMsg(e.message))
      .finally(() => setLoading(false));
  }, [asOfDate, daysWindow]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const totalCost = batches.reduce((sum, b) => sum + b.totalCostValue, 0);
  const totalMrp = batches.reduce((sum, b) => sum + b.totalMrpValue, 0);
  const totalUnits = batches.reduce((sum, b) => sum + b.stockQty, 0);

  const handleExportCsv = () => {
    if (batches.length === 0) return;
    const headers = ['Code', 'Product', 'Company', 'Pack', 'Batch', 'ExpiryDate', 'DaysRemaining', 'Status', 'Qty', 'CostRate', 'MRP', 'TotalCost', 'TotalMRP'];
    const rows = batches.map(b => [
      b.productCode,
      `"${b.productName}"`,
      `"${b.companyName}"`,
      b.packaging,
      b.batchNo,
      b.expiryDate,
      b.daysUntilExpiry,
      b.expiryStatus,
      b.stockQty,
      b.purchaseRate.toFixed(2),
      b.mrp.toFixed(2),
      b.totalCostValue.toFixed(2),
      b.totalMrpValue.toFixed(2),
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ShortExpiry_${asOfDate}_${daysWindow}Days.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <DosWindow
      title="Short-Expiry & Expired Stock Alert"
      breadcrumbs={['REPORTS', 'SHORT-EXPIRY']}
      actions={[
        { keyLabel: 'F5', label: 'Refresh', onClick: loadReport },
        { keyLabel: 'F8', label: 'Export CSV', onClick: handleExportCsv },
      ]}
    >
      <div className="flex flex-col gap-4 font-mono text-xs">
        {/* Filter Strip */}
        <div className="p-3 bg-brand-surface border border-brand-border grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block font-bold text-gray-700 mb-1">AS-OF DATE:</label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-full p-1 bg-white border border-brand-border font-bold"
            />
          </div>

          <div>
            <label className="block font-bold text-gray-700 mb-1">EXPIRY WINDOW FILTER:</label>
            <select
              value={daysWindow}
              onChange={(e) => setDaysWindow(Number(e.target.value))}
              className="w-full p-1 bg-white border border-brand-border font-bold text-brand-ink"
            >
              <option value={0}>Already Expired Batches Only</option>
              <option value={30}>Critical: Within 30 Days</option>
              <option value={60}>Near Expiry: Within 60 Days</option>
              <option value={90}>Watch List: Within 90 Days (Standard)</option>
              <option value={180}>Extended: Within 180 Days (6 Months)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadReport}
              disabled={loading}
              className="px-4 py-1.5 bg-brand-ink text-white font-bold hover:bg-brand-ink/90 flex-1 cursor-pointer"
            >
              {loading ? 'SCANNING...' : '[F5] REFRESH'}
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-1.5 bg-white border border-brand-border hover:bg-gray-100 font-bold"
            >
              CSV
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-2 bg-red-100 border border-red-500 text-red-700 font-bold">
            [ERROR]: {errorMsg}
          </div>
        )}

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="p-2 bg-white border border-brand-border flex flex-col">
            <span className="text-[10px] text-gray-500 font-bold uppercase">BATCHES AT RISK</span>
            <span className="text-base font-bold text-red-600">{batches.length} Batches</span>
            <span className="text-[10px] text-gray-500">{totalUnits.toLocaleString()} Units</span>
          </div>

          <div className="p-2 bg-white border border-brand-border flex flex-col">
            <span className="text-[10px] text-gray-500 font-bold uppercase">TOTAL AT-RISK COST</span>
            <span className="text-base font-bold text-red-700">
              ₹ {totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-gray-500">Purchase Rate Cost</span>
          </div>

          <div className="p-2 bg-white border border-brand-border flex flex-col">
            <span className="text-[10px] text-gray-500 font-bold uppercase">TOTAL AT-RISK MRP</span>
            <span className="text-base font-bold text-brand-ink">
              ₹ {totalMrp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-gray-500">Retail Value</span>
          </div>

          <div className="p-2 bg-yellow-50 border-2 border-brand-amber flex flex-col">
            <span className="text-[10px] text-brand-amber font-bold uppercase">EXPIRY POLICY</span>
            <span className="text-xs font-bold text-brand-ink mt-1">
              {daysWindow === 0
                ? 'Immediate Disposal / Return'
                : `Short Expiry (< ${daysWindow} Days)`}
            </span>
          </div>
        </div>

        {/* Expiry DataGrid */}
        <div className="bg-white border border-brand-border overflow-x-auto max-h-[500px]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-100 border-b border-brand-border sticky top-0">
              <tr>
                <th className="p-2 border-r border-brand-border">STATUS</th>
                <th className="p-2 border-r border-brand-border">CODE</th>
                <th className="p-2 border-r border-brand-border">PRODUCT NAME</th>
                <th className="p-2 border-r border-brand-border">COMPANY</th>
                <th className="p-2 border-r border-brand-border">PACK</th>
                <th className="p-2 border-r border-brand-border">BATCH NO</th>
                <th className="p-2 border-r border-brand-border">EXPIRY</th>
                <th className="p-2 border-r border-brand-border text-center">DAYS LEFT</th>
                <th className="p-2 border-r border-brand-border text-right text-red-600">STOCK QTY</th>
                <th className="p-2 border-r border-brand-border text-right">COST RATE</th>
                <th className="p-2 border-r border-brand-border text-right font-bold text-red-700">COST VALUE</th>
                <th className="p-2 text-right">MRP VALUE</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-4 text-center text-green-700 font-bold italic">
                    [OK] No batches found expiring within {daysWindow} days as of {asOfDate}.
                  </td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.batchId} className="border-b border-gray-200 hover:bg-red-50">
                    <td className="p-2 border-r border-brand-border">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-bold border ${
                          b.expiryStatus === 'EXPIRED'
                            ? 'bg-red-700 text-white border-red-800'
                            : b.expiryStatus === 'CRITICAL'
                            ? 'bg-red-100 text-red-800 border-red-400'
                            : b.expiryStatus === 'NEAR_EXPIRY'
                            ? 'bg-amber-100 text-amber-800 border-amber-400'
                            : 'bg-yellow-100 text-yellow-800 border-yellow-300'
                        }`}
                      >
                        {b.expiryStatus}
                      </span>
                    </td>
                    <td className="p-2 border-r border-brand-border font-bold text-gray-700">{b.productCode}</td>
                    <td className="p-2 border-r border-brand-border font-bold text-brand-ink">{b.productName}</td>
                    <td className="p-2 border-r border-brand-border">{b.companyName}</td>
                    <td className="p-2 border-r border-brand-border">{b.packaging}</td>
                    <td className="p-2 border-r border-brand-border font-mono">{b.batchNo}</td>
                    <td className="p-2 border-r border-brand-border font-bold text-red-600">{b.expiryDate}</td>
                    <td className={`p-2 border-r border-brand-border text-center font-bold ${b.daysUntilExpiry < 0 ? 'text-red-700' : 'text-gray-800'}`}>
                      {b.daysUntilExpiry < 0 ? `EXP (${Math.abs(b.daysUntilExpiry)}d ago)` : `${b.daysUntilExpiry}d`}
                    </td>
                    <td className="p-2 border-r border-brand-border text-right font-bold text-red-600">{b.stockQty}</td>
                    <td className="p-2 border-r border-brand-border text-right">₹{b.purchaseRate.toFixed(2)}</td>
                    <td className="p-2 border-r border-brand-border text-right font-bold font-mono text-red-700">
                      ₹{b.totalCostValue.toFixed(2)}
                    </td>
                    <td className="p-2 text-right font-mono text-gray-700">₹{b.totalMrpValue.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DosWindow>
  );
}
