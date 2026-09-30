'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { getMultiMrpProducts } from './actions';

export default function MultiMrpPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const res = await getMultiMrpProducts();
    if (res.success) {
      setProducts(res.multiMrpProducts);
      setSelectedIndex(0);
      setSelectedProduct(res.multiMrpProducts[0] || null);
    } else {
      setError(res.error || 'Failed to scan multi-MRP products');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const actions: DosAction[] = [
    {
      keyLabel: 'F8',
      label: 'Print Report',
      variant: 'primary',
      disabled: products.length === 0,
      onClick: () => window.print(),
    },
    {
      keyLabel: 'F5',
      label: 'Refresh',
      onClick: loadData,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="Multi-MRP Batch Reconciliation"
        subtitle="Identify medicines in stock with different MRPs and review pricing per batch"
        breadcrumbs={['Stock', 'Audit & Reports', 'Multi-MRP Batches']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Products with Multiple MRPs: {products.length}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1 border border-black">
              [ERROR] {error}
            </div>
          )}

          <div className="grid grid-cols-12 gap-2 flex-1 min-h-0">
            {/* Products List (Left 6 Cols) */}
            <div className="col-span-6 border border-brand-border flex flex-col bg-white overflow-hidden">
              <div className="bg-brand-ink text-white font-bold p-1.5 border-b border-black">
                PRODUCTS WITH MULTIPLE ACTIVE MRP SLABS
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-brand-surface border-b border-brand-border text-brand-ink">
                    <tr>
                      <th className="w-8 px-1 py-1 text-center">#</th>
                      <th className="w-16 px-1 py-1 text-left">ITEM CODE</th>
                      <th className="px-2 py-1 text-left">PRODUCT NAME</th>
                      <th className="w-20 px-1 py-1 text-center">MRP SLABS</th>
                      <th className="w-28 px-2 py-1 text-right">MRP RANGE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-gray-500 font-bold">
                          Checking inventory for multiple MRP batches...
                        </td>
                      </tr>
                    ) : products.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-green-700 font-bold">
                          ✓ No multi-MRP variations found. All stock batches have uniform pricing.
                        </td>
                      </tr>
                    ) : (
                      products.map((p, idx) => {
                        const isSelected = p.productId === selectedProduct?.productId;
                        return (
                          <tr
                            key={p.productId}
                            onClick={() => {
                              setSelectedIndex(idx);
                              setSelectedProduct(p);
                            }}
                            className={`border-b border-gray-200 cursor-pointer ${
                              isSelected ? 'bg-amber-100 font-bold' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                            }`}
                          >
                            <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                            <td className="px-1 py-1 font-bold">{p.code}</td>
                            <td className="px-2 py-1 font-bold">
                              <div>{p.name}</div>
                              <div className="text-[10px] text-gray-500">{p.company} • {p.packaging}</div>
                            </td>
                            <td className="px-1 py-1 text-center font-bold text-red-600">
                              {p.distinctMrpCount} MRPs
                            </td>
                            <td className="px-2 py-1 text-right font-bold text-brand-amber">
                              {p.mrpRange}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Batch Breakdown (Right 6 Cols) */}
            <div className="col-span-6 border border-brand-border flex flex-col bg-white overflow-hidden">
              <div className="bg-brand-ink text-white font-bold p-1.5 border-b border-black">
                ACTIVE BATCH BREAKDOWN {selectedProduct ? `— ${selectedProduct.name}` : ''}
              </div>
              <div className="flex-1 overflow-auto p-2">
                {!selectedProduct ? (
                  <div className="text-center py-12 text-gray-500">Select a product from the list to view batch-wise MRPs and rates.</div>
                ) : (
                  <table className="w-full border-collapse">
                    <thead className="bg-brand-surface border-b border-brand-border text-brand-ink">
                      <tr>
                        <th className="px-2 py-1 text-left">BATCH NO</th>
                        <th className="px-2 py-1 text-center">EXPIRY</th>
                        <th className="px-2 py-1 text-right">PUR. COST</th>
                        <th className="px-2 py-1 text-right">SELLING RATE</th>
                        <th className="px-2 py-1 text-right">MRP</th>
                        <th className="px-2 py-1 text-right">STOCK QTY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProduct.batches.map((b: any, bIdx: number) => (
                        <tr key={b.batchId} className="border-b border-gray-200">
                          <td className="px-2 py-1 font-mono font-bold text-brand-ink">{b.batchNo}</td>
                          <td className="px-2 py-1 text-center text-gray-600">{b.expiryDate}</td>
                          <td className="px-2 py-1 text-right text-gray-600">₹ {b.purchaseRate.toFixed(2)}</td>
                          <td className="px-2 py-1 text-right font-bold">₹ {b.sellingRate.toFixed(2)}</td>
                          <td className="px-2 py-1 text-right font-bold text-brand-amber">₹ {b.mrp.toFixed(2)}</td>
                          <td className="px-2 py-1 text-right font-bold">{b.stockQty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      </DosWindow>
    </div>
  );
}
