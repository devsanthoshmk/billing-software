'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DosWindow } from '@/components/ui/DosWindow';
import {
  fetchGstr1B2b,
  fetchGstr1B2c,
  fetchGstr1Notes,
  fetchGstr1Hsn,
  fetchGstr3bSummary,
} from '../actions';
import {
  Gstr1B2bInvoiceRow,
  Gstr1B2cSummaryRow,
  Gstr1CreditDebitNoteRow,
  Gstr1HsnSummaryRow,
  Gstr3bMonthlySummary,
} from '@/lib/reports';

export default function GstReportPage() {
  const [startDate, setStartDate] = useState<string>('2026-09-01');
  const [endDate, setEndDate] = useState<string>('2026-09-30');
  const [activeTab, setActiveTab] = useState<'b2b' | 'b2c' | 'notes' | 'hsn' | 'gstr3b'>('b2b');

  const [b2b, setB2b] = useState<Gstr1B2bInvoiceRow[]>([]);
  const [b2c, setB2c] = useState<Gstr1B2cSummaryRow[]>([]);
  const [notes, setNotes] = useState<Gstr1CreditDebitNoteRow[]>([]);
  const [hsn, setHsn] = useState<Gstr1HsnSummaryRow[]>([]);
  const [gstr3b, setGstr3b] = useState<Gstr3bMonthlySummary | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setErrorMsg(null);
    Promise.all([
      fetchGstr1B2b(startDate, endDate),
      fetchGstr1B2c(startDate, endDate),
      fetchGstr1Notes(startDate, endDate),
      fetchGstr1Hsn(startDate, endDate),
      fetchGstr3bSummary(startDate, endDate, `${startDate.slice(5, 7)}-${startDate.slice(0, 4)}`),
    ])
      .then(([b2bRes, b2cRes, notesRes, hsnRes, gstr3bRes]) => {
        setB2b(b2bRes);
        setB2c(b2cRes);
        setNotes(notesRes);
        setHsn(hsnRes);
        setGstr3b(gstr3bRes);
      })
      .catch((e) => setErrorMsg(e.message))
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExportJson = () => {
    const exportData = {
      gstin: '33AAAAA0000A1Z5',
      fp: `${startDate.slice(5, 7)}${startDate.slice(0, 4)}`,
      b2b,
      b2c,
      cdnr: notes,
      hsn: { data: hsn },
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `GSTR1_${startDate}_${endDate}.json`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <DosWindow
      title="GST Tax Summary (GSTR-1 & 3B)"
      breadcrumbs={['REPORTS', 'GST TAX SUMMARY']}
      actions={[
        { keyLabel: 'F5', label: 'Recompute', onClick: loadData },
        { keyLabel: 'F8', label: 'Export JSON', onClick: handleExportJson },
      ]}
    >
      <div className="flex flex-col gap-4 font-mono text-xs">
        {/* Filter Strip */}
        <div className="p-3 bg-brand-surface border border-brand-border grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block font-bold text-gray-700 mb-1">FROM DATE:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-1 bg-white border border-brand-border font-bold"
            />
          </div>

          <div>
            <label className="block font-bold text-gray-700 mb-1">TO DATE:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-1 bg-white border border-brand-border font-bold"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="px-4 py-1.5 bg-brand-ink text-white font-bold hover:bg-brand-ink/90 flex-1 cursor-pointer"
            >
              {loading ? 'RECOMPUTING...' : '[F5] RECOMPUTE'}
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="px-3 py-1.5 bg-brand-amber text-black font-bold hover:bg-yellow-500 cursor-pointer"
            >
              [F8] EXPORT JSON
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-2 bg-red-100 border border-red-500 text-red-700 font-bold">
            [ERROR]: {errorMsg}
          </div>
        )}

        {/* GSTR-3B Executive Tax Liability vs ITC Banner */}
        {gstr3b && (
          <div className="p-3 bg-white border-2 border-brand-ink grid grid-cols-1 sm:grid-cols-4 gap-3 shadow-[4px_4px_0px_0px_#0B192C]">
            <div>
              <span className="text-[10px] text-gray-500 font-bold uppercase">OUTPUT TAX LIABILITY (SALES)</span>
              <span className="text-base font-bold text-red-600 block">
                ₹ {gstr3b.totalOutwardTaxLiability.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-gray-500">Taxable: ₹{gstr3b.outwardTaxableTurnover.toFixed(2)}</span>
            </div>

            <div>
              <span className="text-[10px] text-gray-500 font-bold uppercase">ELIGIBLE ITC (PURCHASES)</span>
              <span className="text-base font-bold text-green-700 block">
                ₹ {gstr3b.totalEligibleItc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-gray-500">Inward Taxable: ₹{gstr3b.inwardEligibleTurnover.toFixed(2)}</span>
            </div>

            <div className="sm:col-span-2 p-2 bg-yellow-50 border border-brand-amber flex flex-col justify-center">
              {gstr3b.totalNetTaxPayable > 0 ? (
                <div>
                  <span className="text-[10px] font-bold text-red-700 uppercase">NET TAX PAYABLE VIA CHALLAN:</span>
                  <span className="text-lg font-bold text-red-700 block">
                    ₹ {gstr3b.totalNetTaxPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-gray-600">
                    CGST: ₹{gstr3b.netCgstPayable.toFixed(2)} | SGST: ₹{gstr3b.netSgstPayable.toFixed(2)} | IGST: ₹{gstr3b.netIgstPayable.toFixed(2)}
                  </span>
                </div>
              ) : (
                <div>
                  <span className="text-[10px] font-bold text-green-800 uppercase">EXCESS INPUT TAX CREDIT (CARRIED FORWARD):</span>
                  <span className="text-lg font-bold text-green-800 block">
                    ₹ {gstr3b.excessItcCarryforward.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-gray-600">Carried forward to next tax period</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab Selector */}
        <div className="flex flex-wrap items-center gap-1 border-b border-brand-border pb-1">
          <button
            type="button"
            onClick={() => setActiveTab('b2b')}
            className={`px-3 py-1 font-bold border ${
              activeTab === 'b2b'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [1] B2B INVOICES (TABLE 4) ({b2b.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('b2c')}
            className={`px-3 py-1 font-bold border ${
              activeTab === 'b2c'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [2] B2C SUPPLIES (TABLE 7) ({b2c.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            className={`px-3 py-1 font-bold border ${
              activeTab === 'notes'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [3] CREDIT & DEBIT NOTES (TABLE 9) ({notes.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('hsn')}
            className={`px-3 py-1 font-bold border ${
              activeTab === 'hsn'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [4] HSN SUMMARY (TABLE 12) ({hsn.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('gstr3b')}
            className={`px-3 py-1 font-bold border ${
              activeTab === 'gstr3b'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [5] GSTR-3B MONTHLY RETURN
          </button>
        </div>

        {/* Tab 1: Table 4 B2B */}
        {activeTab === 'b2b' && (
          <div className="bg-white border border-brand-border overflow-x-auto max-h-[500px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 border-b border-brand-border sticky top-0">
                <tr>
                  <th className="p-2 border-r border-brand-border">INV NO</th>
                  <th className="p-2 border-r border-brand-border">DATE</th>
                  <th className="p-2 border-r border-brand-border">CUSTOMER</th>
                  <th className="p-2 border-r border-brand-border">GSTIN</th>
                  <th className="p-2 border-r border-brand-border text-center">POS</th>
                  <th className="p-2 border-r border-brand-border text-center">RATE</th>
                  <th className="p-2 border-r border-brand-border text-right">TAXABLE VALUE</th>
                  <th className="p-2 border-r border-brand-border text-right">CGST</th>
                  <th className="p-2 border-r border-brand-border text-right">SGST</th>
                  <th className="p-2 border-r border-brand-border text-right">IGST</th>
                  <th className="p-2 text-right font-bold">TOTAL VALUE</th>
                </tr>
              </thead>
              <tbody>
                {b2b.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-4 text-center text-gray-500 italic">
                      No registered B2B invoices found in this period.
                    </td>
                  </tr>
                ) : (
                  b2b.map((r) => (
                    <tr key={r.invoiceId} className="border-b border-gray-200 hover:bg-blue-50">
                      <td className="p-2 border-r border-brand-border font-bold text-brand-ink">{r.invoiceNo}</td>
                      <td className="p-2 border-r border-brand-border">{r.invoiceDate}</td>
                      <td className="p-2 border-r border-brand-border font-bold">{r.customerName}</td>
                      <td className="p-2 border-r border-brand-border font-mono text-[11px]">{r.customerGstin}</td>
                      <td className="p-2 border-r border-brand-border text-center">{r.posStateCode}</td>
                      <td className="p-2 border-r border-brand-border text-center">{r.taxRatePct}%</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{r.taxableValue.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{r.cgstAmount.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{r.sgstAmount.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{r.igstAmount.toFixed(2)}</td>
                      <td className="p-2 text-right font-bold font-mono">₹{r.totalInvoiceValue.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Table 7 B2C */}
        {activeTab === 'b2c' && (
          <div className="bg-white border border-brand-border overflow-x-auto max-h-[500px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 border-b border-brand-border sticky top-0">
                <tr>
                  <th className="p-2 border-r border-brand-border">POS STATE</th>
                  <th className="p-2 border-r border-brand-border text-center">RATE (%)</th>
                  <th className="p-2 border-r border-brand-border text-right">INVOICES COUNT</th>
                  <th className="p-2 border-r border-brand-border text-right">TAXABLE VALUE</th>
                  <th className="p-2 border-r border-brand-border text-right">CGST</th>
                  <th className="p-2 border-r border-brand-border text-right">SGST</th>
                  <th className="p-2 border-r border-brand-border text-right">IGST</th>
                  <th className="p-2 text-right font-bold">TOTAL INVOICE VALUE</th>
                </tr>
              </thead>
              <tbody>
                {b2c.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-gray-500 italic">
                      No unregistered B2C transactions found.
                    </td>
                  </tr>
                ) : (
                  b2c.map((r, i) => (
                    <tr key={i} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="p-2 border-r border-brand-border font-bold">State Code: {r.posStateCode}</td>
                      <td className="p-2 border-r border-brand-border text-center font-bold">{r.taxRatePct}%</td>
                      <td className="p-2 border-r border-brand-border text-right">{r.invoicesCount}</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{r.taxableValue.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{r.cgstAmount.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{r.sgstAmount.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{r.igstAmount.toFixed(2)}</td>
                      <td className="p-2 text-right font-bold font-mono">₹{r.totalInvoiceValue.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Table 9 Notes */}
        {activeTab === 'notes' && (
          <div className="bg-white border border-brand-border overflow-x-auto max-h-[500px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 border-b border-brand-border sticky top-0">
                <tr>
                  <th className="p-2 border-r border-brand-border">NOTE NO</th>
                  <th className="p-2 border-r border-brand-border">DATE</th>
                  <th className="p-2 border-r border-brand-border">CUSTOMER</th>
                  <th className="p-2 border-r border-brand-border">CATEGORY</th>
                  <th className="p-2 border-r border-brand-border">ORIGINAL INV</th>
                  <th className="p-2 border-r border-brand-border">REASON</th>
                  <th className="p-2 border-r border-brand-border text-right">TAXABLE</th>
                  <th className="p-2 border-r border-brand-border text-right">CGST</th>
                  <th className="p-2 border-r border-brand-border text-right">SGST</th>
                  <th className="p-2 text-right font-bold">TOTAL NOTE VALUE</th>
                </tr>
              </thead>
              <tbody>
                {notes.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-4 text-center text-gray-500 italic">
                      No credit or debit notes found in this period.
                    </td>
                  </tr>
                ) : (
                  notes.map((n) => (
                    <tr key={n.returnId} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="p-2 border-r border-brand-border font-bold text-brand-ink">{n.noteNo}</td>
                      <td className="p-2 border-r border-brand-border">{n.noteDate}</td>
                      <td className="p-2 border-r border-brand-border font-bold">{n.customerName}</td>
                      <td className="p-2 border-r border-brand-border text-center">{n.partyCategory}</td>
                      <td className="p-2 border-r border-brand-border">{n.originalInvoiceNo || '-'}</td>
                      <td className="p-2 border-r border-brand-border text-[11px] text-gray-600">{n.reason}</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{n.taxableAmount.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{n.cgstAmount.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{n.sgstAmount.toFixed(2)}</td>
                      <td className="p-2 text-right font-bold font-mono">₹{n.totalNoteValue.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 4: Table 12 HSN */}
        {activeTab === 'hsn' && (
          <div className="bg-white border border-brand-border overflow-x-auto max-h-[500px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 border-b border-brand-border sticky top-0">
                <tr>
                  <th className="p-2 border-r border-brand-border">HSN CODE</th>
                  <th className="p-2 border-r border-brand-border">DESCRIPTION</th>
                  <th className="p-2 border-r border-brand-border text-center">UQC</th>
                  <th className="p-2 border-r border-brand-border text-right">TOTAL QTY</th>
                  <th className="p-2 border-r border-brand-border text-right">TOTAL VALUE</th>
                  <th className="p-2 border-r border-brand-border text-right">TAXABLE VALUE</th>
                  <th className="p-2 border-r border-brand-border text-center">RATE</th>
                  <th className="p-2 border-r border-brand-border text-right">CGST</th>
                  <th className="p-2 border-r border-brand-border text-right">SGST</th>
                  <th className="p-2 text-right font-bold">TOTAL TAX</th>
                </tr>
              </thead>
              <tbody>
                {hsn.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-4 text-center text-gray-500 italic">
                      No HSN summary data found.
                    </td>
                  </tr>
                ) : (
                  hsn.map((h, i) => (
                    <tr key={i} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="p-2 border-r border-brand-border font-bold font-mono text-brand-ink">{h.hsnCode}</td>
                      <td className="p-2 border-r border-brand-border">{h.description}</td>
                      <td className="p-2 border-r border-brand-border text-center">{h.uqc}</td>
                      <td className="p-2 border-r border-brand-border text-right font-bold">{h.totalQuantity}</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{h.totalValue.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{h.totalTaxableValue.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-center font-bold">{h.taxRatePct}%</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{h.cgstAmount.toFixed(2)}</td>
                      <td className="p-2 border-r border-brand-border text-right font-mono">₹{h.sgstAmount.toFixed(2)}</td>
                      <td className="p-2 text-right font-bold font-mono">₹{h.totalTaxAmount.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 5: GSTR-3B Return Summary */}
        {activeTab === 'gstr3b' && gstr3b && (
          <div className="bg-white border border-brand-border p-4 flex flex-col gap-4">
            <h3 className="text-sm font-bold border-b border-brand-border pb-1 uppercase">
              FORM GSTR-3B: MONTHLY RETURN STATUTORY RECONCILIATION
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Table 3.1 Outward */}
              <div className="p-3 bg-brand-surface border border-brand-border flex flex-col gap-2">
                <span className="font-bold text-brand-ink uppercase">3.1 DETAILS OF OUTWARD SUPPLIES & TAX LIABILITY</span>
                <div className="flex justify-between py-1 border-b border-gray-200">
                  <span>Net Taxable Turnover:</span>
                  <span className="font-bold">₹ {gstr3b.outwardTaxableTurnover.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-200">
                  <span>Central Tax (CGST):</span>
                  <span className="font-mono">₹ {gstr3b.outwardCgst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-200">
                  <span>State Tax (SGST):</span>
                  <span className="font-mono">₹ {gstr3b.outwardSgst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-200">
                  <span>Integrated Tax (IGST):</span>
                  <span className="font-mono">₹ {gstr3b.outwardIgst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 font-bold text-red-700 bg-red-50 p-1">
                  <span>Total Output Tax:</span>
                  <span>₹ {gstr3b.totalOutwardTaxLiability.toFixed(2)}</span>
                </div>
              </div>

              {/* Table 4 Eligible ITC */}
              <div className="p-3 bg-brand-surface border border-brand-border flex flex-col gap-2">
                <span className="font-bold text-brand-ink uppercase">4. DETAILS OF ELIGIBLE INPUT TAX CREDIT (ITC)</span>
                <div className="flex justify-between py-1 border-b border-gray-200">
                  <span>Eligible Inward Turnover:</span>
                  <span className="font-bold">₹ {gstr3b.inwardEligibleTurnover.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-200">
                  <span>Input Central Tax (CGST):</span>
                  <span className="font-mono">₹ {gstr3b.inputCgstItc.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-200">
                  <span>Input State Tax (SGST):</span>
                  <span className="font-mono">₹ {gstr3b.inputSgstItc.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-200">
                  <span>Input Integrated Tax (IGST):</span>
                  <span className="font-mono">₹ {gstr3b.inputIgstItc.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 font-bold text-green-800 bg-green-50 p-1">
                  <span>Total Eligible ITC:</span>
                  <span>₹ {gstr3b.totalEligibleItc.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DosWindow>
  );
}
