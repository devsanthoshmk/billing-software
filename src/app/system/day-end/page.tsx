'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DosWindow } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import {
  getDayEndAuditPreview,
  executeDayEndClosing,
  getDayEndClosingHistory,
  DayEndAuditPreviewResult,
} from './actions';
import { DayEndClosing } from '@/lib/db/schema/system';

const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

export default function DayEndClosingPage() {
  const [activeTab, setActiveTab] = useState<'closing' | 'history'>('closing');
  const [closingDate, setClosingDate] = useState<string>('2026-09-28');
  const [preview, setPreview] = useState<DayEndAuditPreviewResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Denomination Counter State
  const [denomCounts, setDenomCounts] = useState<Record<number, number>>({
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    2: 0,
    1: 0,
  });

  const [coinsAmount, setCoinsAmount] = useState<string>('0');
  const [manualCashOverride, setManualCashOverride] = useState<string>('');
  const [nextWorkingDate, setNextWorkingDate] = useState<string>('2026-09-29');
  const [supervisorPassword, setSupervisorPassword] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');

  // Confirmation Modal
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  // History Tab
  const [history, setHistory] = useState<DayEndClosing[]>([]);

  const loadPreview = useCallback(() => {
    setLoading(true);
    setErrorMsg(null);
    getDayEndAuditPreview(closingDate)
      .then((p) => {
        setPreview(p);
        setNextWorkingDate(p.proposedNextWorkingDate);
      })
      .catch((e) => setErrorMsg(e.message))
      .finally(() => setLoading(false));
  }, [closingDate]);

  const loadHistory = useCallback(() => {
    getDayEndClosingHistory().then(setHistory).catch(console.error);
  }, []);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  // Denominations Total Calculation
  const denomTotal = Object.entries(denomCounts).reduce(
    (sum, [denom, count]) => sum + Number(denom) * (Number(count) || 0),
    0
  );
  const numCoins = parseFloat(coinsAmount) || 0;
  const calculatedPhysicalCash = Number((denomTotal + numCoins).toFixed(2));

  const effectivePhysicalCash = manualCashOverride
    ? parseFloat(manualCashOverride) || 0
    : calculatedPhysicalCash;

  const expectedCash = preview ? preview.expectedCashBalance : 0;
  const cashVariance = Number((effectivePhysicalCash - expectedCash).toFixed(2));

  const handleDenomChange = (denom: number, countStr: string) => {
    const count = Math.max(0, parseInt(countStr, 10) || 0);
    setDenomCounts((prev) => ({ ...prev, [denom]: count }));
  };

  const handleQuickMatchExpected = () => {
    setManualCashOverride(String(expectedCash));
  };

  const handleExecuteClosing = async () => {
    if (!preview) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await executeDayEndClosing({
        closingDate,
        physicalCashCount: effectivePhysicalCash,
        denominationCounts: Object.fromEntries(
          Object.entries(denomCounts).map(([k, v]) => [k, v])
        ),
        nextWorkingDate,
        closedByUser: 'ADMIN',
        remarks: remarks.trim() || undefined,
        supervisorPassword: supervisorPassword || undefined,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to execute day-end closing');
        setShowConfirmModal(false);
      } else {
        setSuccessMsg(
          `Day-End Closing executed successfully for ${closingDate}! Advanced working date to ${nextWorkingDate}. All daily transactions are now locked.`
        );
        setShowConfirmModal(false);
        loadPreview();
        loadHistory();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Unexpected closing error');
      setShowConfirmModal(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DosWindow
      title="DAY-END AUDIT & DATE ADVANCEMENT ROUTINE [DAYEND1.PRG]"
      breadcrumbs={['SYSTEM', 'DAY-END CLOSING']}
      actions={[
        { keyLabel: 'F1', label: 'Closing Routine', onClick: () => setActiveTab('closing') },
        { keyLabel: 'F2', label: 'Audit History', onClick: () => setActiveTab('history') },
        { keyLabel: 'F5', label: 'Refresh Preview', onClick: loadPreview },
      ]}
    >
      <div className="flex flex-col gap-4 font-mono text-xs">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-brand-border pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('closing')}
            className={`px-3 py-1 font-bold border ${
              activeTab === 'closing'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [F1] EXECUTE DAILY CLOSING
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1 font-bold border ${
              activeTab === 'history'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [F2] CLOSING AUDIT HISTORY ({history.length})
          </button>
        </div>

        {errorMsg && (
          <div className="p-2 bg-red-100 border border-red-500 text-red-700 font-bold">
            [ERROR]: {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-2 bg-green-100 border border-green-500 text-green-800 font-bold">
            [SUCCESS]: {successMsg}
          </div>
        )}

        {activeTab === 'closing' ? (
          <div className="flex flex-col gap-4">
            {/* Date Ribbon */}
            <div className="p-3 bg-brand-surface border border-brand-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-bold text-gray-700">DATE TO AUDIT & CLOSE:</span>
                <input
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  className="p-1 bg-white border border-brand-border font-bold text-brand-ink"
                />
                <button
                  type="button"
                  onClick={loadPreview}
                  className="px-3 py-1 bg-brand-ink text-white font-bold"
                >
                  AUDIT DATE
                </button>
              </div>

              {preview?.isAlreadyClosed && (
                <span className="px-3 py-1 bg-red-600 text-white font-bold text-xs">
                  [LOCKED: DATE ALREADY CLOSED]
                </span>
              )}
            </div>

            {/* Unfinalized Drafts Warning (FoxPro sinv1..6 parity) */}
            {preview && preview.unfinalizedDraftsCount > 0 && (
              <div className="p-3 bg-red-600 text-white border-2 border-red-800 flex flex-col gap-1 shadow-md">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <span>[!] UNFINALIZED DRAFT INVOICES DETECTED:</span>
                  <span>{preview.unfinalizedDraftsCount} Draft(s) Pending</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  The following bills remain in draft status on {closingDate}:{' '}
                  <span className="underline font-mono">{preview.draftInvoiceNumbers.join(', ')}</span>.
                  In accordance with FoxPro DAYEND1 security rules, Day-End Closing is blocked until drafts are finalized or discarded. Supervisor password override is required to bypass.
                </p>
              </div>
            )}

            {/* Financial Overview Cards */}
            {preview && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2 bg-white border border-brand-border flex flex-col">
                  <span className="text-[10px] text-gray-500 font-bold uppercase">DAILY NET TURNOVER</span>
                  <span className="text-base font-bold text-brand-ink">
                    ₹ {preview.netSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-gray-500">{preview.invoicesCount} Invoices Billed</span>
                </div>

                <div className="p-2 bg-white border border-brand-border flex flex-col">
                  <span className="text-[10px] text-gray-500 font-bold uppercase">OUTPUT TAX COLLECTED</span>
                  <span className="text-base font-bold text-purple-700">
                    ₹ {preview.taxCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-gray-500">Gross: ₹{preview.grossSales.toFixed(2)}</span>
                </div>

                <div className="p-2 bg-white border border-brand-border flex flex-col">
                  <span className="text-[10px] text-gray-500 font-bold uppercase">CASH INFLOW (SALES + COLL)</span>
                  <span className="text-base font-bold text-green-700">
                    ₹ {(preview.cashSales + preview.collectionsCash).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    Bills: ₹{preview.cashSales.toFixed(2)} | Receipts: ₹{preview.collectionsCash.toFixed(2)}
                  </span>
                </div>

                <div className="p-2 bg-white border border-brand-border flex flex-col">
                  <span className="text-[10px] text-gray-500 font-bold uppercase">CASH OUTFLOW (PMTS + REFUNDS)</span>
                  <span className="text-base font-bold text-red-600">
                    ₹ {(preview.paymentsCash + preview.cashRefundsAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    Vendors: ₹{preview.paymentsCash.toFixed(2)} | Refunds: ₹{preview.cashRefundsAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Cash Drawer Reconciliation & Denomination Counter */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Denomination Counter Box */}
              <div className="p-3 bg-white border border-brand-border flex flex-col gap-2">
                <span className="font-bold text-brand-ink uppercase border-b border-brand-border pb-1">
                  PHYSICAL CASH DRAWER COUNT (DENOMINATION TALLY)
                </span>

                <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-gray-600 bg-gray-50 p-1">
                  <span>DENOMINATION</span>
                  <span>COUNT</span>
                  <span className="text-right">SUBTOTAL (₹)</span>
                </div>

                <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto pr-1">
                  {DENOMINATIONS.map((d) => (
                    <div key={d} className="grid grid-cols-3 gap-2 items-center text-xs">
                      <span className="font-bold">₹ {d} Notes</span>
                      <input
                        type="number"
                        min="0"
                        value={denomCounts[d] || ''}
                        placeholder="0"
                        onChange={(e) => handleDenomChange(d, e.target.value)}
                        className="p-1 border border-brand-border text-center font-bold bg-white"
                      />
                      <span className="text-right font-mono font-bold text-gray-700">
                        ₹ {((denomCounts[d] || 0) * d).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  <div className="grid grid-cols-3 gap-2 items-center text-xs pt-1 border-t border-gray-200">
                    <span className="font-bold text-gray-600">Coins / Change</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={coinsAmount}
                      onChange={(e) => setCoinsAmount(e.target.value)}
                      className="p-1 border border-brand-border text-center font-bold bg-white"
                    />
                    <span className="text-right font-mono font-bold text-gray-700">
                      ₹ {numCoins.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="p-2 bg-brand-surface border-t border-brand-border flex justify-between font-bold text-sm">
                  <span>DENOMINATION TOTAL:</span>
                  <span className="text-brand-ink font-mono">₹ {calculatedPhysicalCash.toFixed(2)}</span>
                </div>
              </div>

              {/* Reconciliation Balance Card */}
              <div className="p-3 bg-white border border-brand-border flex flex-col justify-between gap-3">
                <div className="flex flex-col gap-2">
                  <span className="font-bold text-brand-ink uppercase border-b border-brand-border pb-1">
                    DRAWER RECONCILIATION AUDIT
                  </span>

                  <div className="flex flex-col gap-1.5 font-mono text-xs">
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span>(+) OPENING CASH BALANCE</span>
                      <span className="font-bold">₹ {preview ? preview.openingCashBalance.toFixed(2) : '0.00'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span>(+) CASH SALES INVOICES</span>
                      <span className="text-green-700 font-bold">₹ {preview ? preview.cashSales.toFixed(2) : '0.00'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span>(+) CASH COLLECTIONS TODAY</span>
                      <span className="text-green-700 font-bold">₹ {preview ? preview.collectionsCash.toFixed(2) : '0.00'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span>(-) CASH SUPPLIER PAYMENTS</span>
                      <span className="text-red-600 font-bold">(-) ₹ {preview ? preview.paymentsCash.toFixed(2) : '0.00'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span>(-) CASH RETURNS REFUNDED</span>
                      <span className="text-red-600 font-bold">(-) ₹ {preview ? preview.cashRefundsAmount.toFixed(2) : '0.00'}</span>
                    </div>

                    <div className="flex justify-between py-2 border-t-2 border-black font-bold text-sm bg-gray-50 px-2 mt-1">
                      <span>(=) EXPECTED SYSTEM CASH:</span>
                      <span className="text-brand-ink">₹ {expectedCash.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center py-2 px-2 bg-yellow-50 border border-brand-amber font-bold text-sm">
                      <span>PHYSICAL CASH COUNT:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-brand-ink font-mono">₹ {effectivePhysicalCash.toFixed(2)}</span>
                        <button
                          type="button"
                          onClick={handleQuickMatchExpected}
                          className="px-1.5 py-0.5 bg-brand-ink text-white text-[10px] font-bold"
                          title="Set physical cash count equal to expected system cash"
                        >
                          MATCH
                        </button>
                      </div>
                    </div>

                    <div
                      className={`flex justify-between py-2 px-2 font-bold text-sm border-2 ${
                        cashVariance === 0
                          ? 'bg-green-100 text-green-900 border-green-500'
                          : 'bg-red-100 text-red-900 border-red-500'
                      }`}
                    >
                      <span>CASH VARIANCE DIFFERENCE:</span>
                      <span className="font-mono">
                        {cashVariance === 0 ? '₹ 0.00 (PERFECTLY BALANCED)' : `₹ ${cashVariance.toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Supervisor Passcode if variance or drafts exist */}
                {(cashVariance !== 0 || (preview && preview.unfinalizedDraftsCount > 0)) && (
                  <div className="p-2 bg-red-50 border border-red-300 flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-red-800">
                      SUPERVISOR AUTHORIZATION REQUIRED (Passcode: 'SPM'):
                    </span>
                    <input
                      type="password"
                      placeholder="Enter Supervisor Password"
                      value={supervisorPassword}
                      onChange={(e) => setSupervisorPassword(e.target.value)}
                      className="w-full p-1 bg-white border border-red-400 font-bold"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Advance Date & Execution Bar */}
            <div className="p-3 bg-brand-surface border border-brand-border grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block font-bold text-gray-700 mb-1">PROPOSED NEXT WORKING BUSINESS DATE:</label>
                <input
                  type="date"
                  value={nextWorkingDate}
                  onChange={(e) => setNextWorkingDate(e.target.value)}
                  className="w-full p-1.5 bg-white border border-brand-border font-bold text-brand-ink"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">CLOSING REMARKS / NOTES:</label>
                <input
                  type="text"
                  placeholder="Optional audit remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full p-1.5 bg-white border border-brand-border"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={loading || preview?.isAlreadyClosed}
                  onClick={() => setShowConfirmModal(true)}
                  className="w-full sm:w-auto px-6 py-2.5 bg-brand-ink text-white font-bold hover:bg-brand-ink/90 disabled:opacity-50 cursor-pointer shadow-[4px_4px_0px_0px_#F05A28]"
                >
                  [ENTER] EXECUTE DAY-END CLOSING & ADVANCE DATE
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* History Tab */
          <div className="bg-white border border-brand-border flex flex-col">
            <div className="p-2 bg-brand-surface border-b border-brand-border flex items-center justify-between">
              <span className="font-bold text-brand-ink uppercase">HISTORICAL DAY-END CLOSING LOGS</span>
              <button
                type="button"
                onClick={loadHistory}
                className="px-2 py-0.5 bg-white border border-brand-border hover:bg-gray-100 font-bold"
              >
                REFRESH
              </button>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-100 border-b border-brand-border sticky top-0">
                  <tr>
                    <th className="p-2 border-r border-brand-border">CLOSING DATE</th>
                    <th className="p-2 border-r border-brand-border">EXECUTION TIME</th>
                    <th className="p-2 border-r border-brand-border text-center">BILLS</th>
                    <th className="p-2 border-r border-brand-border text-right">NET TURNOVER</th>
                    <th className="p-2 border-r border-brand-border text-right">OUTPUT TAX</th>
                    <th className="p-2 border-r border-brand-border text-right">EXPECTED CASH</th>
                    <th className="p-2 border-r border-brand-border text-right">PHYSICAL CASH</th>
                    <th className="p-2 border-r border-brand-border text-right">VARIANCE</th>
                    <th className="p-2 border-r border-brand-border">NEXT DATE</th>
                    <th className="p-2">USER</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-4 text-center text-gray-500 italic">
                        No previous day-end closing records.
                      </td>
                    </tr>
                  ) : (
                    history.map((h) => (
                      <tr key={h.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="p-2 border-r border-brand-border font-bold text-brand-ink">{h.closingDate}</td>
                        <td className="p-2 border-r border-brand-border text-gray-600">{h.closedAt.slice(0, 19).replace('T', ' ')}</td>
                        <td className="p-2 border-r border-brand-border text-center">{h.totalInvoicesCount}</td>
                        <td className="p-2 border-r border-brand-border text-right font-bold">
                          ₹{Number(h.totalSalesNet).toFixed(2)}
                        </td>
                        <td className="p-2 border-r border-brand-border text-right font-mono">
                          ₹{Number(h.totalTaxCollected).toFixed(2)}
                        </td>
                        <td className="p-2 border-r border-brand-border text-right font-mono">
                          ₹{Number(h.closingCashBalance).toFixed(2)}
                        </td>
                        <td className="p-2 border-r border-brand-border text-right font-mono">
                          ₹{Number(h.physicalCashCount).toFixed(2)}
                        </td>
                        <td className={`p-2 border-r border-brand-border text-right font-bold ${h.cashDifference !== 0 ? 'text-red-600' : 'text-green-700'}`}>
                          ₹{Number(h.cashDifference).toFixed(2)}
                        </td>
                        <td className="p-2 border-r border-brand-border font-bold text-blue-700">{h.nextWorkingDate}</td>
                        <td className="p-2 text-gray-600">{h.closedByUser}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        <DosModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          title="CONFIRM FINAL DAY-END CLOSING & TRANSACTION FREEZE"
          variant="danger"
          confirmText="[Enter: Confirm & Lock]"
          onConfirm={handleExecuteClosing}
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm font-bold text-red-700">
              WARNING: Day-End Closing is an atomic, immutable financial milestone!
            </p>
            <ul className="list-disc pl-4 text-xs text-gray-800 space-y-1">
              <li>All sales invoices, purchase inwards, returns, and collections for {closingDate} will be permanently locked against modification.</li>
              <li>The working business date will advance to <strong>{nextWorkingDate}</strong>.</li>
              <li>Physical drawer cash of <strong>₹{effectivePhysicalCash.toFixed(2)}</strong> will be recorded as opening cash for tomorrow.</li>
              {cashVariance !== 0 && (
                <li className="text-red-700 font-bold">
                  Cash variance of ₹{cashVariance.toFixed(2)} will be audited with supervisor credentials.
                </li>
              )}
            </ul>
            <p className="text-xs text-gray-600 mt-1">
              Are you sure you want to proceed with closing date {closingDate}?
            </p>
          </div>
        </DosModal>
      </div>
    </DosWindow>
  );
}
