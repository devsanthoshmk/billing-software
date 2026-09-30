'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import { ProductSearchModal } from '../../masters/products/ProductSearchModal';
import { BatchPickerModal, BatchItem } from '../components/BatchPickerModal';
import {
  createCreditOrDebitNote,
  getRecentNotes,
  getSuppliersList,
  NoteType,
  NoteItemInput,
} from './actions';
import { getBillingInitialData, getBatchesForProduct } from '../actions';
import { roundToPaise } from '@/lib/business-engine/calculations';

export default function CreditDebitNotesPage() {
  const [activeTab, setActiveTab] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [noteType, setNoteType] = useState<NoteType>('EXPIRY_BROKEN');
  const [systemDate, setSystemDate] = useState(new Date().toISOString().split('T')[0]);
  const [operator, setOperator] = useState('ADMIN');
  const [referenceInvoiceNo, setReferenceInvoiceNo] = useState('');

  // Master lists
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [suppliersList, setSuppliersList] = useState<any[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState('');

  // Recent notes table
  const [recentCreditNotes, setRecentCreditNotes] = useState<any[]>([]);
  const [recentDebitNotes, setRecentDebitNotes] = useState<any[]>([]);

  // Modals
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [showBatchPicker, setShowBatchPicker] = useState(false);
  const [batchList, setBatchList] = useState<BatchItem[]>([]);
  const [activeRowIdx, setActiveRowIdx] = useState(0);

  // Line items
  const [lines, setLines] = useState<
    Array<
      NoteItemInput & {
        productCode: string;
        productName: string;
        mrp: number;
      }
    >
  >([]);

  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noteSuccess, setNoteSuccess] = useState<{
    noteNo: string;
    totalAmount: number;
  } | null>(null);

  useEffect(() => {
    async function loadData() {
      const data = await getBillingInitialData();
      const customers = data.customers || [];
      let suppliers = data.suppliers || [];
      if (suppliers.length === 0) {
        suppliers = await getSuppliersList();
      }
      setCustomersList(customers);
      setSuppliersList(suppliers);
      if (activeTab === 'CREDIT') {
        setSelectedPartyId(customers[0]?.id || '');
      } else {
        setSelectedPartyId(suppliers[0]?.id || '');
      }
      refreshRecentNotes();
    }
    loadData();
  }, []);

  const refreshRecentNotes = async () => {
    try {
      const notes = await getRecentNotes();
      setRecentCreditNotes(notes.creditNotes);
      setRecentDebitNotes(notes.debitNotes);
    } catch {}
  };

  // Toggle Tab
  const handleTabChange = (tab: 'CREDIT' | 'DEBIT') => {
    setActiveTab(tab);
    setLines([]);
    if (tab === 'CREDIT') {
      setNoteType('EXPIRY_BROKEN');
      setSelectedPartyId(customersList[0]?.id || '');
    } else {
      setNoteType('SHORTAGE_DAMAGE');
      setSelectedPartyId(suppliersList[0]?.id || '');
    }
  };

  const handleSelectProduct = async (prod: any, chosenBatch?: any) => {
    try {
      let batch = chosenBatch;
      if (!batch) {
        const batches = await getBatchesForProduct(prod.id);
        batch = batches[0];
      }

      if (!batch) {
        setErrorMessage(`No stock batches available for ${prod.name}.`);
        return;
      }

      const defaultRate = batch.sellingRate;
      const newLine = {
        productId: prod.id,
        productCode: prod.code,
        productName: prod.name,
        batchId: batch.id,
        batchNo: batch.batchNo,
        expiryDate: batch.expiryDate,
        quantity: 1,
        rate: defaultRate,
        oldRate: noteType === 'RATE_DIFFERENCE' ? batch.sellingRate : undefined,
        newRate: noteType === 'RATE_DIFFERENCE' ? Math.max(0, batch.sellingRate - 5) : undefined,
        mrp: batch.mrp,
        discountPct: 0,
        taxCode: prod.taxCode || '02',
      };

      setLines((prev) => [...prev, newLine]);
      setShowProductSearch(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error selecting product');
    }
  };

  const handleOpenBatchPicker = async (idx: number) => {
    const line = lines[idx];
    if (!line) return;
    const batches = await getBatchesForProduct(line.productId);
    setBatchList(batches);
    setActiveRowIdx(idx);
    setShowBatchPicker(true);
  };

  const handleApplyBatch = (b: BatchItem) => {
    setLines((prev) => {
      const next = [...prev];
      if (next[activeRowIdx]) {
        next[activeRowIdx] = {
          ...next[activeRowIdx],
          batchId: b.id,
          batchNo: b.batchNo,
          expiryDate: b.expiryDate,
          rate: b.sellingRate,
          mrp: b.mrp,
        };
      }
      return next;
    });
    setShowBatchPicker(false);
  };

  // Live calculation of note totals
  let totalGross = 0;
  let totalNet = 0;

  for (const l of lines) {
    let effectiveRate = l.rate;
    if (noteType === 'RATE_DIFFERENCE' && l.oldRate !== undefined && l.newRate !== undefined) {
      effectiveRate = Math.max(0, l.oldRate - l.newRate);
    }
    const lineGross = roundToPaise(l.quantity * effectiveRate);
    const lineDisc = roundToPaise((lineGross * (l.discountPct || 0)) / 100);
    totalGross += lineGross;
    totalNet += (lineGross - lineDisc);
  }
  const grandTotal = Math.round(totalNet);

  const handleSubmitNote = async () => {
    setErrorMessage(null);
    if (lines.length === 0) {
      setErrorMessage('Please add at least one item before saving.');
      return;
    }
    if (!selectedPartyId) {
      setErrorMessage('Please select a party.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createCreditOrDebitNote({
        isDebitNote: activeTab === 'DEBIT',
        partyType: activeTab === 'CREDIT' ? 'CUSTOMER' : 'SUPPLIER',
        partyId: selectedPartyId,
        date: systemDate,
        noteType,
        referenceInvoiceNo,
        operatorId: operator,
        items: lines.map((l) => ({
          productId: l.productId,
          batchId: l.batchId,
          batchNo: l.batchNo,
          expiryDate: l.expiryDate,
          quantity: l.quantity,
          rate: l.rate,
          oldRate: l.oldRate,
          newRate: l.newRate,
          discountPct: l.discountPct || 0,
          taxCode: l.taxCode,
        })),
      });

      if (res.success && res.noteNo) {
        setNoteSuccess({
          noteNo: res.noteNo,
          totalAmount: res.totalAmount || grandTotal,
        });
        setLines([]);
        refreshRecentNotes();
      } else {
        setErrorMessage(res.error || 'Failed to save note.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving note.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const actions: DosAction[] = [
    {
      keyLabel: 'F2',
      label: 'Search Item',
      onClick: () => setShowProductSearch(true),
    },
    {
      keyLabel: 'F5',
      label: `Save ${activeTab === 'CREDIT' ? 'Credit' : 'Debit'} Note`,
      variant: 'primary',
      onClick: handleSubmitNote,
      disabled: isSubmitting || lines.length === 0,
    },
    {
      keyLabel: 'F12',
      label: 'Clear All',
      variant: 'danger',
      onClick: () => setLines([]),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title={activeTab === 'CREDIT' ? 'CREDIT NOTE ENTRY' : 'DEBIT NOTE ENTRY'}
        subtitle="RATE DIFFERENCE & ADJUSTMENT NOTES"
        breadcrumbs={['BILLING', 'CREDIT & DEBIT NOTES', activeTab === 'CREDIT' ? 'CREDIT NOTE' : 'DEBIT NOTE']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            ITEMS: {lines.length} | TOTAL: ₹ {grandTotal.toFixed(2)}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {errorMessage && (
            <div className="bg-red-600 text-white font-bold p-1.5 border border-black">
              [ERROR] {errorMessage}
            </div>
          )}

          {/* Mode Tabs */}
          <div className="flex gap-2 border-b border-brand-border pb-1">
            <button
              type="button"
              onClick={() => handleTabChange('CREDIT')}
              className={`px-4 py-1.5 font-bold cursor-pointer border ${
                activeTab === 'CREDIT'
                  ? 'bg-brand-ink text-white border-black'
                  : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
              }`}
            >
              Credit Notes (Customer)
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('DEBIT')}
              className={`px-4 py-1.5 font-bold cursor-pointer border ${
                activeTab === 'DEBIT'
                  ? 'bg-brand-ink text-white border-black'
                  : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
              }`}
            >
              Debit Notes (Supplier)
            </button>
          </div>

          {/* Header Controls */}
          <div className="bg-brand-surface border border-brand-border p-2 grid grid-cols-12 gap-2 items-center">
            <div className="col-span-4 flex items-center gap-1">
              <label className="font-bold text-brand-ink">
                {activeTab === 'CREDIT' ? 'Customer Name:' : 'Supplier Name:'}
              </label>
              <select
                value={selectedPartyId}
                onChange={(e) => setSelectedPartyId(e.target.value)}
                className="w-full bg-[#00AAAA] text-black font-bold px-1.5 py-0.5 border border-black focus:outline-none"
              >
                {activeTab === 'CREDIT'
                  ? customersList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.name}
                      </option>
                    ))
                  : suppliersList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code || s.name} - {s.name}
                      </option>
                    ))}
              </select>
            </div>

            <div className="col-span-3 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Note Type:</label>
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value as any)}
                className="w-full bg-white border border-brand-border px-1 py-0.5 font-bold"
              >
                {activeTab === 'CREDIT' ? (
                  <>
                    <option value="EXPIRY_BROKEN">Expiry / Breakage</option>
                    <option value="RATE_DIFFERENCE">Rate Difference</option>
                    <option value="OTHER">Other Credit</option>
                  </>
                ) : (
                  <>
                    <option value="SHORTAGE_DAMAGE">Shortage / Damage</option>
                    <option value="RATE_DIFFERENCE">Rate Difference</option>
                    <option value="OTHER">Other Debit</option>
                  </>
                )}
              </select>
            </div>

            <div className="col-span-3 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Ref Invoice No:</label>
              <input
                type="text"
                value={referenceInvoiceNo}
                onChange={(e) => setReferenceInvoiceNo(e.target.value.toUpperCase())}
                placeholder="Invoice or Challan No (optional)"
                className="w-full bg-white border border-brand-border px-1.5 py-0.5"
              />
            </div>

            <div className="col-span-2 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Date:</label>
              <input
                type="date"
                value={systemDate}
                onChange={(e) => setSystemDate(e.target.value)}
                className="w-full bg-white border border-brand-border px-1 py-0.5"
              />
            </div>
          </div>

          {/* Description banner */}
          <div className="bg-blue-50 border border-blue-300 p-1.5 text-blue-900 text-[11px]">
            {noteType === 'EXPIRY_BROKEN' && (
              <span>Expiry / Breakage: Credits the customer and moves expired or damaged items to quarantine stock.</span>
            )}
            {noteType === 'RATE_DIFFERENCE' && (
              <span>Rate Difference: Adjusts invoice pricing without moving inventory. Calculates (Old Rate - New Rate) × Qty.</span>
            )}
            {noteType === 'SHORTAGE_DAMAGE' && (
              <span>Shortage / Damage: Issues a debit note to the supplier for damaged or missing goods.</span>
            )}
          </div>

          {/* Lines Table */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white min-h-40">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="w-20 px-2 py-1 text-left">CODE</th>
                  <th className="px-2 py-1 text-left">PRODUCT NAME</th>
                  <th className="w-24 px-2 py-1 text-center">BATCH</th>
                  <th className="w-20 px-2 py-1 text-center">EXPIRY</th>
                  <th className="w-16 px-2 py-1 text-right">QTY</th>
                  {noteType === 'RATE_DIFFERENCE' ? (
                    <>
                      <th className="w-20 px-2 py-1 text-right">OLD RATE</th>
                      <th className="w-20 px-2 py-1 text-right">NEW RATE</th>
                      <th className="w-20 px-2 py-1 text-right">DIFF</th>
                    </>
                  ) : (
                    <th className="w-20 px-2 py-1 text-right">RATE</th>
                  )}
                  <th className="w-24 px-2 py-1 text-right">AMOUNT</th>
                  <th className="w-8 px-1 py-1 text-center">DEL</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-gray-500 font-bold">
                      <div className="flex flex-col items-center gap-2">
                        <span>No items added to note</span>
                        <button
                          type="button"
                          onClick={() => setShowProductSearch(true)}
                          className="bg-brand-ink text-white px-3 py-1 font-bold hover:bg-brand-amber cursor-pointer"
                        >
                          [F2: Search & Add Item]
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  lines.map((l, idx) => {
                    let effectiveRate = l.rate;
                    let diff = 0;
                    if (noteType === 'RATE_DIFFERENCE') {
                      diff = Math.max(0, (l.oldRate || 0) - (l.newRate || 0));
                      effectiveRate = diff;
                    }
                    const lineVal = roundToPaise(l.quantity * effectiveRate);

                    return (
                      <tr key={idx} className="border-b border-gray-200">
                        <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-1 font-bold">{l.productCode}</td>
                        <td className="px-2 py-1 font-bold">{l.productName}</td>
                        <td className="px-1 py-0.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenBatchPicker(idx)}
                            className="bg-brand-surface border border-brand-border px-1 py-0.5 text-xs font-bold truncate hover:bg-brand-amber hover:text-white"
                          >
                            {l.batchNo}
                          </button>
                        </td>
                        <td className="px-2 py-1 text-center">{l.expiryDate}</td>
                        <td className="px-1 py-0.5 text-right">
                          <input
                            type="number"
                            min="1"
                            value={l.quantity}
                            onChange={(e) => {
                              const q = Math.max(1, parseInt(e.target.value) || 1);
                              setLines((prev) => {
                                const n = [...prev];
                                n[idx] = { ...n[idx], quantity: q };
                                return n;
                              });
                            }}
                            className="w-14 text-right bg-white border border-brand-border px-1 py-0.5 font-bold"
                          />
                        </td>

                        {noteType === 'RATE_DIFFERENCE' ? (
                          <>
                            <td className="px-1 py-0.5 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={l.oldRate || 0}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value) || 0;
                                  setLines((prev) => {
                                    const n = [...prev];
                                    n[idx] = { ...n[idx], oldRate: v };
                                    return n;
                                  });
                                }}
                                className="w-16 text-right bg-white border border-brand-border px-1 py-0.5"
                              />
                            </td>
                            <td className="px-1 py-0.5 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={l.newRate || 0}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value) || 0;
                                  setLines((prev) => {
                                    const n = [...prev];
                                    n[idx] = { ...n[idx], newRate: v };
                                    return n;
                                  });
                                }}
                                className="w-16 text-right bg-white border border-brand-border px-1 py-0.5"
                              />
                            </td>
                            <td className="px-2 py-1 text-right font-bold text-brand-amber">
                              {diff.toFixed(2)}
                            </td>
                          </>
                        ) : (
                          <td className="px-1 py-0.5 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={l.rate}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value) || 0;
                                setLines((prev) => {
                                    const n = [...prev];
                                    n[idx] = { ...n[idx], rate: v };
                                    return n;
                                });
                              }}
                              className="w-16 text-right bg-white border border-brand-border px-1 py-0.5 font-bold"
                            />
                          </td>
                        )}

                        <td className="px-2 py-1 text-right font-bold">{lineVal.toFixed(2)}</td>
                        <td className="px-1 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-red-600 font-bold hover:bg-red-100 px-1"
                            title="Remove item"
                          >
                            X
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="bg-brand-surface border border-brand-border p-2 flex justify-between items-center">
            <button
              type="button"
              onClick={() => setShowProductSearch(true)}
              className="bg-brand-paper border border-brand-border px-2 py-1 font-bold hover:bg-gray-100"
            >
              [+ Add Item (F2)]
            </button>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="text-xs text-gray-500 block uppercase">
                  Total {activeTab === 'CREDIT' ? 'Credit' : 'Debit'} Amount
                </span>
                <span className="text-xl font-bold text-brand-amber">₹ {grandTotal.toFixed(2)}</span>
              </div>
              <button
                type="button"
                onClick={handleSubmitNote}
                disabled={isSubmitting || lines.length === 0}
                className="bg-brand-ink text-white font-bold px-6 py-2 border-2 border-black hover:bg-brand-amber disabled:opacity-50"
              >
                {isSubmitting ? 'SAVING...' : `[F5: SAVE ${activeTab} NOTE]`}
              </button>
            </div>
          </div>
        </div>
      </DosWindow>

      {showProductSearch && (
        <ProductSearchModal
          isOpen={showProductSearch}
          onClose={() => setShowProductSearch(false)}
          onSelectProduct={handleSelectProduct}
        />
      )}

      {showBatchPicker && (
        <BatchPickerModal
          isOpen={showBatchPicker}
          onClose={() => setShowBatchPicker(false)}
          productName={lines[activeRowIdx]?.productName || ''}
          batches={batchList}
          currentBatchId={lines[activeRowIdx]?.batchId}
          onSelectBatch={handleApplyBatch}
        />
      )}

      {noteSuccess && (
        <DosModal
          isOpen={true}
          onClose={() => setNoteSuccess(null)}
          title={`${activeTab} NOTE SAVED`}
          width="max-w-md"
          confirmText="[Enter: OK]"
          cancelText=""
          onConfirm={() => setNoteSuccess(null)}
        >
          <div className="flex flex-col gap-2 font-mono text-xs text-center py-2">
            <div className="bg-green-100 text-green-900 p-2 font-bold border border-green-400">
              Note Saved Successfully
            </div>
            <div className="text-base font-bold text-brand-ink">
              NOTE NO: {noteSuccess.noteNo}
            </div>
            <div className="text-lg font-bold text-brand-amber">
              AMOUNT: ₹ {noteSuccess.totalAmount.toFixed(2)}
            </div>
          </div>
        </DosModal>
      )}
    </div>
  );
}
