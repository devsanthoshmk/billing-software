'use client';

import React, { useState } from 'react';
import { DosModal } from '@/components/ui/DosModal';

export interface BatchItem {
  id: string;
  batchNo: string;
  expiryDate: string;
  expiryMonthYear?: string | null;
  stockQty: number;
  mrp: number;
  sellingRate: number;
  purchaseRate: number;
  schemeThreshold: number;
  schemeFreeQty: number;
}

export interface BatchPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  batches: BatchItem[];
  currentBatchId?: string;
  onSelectBatch: (batch: BatchItem) => void;
}

export function BatchPickerModal({
  isOpen,
  onClose,
  productName,
  batches,
  currentBatchId,
  onSelectBatch,
}: BatchPickerModalProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (batches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(batches.length - 1, prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const b = batches[selectedIdx];
      if (b) {
        onSelectBatch(b);
        onClose();
      }
    }
  };

  return (
    <DosModal
      isOpen={isOpen}
      onClose={onClose}
      title={`SELECT BATCH: ${productName.toUpperCase()}`}
      width="max-w-3xl"
      confirmText="[Enter: Select Batch]"
      cancelText="[ESC: Cancel]"
      onConfirm={() => {
        const b = batches[selectedIdx];
        if (b) {
          onSelectBatch(b);
          onClose();
        }
      }}
    >
      <div
        className="flex flex-col gap-2 font-mono text-xs focus:outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className="bg-brand-surface p-1.5 border border-brand-border text-brand-ink">
          Use [↑↓] arrow keys to navigate batches. Batches ordered by FEFO (Earliest Expiry First).
        </div>

        <div className="border border-brand-border overflow-auto max-h-60 bg-white">
          <table className="w-full border-collapse">
            <thead className="bg-brand-ink text-white sticky top-0">
              <tr>
                <th className="px-2 py-1 text-left">BATCH NO</th>
                <th className="px-2 py-1 text-center">EXPIRY</th>
                <th className="px-2 py-1 text-right">STOCK</th>
                <th className="px-2 py-1 text-right">P.RATE</th>
                <th className="px-2 py-1 text-right">S.RATE</th>
                <th className="px-2 py-1 text-right">MRP</th>
                <th className="px-2 py-1 text-center">SCHEME</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-gray-500 font-bold">
                    --- NO ACTIVE BATCHES AVAILABLE ---
                  </td>
                </tr>
              ) : (
                batches.map((b, idx) => {
                  const isSelected = idx === selectedIdx;
                  const isCurrent = b.id === currentBatchId;
                  const isLow = b.stockQty <= 0;

                  return (
                    <tr
                      key={b.id}
                      onClick={() => {
                        setSelectedIdx(idx);
                        onSelectBatch(b);
                        onClose();
                      }}
                      className={`cursor-pointer border-b border-gray-200 ${
                        isSelected
                          ? 'bg-[#00AAAA] text-black font-bold'
                          : isCurrent
                          ? 'bg-amber-100 text-brand-ink font-bold'
                          : idx % 2 === 0
                          ? 'bg-white'
                          : 'bg-gray-50'
                      }`}
                    >
                      <td className="px-2 py-1">{b.batchNo}</td>
                      <td className="px-2 py-1 text-center">
                        {b.expiryMonthYear || b.expiryDate}
                      </td>
                      <td
                        className={`px-2 py-1 text-right font-bold ${
                          isLow ? 'text-red-600' : ''
                        }`}
                      >
                        {b.stockQty}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {b.purchaseRate.toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {b.sellingRate.toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right">{b.mrp.toFixed(2)}</td>
                      <td className="px-2 py-1 text-center">
                        {b.schemeThreshold > 0
                          ? `${b.schemeThreshold}+${b.schemeFreeQty}`
                          : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DosModal>
  );
}
