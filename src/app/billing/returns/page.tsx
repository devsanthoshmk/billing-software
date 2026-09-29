'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import { ProductSearchModal } from '../../masters/products/ProductSearchModal';
import { BatchPickerModal, BatchItem } from '../components/BatchPickerModal';
import {
  createSalesReturn,
  getCustomerInvoicesForReturn,
  SalesReturnItemInput,
} from './actions';
import { getBillingInitialData, getBatchesForProduct } from '../actions';
import { roundToPaise } from '@/lib/business-engine/calculations';

export default function SalesReturnsPage() {
  const [systemDate, setSystemDate] = useState(new Date().toISOString().split('T')[0]);
  const [operator, setOperator] = useState('ADMIN');
  const [returnType, setReturnType] = useState<'CREDIT_NOTE' | 'CASH_REFUND' | 'REPLACEMENT'>('CREDIT_NOTE');
  const [reason, setReason] = useState<'EXPIRED' | 'DAMAGED' | 'RATE_DIFFERENCE' | 'EXCESS_STOCK'>('EXPIRED');

  // Master lists
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [salesmenList, setSalesmenList] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);

  // Invoices for return
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');

  // Modals
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [showBatchPicker, setShowBatchPicker] = useState(false);
  const [batchList, setBatchList] = useState<BatchItem[]>([]);
  const [activeRowIdx, setActiveRowIdx] = useState(0);

  // Lines
  const [lines, setLines] = useState<
    Array<
      SalesReturnItemInput & {
        productCode: string;
        productName: string;
        mrp: number;
      }
    >
  >([]);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [returnSuccess, setReturnSuccess] = useState<{
    returnNo: string;
    grandTotal: number;
  } | null>(null);

  useEffect(() => {
    async function loadData() {
      const data = await getBillingInitialData();
      setCustomersList(data.customers);
      setSalesmenList(data.salesmen);
      if (data.customers.length > 0) {
        setSelectedCustomerId(data.customers[0].id);
        setSelectedCustomer(data.customers[0]);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedCustomerId) return;
    async function loadInvoices() {
      const invs = await getCustomerInvoicesForReturn(selectedCustomerId);
      setCustomerInvoices(invs);
    }
    loadInvoices();
  }, [selectedCustomerId]);

  const handleSelectCustomer = (id: string) => {
    const cust = customersList.find((c) => c.id === id);
    setSelectedCustomerId(id);
    setSelectedCustomer(cust || null);
    setSelectedInvoiceId('');
  };

  const handleSelectProduct = async (prod: any, chosenBatch?: any) => {
    try {
      let batch = chosenBatch;
      if (!batch) {
        const batches = await getBatchesForProduct(prod.id);
        batch = batches[0];
      }

      if (!batch) {
        setErrorMessage(`No batches found for ${prod.name}`);
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
        rate: batch.sellingRate,
        purchaseRate: batch.purchaseRate,
        mrp: batch.mrp,
        discountPct: selectedCustomer?.defaultDiscountPct || 0,
        taxCode: prod.taxCode || '02',
        restockInventory: reason === 'EXCESS_STOCK', // Damage / Expired defaults to quarantine
        reason,
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
          purchaseRate: b.purchaseRate,
          mrp: b.mrp,
        };
      }
      return next;
    });
    setShowBatchPicker(false);
  };

  // Populate from original invoice items
  const handleLoadInvoiceItems = (invId: string) => {
    setSelectedInvoiceId(invId);
    const inv = customerInvoices.find((i) => i.id === invId);
    if (!inv || !inv.items) return;

    const imported = inv.items.map((item: any) => ({
      productId: item.productId,
      productCode: item.productCode || 'ITEM',
      productName: item.productName,
      batchId: item.batchId,
      batchNo: item.batchNo,
      expiryDate: item.expiryDate,
      quantity: item.quantity,
      freeQuantity: item.freeQuantity || 0,
      rate: item.sellingRate,
      purchaseRate: item.purchaseRate,
      mrp: item.mrp,
      discountPct: item.tradeDiscountPct || 0,
      taxCode: item.taxCode || '02',
      restockInventory: reason === 'EXCESS_STOCK',
      reason,
    }));

    setLines(imported);
  };

  // Compute live totals
  let totalGross = 0;
  let totalDisc = 0;
  let totalNet = 0;

  for (const l of lines) {
    const gross = roundToPaise(l.quantity * l.rate);
    const disc = roundToPaise((gross * (l.discountPct || 0)) / 100);
    totalGross += gross;
    totalDisc += disc;
    totalNet += (gross - disc);
  }
  const grandTotal = Math.round(totalNet);

  const handleSubmitReturn = async () => {
    setErrorMessage(null);
    if (lines.length === 0) {
      setErrorMessage('Add at least 1 return line item.');
      return;
    }
    if (!selectedCustomerId) {
      setErrorMessage('Customer is mandatory.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createSalesReturn({
        customerId: selectedCustomerId,
        originalInvoiceId: selectedInvoiceId || null,
        returnDate: systemDate,
        returnType,
        reason,
        operatorId: operator,
        items: lines.map((l) => ({
          productId: l.productId,
          batchId: l.batchId,
          batchNo: l.batchNo,
          expiryDate: l.expiryDate,
          quantity: l.quantity,
          freeQuantity: l.freeQuantity || 0,
          rate: l.rate,
          purchaseRate: l.purchaseRate,
          discountPct: l.discountPct || 0,
          taxCode: l.taxCode,
          restockInventory: l.restockInventory,
          reason: l.reason || reason,
        })),
      });

      if (res.success && res.returnNo) {
        setReturnSuccess({
          returnNo: res.returnNo,
          grandTotal: res.grandTotal || grandTotal,
        });
        setLines([]);
      } else {
        setErrorMessage(res.error || 'Failed to create sales return');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error processing sales return');
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
      label: 'Save Return',
      variant: 'primary',
      onClick: handleSubmitReturn,
      disabled: isSubmitting || lines.length === 0,
    },
    {
      keyLabel: 'F12',
      label: 'Clear',
      variant: 'danger',
      onClick: () => setLines([]),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="SALES RETURN PREPARATION (SRETPRE.PRG)"
        subtitle="CREDIT NOTE / RESTOCK & QUARANTINE ROUTING"
        breadcrumbs={['BILLING', 'SALES RETURNS']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            ITEMS: {lines.length} | CREDIT: ₹ {grandTotal.toFixed(2)}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {errorMessage && (
            <div className="bg-red-600 text-white font-bold p-1.5 border border-black">
              [ERROR] {errorMessage}
            </div>
          )}

          {/* Header */}
          <div className="bg-brand-surface border border-brand-border p-2 grid grid-cols-12 gap-2 items-center">
            <div className="col-span-3 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Customer:</label>
              <select
                value={selectedCustomerId}
                onChange={(e) => handleSelectCustomer(e.target.value)}
                className="w-full bg-[#00AAAA] text-black font-bold px-1.5 py-0.5 border border-black focus:outline-none"
              >
                {customersList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-3 flex items-center gap-1">
              <label className="font-bold text-brand-ink whitespace-nowrap">Link Bill:</label>
              <select
                value={selectedInvoiceId}
                onChange={(e) => handleLoadInvoiceItems(e.target.value)}
                className="w-full bg-white border border-brand-border px-1 py-0.5"
              >
                <option value="">-- Ad-Hoc Direct Return --</option>
                {customerInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNo} ({inv.invoiceDate}) - ₹{inv.netAmount}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Return Type:</label>
              <select
                value={returnType}
                onChange={(e) => setReturnType(e.target.value as any)}
                className="w-full bg-white border border-brand-border px-1 py-0.5 font-bold"
              >
                <option value="CREDIT_NOTE">Credit Note</option>
                <option value="CASH_REFUND">Cash Refund</option>
                <option value="REPLACEMENT">Replacement</option>
              </select>
            </div>

            <div className="col-span-2 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Reason:</label>
              <select
                value={reason}
                onChange={(e) => {
                  const r = e.target.value as any;
                  setReason(r);
                  // Update all lines restock flag
                  setLines((prev) =>
                    prev.map((l) => ({
                      ...l,
                      reason: r,
                      restockInventory: r === 'EXCESS_STOCK',
                    }))
                  );
                }}
                className="w-full bg-white border border-brand-border px-1 py-0.5"
              >
                <option value="EXPIRED">Expired</option>
                <option value="DAMAGED">Damaged / Broken</option>
                <option value="EXCESS_STOCK">Excess Stock</option>
                <option value="RATE_DIFFERENCE">Rate Diff</option>
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
          </div>

          {/* Grid */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white min-h-48">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="w-20 px-2 py-1 text-left">CODE</th>
                  <th className="px-2 py-1 text-left">PRODUCT NAME</th>
                  <th className="w-24 px-2 py-1 text-center">BATCH</th>
                  <th className="w-20 px-2 py-1 text-center">EXPY</th>
                  <th className="w-16 px-2 py-1 text-right">QTY</th>
                  <th className="w-20 px-2 py-1 text-right">RATE</th>
                  <th className="w-20 px-2 py-1 text-right">DISC%</th>
                  <th className="w-24 px-2 py-1 text-right">VALUE</th>
                  <th className="w-32 px-2 py-1 text-center">DISPOSITION</th>
                  <th className="w-8 px-1 py-1 text-center">DEL</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-gray-500 font-bold">
                      <div className="flex flex-col items-center gap-2">
                        <span>--- NO RETURN ITEMS ENTERED ---</span>
                        <button
                          type="button"
                          onClick={() => setShowProductSearch(true)}
                          className="bg-brand-ink text-white px-3 py-1 font-bold hover:bg-brand-amber cursor-pointer"
                        >
                          [F2: Search & Add Return Items]
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  lines.map((l, idx) => {
                    const gross = roundToPaise(l.quantity * l.rate);
                    const disc = roundToPaise((gross * (l.discountPct || 0)) / 100);
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
                            value={l.rate}
                            onChange={(e) => {
                              const r = parseFloat(e.target.value) || 0;
                              setLines((prev) => {
                                const n = [...prev];
                                n[idx] = { ...n[idx], rate: r };
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
                            value={l.discountPct}
                            onChange={(e) => {
                              const d = parseFloat(e.target.value) || 0;
                              setLines((prev) => {
                                const n = [...prev];
                                n[idx] = { ...n[idx], discountPct: d };
                                return n;
                              });
                            }}
                            className="w-14 text-right bg-white border border-brand-border px-1 py-0.5"
                          />
                        </td>
                        <td className="px-2 py-1 text-right font-bold">{net.toFixed(2)}</td>
                        <td className="px-2 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setLines((prev) => {
                                const n = [...prev];
                                n[idx] = { ...n[idx], restockInventory: !n[idx].restockInventory };
                                return n;
                              });
                            }}
                            className={`px-1.5 py-0.5 font-bold text-[10px] border ${
                              l.restockInventory
                                ? 'bg-green-100 text-green-800 border-green-400'
                                : 'bg-red-100 text-red-800 border-red-400'
                            }`}
                          >
                            {l.restockInventory ? 'RESTOCK SALEABLE' : 'QUARANTINE'}
                          </button>
                        </td>
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
                <span className="text-xs text-gray-500 block uppercase">Total Return Credit</span>
                <span className="text-xl font-bold text-brand-amber">₹ {grandTotal.toFixed(2)}</span>
              </div>
              <button
                type="button"
                onClick={handleSubmitReturn}
                disabled={isSubmitting || lines.length === 0}
                className="bg-brand-ink text-white font-bold px-6 py-2 border-2 border-black hover:bg-brand-amber disabled:opacity-50"
              >
                {isSubmitting ? 'PROCESSING...' : '[F5: COMMIT RETURN & CREDIT NOTE]'}
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
          title="SALES RETURN RECORDED"
          width="max-w-md"
          confirmText="[Enter: Prepare Next Return]"
          cancelText="[ESC: Close]"
          onConfirm={() => setReturnSuccess(null)}
        >
          <div className="flex flex-col gap-2 font-mono text-xs text-center py-2">
            <div className="bg-green-100 text-green-900 p-2 font-bold border border-green-400">
              CREDIT NOTE ISSUED & INVENTORY ROUTED
            </div>
            <div className="text-base font-bold text-brand-ink">
              CREDIT NOTE NO: {returnSuccess.returnNo}
            </div>
            <div className="text-lg font-bold text-brand-amber">
              AMOUNT: ₹ {returnSuccess.grandTotal.toFixed(2)}
            </div>
            <div className="text-gray-500 text-[11px]">
              Customer balance credited. Stock segregated according to disposition rules.
            </div>
          </div>
        </DosModal>
      )}
    </div>
  );
}
