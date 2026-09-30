'use client';

import React, { useState } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import { runSystemRecalculation } from './actions';

export default function SystemRecalculatePage() {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunRecalculation = async () => {
    setIsRunning(true);
    setError(null);
    const res = await runSystemRecalculation('ADMIN');
    if (res.success) {
      setResult(res);
    } else {
      setError(res.error || 'Recalculation routine failed');
    }
    setIsRunning(false);
  };

  const actions: DosAction[] = [
    {
      keyLabel: 'F8',
      label: 'Recalculate Balances',
      variant: 'primary',
      disabled: isRunning,
      onClick: handleRunRecalculation,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="Stock & Balance Recalculation"
        subtitle="Recalculate batch inventory sums, customer ledger balances, and verify data consistency"
        breadcrumbs={['SYSTEM', 'RECALCULATE BALANCES']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Status: {isRunning ? 'Recalculating...' : 'Ready'}
          </span>
        }
      >
        <div className="flex flex-col h-full p-3 gap-3 font-mono text-xs max-w-3xl mx-auto">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1.5 border border-black">
              [ERROR] {error}
            </div>
          )}

          <div className="border-2 border-brand-border bg-brand-surface p-4 flex flex-col gap-3">
            <h2 className="text-base font-bold text-brand-ink border-b pb-2">
              STOCK & LEDGER BALANCE VERIFICATION
            </h2>
            <p className="text-gray-700 leading-relaxed">
              This routine audits and recalculates transaction balances across all records:
            </p>
            <ul className="list-disc pl-5 flex flex-col gap-1 text-gray-800">
              <li>Re-tallies product stock-on-hand totals directly from active product batch balances.</li>
              <li>Recomputes customer closing balances from open outstanding invoices and unallocated receipts.</li>
              <li>Resolves fractional rounding differences across all ledger accounts.</li>
              <li>Ensures data consistency and audit readiness across inventory and accounts.</li>
            </ul>

            <div className="mt-4 flex justify-center">
              <button
                type="button"
                disabled={isRunning}
                onClick={handleRunRecalculation}
                className="bg-brand-ink text-white font-bold px-8 py-2.5 text-sm border-2 border-black hover:bg-brand-amber cursor-pointer disabled:opacity-50 shadow-[3px_3px_0px_0px_#F05A28]"
              >
                {isRunning ? 'RECALCULATING INVENTORY & BALANCES...' : '[F8: RECALCULATE BALANCES NOW]'}
              </button>
            </div>
          </div>

          {/* Results Summary */}
          {result && (
            <div className="border-2 border-green-500 bg-green-50 p-4 flex flex-col gap-2">
              <div className="font-bold text-green-900 text-sm">
                ✓ Balance recalculation completed successfully with zero errors.
              </div>
              <div className="grid grid-cols-2 gap-3 mt-1">
                <div className="border p-2 bg-white">
                  <div className="text-gray-500 text-[10px]">PRODUCT INVENTORY</div>
                  <div className="font-bold text-base text-brand-ink">{result.totalProducts} Products Scanned</div>
                  <div className="text-green-700 font-bold">{result.fixedProducts} Balances Re-aligned</div>
                </div>
                <div className="border p-2 bg-white">
                  <div className="text-gray-500 text-[10px]">CUSTOMER BALANCES</div>
                  <div className="font-bold text-base text-brand-ink">{result.totalCustomers} Accounts Verified</div>
                  <div className="text-green-700 font-bold">{result.fixedCustomers} Ledgers Re-aligned</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DosWindow>
    </div>
  );
}
