'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { searchInvoicesForReprint, getInvoicePrintData } from './actions';
import { PrintPreviewModal } from '@/components/print/PrintPreviewModal';
import { PrintInvoiceData } from '@/lib/print';

export default function InvoiceReprintPage() {
  const [query, setQuery] = useState('');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [copyType, setCopyType] = useState<'ORIGINAL' | 'DUPLICATE' | 'TRIPLICATE' | 'TRANSPORT'>('DUPLICATE');
  const [printData, setPrintData] = useState<PrintInvoiceData | null>(null);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadInvoices = async (searchTxt = '') => {
    setLoading(true);
    setError(null);
    const res = await searchInvoicesForReprint(searchTxt);
    if (res.success) {
      setInvoices(res.invoices);
      setSelectedIndex(0);
    } else {
      setError(res.error || 'Failed to load invoices');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const handleOpenPrint = async (invId: string) => {
    setError(null);
    const res = await getInvoicePrintData(invId, copyType);
    if (res.success && res.printData) {
      setPrintData(res.printData);
      setShowPrintModal(true);
    } else {
      setError(res.error || 'Failed to load invoice print data');
    }
  };

  const actions: DosAction[] = [
    {
      keyLabel: 'F2',
      label: 'Search Bill',
      onClick: () => {
        const input = document.getElementById('search-query-input');
        if (input) input.focus();
      },
    },
    {
      keyLabel: 'F8',
      label: 'Print Preview',
      variant: 'primary',
      disabled: invoices.length === 0,
      onClick: () => {
        if (invoices[selectedIndex]) {
          handleOpenPrint(invoices[selectedIndex].id);
        }
      },
    },
    {
      keyLabel: 'F5',
      label: 'Refresh',
      onClick: () => loadInvoices(query),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="DUPLICATE INVOICE PRINTING"
        subtitle="PRINT ORIGINAL, DUPLICATE, TRIPLICATE, AND TRANSPORT COPIES"
        breadcrumbs={['BILLING', 'INVOICE REPRINT']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            INVOICES FOUND: {invoices.length} | COPY TYPE: {copyType}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1 border border-black">
              [ERROR] {error}
            </div>
          )}

          {/* Search & Filter Header */}
          <div className="bg-brand-surface border border-brand-border p-2 grid grid-cols-12 gap-2 items-center">
            <div className="col-span-6 flex items-center gap-2">
              <label className="font-bold text-brand-ink whitespace-nowrap">Search Invoice / Customer:</label>
              <input
                id="search-query-input"
                type="text"
                placeholder="Search by invoice number or customer name..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  loadInvoices(e.target.value);
                }}
                className="w-full bg-white border border-brand-border px-2 py-1 font-bold text-black"
              />
            </div>

            <div className="col-span-4 flex items-center gap-2">
              <label className="font-bold text-brand-ink whitespace-nowrap">Copy Type:</label>
              <select
                value={copyType}
                onChange={(e) => setCopyType(e.target.value as any)}
                className="w-full bg-white border border-brand-border px-2 py-1 font-bold"
              >
                <option value="DUPLICATE">Duplicate Copy</option>
                <option value="ORIGINAL">Original (Recipient)</option>
                <option value="TRIPLICATE">Triplicate (Supplier)</option>
                <option value="TRANSPORT">Transport Copy</option>
              </select>
            </div>

            <div className="col-span-2 flex justify-end">
              <button
                type="button"
                onClick={() => loadInvoices(query)}
                className="bg-brand-ink text-white font-bold px-3 py-1 border border-black hover:bg-brand-amber"
              >
                [SEARCH]
              </button>
            </div>
          </div>

          {/* Invoices List Grid */}
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
                  <th className="w-24 px-2 py-1 text-right">TAXABLE</th>
                  <th className="w-20 px-2 py-1 text-right">TAX</th>
                  <th className="w-24 px-2 py-1 text-right">NET AMOUNT</th>
                  <th className="w-24 px-2 py-1 text-center">STATUS</th>
                  <th className="w-20 px-2 py-1 text-center">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-gray-500 font-bold">
                      Loading invoices...
                    </td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-gray-500 font-bold">
                      No invoices found matching search.
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
                          isSelected ? 'bg-cyan-100 font-bold' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        }`}
                      >
                        <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-1 font-bold text-brand-ink">{inv.invoiceNo}</td>
                        <td className="px-2 py-1 text-center">{inv.invoiceDate}</td>
                        <td className="px-2 py-1">
                          <span className="font-bold">{inv.customerName}</span>
                          <span className="text-gray-500 text-[10px] ml-1">({inv.customerCode})</span>
                        </td>
                        <td className="px-2 py-1 text-center">{inv.totalItemsCount}</td>
                        <td className="px-2 py-1 text-right">{inv.totalQuantity}</td>
                        <td className="px-2 py-1 text-right">₹ {inv.taxableAmount.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right text-gray-600">₹ {inv.totalTaxAmount.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right font-bold text-brand-amber">₹ {inv.netAmount.toFixed(2)}</td>
                        <td className="px-2 py-1 text-center">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold ${
                              inv.isCancelled
                                ? 'bg-red-600 text-white'
                                : 'bg-green-600 text-white'
                            }`}
                          >
                            {inv.isCancelled ? 'CANCELLED' : inv.status}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPrint(inv.id);
                            }}
                            className="bg-brand-ink text-white px-2 py-0.5 font-bold hover:bg-brand-amber text-[10px]"
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

      {/* Print Preview Modal */}
      {printData && (
        <PrintPreviewModal
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          invoiceData={printData}
        />
      )}
    </div>
  );
}
