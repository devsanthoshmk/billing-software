'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import { getStockTransferInitialData, recordStockTransfer } from './actions';
import { ProductSearchModal } from '@/app/masters/products/ProductSearchModal';

export default function StockTransfersPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [transferDate, setTransferDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [sourceDepot, setSourceDepot] = useState<string>('MAIN_DEPOT');
  const [destDepot, setDestDepot] = useState<string>('RETAIL_COUNTER');
  const [transferLines, setTransferLines] = useState<any[]>([]);
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [successInfo, setSuccessInfo] = useState<{ transferRef: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    async function init() {
      const res = await getStockTransferInitialData();
      if (res.success) {
        setProducts(res.products);
      }
    }
    init();
  }, []);

  const handleSelectProduct = (prod: any) => {
    const batch = prod.batches?.find((b: any) => b.stockQty > 0) || prod.batches?.[0];
    if (!batch) {
      setError(`No active stock in ${prod.name}`);
      return;
    }

    setTransferLines((prev) => [
      ...prev,
      {
        productId: prod.id,
        batchId: batch.id,
        productName: prod.name,
        packaging: prod.packaging,
        batchNo: batch.batchNo,
        availableStock: batch.stockQty,
        quantity: 1,
        destinationRack: 'RACK-A',
      },
    ]);
    setShowProductModal(false);
  };

  const handleSaveTransfer = async () => {
    setError(null);
    if (sourceDepot === destDepot) {
      setError('Source and Destination depots cannot be the same');
      return;
    }
    if (transferLines.length === 0) {
      setError('Add at least 1 item to transfer');
      return;
    }

    setIsSubmitting(true);
    const res = await recordStockTransfer({
      transferDate,
      sourceDepot,
      destinationDepot: destDepot,
      operator: 'ADMIN',
      transfers: transferLines.map((l) => ({
        productId: l.productId,
        batchId: l.batchId,
        batchNo: l.batchNo,
        quantity: l.quantity,
        destinationRack: l.destinationRack,
      })),
    });

    if (res.success && res.transferRef) {
      setSuccessInfo({ transferRef: res.transferRef });
      setTransferLines([]);
    } else {
      setError(res.error || 'Transfer failed');
    }
    setIsSubmitting(false);
  };

  const actions: DosAction[] = [
    {
      keyLabel: 'F2',
      label: 'Add Product',
      onClick: () => setShowProductModal(true),
    },
    {
      keyLabel: 'F5',
      label: 'Post Transfer Memo',
      variant: 'primary',
      disabled: isSubmitting || transferLines.length === 0,
      onClick: handleSaveTransfer,
    },
    {
      keyLabel: 'F12',
      label: 'Clear List',
      variant: 'danger',
      onClick: () => setTransferLines([]),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="Inter-Depot & Branch Stock Transfers"
        subtitle="Move batch inventory between central warehouse, cold storage, and retail counters"
        breadcrumbs={['Stock', 'Transfers', 'Inter-Depot Movement']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Items in Transfer Memo: {transferLines.length}
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
          <div className="bg-brand-surface border border-brand-border p-2 grid grid-cols-12 gap-2 items-center">
            <div className="col-span-2">
              <label className="font-bold text-brand-ink block">Transfer Date:</label>
              <input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                className="w-full bg-white border border-brand-border px-2 py-1 font-bold"
              />
            </div>

            <div className="col-span-4">
              <label className="font-bold text-brand-ink block">Source Location / Room:</label>
              <select
                value={sourceDepot}
                onChange={(e) => setSourceDepot(e.target.value)}
                className="w-full bg-white border border-brand-border px-2 py-1 font-bold text-brand-ink"
              >
                <option value="MAIN_DEPOT">1. Main Central Warehouse</option>
                <option value="COLD_ROOM">2. Cold Storage Unit (Vaccines / Biologicals)</option>
                <option value="QUARANTINE">3. Quarantine / Damaged Goods Bin</option>
                <option value="RETAIL_COUNTER">4. Front Retail Dispensing Counter</option>
              </select>
            </div>

            <div className="col-span-4">
              <label className="font-bold text-brand-ink block">Destination Location / Room:</label>
              <select
                value={destDepot}
                onChange={(e) => setDestDepot(e.target.value)}
                className="w-full bg-white border border-brand-border px-2 py-1 font-bold text-brand-amber"
              >
                <option value="RETAIL_COUNTER">4. Front Retail Dispensing Counter</option>
                <option value="MAIN_DEPOT">1. Main Central Warehouse</option>
                <option value="COLD_ROOM">2. Cold Storage Unit (Vaccines / Biologicals)</option>
                <option value="QUARANTINE">3. Quarantine / Damaged Goods Bin</option>
              </select>
            </div>

            <div className="col-span-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowProductModal(true)}
                className="bg-brand-ink text-white font-bold px-3 py-1 border border-black hover:bg-brand-amber cursor-pointer"
              >
                [+ Add Product (F2)]
              </button>
            </div>
          </div>

          {/* Transfer Grid */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="px-2 py-1 text-left">PRODUCT NAME</th>
                  <th className="w-24 px-2 py-1 text-left">PACKAGING</th>
                  <th className="w-28 px-2 py-1 text-center">BATCH NO</th>
                  <th className="w-24 px-2 py-1 text-right">AVAILABLE</th>
                  <th className="w-24 px-2 py-1 text-right">TRANSFER QTY</th>
                  <th className="w-28 px-2 py-1 text-center">TARGET RACK</th>
                  <th className="w-12 px-1 py-1 text-center">DEL</th>
                </tr>
              </thead>
              <tbody>
                {transferLines.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-500 font-bold">
                      --- NO ITEMS ADDED TO TRANSFER MEMO ---
                    </td>
                  </tr>
                ) : (
                  transferLines.map((it, idx) => (
                    <tr key={idx} className="border-b border-gray-200">
                      <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                      <td className="px-2 py-1 font-bold">{it.productName}</td>
                      <td className="px-2 py-1 text-gray-600">{it.packaging}</td>
                      <td className="px-2 py-1 text-center font-mono font-bold">{it.batchNo}</td>
                      <td className="px-2 py-1 text-right text-gray-600">{it.availableStock}</td>
                      <td className="px-1 py-0.5 text-right">
                        <input
                          type="number"
                          min="1"
                          max={it.availableStock}
                          value={it.quantity}
                          onChange={(e) => {
                            const val = Math.max(1, Math.min(it.availableStock, parseInt(e.target.value) || 1));
                            setTransferLines((prev) => {
                              const next = [...prev];
                              next[idx].quantity = val;
                              return next;
                            });
                          }}
                          className="w-20 text-right font-bold border border-brand-border px-1 py-0.5"
                        />
                      </td>
                      <td className="px-1 py-0.5 text-center">
                        <input
                          type="text"
                          value={it.destinationRack}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTransferLines((prev) => {
                              const next = [...prev];
                              next[idx].destinationRack = val;
                              return next;
                            });
                          }}
                          className="w-24 text-center border border-brand-border px-1 py-0.5 uppercase"
                        />
                      </td>
                      <td className="px-1 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => setTransferLines((prev) => prev.filter((_, i) => i !== idx))}
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
      {successInfo && (
        <DosModal
          isOpen={true}
          onClose={() => setSuccessInfo(null)}
          title="STOCK TRANSFER COMPLETED"
          width="max-w-md"
          confirmText="[Enter: OK]"
          onConfirm={() => setSuccessInfo(null)}
        >
          <div className="flex flex-col gap-2 font-mono text-xs text-center py-2">
            <div className="bg-green-100 text-green-800 p-2 border border-green-400 font-bold">
              WAREHOUSE INVENTORY REALLOCATED
            </div>
            <div className="text-base font-bold text-brand-ink">
              TRANSFER REF: {successInfo.transferRef}
            </div>
            <div className="text-gray-500 text-[11px]">
              Stock successfully deducted from source location and logged in destination registry.
            </div>
          </div>
        </DosModal>
      )}
    </div>
  );
}
