'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { getStockMovementAnalysis } from './actions';

export default function StockMovementPage() {
  const [filterTier, setFilterTier] = useState<'ALL' | 'FAST' | 'SLOW' | 'NON_MOVING'>('ALL');
  const [movementList, setMovementList] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const res = await getStockMovementAnalysis();
    if (res.success) {
      setMovementList(res.stockMovement);
    } else {
      setError(res.error || 'Failed to analyze stock velocity');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = movementList.filter((it) => {
    if (filterTier === 'ALL') return true;
    return it.velocityTier === filterTier;
  });

  const actions: DosAction[] = [
    {
      keyLabel: 'F8',
      label: 'Print Report',
      variant: 'primary',
      disabled: filtered.length === 0,
      onClick: () => window.print(),
    },
    {
      keyLabel: 'F5',
      label: 'Refresh',
      onClick: loadData,
    },
  ];

  const deadStockValue = movementList
    .filter((it) => it.velocityTier === 'NON_MOVING')
    .reduce((acc, it) => acc + (it.totalStockValue || 0), 0);

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="Fast, Slow & Non-Moving Stock Analysis"
        subtitle="Inventory movement velocity analysis, turnover ratios, and slow-moving stock"
        breadcrumbs={['REPORTS', 'STOCK MOVEMENT ANALYSIS']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Products: {filtered.length} | Non-Moving Stock Value: ₹ {deadStockValue.toFixed(2)}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1 border border-black">
              [ERROR] {error}
            </div>
          )}

          {/* Velocity Tier Selector */}
          <div className="bg-brand-surface border border-brand-border p-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="font-bold text-brand-ink">Velocity Tier:</label>
              <select
                value={filterTier}
                onChange={(e) => setFilterTier(e.target.value as any)}
                className="bg-white border border-brand-border px-2 py-1 font-bold"
              >
                <option value="ALL">All Movement Categories</option>
                <option value="FAST">Fast Moving Items (&gt;50 Units Sold)</option>
                <option value="SLOW">Slow Moving Items (1-50 Units Sold)</option>
                <option value="NON_MOVING">Non-Moving / Stagnant Items (0 Units Sold)</option>
              </select>
            </div>

            <div className="flex items-center gap-3 text-[11px]">
              <span className="bg-green-100 text-green-900 border border-green-400 px-2 py-0.5 font-bold">
                FAST: &gt;50 SOLD
              </span>
              <span className="bg-yellow-100 text-yellow-900 border border-yellow-400 px-2 py-0.5 font-bold">
                SLOW: 1-50 SOLD
              </span>
              <span className="bg-red-100 text-red-900 border border-red-400 px-2 py-0.5 font-bold">
                NON-MOVING: 0 SOLD
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="w-20 px-2 py-1 text-left">CODE</th>
                  <th className="px-2 py-1 text-left">PRODUCT NAME</th>
                  <th className="w-24 px-2 py-1 text-left">COMPANY</th>
                  <th className="w-20 px-2 py-1 text-center">RACK</th>
                  <th className="w-24 px-2 py-1 text-center">TIER</th>
                  <th className="w-24 px-2 py-1 text-right">UNITS SOLD</th>
                  <th className="w-28 px-2 py-1 text-right">SALES VALUE</th>
                  <th className="w-24 px-2 py-1 text-right">STOCK QTY</th>
                  <th className="w-28 px-2 py-1 text-right">HOLDING COST</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-gray-500 font-bold">
                      Analyzing stock movement velocity...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-gray-500 font-bold">
                      No products found in this movement category.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item, idx) => (
                    <tr key={item.productId} className={`border-b border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                      <td className="px-2 py-1 font-bold">{item.code}</td>
                      <td className="px-2 py-1 font-bold">{item.name}</td>
                      <td className="px-2 py-1 text-gray-600">{item.company}</td>
                      <td className="px-2 py-1 text-center font-mono">{item.rackLocation}</td>
                      <td className="px-2 py-1 text-center font-bold">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] ${
                            item.velocityTier === 'FAST'
                              ? 'bg-green-600 text-white'
                              : item.velocityTier === 'SLOW'
                              ? 'bg-yellow-500 text-black'
                              : 'bg-red-600 text-white'
                          }`}
                        >
                          {item.velocityTier}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right font-bold">{item.totalSoldQty}</td>
                      <td className="px-2 py-1 text-right font-bold text-brand-ink">
                        ₹ {item.totalSalesVal.toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right">{item.totalStockOnHand}</td>
                      <td className="px-2 py-1 text-right font-bold text-brand-amber">
                        ₹ {item.totalStockValue.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DosWindow>
    </div>
  );
}
