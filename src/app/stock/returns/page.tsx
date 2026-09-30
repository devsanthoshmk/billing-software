'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import { ProductSearchModal } from '../../masters/products/ProductSearchModal';
import { BatchPickerModal, BatchItem } from '../../billing/components/BatchPickerModal';
import {
  createPurchaseReturn,
  getSupplierPurchasesForReturn,
  PurchaseReturnLineItemInput,
} from './actions';
import { getPurchaseInitialData } from '../inward/actions';
import { getBatchesForProduct } from '../../billing/actions';
import { roundToPaise } from '@/lib/business-engine/calculations';

export default function PurchaseReturnsPage() {
  const [systemDate, setSystemDate] = useState(new Date().toISOString().split('T')[0]);
  const [operator, setOperator] = useState('ADMIN');
  const [rateBasis, setRateBasis] = useState<'P' | 'S'>('P');
  const [discountPct, setDiscountPct] = useState(0);

  // Supplier & Bills cache
  const [suppliersList, setSuppliersList] = useState<any[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierPurchases, setSupplierPurchases] = useState<any[]>([]);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState('');

  // Transport
  const [lrNo, setLrNo] = useState('');
  const [transportName, setTransportName] = useState('');

  // Modals
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [showBatchPicker, setShowBatchPicker] = useState(false);
  const [batchList, setBatchList] = useState<BatchItem[]>([]);
  const [activeRowIdx, setActiveRowIdx] = useState(0);

  // Line items
  const [lines, setLines] = useState<
    Array<
      PurchaseReturnLineItemInput & {
        productCode: string;
        productName: string;
      }
    >
  >([]);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [returnSuccess, setReturnSuccess] = useState<{
    returnNo: string;
    netAmount: number;
  } | null>(null);

  useEffect(() => {
    async function loadData() {
      const data = await getPurchaseInitialData();
      setSuppliersList(data.suppliers);
      if (data.suppliers.length > 0) {
        setSelectedSupplierId(data.suppliers[0].id);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedSupplierId) return;
    async function loadPurchases() {
      const bills = await getSupplierPurchasesForReturn(selectedSupplierId);
      setSupplierPurchases(bills);
    }
    loadPurchases();
  }, [selectedSupplierId]);

  const handleSelectProduct = async (prod: any, chosenBatch?: any) => {
    try {
      let batch = chosenBatch;
      if (!batch) {
        const batches = await getBatchesForProduct(prod.id);
        const inStock = batches.filter((b) => b.stockQty > 0);
        batch = inStock[0] || batches[0];
      }

      if (!batch) {
        setErrorMessage(`No batches available for ${prod.name}`);
        return;
      }

      const newLine = {
        productId: prod.id,
        productCode: prod.code,
        productName: prod.name,
        batchId: batch.id,
        batchNo: batch.batchNo,
        expiryDate: batch.expiryDate,
        quantity: 1,
        freeQuantity: 0,
        purchaseRate: rateBasis === 'P' ? batch.purchaseRate : batch.sellingRate,
        mrp: batch.mrp,
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
          purchaseRate: rateBasis === 'P' ? b.purchaseRate : b.sellingRate,
          mrp: b.mrp,
        };
      }
      return next;
    });
    setShowBatchPicker(false);
  };

  // Populate from original purchase items
  const handleLoadPurchaseItems = (purchaseId: string) => {
    setSelectedPurchaseId(purchaseId);
    const pur = supplierPurchases.find((p) => p.id === purchaseId);
    if (!pur || !pur.items) return;

    const imported = pur.items.map((item: any) => ({
      productId: item.productId,
      productCode: 'ITEM',
      productName: item.batchNo ? `Batch ${item.batchNo}` : 'Product',
      batchId: item.batchId,
      batchNo: item.batchNo,
      expiryDate: item.expiryDate,
      quantity: item.quantity,
      freeQuantity: item.freeQuantity || 0,
      purchaseRate: item.purchaseRate,
      mrp: item.mrp,
      taxCode: item.taxCode || '02',
    }));

    setLines(imported);
  };

  // Live total
  let totalNet = 0;
  for (const l of lines) {
    const gross = roundToPaise(l.quantity * l.purchaseRate);
    const disc = roundToPaise((gross * discountPct) / 100);
    totalNet += (gross - disc);
  }
  const grandTotal = Math.round(totalNet);

  const handleSubmitReturn = async () => {
    setErrorMessage(null);
    if (!selectedSupplierId) {
      setErrorMessage('Please select a supplier.');
      return;
    }
    if (lines.length === 0) {
      setErrorMessage('Please add at least one product item to return.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createPurchaseReturn({
        supplierId: selectedSupplierId,
        purchaseId: selectedPurchaseId || undefined,
        returnDate: systemDate,
        rateBasis,
        discountPct,
        lrNo,
        transportName,
        operatorId: operator,
        lineItems: lines,
      });

      if (res.success && res.returnNo) {
        setReturnSuccess({
          returnNo: res.returnNo,
          netAmount: res.netAmount || grandTotal,
        });
        setLines([]);
      } else {
        setErrorMessage(res.error || 'Failed to process purchase return');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error creating purchase return');
    } finally {
      setIsSubmitting(false);
    }
  };

  const actions: DosAction[] = [
    {
      keyLabel: 'F2',
      label: 'Add Product',
      onClick: () => setShowProductSearch(true),
    },
    {
      keyLabel: 'F5',
      label: 'Save Return',
      variant: 'primary',
      onClick: handleSubmitReturn,
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
        title="Purchase Returns (Debit Note to Supplier)"
        subtitle="Issue debit notes to vendors and adjust inventory for returned batches"
        breadcrumbs={['Stock', 'Purchase Returns']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Items: {lines.length} | Total Return Value: ₹ {grandTotal.toFixed(2)}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {errorMessage && (
            <div className="bg-red-600 text-white font-bold p-1.5 border border-black">
              [ERROR] {errorMessage}
            </div>
          )}

          {/* Header Controls */}
          <div className="bg-brand-surface border border-brand-border p-2 grid grid-cols-12 gap-2 items-center">
            <div className="col-span-4 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Supplier:</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => {
                  setSelectedSupplierId(e.target.value);
                  setSelectedPurchaseId('');
                }}
                className="w-full bg-[#00AAAA] text-black font-bold px-1.5 py-0.5 border border-black focus:outline-none"
              >
                {suppliersList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-4 flex items-center gap-1">
              <label className="font-bold text-brand-ink whitespace-nowrap">Link Inward Bill:</label>
              <select
                value={selectedPurchaseId}
                onChange={(e) => handleLoadPurchaseItems(e.target.value)}
                className="w-full bg-white border border-brand-border px-1 py-0.5"
              >
                <option value="">-- Direct Supplier Return (Unlinked) --</option>
                {supplierPurchases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.inwardNo} ({p.inwardDate}) - ₹{p.netAmount}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Rate Basis:</label>
              <select
                value={rateBasis}
                onChange={(e) => setRateBasis(e.target.value as any)}
                className="w-full bg-white border border-brand-border px-1 py-0.5 font-bold"
              >
                <option value="P">Purchase Rate (Cost)</option>
                <option value="S">Selling Rate</option>
              </select>
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

            <div className="col-span-3 flex items-center gap-1">
              <label className="font-bold text-brand-ink">LR / Docket No:</label>
              <input
                type="text"
                value={lrNo}
                onChange={(e) => setLrNo(e.target.value.toUpperCase())}
                placeholder="Lorry Receipt No"
                className="w-full bg-white border border-brand-border px-1.5 py-0.5"
              />
            </div>

            <div className="col-span-4 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Transport:</label>
              <input
                type="text"
                value={transportName}
                onChange={(e) => setTransportName(e.target.value.toUpperCase())}
                placeholder="Transporter Name"
                className="w-full bg-white border border-brand-border px-1.5 py-0.5"
              />
            </div>

            <div className="col-span-2 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Disc%:</label>
              <input
                type="number"
                step="0.01"
                value={discountPct}
                onChange={(e) => setDiscountPct(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-brand-border px-1 py-0.5 text-right"
              />
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white min-h-48">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="w-20 px-2 py-1 text-left">ITEM CODE</th>
                  <th className="px-2 py-1 text-left">PRODUCT NAME</th>
                  <th className="w-24 px-2 py-1 text-center">BATCH NO</th>
                  <th className="w-20 px-2 py-1 text-center">EXPIRY</th>
                  <th className="w-16 px-2 py-1 text-right">RETURN QTY</th>
                  <th className="w-20 px-2 py-1 text-right">RETURN RATE</th>
                  <th className="w-24 px-2 py-1 text-right">NET VALUE</th>
                  <th className="w-8 px-1 py-1 text-center">DEL</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-500 font-bold">
                      <div className="flex flex-col items-center gap-2">
                        <span>--- NO RETURN ITEMS ENTERED ---</span>
                        <button
                          type="button"
                          onClick={() => setShowProductSearch(true)}
                          className="bg-brand-ink text-white px-3 py-1 font-bold hover:bg-brand-amber cursor-pointer"
                        >
                          [F2: Press to Search & Return Products]
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  lines.map((l, idx) => {
                    const gross = roundToPaise(l.quantity * l.purchaseRate);
                    const disc = roundToPaise((gross * discountPct) / 100);
                    const net = gross - disc;

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
                        <td className="px-1 py-0.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={l.purchaseRate}
                            onChange={(e) => {
                              const r = parseFloat(e.target.value) || 0;
                              setLines((prev) => {
                                const n = [...prev];
                                n[idx] = { ...n[idx], purchaseRate: r };
                                return n;
                              });
                            }}
                            className="w-18 text-right bg-white border border-brand-border px-1 py-0.5 font-bold"
                          />
                        </td>
                        <td className="px-2 py-1 text-right font-bold">{net.toFixed(2)}</td>
                        <td className="px-1 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-red-600 font-bold hover:bg-red-100 px-1"
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
              className="bg-brand-paper border border-brand-border px-2 py-1 font-bold text-brand-ink hover:bg-gray-100"
            >
              [+ Add Product (F2)]
            </button>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="text-xs text-gray-500 block uppercase">
                  Total Supplier Debit
                </span>
                <span className="text-xl font-bold text-brand-amber">₹ {grandTotal.toFixed(2)}</span>
              </div>
              <button
                type="button"
                onClick={handleSubmitReturn}
                disabled={isSubmitting || lines.length === 0}
                className="bg-brand-ink text-white font-bold px-6 py-2 border-2 border-black hover:bg-brand-amber disabled:opacity-50"
              >
                {isSubmitting ? 'PROCESSING...' : '[F5: COMMIT RETURN & DEBIT NOTE]'}
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

      {returnSuccess && (
        <DosModal
          isOpen={true}
          onClose={() => setReturnSuccess(null)}
          title="PURCHASE RETURN COMPLETED"
          width="max-w-md"
          confirmText="[Enter: OK]"
          cancelText=""
          onConfirm={() => setReturnSuccess(null)}
        >
          <div className="flex flex-col gap-2 font-mono text-xs text-center py-2">
            <div className="bg-green-100 text-green-900 p-2 font-bold border border-green-400">
              DEBIT NOTE ISSUED & STOCKS DEDUCTED
            </div>
            <div className="text-base font-bold text-brand-ink">
              RETURN NO: {returnSuccess.returnNo}
            </div>
            <div className="text-lg font-bold text-brand-amber">
              AMOUNT: ₹ {returnSuccess.netAmount.toFixed(2)}
            </div>
          </div>
        </DosModal>
      )}
    </div>
  );
}
