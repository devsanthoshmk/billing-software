'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DosWindow } from '@/components/ui/DosWindow';
import {
  fetchStockValuationSummary,
  fetchStockLedger,
  fetchLowStockAlerts,
  getCompaniesList,
} from '../actions';
import { StockValuationSummary, StockLedgerRow, LowStockAlertRow } from '@/lib/reports';

export default function StockReportPage() {
  const [asOfDate, setAsOfDate] = useState<string>('2026-09-28');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('ALL');
  const [companies, setCompanies] = useState<{ id: string; code: string; name: string }[]>([]);
  const [activeTab, setActiveTab] = useState<'ledger' | 'alerts'>('ledger');

  const [summary, setSummary] = useState<StockValuationSummary | null>(null);
  const [ledger, setLedger] = useState<StockLedgerRow[]>([]);
  const [alerts, setAlerts] = useState<LowStockAlertRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    getCompaniesList().then(setCompanies).catch(console.error);
  }, []);

  const loadData = useCallback(() => {
    setLoading(true);
    setErrorMsg(null);
    Promise.all([
      fetchStockValuationSummary(asOfDate),
      fetchStockLedger(selectedCompanyId),
      fetchLowStockAlerts(),
    ])
      .then(([s, l, a]) => {
        setSummary(s);
        setLedger(l);
        setAlerts(a);
      })
      .catch((e) => setErrorMsg(e.message))
      .finally(() => setLoading(false));
  }, [asOfDate, selectedCompanyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExportCsv = () => {
    if (activeTab === 'ledger') {
      if (ledger.length === 0) return;
      const headers = ['Code', 'Product', 'Company', 'Pack', 'Batch', 'Expiry', 'Qty', 'CostRate', 'MRP', 'ClosingCost', 'ClosingMRP'];
      const rows = ledger.map(r => [
        r.productCode,
        `"${r.productName}"`,
        `"${r.companyName}"`,
        r.packaging,
        r.batchNo,
        r.expiryDate,
        r.stockQty,
        r.purchaseRate.toFixed(2),
        r.mrp.toFixed(2),
        r.closingValueCost.toFixed(2),
        r.closingValueMrp.toFixed(2),
      ]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `StockLedger_${asOfDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      if (alerts.length === 0) return;
      const headers = ['Code', 'Product', 'Company', 'StockOnHand', 'ReorderLevel', 'DeficitQty', 'MinOrderQty', 'PreferredSupplier'];
      const rows = alerts.map(r => [
        r.productCode,
        `"${r.productName}"`,
        `"${r.companyName}"`,
        r.totalStockOnHand,
        r.reorderLevel,
        r.deficitQuantity,
        r.minOrderQty,
        `"${r.preferredSupplierName || 'N/A'}"`,
      ]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `ReorderAlerts_${asOfDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <DosWindow
      title="STOCK VALUATION & INVENTORY LEDGER [CLOSTK.PRG]"
      breadcrumbs={['REPORTS', 'STOCK VALUATION']}
      actions={[
        { keyLabel: 'F5', label: 'Refresh', onClick: loadData },
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
            <label className="block font-bold text-gray-700 mb-1">MANUFACTURING COMPANY:</label>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="w-full p-1 bg-white border border-brand-border font-bold"
            >
              <option value="ALL">ALL COMPANIES</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  [{c.code}] {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="px-4 py-1.5 bg-brand-ink text-white font-bold hover:bg-brand-ink/90 flex-1 cursor-pointer"
            >
              {loading ? 'COMPUTING...' : '[F5] REFRESH'}
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

        {/* Executive KPI Banner */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="p-2 bg-white border border-brand-border flex flex-col">
              <span className="text-[10px] text-gray-500 font-bold uppercase">PRODUCTS / BATCHES</span>
              <span className="text-base font-bold text-brand-ink">
                {summary.totalActiveProducts} Prods / {summary.totalActiveBatches} Batches
              </span>
              <span className="text-[10px] text-gray-500">{summary.totalStockUnits.toLocaleString()} Total Units</span>
            </div>

            <div className="p-2 bg-white border border-brand-border flex flex-col">
              <span className="text-[10px] text-gray-500 font-bold uppercase">VALUATION (AT COST RATE)</span>
              <span className="text-base font-bold text-blue-700">
                ₹ {summary.totalValuationCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-gray-500">Purchase Rate Cost</span>
            </div>

            <div className="p-2 bg-white border border-brand-border flex flex-col">
              <span className="text-[10px] text-gray-500 font-bold uppercase">VALUATION (AT MRP)</span>
              <span className="text-base font-bold text-green-700">
                ₹ {summary.totalValuationMrp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-gray-500">Retail Value</span>
            </div>

            <div className="p-2 bg-white border border-brand-border flex flex-col">
              <span className="text-[10px] text-gray-500 font-bold uppercase">POTENTIAL GROSS PROFIT</span>
              <span className="text-base font-bold text-purple-700">
                ₹ {summary.potentialGrossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-purple-600 font-bold">Margin: {summary.potentialProfitMarginPct}%</span>
            </div>

            <div className="p-2 bg-yellow-50 border-2 border-brand-amber flex flex-col">
              <span className="text-[10px] text-brand-amber font-bold uppercase">REORDER DEFICITS</span>
              <span className="text-lg font-bold text-brand-ink">
                {alerts.length} Low-Stock Items
              </span>
              <span className="text-[10px] text-red-600 font-bold">Action Required</span>
            </div>
          </div>
        )}

        {/* Sub-Tabs */}
        <div className="flex items-center gap-1 border-b border-brand-border pb-1">
          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`px-3 py-1 font-bold border ${
              activeTab === 'ledger'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [1] STOCK VALUATION LEDGER (CLOSTK)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('alerts')}
            className={`px-3 py-1 font-bold border ${
              activeTab === 'alerts'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [2] LOW-STOCK REORDER ALERTS ({alerts.length})
          </button>
        </div>

        {/* Tab 1: Stock Ledger */}
        {activeTab === 'ledger' && (
          <div className="bg-white border border-brand-border overflow-x-auto max-h-[500px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 border-b border-brand-border sticky top-0">
                <tr>
                  <th className="p-2 border-r border-brand-border">CODE</th>
                  <th className="p-2 border-r border-brand-border">PRODUCT NAME</th>
                  <th className="p-2 border-r border-brand-border">COMPANY</th>
                  <th className="p-2 border-r border-brand-border">PACK</th>
                  <th className="p-2 border-r border-brand-border">BATCH NO</th>
                  <th className="p-2 border-r border-brand-border">EXPIRY</th>
                  <th className="p-2 border-r border-brand-border text-right">QTY</th>
                  <th className="p-2 border-r border-brand-border text-right">COST RATE</th>
                  <th className="p-2 border-r border-brand-border text-right">MRP</th>
                  <th className="p-2 border-r border-brand-border text-right font-bold">CLOSING COST</th>
                  <th className="p-2 text-right font-bold">CLOSING MRP</th>
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-4 text-center text-gray-500 italic">
                      No stock batches available for chosen filter.
                    </td>
                  </tr>
                ) : (
                  ledger.map((r) => (
                    <tr key={r.batchId} className="border-b border-gray-200 hover:bg-blue-50">
                      <td className="p-2 border-r border-brand-border font-bold text-gray-700">{r.productCode}</td>
                      <td className="p-2 border-r border-brand-border font-bold text-brand-ink">{r.productName}</td>
                      <td className="p-2 border-r border-brand-border">{r.companyName}</td>
                      <td className="p-2 border-r border-brand-border">{r.packaging}</td>
                      <td className="p-2 border-r border-brand-border font-mono">{r.batchNo}</td>
                      <td className="p-2 border-r border-brand-border">{r.expiryDate}</td>
                      <td className="p-2 border-r border-brand-border text-right font-bold text-blue-700">{r.stockQty}</td>
                      <td className="p-2 border-r border-brand-border text-right">₹{r.purchaseRate.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right">₹{r.mrp.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right font-bold font-mono text-brand-ink">
                        ₹{r.closingValueCost.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-bold font-mono text-green-700">
                        ₹{r.closingValueMrp.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Low-Stock Alerts */}
        {activeTab === 'alerts' && (
          <div className="bg-white border border-brand-border overflow-x-auto max-h-[500px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 border-b border-brand-border sticky top-0">
                <tr>
                  <th className="p-2 border-r border-brand-border">CODE</th>
                  <th className="p-2 border-r border-brand-border">PRODUCT NAME</th>
                  <th className="p-2 border-r border-brand-border">COMPANY</th>
                  <th className="p-2 border-r border-brand-border">PACK</th>
                  <th className="p-2 border-r border-brand-border text-right text-red-600">STOCK ON HAND</th>
                  <th className="p-2 border-r border-brand-border text-right">REORDER LVL</th>
                  <th className="p-2 border-r border-brand-border text-right font-bold text-red-700">DEFICIT QTY</th>
                  <th className="p-2 border-r border-brand-border text-right">MIN ORDER QTY</th>
                  <th className="p-2">PREFERRED SUPPLIER</th>
                </tr>
              </thead>
              <tbody>
                {alerts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-4 text-center text-green-700 font-bold italic">
                      [OK] All active products are currently above their minimum reorder levels.
                    </td>
                  </tr>
                ) : (
                  alerts.map((a) => (
                    <tr key={a.productId} className="border-b border-gray-200 hover:bg-yellow-50">
                      <td className="p-2 border-r border-brand-border font-bold">{a.productCode}</td>
                      <td className="p-2 border-r border-brand-border font-bold text-brand-ink">{a.productName}</td>
                      <td className="p-2 border-r border-brand-border">{a.companyName}</td>
                      <td className="p-2 border-r border-brand-border">{a.packaging}</td>
                      <td className="p-2 border-r border-brand-border text-right font-bold text-red-600">
                        {a.totalStockOnHand}
                      </td>
                      <td className="p-2 border-r border-brand-border text-right">{a.reorderLevel}</td>
                      <td className="p-2 border-r border-brand-border text-right font-bold text-red-700 font-mono">
                        {a.deficitQuantity}
                      </td>
                      <td className="p-2 border-r border-brand-border text-right">{a.minOrderQty}</td>
                      <td className="p-2 text-gray-700">{a.preferredSupplierName || 'Standard Supplier'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DosWindow>
  );
}
