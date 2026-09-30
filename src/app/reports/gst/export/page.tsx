'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import { generateGstr1Export } from './actions';

export default function GstExportPage() {
  const [startDate, setStartDate] = useState<string>('2026-09-01');
  const [endDate, setEndDate] = useState<string>('2026-09-30');
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'B2B' | 'B2C' | 'HSN' | 'JSON'>('SUMMARY');
  const [exportData, setExportData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (s = startDate, e = endDate) => {
    setLoading(true);
    setError(null);
    const res = await generateGstr1Export(s, e);
    if (res.success) {
      setExportData(res);
    } else {
      setError(res.error || 'Failed to compile GSTR-1 export');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDownloadJson = () => {
    if (!exportData?.gstr1JsonString) return;
    const blob = new Blob([exportData.gstr1JsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GSTR1_EXPORT_${startDate}_to_${endDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    if (!exportData?.b2bInvoices) return;
    const headers = 'InvoiceNo,InvoiceDate,CustomerGSTIN,CustomerName,PlaceOfSupply,TaxableValue,CGST,SGST,IGST,TotalValue\n';
    const rows = exportData.b2bInvoices.map((it: any) =>
      `"${it.invoiceNo}","${it.invoiceDate}","${it.customerGstin}","${it.customerName}","${it.placeOfSupply}",${it.taxableValue},${it.cgst},${it.sgst},${it.igst},${it.invoiceValue}`
    ).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GSTR1_B2B_${startDate}_to_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const actions: DosAction[] = [
    {
      keyLabel: 'F8',
      label: 'Download JSON',
      variant: 'primary',
      disabled: !exportData,
      onClick: handleDownloadJson,
    },
    {
      keyLabel: 'F9',
      label: 'Download CSV',
      variant: 'amber',
      disabled: !exportData,
      onClick: handleDownloadCsv,
    },
    {
      keyLabel: 'F5',
      label: 'Refresh',
      onClick: () => loadData(startDate, endDate),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="GST Returns Data Export"
        subtitle="Official GSTR-1 and GSTR-3B filing data with JSON and CSV exports"
        breadcrumbs={['REPORTS', 'GST RETURNS EXPORT']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Total Invoices: {exportData?.summary?.totalInvoices || 0} | Total GST: ₹ {(exportData?.summary?.totalTax || 0).toFixed(2)}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1 border border-black">
              [ERROR] {error}
            </div>
          )}

          {/* Date Range & Tab Controls */}
          <div className="bg-brand-surface border border-brand-border p-2 flex items-center justify-between">
            <div className="flex items-center gap-4">
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
                className="bg-brand-ink text-white font-bold px-3 py-1 border border-black hover:bg-brand-amber cursor-pointer"
              >
                [RECOMPILE EXPORT]
              </button>
            </div>

            {/* Sub-tabs */}
            <div className="flex items-center gap-1">
              {[
                { id: 'SUMMARY', label: 'Summary' },
                { id: 'B2B', label: 'B2B Invoices (Table 4A)' },
                { id: 'B2C', label: 'B2C Supplies (Table 7)' },
                { id: 'HSN', label: 'HSN Summary (Table 12)' },
                { id: 'JSON', label: 'JSON Preview' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-2.5 py-1 border font-bold ${
                    activeTab === tab.id
                      ? 'bg-brand-amber text-white border-black'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border-brand-border'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Main Display Area */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white p-2">
            {loading ? (
              <div className="text-center py-12 text-gray-500 font-bold">Compiling GST returns data...</div>
            ) : !exportData ? (
              <div className="text-center py-12 text-gray-500 font-bold">NO DATA AVAILABLE</div>
            ) : activeTab === 'SUMMARY' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-brand-border p-3 bg-brand-surface">
                  <div className="font-bold text-sm text-brand-ink mb-2 border-b pb-1">TURNOVER BREAKDOWN</div>
                  <div className="flex justify-between py-1 border-b">
                    <span>B2B Registered Invoices:</span>
                    <span className="font-bold">{exportData.summary.b2bCount} bills (₹ {exportData.summary.totalB2bTaxable.toFixed(2)})</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span>B2C Consumer Invoices:</span>
                    <span className="font-bold">{exportData.summary.b2cCount} bills (₹ {exportData.summary.totalB2cTaxable.toFixed(2)})</span>
                  </div>
                  <div className="flex justify-between py-1 font-bold text-brand-ink">
                    <span>Total Taxable Turnover:</span>
                    <span>₹ {(exportData.summary.totalB2bTaxable + exportData.summary.totalB2cTaxable).toFixed(2)}</span>
                  </div>
                </div>

                <div className="border border-brand-border p-3 bg-brand-surface">
                  <div className="font-bold text-sm text-brand-ink mb-2 border-b pb-1">GST LIABILITY SUMMARY</div>
                  <div className="flex justify-between py-1 border-b">
                    <span>Central GST (CGST):</span>
                    <span className="font-bold text-blue-700">₹ {exportData.summary.totalCgst.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span>State GST (SGST):</span>
                    <span className="font-bold text-blue-700">₹ {exportData.summary.totalSgst.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span>Integrated GST (IGST):</span>
                    <span className="font-bold text-purple-700">₹ {exportData.summary.totalIgst.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-1 font-bold text-brand-amber">
                    <span>Total Tax Collected:</span>
                    <span>₹ {exportData.summary.totalTax.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ) : activeTab === 'B2B' ? (
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-brand-ink text-white z-10">
                  <tr>
                    <th className="px-2 py-1 text-left">INVOICE NO</th>
                    <th className="px-2 py-1 text-center">DATE</th>
                    <th className="px-2 py-1 text-left">GSTIN</th>
                    <th className="px-2 py-1 text-left">CUSTOMER NAME</th>
                    <th className="px-2 py-1 text-right">TAXABLE</th>
                    <th className="px-2 py-1 text-right">CGST</th>
                    <th className="px-2 py-1 text-right">SGST</th>
                    <th className="px-2 py-1 text-right">IGST</th>
                    <th className="px-2 py-1 text-right">TOTAL INVOICE</th>
                  </tr>
                </thead>
                <tbody>
                  {exportData.b2bInvoices.map((it: any, idx: number) => (
                    <tr key={idx} className={`border-b border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-2 py-1 font-bold">{it.invoiceNo}</td>
                      <td className="px-2 py-1 text-center">{it.invoiceDate}</td>
                      <td className="px-2 py-1 font-mono font-bold text-blue-800">{it.customerGstin}</td>
                      <td className="px-2 py-1">{it.customerName}</td>
                      <td className="px-2 py-1 text-right">₹ {it.taxableValue.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">₹ {it.cgst.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">₹ {it.sgst.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">₹ {it.igst.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right font-bold text-brand-amber">₹ {it.invoiceValue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : activeTab === 'HSN' ? (
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-brand-ink text-white z-10">
                  <tr>
                    <th className="px-2 py-1 text-center">HSN CODE</th>
                    <th className="px-2 py-1 text-left">DESCRIPTION</th>
                    <th className="px-2 py-1 text-center">UQC</th>
                    <th className="px-2 py-1 text-right">TOTAL QTY</th>
                    <th className="px-2 py-1 text-right">TAXABLE VALUE</th>
                    <th className="px-2 py-1 text-right">CGST</th>
                    <th className="px-2 py-1 text-right">SGST</th>
                    <th className="px-2 py-1 text-right">IGST</th>
                    <th className="px-2 py-1 text-right">TOTAL VALUE</th>
                  </tr>
                </thead>
                <tbody>
                  {exportData.hsnList.map((h: any, idx: number) => (
                    <tr key={idx} className={`border-b border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-2 py-1 text-center font-mono font-bold">{h.hsn}</td>
                      <td className="px-2 py-1">{h.desc}</td>
                      <td className="px-2 py-1 text-center">{h.uqc}</td>
                      <td className="px-2 py-1 text-right">{h.totalQty}</td>
                      <td className="px-2 py-1 text-right">₹ {h.taxableVal.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">₹ {h.cgst.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">₹ {h.sgst.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">₹ {h.igst.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right font-bold text-brand-amber">₹ {h.totalVal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <pre className="bg-black text-green-400 p-3 font-mono text-xs overflow-auto max-h-[60vh] border border-gray-700">
                {exportData.gstr1JsonString}
              </pre>
            )}
          </div>
        </div>
      </DosWindow>
    </div>
  );
}
