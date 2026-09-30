'use client';

import React, { useState } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import { executeMonthEndClosing } from './actions';

export default function MonthEndPage() {
  const [closingMonth, setClosingMonth] = useState<string>('2026-09');
  const [confirmModal, setConfirmModal] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successInfo, setSuccessInfo] = useState<{ closedMonth: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConfirmClosing = async () => {
    setIsSubmitting(true);
    setError(null);
    const res = await executeMonthEndClosing(closingMonth, 'ADMIN');
    if (res.success) {
      setSuccessInfo({ closedMonth: res.closedMonth || closingMonth });
      setConfirmModal(false);
    } else {
      setError(res.error || 'Month-end execution failed');
    }
    setIsSubmitting(false);
  };

  const actions: DosAction[] = [
    {
      keyLabel: 'F8',
      label: 'Execute Month-End',
      variant: 'danger',
      disabled: isSubmitting,
      onClick: () => setConfirmModal(true),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="Month-End Accounting Period Lock"
        subtitle="Lock accounting period vouchers and prevent unauthorized retroactive ledger edits"
        breadcrumbs={['SYSTEM', 'MONTH-END CLOSING']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Selected Period: {closingMonth}
          </span>
        }
      >
        <div className="flex flex-col h-full p-3 gap-3 font-mono text-xs max-w-2xl mx-auto">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1.5 border border-black">
              [ERROR] {error}
            </div>
          )}

          <div className="border-2 border-brand-border bg-brand-surface p-4 flex flex-col gap-3">
            <h2 className="text-base font-bold text-brand-ink border-b pb-2">
              PERIOD-END ACCOUNTING LOCK
            </h2>
            <p className="text-gray-700">
              Lock all sales, purchases, credit notes, and collection receipts in the selected month to ensure audit compliance and prevent accidental modifications.
            </p>

            <div className="my-2">
              <label className="font-bold text-black block mb-1">Select Accounting Month to Finalize:</label>
              <input
                type="month"
                value={closingMonth}
                onChange={(e) => setClosingMonth(e.target.value)}
                className="bg-white border border-brand-border px-3 py-1.5 font-bold text-sm"
              />
            </div>

            <div className="flex justify-center mt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(true)}
                className="bg-red-600 text-white font-bold px-8 py-2.5 text-sm border-2 border-black hover:bg-red-700 cursor-pointer shadow-[3px_3px_0px_0px_#000]"
              >
                [F8: LOCK ACCOUNTING MONTH]
              </button>
            </div>
          </div>

          {/* Success */}
          {successInfo && (
            <div className="border-2 border-green-500 bg-green-50 p-4 font-bold text-green-900 text-center">
              ✓ Month-End closing completed for {successInfo.closedMonth}. All vouchers in this period are now locked.
            </div>
          )}
        </div>
      </DosWindow>

      {/* Confirmation Modal */}
      {confirmModal && (
        <DosModal
          isOpen={true}
          onClose={() => setConfirmModal(false)}
          title="CONFIRM MONTH-END PERIOD LOCK"
          width="max-w-md"
          variant="danger"
          confirmText="[Enter: Confirm Month-End Lock]"
          cancelText="[ESC: Cancel]"
          onConfirm={handleConfirmClosing}
        >
          <div className="flex flex-col gap-2 font-mono text-xs">
            <p className="font-bold text-red-700">
              Permanently lock accounting month {closingMonth}?
            </p>
            <p className="text-gray-600">
              Once locked, transactions for {closingMonth} cannot be edited or reversed without supervisor authorization.
            </p>
          </div>
        </DosModal>
      )}
    </div>
  );
}
