'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DosWindow } from '@/components/ui/DosWindow';
import { fetchDailySalesReport } from '../actions';
import { DailySalesReportData } from '@/lib/reports';

export default function DailySalesReportPage() {
  const [reportDate, setReportDate] = useState<string>('2026-09-28');
  const [operatorId, setOperatorId] = useState<string>('ALL');
  const [invoiceSeries, setInvoiceSeries] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'register' | 'cashier' | 'tax' | 'reconciliation'>('register');

  const [data, setData] = useState<DailySalesReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadReport = useCallback(() => {
    setLoading(true);
    setErrorMsg(null);
    fetchDailySalesReport({
      reportDate,
      operatorId: operatorId === 'ALL' ? undefined : operatorId,
      invoiceSeries: invoiceSeries === 'ALL' ? undefined : Number(invoiceSeries),
    })
      .then(setData)
      .catch((e) => setErrorMsg(e.message))
      .finally(() => setLoading(false));
  }, [reportDate, operatorId, invoiceSeries]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const summary = data?.summary;

  const handleExportCsv = () => {
    if (!data || data.billWiseRegister.length === 0) return;
    const headers = ['InvoiceNo', 'Date', 'Time', 'Customer', 'Terms', 'Items', 'Gross', 'Discount', 'Taxable', 'CGST', 'SGST', 'IGST', 'Net', 'PreparedBy'];
    const rows = data.billWiseRegister.map(r => [
      r.invoiceNo,
      reportDate,
      r.invoiceTime,
      `"${r.customerName}"`,
      r.paymentTerms,
      r.itemsCount,
      r.subtotalGross.toFixed(2),
      r.discountAmount.toFixed(2),
      r.taxableAmount.toFixed(2),
      r.cgstAmount.toFixed(2),
      r.sgstAmount.toFixed(2),
      r.igstAmount.toFixed(2),
      r.netAmount.toFixed(2),
      r.preparedBy,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `DailySales_${reportDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <DosWindow
      title="Daily Sales Register"
      breadcrumbs={['REPORTS', 'DAILY SALES']}
      actions={[
        { keyLabel: 'F5', label: 'Generate', onClick: loadReport },
        { keyLabel: 'F8', label: 'Export CSV', onClick: handleExportCsv },
      ]}
    >
      <div className="flex flex-col gap-4 font-mono text-xs">
        {/* Filter Strip */}
        <div className="p-3 bg-brand-surface border border-brand-border grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block font-bold text-gray-700 mb-1">DATE:</label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="w-full p-1 bg-white border border-brand-border font-bold"
            />
          </div>

          <div>
            <label className="block font-bold text-gray-700 mb-1">BILLED BY / CASHIER:</label>
            <select
              value={operatorId}
              onChange={(e) => setOperatorId(e.target.value)}
              className="w-full p-1 bg-white border border-brand-border font-bold"
            >
              <option value="ALL">ALL OPERATORS</option>
              {data?.cashierBreakdown.map((c) => (
                <option key={c.operatorCode} value={c.operatorCode}>
                  {c.operatorCode} ({c.billsCount} bills)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-gray-700 mb-1">INVOICE SERIES:</label>
            <select
              value={invoiceSeries}
              onChange={(e) => setInvoiceSeries(e.target.value)}
              className="w-full p-1 bg-white border border-brand-border font-bold"
            >
              <option value="ALL">ALL SERIES</option>
              <option value="1">SERIES 1 (LOCAL / 1000s)</option>
              <option value="2">SERIES 2 (OUTSTATION / 30000s)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadReport}
              disabled={loading}
              className="px-4 py-1.5 bg-brand-ink text-white font-bold hover:bg-brand-ink/90 flex-1 cursor-pointer"
            >
              {loading ? 'CALCULATING...' : '[F5] GENERATE'}
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
              <span className="text-[10px] text-gray-500 font-bold uppercase">NET SALES TURNOVER</span>
              <span className="text-base font-bold text-brand-ink">
                ₹ {summary.totalNetSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-gray-500">{summary.totalInvoicesCount} Billed Invoices</span>
            </div>

            <div className="p-2 bg-white border border-brand-border flex flex-col">
              <span className="text-[10px] text-gray-500 font-bold uppercase">CASH BILLS</span>
              <span className="text-base font-bold text-green-700">
                ₹ {summary.cashSalesAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="p-2 bg-white border border-brand-border flex flex-col">
              <span className="text-[10px] text-gray-500 font-bold uppercase">CREDIT BILLS</span>
              <span className="text-base font-bold text-blue-700">
                ₹ {summary.creditSalesAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="p-2 bg-white border border-brand-border flex flex-col">
              <span className="text-[10px] text-gray-500 font-bold uppercase">CASH COLLECTIONS TODAY</span>
              <span className="text-base font-bold text-purple-700">
                ₹ {summary.cashCollectionsAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-gray-500">{summary.collectionsCount} Receipts</span>
            </div>

            <div className="p-2 bg-yellow-50 border-2 border-brand-amber flex flex-col shadow-sm">
              <span className="text-[10px] text-brand-amber font-bold uppercase">CASH IN DRAWER</span>
              <span className="text-lg font-bold text-brand-ink">
                ₹ {summary.netCashInDrawer.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-gray-600">Reconciled Net Cash</span>
            </div>
          </div>
        )}

        {/* Sub-Tabs */}
        <div className="flex items-center gap-1 border-b border-brand-border pb-1">
          <button
            type="button"
            onClick={() => setActiveTab('register')}
            className={`px-3 py-1 font-bold border ${
              activeTab === 'register'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [1] BILL-WISE SALES REGISTER
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cashier')}
            className={`px-3 py-1 font-bold border ${
              activeTab === 'cashier'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [2] CASHIER BREAKDOWN
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tax')}
            className={`px-3 py-1 font-bold border ${
              activeTab === 'tax'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [3] GST TAX SLABS (0% - 28%)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reconciliation')}
            className={`px-3 py-1 font-bold border ${
              activeTab === 'reconciliation'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [4] CASH DRAWER RECONCILIATION
          </button>
        </div>

        {/* Tab 1: Bill-Wise Sales Register */}
        {activeTab === 'register' && (
          <div className="bg-white border border-brand-border overflow-x-auto max-h-[500px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 border-b border-brand-border sticky top-0">
                <tr>
                  <th className="p-2 border-r border-brand-border">INV NO</th>
                  <th className="p-2 border-r border-brand-border">TIME</th>
                  <th className="p-2 border-r border-brand-border">SERIES</th>
                  <th className="p-2 border-r border-brand-border">CUSTOMER</th>
                  <th className="p-2 border-r border-brand-border">TERM</th>
                  <th className="p-2 border-r border-brand-border text-right">ITEMS</th>
                  <th className="p-2 border-r border-brand-border text-right">GROSS</th>
                  <th className="p-2 border-r border-brand-border text-right">DISC</th>
                  <th className="p-2 border-r border-brand-border text-right">TAXABLE</th>
                  <th className="p-2 border-r border-brand-border text-right">TAX</th>
                  <th className="p-2 border-r border-brand-border text-right font-bold">NET TOTAL</th>
                  <th className="p-2 text-center">CASHIER</th>
                </tr>
              </thead>
              <tbody>
                {!data || data.billWiseRegister.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="p-4 text-center text-gray-500 italic">
                      No invoices recorded for {reportDate}.
                    </td>
                  </tr>
                ) : (
                  data.billWiseRegister.map((b) => (
                    <tr key={b.id} className="border-b border-gray-200 hover:bg-blue-50">
                      <td className="p-2 border-r border-brand-border font-bold text-brand-ink">{b.invoiceNo}</td>
                      <td className="p-2 border-r border-brand-border">{b.invoiceTime}</td>
                      <td className="p-2 border-r border-brand-border text-center">{b.invoiceSeries}</td>
                      <td className="p-2 border-r border-brand-border">
                        [{b.customerCode}] {b.customerName}
                      </td>
                      <td className="p-2 border-r border-brand-border font-bold">{b.paymentTerms}</td>
                      <td className="p-2 border-r border-brand-border text-right">{b.itemsCount}</td>
                      <td className="p-2 border-r border-brand-border text-right">₹{b.subtotalGross.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right">₹{b.discountAmount.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right">₹{b.taxableAmount.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right">₹{b.totalTaxAmount.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right font-bold text-brand-ink">
                        ₹{b.netAmount.toFixed(2)}
                      </td>
                      <td className="p-2 text-center font-bold text-gray-600">{b.preparedBy}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Cashier Breakdown */}
        {activeTab === 'cashier' && (
          <div className="bg-white border border-brand-border overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 border-b border-brand-border">
                <tr>
                  <th className="p-2 border-r border-brand-border">OPERATOR / CASHIER</th>
                  <th className="p-2 border-r border-brand-border text-right">BILLS COUNT</th>
                  <th className="p-2 border-r border-brand-border text-right">GROSS SALES</th>
                  <th className="p-2 border-r border-brand-border text-right">CASH SALES</th>
                  <th className="p-2 border-r border-brand-border text-right">CREDIT SALES</th>
                  <th className="p-2 border-r border-brand-border text-right">CHEQUE SALES</th>
                  <th className="p-2 text-right font-bold">TOTAL NET SALES</th>
                </tr>
              </thead>
              <tbody>
                {!data || data.cashierBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-gray-500 italic">
                      No cashier data available.
                    </td>
                  </tr>
                ) : (
                  data.cashierBreakdown.map((c) => (
                    <tr key={c.operatorCode} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="p-2 border-r border-brand-border font-bold text-brand-ink">{c.operatorCode}</td>
                      <td className="p-2 border-r border-brand-border text-right">{c.billsCount}</td>
                      <td className="p-2 border-r border-brand-border text-right">₹{c.grossSales.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right text-green-700">₹{c.cashSales.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right text-blue-700">₹{c.creditSales.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right">₹{c.chequeSales.toFixed(2)}</td>
                      <td className="p-2 text-right font-bold">₹{c.totalNetSales.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Statutory Tax Slabs Breakdown */}
        {activeTab === 'tax' && (
          <div className="bg-white border border-brand-border overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 border-b border-brand-border">
                <tr>
                  <th className="p-2 border-r border-brand-border">TAX SLAB</th>
                  <th className="p-2 border-r border-brand-border">RATE (%)</th>
                  <th className="p-2 border-r border-brand-border text-right">TAXABLE TURNOVER</th>
                  <th className="p-2 border-r border-brand-border text-right">CGST</th>
                  <th className="p-2 border-r border-brand-border text-right">SGST</th>
                  <th className="p-2 border-r border-brand-border text-right">IGST</th>
                  <th className="p-2 border-r border-brand-border text-right font-bold">TOTAL TAX</th>
                  <th className="p-2 text-right">GROSS WITH TAX</th>
                </tr>
              </thead>
              <tbody>
                {!data || data.taxSlabSummary.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-gray-500 italic">
                      No tax slab data.
                    </td>
                  </tr>
                ) : (
                  data.taxSlabSummary.map((s) => (
                    <tr key={s.taxCode} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="p-2 border-r border-brand-border font-bold">
                        [{s.taxCode}] {s.description}
                      </td>
                      <td className="p-2 border-r border-brand-border font-bold">{s.taxRatePct}%</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{s.taxableAmount.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{s.cgstAmount.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{s.sgstAmount.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{s.igstAmount.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right font-bold text-brand-ink">
                        ₹{s.totalTaxAmount.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono">₹{s.totalGrossWithTax.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 4: Cash Drawer Reconciliation */}
        {activeTab === 'reconciliation' && summary && (
          <div className="bg-white border border-brand-border p-6 max-w-xl mx-auto flex flex-col gap-4">
            <h3 className="text-sm font-bold border-b border-brand-border pb-2 text-center uppercase">
              CASH DRAWER RECONCILIATION STATEMENT — {reportDate}
            </h3>

            <div className="flex flex-col gap-2 font-mono text-sm">
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-gray-700">(+) CASH SALES INVOICES</span>
                <span className="font-bold text-green-700">₹ {summary.cashSalesAmount.toFixed(2)}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-gray-700">(+) CUSTOMER CASH RECEIPTS & COLLECTIONS</span>
                <span className="font-bold text-green-700">₹ {summary.cashCollectionsAmount.toFixed(2)}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-gray-700">(-) CASH REFUNDS ON SALES RETURNS</span>
                <span className="font-bold text-red-600">(-) ₹ {summary.cashRefundsAmount.toFixed(2)}</span>
              </div>

              <div className="flex justify-between py-3 border-t-2 border-black border-b-2 font-bold text-base bg-yellow-50 px-2 mt-2">
                <span>(=) NET EXPECTED CASH IN DRAWER:</span>
                <span className="text-brand-ink">₹ {summary.netCashInDrawer.toFixed(2)}</span>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 italic text-center">
              Reconciles cash sales, receipts, and returns for the selected day against cash drawer records.
            </p>
          </div>
        )}
      </div>
    </DosWindow>
  );
}
