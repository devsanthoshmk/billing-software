'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import { ProductSearchModal } from '../../masters/products/ProductSearchModal';
import { InlineSupplierModal } from '../components/InlineSupplierModal';
import {
  createPurchaseInward,
  getPurchaseInitialData,
  PurchaseInwardLineItemInput,
} from '../inward/actions';
import { roundToPaise } from '@/lib/business-engine/calculations';

interface InwardLineRow extends PurchaseInwardLineItemInput {
  productCode: string;
  productName: string;
}

export default function PurchaseInwardPage() {
  const [operator, setOperator] = useState('');
  const [showOperatorModal, setShowOperatorModal] = useState(true);

  const [systemDate, setSystemDate] = useState(new Date().toISOString().split('T')[0]);
  const [supplierBillDate, setSupplierBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [supplierBillNo, setSupplierBillNo] = useState('');
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  );
  const [paymentTerms, setPaymentTerms] = useState<'CREDIT' | 'CASH'>('CREDIT');
  const [isInterstate, setIsInterstate] = useState(false);
  const [cashDiscountPct, setCashDiscountPct] = useState(0);

  // Suppliers & Products cache
  const [suppliersList, setSuppliersList] = useState<any[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);

  // Modals
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [showInlineSupplierModal, setShowInlineSupplierModal] = useState(false);

  // Line items
  const [lines, setLines] = useState<InwardLineRow[]>([]);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [grnSuccess, setGrnSuccess] = useState<{
    inwardNo: string;
    netAmount: number;
    totalUnits: number;
  } | null>(null);

  useEffect(() => {
    async function loadData() {
      const data = await getPurchaseInitialData();
      setSuppliersList(data.suppliers);
      if (data.suppliers.length > 0) {
        setSelectedSupplierId(data.suppliers[0].id);
        setSelectedSupplier(data.suppliers[0]);
      }
    }
    loadData();
  }, []);

  const handleSelectSupplier = (id: string) => {
    const sup = suppliersList.find((s) => s.id === id);
    setSelectedSupplierId(id);
    setSelectedSupplier(sup || null);
    if (sup?.gstin) {
      setIsInterstate(!sup.gstin.startsWith('33'));
    }
  };

  const handleSelectProduct = (prod: any) => {
    const defaultBatchNo = `B${Date.now().toString().slice(-5)}`;
    const nextYear = new Date().getFullYear() + 2;
    const defaultExpiry = `12/${nextYear.toString().slice(-2)}`;

    const pRate = 20.0;
    const margin = 25.0; // 25% default markup
    const sRate = roundToPaise(pRate * (1 + margin / 100));
    const mrp = roundToPaise(sRate * 1.4); // 40% retail markup

    const newLine: InwardLineRow = {
      productId: prod.id,
      productCode: prod.code,
      productName: prod.name,
      batchNo: defaultBatchNo,
      expiryMonthYear: defaultExpiry,
      quantity: 10,
      freeQuantity: 0,
      purchaseRate: pRate,
      targetMarginPct: margin,
      sellingRate: sRate,
      mrp,
      tradeDiscountPct: selectedSupplier?.defaultDiscountPct || 0,
      taxCode: prod.taxCode || '02',
    };

    setLines((prev) => [...prev, newLine]);
    setShowProductSearch(false);
  };

  // Handle margin change -> auto calculate selling rate
  const handleMarginChange = (idx: number, margin: number) => {
    setLines((prev) => {
      const next = [...prev];
      const item = next[idx];
      if (item) {
        const computedSrate = roundToPaise(item.purchaseRate * (1 + margin / 100));
        next[idx] = {
          ...item,
          targetMarginPct: margin,
          sellingRate: computedSrate,
        };
      }
      return next;
    });
  };

  // Handle purchase rate change -> recalculate selling rate based on margin
  const handlePurchaseRateChange = (idx: number, prate: number) => {
    setLines((prev) => {
      const next = [...prev];
      const item = next[idx];
      if (item) {
        const margin = item.targetMarginPct || 0;
        const computedSrate = roundToPaise(prate * (1 + margin / 100));
        next[idx] = {
          ...item,
          purchaseRate: prate,
          sellingRate: computedSrate,
        };
      }
      return next;
    });
  };

  // Live Totals
  let totalGross = 0;
  let totalDisc = 0;
  let totalTaxable = 0;
  let totalInwardUnits = 0;

  for (const l of lines) {
    const gross = roundToPaise(l.quantity * l.purchaseRate);
    const disc = roundToPaise((gross * (l.tradeDiscountPct || 0)) / 100);
    const taxable = gross - disc;

    totalGross += gross;
    totalDisc += disc;
    totalTaxable += taxable;
    totalInwardUnits += (l.quantity + (l.freeQuantity || 0));
  }

  const estGst = roundToPaise(totalTaxable * 0.12); // ~12% GST average
  const unroundedNet = totalTaxable + estGst;
  const grandTotal = Math.round(unroundedNet);

  const handleSubmitGRN = async () => {
    setErrorMessage(null);
    if (!selectedSupplierId) {
      setErrorMessage('Supplier is required');
      return;
    }
    if (!supplierBillNo.trim()) {
      setErrorMessage('Supplier Bill No is required');
      return;
    }
    if (lines.length === 0) {
      setErrorMessage('Add at least 1 inward item');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createPurchaseInward({
        supplierId: selectedSupplierId,
        supplierBillNo,
        supplierBillDate,
        inwardDate: systemDate,
        dueDate,
        paymentTerms,
        isInterstate,
        cashDiscountPct,
        operatorId: operator || 'ADMIN',
        lineItems: lines,
      });

      if (res.success && res.inwardNo) {
        setGrnSuccess({
          inwardNo: res.inwardNo,
          netAmount: res.netAmount || grandTotal,
          totalUnits: res.totalUnits || totalInwardUnits,
        });
        setLines([]);
        setSupplierBillNo('');
      } else {
        setErrorMessage(res.error || 'Failed to save purchase inward');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error processing purchase inward');
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
      keyLabel: '+',
      label: 'New Supplier',
      variant: 'amber',
      onClick: () => setShowInlineSupplierModal(true),
    },
    {
      keyLabel: 'F5',
      label: 'Save GRN',
      variant: 'primary',
      onClick: handleSubmitGRN,
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
      {/* Operator Modal */}
      {showOperatorModal && (
        <DosModal
          isOpen={true}
          onClose={() => {}}
          title="STOCKS INWARD OPERATOR"
          width="max-w-md"
          confirmText="[Enter: Confirm]"
          cancelText=""
          onConfirm={() => {
            if (!operator.trim()) setOperator('ADMIN');
            setShowOperatorModal(false);
          }}
        >
          <div className="flex flex-col gap-3 font-mono text-xs">
            <div className="bg-[#00AAAA] text-black font-bold p-2 text-center border border-black">
              STOCKS ENTERED BY █
            </div>
            <div className="flex items-center gap-2">
              <label className="font-bold text-brand-ink">OPERATOR INITIALS:</label>
              <input
                type="text"
                value={operator}
                onChange={(e) => setOperator(e.target.value.toUpperCase())}
                placeholder="ADMIN"
                className="w-full bg-white border border-brand-border px-2 py-1 font-bold uppercase focus:outline-brand-amber"
                autoFocus
              />
            </div>
          </div>
        </DosModal>
      )}

      {/* Main Window */}
      <DosWindow
        title="PRODUCT PURCHASE ENTRY SCREEN (PURCHASE.PRG / PURTRA.PRG)"
        subtitle={`OPERATOR: ${operator || 'ADMIN'} | GRN INWARD`}
        breadcrumbs={['STOCK', 'PURCHASE INWARD GRN']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            ITEMS: {lines.length} | TOTAL INWARD: ₹ {grandTotal.toFixed(2)}
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
              <label className="font-bold text-brand-ink whitespace-nowrap">Supplier:</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => handleSelectSupplier(e.target.value)}
                className="w-full bg-[#00AAAA] text-black font-bold px-1.5 py-0.5 border border-black focus:outline-none"
              >
                {suppliersList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowInlineSupplierModal(true)}
                className="bg-brand-amber text-white font-bold px-2 py-0.5 border border-black hover:bg-brand-amber/80"
                title="Register new supplier (+)"
              >
                +
              </button>
            </div>

            <div className="col-span-3 flex items-center gap-1">
              <label className="font-bold text-brand-ink whitespace-nowrap">Pur.Inv.No:</label>
              <input
                type="text"
                value={supplierBillNo}
                onChange={(e) => setSupplierBillNo(e.target.value.toUpperCase())}
                placeholder="INV-88912"
                className="w-full bg-white border border-brand-border px-1.5 py-0.5 font-bold uppercase"
                required
              />
            </div>

            <div className="col-span-2 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Bill Date:</label>
              <input
                type="date"
                value={supplierBillDate}
                onChange={(e) => setSupplierBillDate(e.target.value)}
                className="w-full bg-white border border-brand-border px-1 py-0.5"
              />
            </div>

            <div className="col-span-3 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Inward Date:</label>
              <input
                type="date"
                value={systemDate}
                onChange={(e) => setSystemDate(e.target.value)}
                className="w-full bg-white border border-brand-border px-1 py-0.5"
              />
            </div>

            <div className="col-span-3 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Terms:</label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value as any)}
                className="w-full bg-white border border-brand-border px-1 py-0.5 font-bold"
              >
                <option value="CREDIT">Credit (AP Balance)</option>
                <option value="CASH">Cash Inward</option>
              </select>
            </div>

            <div className="col-span-3 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Due Date:</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-white border border-brand-border px-1 py-0.5"
              />
            </div>

            <div className="col-span-3 flex items-center gap-1">
              <label className="font-bold text-brand-ink">GST Type:</label>
              <select
                value={isInterstate ? 'O' : 'L'}
                onChange={(e) => setIsInterstate(e.target.value === 'O')}
                className="w-full bg-white border border-brand-border px-1 py-0.5"
              >
                <option value="L">Local (CGST+SGST)</option>
                <option value="O">Interstate (IGST)</option>
              </select>
            </div>

            <div className="col-span-3 flex items-center gap-1">
              <label className="font-bold text-brand-ink">Cash Disc%:</label>
              <input
                type="number"
                step="0.01"
                value={cashDiscountPct}
                onChange={(e) => setCashDiscountPct(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-brand-border px-1 py-0.5 text-right"
              />
            </div>
          </div>

          {/* Inward Grid */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white min-h-48">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="w-20 px-2 py-1 text-left">CODE</th>
                  <th className="px-2 py-1 text-left">PRODUCT NAME</th>
                  <th className="w-24 px-2 py-1 text-center">BATCH</th>
                  <th className="w-20 px-2 py-1 text-center">EXPY (MM/YY)</th>
                  <th className="w-14 px-2 py-1 text-right">QTY</th>
                  <th className="w-14 px-2 py-1 text-right">FREE</th>
                  <th className="w-20 px-2 py-1 text-right">P.RATE</th>
                  <th className="w-16 px-2 py-1 text-right">MARGIN%</th>
                  <th className="w-20 px-2 py-1 text-right">S.RATE</th>
                  <th className="w-20 px-2 py-1 text-right">MRP</th>
                  <th className="w-16 px-2 py-1 text-right">DISC%</th>
                  <th className="w-24 px-2 py-1 text-right">VALUE</th>
                  <th className="w-8 px-1 py-1 text-center">DEL</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="text-center py-12 text-gray-500 font-bold">
                      <div className="flex flex-col items-center gap-2">
                        <span>--- NO INWARD ITEMS ENTERED ---</span>
                        <button
                          type="button"
                          onClick={() => setShowProductSearch(true)}
                          className="bg-brand-ink text-white px-3 py-1 font-bold hover:bg-brand-amber cursor-pointer"
                        >
                          [F2: Press to Search & Inward Products]
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  lines.map((l, idx) => {
                    const gross = roundToPaise(l.quantity * l.purchaseRate);
                    const disc = roundToPaise((gross * (l.tradeDiscountPct || 0)) / 100);
                    const taxable = gross - disc;

                    return (
                      <tr key={idx} className="border-b border-gray-200">
                        <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-1 font-bold">{l.productCode}</td>
                        <td className="px-2 py-1 font-bold">{l.productName}</td>
                        <td className="px-1 py-0.5 text-center">
                          <input
                            type="text"
                            value={l.batchNo}
                            onChange={(e) => {
                              const b = e.target.value.toUpperCase();
                              setLines((prev) => {
                                const n = [...prev];
                                n[idx] = { ...n[idx], batchNo: b };
                                return n;
                              });
                            }}
                            className="w-20 bg-white border border-brand-border px-1 py-0.5 text-center uppercase font-bold"
                          />
                        </td>
                        <td className="px-1 py-0.5 text-center">
                          <input
                            type="text"
                            placeholder="MM/YY"
                            value={l.expiryMonthYear}
                            onChange={(e) => {
                              const exp = e.target.value;
                              setLines((prev) => {
                                const n = [...prev];
                                n[idx] = { ...n[idx], expiryMonthYear: exp };
                                return n;
                              });
                            }}
                            className="w-16 bg-white border border-brand-border px-1 py-0.5 text-center"
                          />
                        </td>
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
                            min="0"
                            value={l.freeQuantity || 0}
                            onChange={(e) => {
                              const f = Math.max(0, parseInt(e.target.value) || 0);
                              setLines((prev) => {
                                const n = [...prev];
                                n[idx] = { ...n[idx], freeQuantity: f };
                                return n;
                              });
                            }}
                            className="w-12 text-right bg-white border border-brand-border px-1 py-0.5 text-green-700 font-bold"
                          />
                        </td>
                        <td className="px-1 py-0.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={l.purchaseRate}
                            onChange={(e) =>
                              handlePurchaseRateChange(idx, parseFloat(e.target.value) || 0)
                            }
                            className="w-16 text-right bg-white border border-brand-border px-1 py-0.5 font-bold"
                          />
                        </td>
                        <td className="px-1 py-0.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={l.targetMarginPct || 0}
                            onChange={(e) =>
                              handleMarginChange(idx, parseFloat(e.target.value) || 0)
                            }
                            className="w-14 text-right bg-amber-50 border border-brand-border px-1 py-0.5 text-brand-ink"
                            title="Markup % on Purchase Rate"
                          />
                        </td>
                        <td className="px-1 py-0.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={l.sellingRate}
                            onChange={(e) => {
                              const s = parseFloat(e.target.value) || 0;
                              setLines((prev) => {
                                const n = [...prev];
                                n[idx] = { ...n[idx], sellingRate: s };
                                return n;
                              });
                            }}
                            className="w-16 text-right bg-white border border-brand-border px-1 py-0.5 font-bold text-blue-700"
                          />
                        </td>
                        <td className="px-1 py-0.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={l.mrp}
                            onChange={(e) => {
                              const m = parseFloat(e.target.value) || 0;
                              setLines((prev) => {
                                const n = [...prev];
                                n[idx] = { ...n[idx], mrp: m };
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
                            value={l.tradeDiscountPct || 0}
                            onChange={(e) => {
                              const d = parseFloat(e.target.value) || 0;
                              setLines((prev) => {
                                const n = [...prev];
                                n[idx] = { ...n[idx], tradeDiscountPct: d };
                                return n;
                              });
                            }}
                            className="w-12 text-right bg-white border border-brand-border px-1 py-0.5"
                          />
                        </td>
                        <td className="px-2 py-1 text-right font-bold">{taxable.toFixed(2)}</td>
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
                  Net Inward Payable (Incl GST)
                </span>
                <span className="text-xl font-bold text-brand-amber">₹ {grandTotal.toFixed(2)}</span>
              </div>
              <button
                type="button"
                onClick={handleSubmitGRN}
                disabled={isSubmitting || lines.length === 0}
                className="bg-brand-ink text-white font-bold px-6 py-2 border-2 border-black hover:bg-brand-amber disabled:opacity-50"
              >
                {isSubmitting ? 'COMMITTING...' : '[F5: COMMIT STOCKS & ACCOUNTS PAYABLE]'}
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

      {showInlineSupplierModal && (
        <InlineSupplierModal
          isOpen={showInlineSupplierModal}
          onClose={() => setShowInlineSupplierModal(false)}
          onSupplierCreated={(newSup) => {
            setSuppliersList((prev) => [newSup, ...prev]);
            handleSelectSupplier(newSup.id);
          }}
        />
      )}

      {grnSuccess && (
        <DosModal
          isOpen={true}
          onClose={() => setGrnSuccess(null)}
          title="PURCHASE INWARD COMMITTED"
          width="max-w-md"
          confirmText="[Enter: OK]"
          cancelText=""
          onConfirm={() => setGrnSuccess(null)}
        >
          <div className="flex flex-col gap-2 font-mono text-xs text-center py-2">
            <div className="bg-green-100 text-green-900 p-2 font-bold border border-green-400">
              STOCKS ADDED & ACCOUNTS PAYABLE CREDITED
            </div>
            <div className="text-base font-bold text-brand-ink">
              GRN NO: {grnSuccess.inwardNo}
            </div>
            <div className="text-lg font-bold text-brand-amber">
              TOTAL UNITS: {grnSuccess.totalUnits} | NET AMOUNT: ₹ {grnSuccess.netAmount.toFixed(2)}
            </div>
          </div>
        </DosModal>
      )}
    </div>
  );
}
