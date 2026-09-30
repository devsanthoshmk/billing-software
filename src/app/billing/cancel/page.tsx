'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import { searchInvoicesForCancellation, cancelInvoice } from './actions';

export default function InvoiceCancellationPage() {
  const [query, setQuery] = useState('');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [confirmModal, setConfirmModal] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('Entry error / Customer change');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successInfo, setSuccessInfo] = useState<{ invoiceNo: string; amount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = async (search = '') => {
    setLoading(true);
    setError(null);
    const res = await searchInvoicesForCancellation(search);
    if (res.success) {
      setInvoices(res.invoices);
      setSelectedIndex(0);
    } else {
      setError(res.error || 'Failed to search invoices.');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadList();
  }, []);

  const handleConfirmCancel = async () => {
    if (!confirmModal) return;
    setIsSubmitting(true);
    setError(null);

    const res = await cancelInvoice({
      invoiceId: confirmModal.id,
      reason: cancelReason,
      operator: 'ADMIN',
    });

    if (res.success) {
      setSuccessInfo({ invoiceNo: res.invoiceNo || confirmModal.invoiceNo, amount: res.amountReversed || 0 });
      setConfirmModal(null);
      loadList(query);
    } else {
      setError(res.error || 'Invoice cancellation failed.');
    }
    setIsSubmitting(false);
  };

  const actions: DosAction[] = [
    {
      keyLabel: 'F5',
      label: 'Refresh',
      onClick: () => loadList(query),
    },
    {
      keyLabel: 'F8',
      label: 'Cancel Invoice',
      variant: 'danger',
      disabled: invoices.length === 0,
      onClick: () => {
        if (invoices[selectedIndex]) {
          setConfirmModal(invoices[selectedIndex]);
        }
      },
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="INVOICE CANCELLATION"
        subtitle="CANCEL INVOICES, RESTORE BATCH STOCKS, AND REVERSE CUSTOMER BALANCES"
        breadcrumbs={['BILLING', 'INVOICE CANCELLATION']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            INVOICES FOUND: {invoices.length}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1 border border-black">
              [ERROR] {error}
            </div>
          )}

          {/* Search Header */}
          <div className="bg-brand-surface border border-brand-border p-2 flex items-center gap-3">
            <label className="font-bold text-brand-ink whitespace-nowrap">Search Invoice No:</label>
            <input
              type="text"
              placeholder="Enter invoice number (e.g. INV-000101)..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                loadList(e.target.value);
              }}
              className="w-80 bg-white border border-brand-border px-2 py-1 font-bold text-black"
            />
            <button
              type="button"
              onClick={() => loadList(query)}
              className="bg-brand-ink text-white font-bold px-3 py-1 border border-black hover:bg-brand-amber"
            >
              [SEARCH]
            </button>
          </div>

          {/* Invoices List */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="w-28 px-2 py-1 text-left">INVOICE NO</th>
                  <th className="w-24 px-2 py-1 text-center">DATE</th>
                  <th className="px-2 py-1 text-left">CUSTOMER NAME</th>
                  <th className="w-16 px-2 py-1 text-center">ITEMS</th>
                  <th className="w-16 px-2 py-1 text-right">QTY</th>
                  <th className="w-24 px-2 py-1 text-right">NET AMOUNT</th>
                  <th className="w-24 px-2 py-1 text-center">STATUS</th>
                  <th className="w-24 px-2 py-1 text-center">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-500 font-bold">
                      Loading invoices...
                    </td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-500 font-bold">
                      No open invoices found for cancellation.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => setSelectedIndex(idx)}
                        className={`border-b border-gray-200 cursor-pointer ${
                          isSelected ? 'bg-amber-100 font-bold' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        }`}
                      >
                        <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-1 font-bold text-brand-ink">{inv.invoiceNo}</td>
                        <td className="px-2 py-1 text-center">{inv.invoiceDate}</td>
                        <td className="px-2 py-1 font-bold">
                          {inv.customerName} ({inv.customerCode})
                        </td>
                        <td className="px-2 py-1 text-center">{inv.totalItemsCount}</td>
                        <td className="px-2 py-1 text-right">{inv.totalQuantity}</td>
                        <td className="px-2 py-1 text-right font-bold text-brand-amber">
                          ₹ {inv.netAmount.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-center">
                          {inv.dayEndLocked ? (
                            <span className="bg-red-600 text-white px-1 py-0.5 text-[10px]">LOCKED</span>
                          ) : (
                            <span className="bg-green-600 text-white px-1 py-0.5 text-[10px]">OPEN</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button
                            type="button"
                            disabled={inv.dayEndLocked}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmModal(inv);
                            }}
                            className="bg-red-600 text-white px-2 py-0.5 font-bold hover:bg-red-700 disabled:opacity-30 text-[10px]"
                          >
                            [CANCEL]
                          </button>
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

      {/* Confirmation Modal */}
      {confirmModal && (
        <DosModal
          isOpen={true}
          onClose={() => setConfirmModal(null)}
          title="CONFIRM INVOICE CANCELLATION"
          width="max-w-md"
          variant="danger"
          confirmText="[Enter: Confirm Cancellation]"
          cancelText="[ESC: Cancel]"
          onConfirm={handleConfirmCancel}
        >
          <div className="flex flex-col gap-2 font-mono text-xs">
            <p className="font-bold text-red-700">
              Are you sure you want to cancel Invoice {confirmModal.invoiceNo}?
            </p>
            <p className="text-gray-600">
              Amount: ₹ {confirmModal.netAmount.toFixed(2)} | Customer: {confirmModal.customerName}
            </p>
            <div className="mt-2">
              <label className="font-bold block text-black">Reason for Cancellation:</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full bg-white border border-brand-border px-2 py-1 font-bold"
              />
            </div>
            <p className="text-gray-500 text-[11px] mt-1">
              • Item quantities will be restored to their original batches.<br />
              • Customer ledger balance will be reversed.
            </p>
          </div>
        </DosModal>
      )}

      {/* Success Modal */}
      {successInfo && (
        <DosModal
          isOpen={true}
          onClose={() => setSuccessInfo(null)}
          title="INVOICE CANCELLED"
          width="max-w-md"
          confirmText="[Enter: OK]"
          onConfirm={() => setSuccessInfo(null)}
        >
          <div className="flex flex-col gap-2 font-mono text-xs text-center py-2">
            <div className="bg-red-100 text-red-800 p-2 border border-red-400 font-bold">
              Invoice Cancelled Successfully
            </div>
            <div className="text-base font-bold text-brand-ink">
              CANCELLED INVOICE: {successInfo.invoiceNo}
            </div>
            <div className="text-lg font-bold text-brand-amber">
              AMOUNT REVERSED: ₹ {successInfo.amount.toFixed(2)}
            </div>
          </div>
        </DosModal>
      )}
    </div>
  );
}
