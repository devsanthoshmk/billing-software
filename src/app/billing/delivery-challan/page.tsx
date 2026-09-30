'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import { getDeliveryChallanInitialData, createDeliveryChallan, ChallanLineInput } from './actions';
import { ProductSearchModal } from '@/app/masters/products/ProductSearchModal';

export default function DeliveryChallanPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [challanDate, setChallanDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [transportName, setTransportName] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [lrNo, setLrNo] = useState<string>('');
  const [items, setItems] = useState<ChallanLineInput[]>([]);
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [successModal, setSuccessModal] = useState<{ challanNo: string; amount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    async function init() {
      const res = await getDeliveryChallanInitialData();
      if (res.success) {
        setCustomers(res.customers);
        setProducts(res.products);
        if (res.customers.length > 0) {
          setSelectedCustomerId(res.customers[0].id);
        }
      }
    }
    init();
  }, []);

  const handleSelectProduct = (prod: any) => {
    const batch = prod.batches?.find((b: any) => b.stockQty > 0) || prod.batches?.[0];
    if (!batch) {
      setError(`No stock batches available for ${prod.name}.`);
      return;
    }

    const newItem: ChallanLineInput = {
      productId: prod.id,
      batchId: batch.id,
      productName: prod.name,
      packaging: prod.packaging,
      hsnCode: prod.hsnCode,
      batchNo: batch.batchNo,
      expiryDate: batch.expiryDate,
      quantity: 1,
      freeQuantity: 0,
      sellingRate: batch.sellingRate,
      mrp: batch.mrp,
    };

    setItems((prev) => [...prev, newItem]);
    setShowProductModal(false);
  };

  const handleSaveChallan = async () => {
    setError(null);
    if (!selectedCustomerId) {
      setError('Please select a customer for the delivery challan.');
      return;
    }
    if (items.length === 0) {
      setError('Please add at least one item before saving.');
      return;
    }

    setIsSubmitting(true);
    const res = await createDeliveryChallan({
      customerId: selectedCustomerId,
      challanDate,
      transportName,
      destination,
      lrNo,
      preparedBy: 'OPERATOR',
      items,
    });

    if (res.success && res.challanNo) {
      setSuccessModal({ challanNo: res.challanNo, amount: res.totalAmount || 0 });
      setItems([]);
    } else {
      setError(res.error || 'Failed to save delivery challan.');
    }
    setIsSubmitting(false);
  };

  const actions: DosAction[] = [
    {
      keyLabel: 'F2',
      label: 'Add Item',
      onClick: () => setShowProductModal(true),
    },
    {
      keyLabel: 'F5',
      label: 'Save Challan',
      variant: 'primary',
      disabled: isSubmitting || items.length === 0,
      onClick: handleSaveChallan,
    },
    {
      keyLabel: 'F12',
      label: 'Clear All',
      variant: 'danger',
      onClick: () => setItems([]),
    },
  ];

  const totalValue = items.reduce((acc, it) => acc + it.quantity * it.sellingRate, 0);

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="DELIVERY CHALLAN ENTRY"
        subtitle="CREATE DELIVERY CHALLAN & PACKING SLIP FOR GOODS DISPATCH"
        breadcrumbs={['BILLING', 'DELIVERY CHALLAN', 'NEW CHALLAN']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            ITEMS: {items.length} | TOTAL VALUE: ₹ {totalValue.toFixed(2)}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1 border border-black">
              [ERROR] {error}
            </div>
          )}

          {/* Header Controls */}
          <div className="bg-brand-surface border border-brand-border p-2 grid grid-cols-12 gap-2">
            <div className="col-span-2">
              <label className="font-bold text-brand-ink block">Challan Date:</label>
              <input
                type="date"
                value={challanDate}
                onChange={(e) => setChallanDate(e.target.value)}
                className="w-full bg-white border border-brand-border px-1.5 py-0.5"
              />
            </div>

            <div className="col-span-5">
              <label className="font-bold text-brand-ink block">Customer Name:</label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full bg-[#00AAAA] text-black font-bold border border-black px-1.5 py-0.5"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name} ({c.addressLine1})
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-3">
              <label className="font-bold text-brand-ink block">Transport / Carrier:</label>
              <input
                type="text"
                placeholder="e.g. VRL Logistics"
                value={transportName}
                onChange={(e) => setTransportName(e.target.value)}
                className="w-full bg-white border border-brand-border px-1.5 py-0.5"
              />
            </div>

            <div className="col-span-2">
              <label className="font-bold text-brand-ink block">LR / Docket No:</label>
              <input
                type="text"
                placeholder="LR No..."
                value={lrNo}
                onChange={(e) => setLrNo(e.target.value)}
                className="w-full bg-white border border-brand-border px-1.5 py-0.5"
              />
            </div>
          </div>

          {/* Items Grid */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="px-2 py-1 text-left">PRODUCT NAME</th>
                  <th className="w-24 px-2 py-1 text-left">PACKING</th>
                  <th className="w-24 px-2 py-1 text-center">BATCH</th>
                  <th className="w-20 px-2 py-1 text-center">EXPIRY</th>
                  <th className="w-20 px-2 py-1 text-right">QTY</th>
                  <th className="w-16 px-2 py-1 text-right">FREE</th>
                  <th className="w-20 px-2 py-1 text-right">RATE</th>
                  <th className="w-24 px-2 py-1 text-right">VALUE</th>
                  <th className="w-10 px-1 py-1 text-center">DEL</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-gray-500 font-bold">
                      <div className="flex flex-col items-center gap-2">
                        <span>No items added to delivery challan</span>
                        <button
                          type="button"
                          onClick={() => setShowProductModal(true)}
                          className="bg-brand-ink text-white px-3 py-1 font-bold border border-black hover:bg-brand-amber"
                        >
                          [F2: Search & Add Product]
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => (
                    <tr key={idx} className="border-b border-gray-200">
                      <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                      <td className="px-2 py-1 font-bold">{it.productName}</td>
                      <td className="px-2 py-1 text-gray-600">{it.packaging}</td>
                      <td className="px-2 py-1 text-center font-bold">{it.batchNo}</td>
                      <td className="px-2 py-1 text-center text-gray-600">{it.expiryDate}</td>
                      <td className="px-1 py-0.5 text-right">
                        <input
                          type="number"
                          min="1"
                          value={it.quantity}
                          onChange={(e) => {
                            const val = Math.max(1, parseInt(e.target.value) || 1);
                            setItems((prev) => {
                              const next = [...prev];
                              next[idx].quantity = val;
                              return next;
                            });
                          }}
                          className="w-16 text-right font-bold border border-brand-border px-1 py-0.5"
                        />
                      </td>
                      <td className="px-1 py-0.5 text-right">
                        <input
                          type="number"
                          min="0"
                          value={it.freeQuantity}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setItems((prev) => {
                              const next = [...prev];
                              next[idx].freeQuantity = val;
                              return next;
                            });
                          }}
                          className="w-14 text-right border border-brand-border px-1 py-0.5"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">₹ {it.sellingRate.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right font-bold">
                        ₹ {(it.quantity * it.sellingRate).toFixed(2)}
                      </td>
                      <td className="px-1 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-red-600 font-bold hover:bg-red-100 px-1"
                        >
                          X
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DosWindow>

      {/* Product Search Modal */}
      {showProductModal && (
        <ProductSearchModal
          isOpen={showProductModal}
          onClose={() => setShowProductModal(false)}
          onSelectProduct={handleSelectProduct}
        />
      )}

      {/* Success Modal */}
      {successModal && (
        <DosModal
          isOpen={true}
          onClose={() => setSuccessModal(null)}
          title="DELIVERY CHALLAN SAVED"
          width="max-w-md"
          confirmText="[Enter: OK]"
          onConfirm={() => setSuccessModal(null)}
        >
          <div className="flex flex-col gap-3 font-mono text-xs text-center py-2">
            <div className="bg-green-100 text-green-900 p-2 border border-green-400 font-bold">
              Delivery Challan Saved Successfully
            </div>
            <div className="text-lg font-bold text-brand-ink">
              CHALLAN NO: {successModal.challanNo}
            </div>
            <div className="text-xl font-bold text-brand-amber">
              TOTAL VALUE: ₹ {successModal.amount.toFixed(2)}
            </div>
            <div className="text-gray-500 text-[11px]">
              Stock updated for dispatched items. Ready for delivery confirmation and invoice conversion.
            </div>
          </div>
        </DosModal>
      )}
    </div>
  );
}
