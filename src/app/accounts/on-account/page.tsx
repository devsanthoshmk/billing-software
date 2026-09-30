'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import { getUnallocatedReceipts, autoAllocateOnAccountReceipt } from './actions';

export default function OnAccountSettlementPage() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successModal, setSuccessModal] = useState<{ allocated: number; remaining: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = async () => {
    setLoading(true);
    setError(null);
    const res = await getUnallocatedReceipts();
    if (res.success) {
      setReceipts(res.receipts);
      setSelectedIndex(0);
    } else {
      setError(res.error || 'Failed to load advance receipts');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadList();
  }, []);

  const handleAutoAllocate = async (rId: string) => {
    setIsSubmitting(true);
    setError(null);
    const res = await autoAllocateOnAccountReceipt(rId);
    if (res.success) {
      setSuccessModal({ allocated: res.allocatedTotal || 0, remaining: res.remainingUnallocated || 0 });
      loadList();
    } else {
      setError(res.error || 'Allocation failed');
    }
    setIsSubmitting(false);
  };

  const actions: DosAction[] = [
    {
      keyLabel: 'F8',
      label: 'FIFO Auto-Allocate',
      variant: 'primary',
      disabled: receipts.length === 0 || isSubmitting,
      onClick: () => {
        if (receipts[selectedIndex]) {
          handleAutoAllocate(receipts[selectedIndex].receiptId);
        }
      },
    },
    {
      keyLabel: 'F5',
      label: 'Refresh',
      onClick: loadList,
    },
  ];

  const totalUnallocated = receipts.reduce((acc, r) => acc + (r.unallocatedAmount || 0), 0);

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="Advance Payment Settlement"
        subtitle="Reconcile and allocate unadjusted customer advances against open invoices"
        breadcrumbs={['ACCOUNTS', 'ADVANCE SETTLEMENT']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Unallocated Receipts: {receipts.length} | Total Advance Held: ₹ {totalUnallocated.toFixed(2)}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1 border border-black">
              [ERROR] {error}
            </div>
          )}

          {/* Table */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="w-28 px-2 py-1 text-left">RECEIPT NO</th>
                  <th className="w-24 px-2 py-1 text-center">DATE</th>
                  <th className="px-2 py-1 text-left">CUSTOMER / PHARMACY</th>
                  <th className="w-24 px-2 py-1 text-center">MODE</th>
                  <th className="w-28 px-2 py-1 text-right">TOTAL RECEIPT</th>
                  <th className="w-28 px-2 py-1 text-right">UNALLOCATED ADV</th>
                  <th className="w-32 px-2 py-1 text-center">FIFO SETTLEMENT</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-500 font-bold">
                      Loading unallocated advances...
                    </td>
                  </tr>
                ) : receipts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-green-700 font-bold">
                      All customer receipts are fully reconciled. No unallocated advances found.
                    </td>
                  </tr>
                ) : (
                  receipts.map((r, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <tr
                        key={r.receiptId}
                        onClick={() => setSelectedIndex(idx)}
                        className={`border-b border-gray-200 cursor-pointer ${
                          isSelected ? 'bg-cyan-100 font-bold' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        }`}
                      >
                        <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-1 font-bold text-brand-ink">{r.receiptNo}</td>
                        <td className="px-2 py-1 text-center">{r.receiptDate}</td>
                        <td className="px-2 py-1 font-bold">
                          {r.customerName} ({r.customerCode})
                        </td>
                        <td className="px-2 py-1 text-center font-bold text-gray-700">{r.paymentMode}</td>
                        <td className="px-2 py-1 text-right">₹ {r.totalAmount.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right font-bold text-brand-amber">
                          ₹ {r.unallocatedAmount.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAutoAllocate(r.receiptId);
                            }}
                            className="bg-brand-ink text-white px-2 py-0.5 text-[10px] font-bold hover:bg-brand-amber cursor-pointer disabled:opacity-50"
                          >
                            Allocate FIFO
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

      {/* Success Modal */}
      {successModal && (
        <DosModal
          isOpen={true}
          onClose={() => setSuccessModal(null)}
          title="Advance Settlement Completed"
          width="max-w-md"
          confirmText="[Enter: OK]"
          onConfirm={() => setSuccessModal(null)}
        >
          <div className="flex flex-col gap-2 font-mono text-xs text-center py-2">
            <div className="bg-green-100 text-green-800 p-2 border border-green-400 font-bold">
              Advance successfully applied to open invoices
            </div>
            <div className="text-lg font-bold text-brand-amber">
              Allocated: ₹ {successModal.allocated.toFixed(2)}
            </div>
            <div className="text-gray-600 text-[11px]">
              Remaining Advance: ₹ {successModal.remaining.toFixed(2)}
            </div>
          </div>
        </DosModal>
      )}
    </div>
  );
}
