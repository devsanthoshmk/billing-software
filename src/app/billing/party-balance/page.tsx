'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import { getPartyBalances, generatePartyBalanceSlip } from './actions';

export default function PartyBalancePrintingPage() {
  const [areas, setAreas] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [slipFormat, setSlipFormat] = useState<'40COL' | '80COL'>('40COL');
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (area = '') => {
    setLoading(true);
    setError(null);
    const res = await getPartyBalances(area);
    if (res.success) {
      setAreas(res.areas);
      setCustomers(res.customers);
      setSelectedIndex(0);
    } else {
      setError(res.error || 'Failed to load customer balances');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePrintSlip = async (custId: string) => {
    setError(null);
    const res = await generatePartyBalanceSlip(custId, slipFormat);
    if (res.success && res.slipText) {
      setPreviewText(res.slipText);
    } else {
      setError(res.error || 'Failed to generate balance statement.');
    }
  };

  const actions: DosAction[] = [
    {
      keyLabel: 'F8',
      label: 'Print Statement',
      variant: 'primary',
      disabled: customers.length === 0,
      onClick: () => {
        if (customers[selectedIndex]) {
          handlePrintSlip(customers[selectedIndex].id);
        }
      },
    },
    {
      keyLabel: 'F5',
      label: 'Refresh',
      onClick: () => loadData(selectedAreaId),
    },
  ];

  const totalOutstandingSum = customers.reduce((acc, c) => acc + (c.closingBalance || 0), 0);

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="CUSTOMER BALANCE STATEMENT"
        subtitle="CUSTOMER OUTSTANDING BALANCES & DUES STATEMENT PRINTING"
        breadcrumbs={['BILLING', 'CUSTOMER BALANCES']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            CUSTOMERS: {customers.length} | TOTAL OUTSTANDING: ₹ {totalOutstandingSum.toFixed(2)}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1 border border-black">
              [ERROR] {error}
            </div>
          )}

          {/* Area Filter & Format Selector */}
          <div className="bg-brand-surface border border-brand-border p-2 grid grid-cols-12 gap-2 items-center">
            <div className="col-span-6 flex items-center gap-2">
              <label className="font-bold text-brand-ink whitespace-nowrap">Filter by Area:</label>
              <select
                value={selectedAreaId}
                onChange={(e) => {
                  setSelectedAreaId(e.target.value);
                  loadData(e.target.value);
                }}
                className="w-full bg-white border border-brand-border px-2 py-1 font-bold"
              >
                <option value="">-- All Areas --</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-4 flex items-center gap-2">
              <label className="font-bold text-brand-ink whitespace-nowrap">Print Format:</label>
              <select
                value={slipFormat}
                onChange={(e) => setSlipFormat(e.target.value as any)}
                className="w-full bg-white border border-brand-border px-2 py-1 font-bold"
              >
                <option value="40COL">40-Column Thermal Slip</option>
                <option value="80COL">80-Column Statement</option>
              </select>
            </div>

            <div className="col-span-2 flex justify-end">
              <button
                type="button"
                onClick={() => loadData(selectedAreaId)}
                className="bg-brand-ink text-white font-bold px-3 py-1 border border-black hover:bg-brand-amber"
              >
                [FILTER]
              </button>
            </div>
          </div>

          {/* Customer Ledger Table */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="w-20 px-2 py-1 text-left">CODE</th>
                  <th className="px-2 py-1 text-left">CUSTOMER NAME</th>
                  <th className="w-28 px-2 py-1 text-left">AREA</th>
                  <th className="w-28 px-2 py-1 text-left">PHONE</th>
                  <th className="w-24 px-2 py-1 text-right">CREDIT LIMIT</th>
                  <th className="w-20 px-2 py-1 text-center">DAYS</th>
                  <th className="w-28 px-2 py-1 text-right">OUTSTANDING</th>
                  <th className="w-20 px-2 py-1 text-center">PRINT</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-500 font-bold">
                      Loading customer balances...
                    </td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-500 font-bold">
                      No customers found for the selected area.
                    </td>
                  </tr>
                ) : (
                  customers.map((cust, idx) => {
                    const isSelected = idx === selectedIndex;
                    const hasOverdue = (cust.closingBalance || 0) > (cust.creditLimit || 0);

                    return (
                      <tr
                        key={cust.id}
                        onClick={() => setSelectedIndex(idx)}
                        className={`border-b border-gray-200 cursor-pointer ${
                          isSelected ? 'bg-cyan-100 font-bold' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        }`}
                      >
                        <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-1 font-bold">{cust.code}</td>
                        <td className="px-2 py-1">
                          <span className="font-bold">{cust.name}</span>
                          <span className="text-gray-500 text-[10px] ml-1">({cust.address || 'LOCAL'})</span>
                        </td>
                        <td className="px-2 py-1 text-gray-600">{cust.areaName || 'MAIN'}</td>
                        <td className="px-2 py-1 text-gray-600">{cust.phone || '-'}</td>
                        <td className="px-2 py-1 text-right text-gray-600">
                          ₹ {(cust.creditLimit || 0).toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-center">{cust.creditDays || 21}d</td>
                        <td className={`px-2 py-1 text-right font-bold ${hasOverdue ? 'text-red-600' : 'text-brand-amber'}`}>
                          ₹ {(cust.closingBalance || 0).toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePrintSlip(cust.id);
                            }}
                            className="bg-brand-ink text-white px-2 py-0.5 text-[10px] font-bold hover:bg-brand-amber"
                          >
                            [PRINT]
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

      {/* Slip Preview Modal */}
      {previewText && (
        <DosModal
          isOpen={true}
          onClose={() => setPreviewText(null)}
          title="CUSTOMER BALANCE STATEMENT PREVIEW"
          width="max-w-2xl"
          confirmText="[Enter: Print]"
          cancelText="[ESC: Close]"
          actions={[
            {
              keyLabel: 'F9',
              label: 'Copy Text',
              onClick: () => {
                navigator.clipboard.writeText(previewText);
                alert('Balance statement copied to clipboard.');
              },
            },
          ]}
          onConfirm={() => {
            const printWin = window.open('', '_blank');
            if (printWin) {
              printWin.document.write(`<pre style="font-family: monospace; font-size: 12px;">${previewText}</pre>`);
              printWin.document.close();
              printWin.print();
            }
          }}
        >
          <div className="bg-black text-green-400 p-3 font-mono text-xs overflow-auto max-h-[60vh] border border-gray-700 whitespace-pre">
            {previewText}
          </div>
        </DosModal>
      )}
    </div>
  );
}
