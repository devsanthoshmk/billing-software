'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import { searchBatchesForRackManagement, updateBatchRackAndRates } from './actions';

export default function RackManagementPage() {
  const [query, setQuery] = useState('');
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [editRack, setEditRack] = useState<string>('');
  const [editSellingRate, setEditSellingRate] = useState<number>(0);
  const [editSecondaryRate, setEditSecondaryRate] = useState<number>(0);
  const [editMrp, setEditMrp] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadList = async (search = '') => {
    setLoading(true);
    setError(null);
    const res = await searchBatchesForRackManagement(search);
    if (res.success) {
      setBatches(res.batches);
      setSelectedIndex(0);
    } else {
      setError(res.error || 'Failed to search batches');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadList();
  }, []);

  const handleOpenEdit = (b: any) => {
    setEditItem(b);
    setEditRack(b.rackLocation || '');
    setEditSellingRate(b.sellingRate || 0);
    setEditSecondaryRate(b.secondaryRate || 0);
    setEditMrp(b.mrp || 0);
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    setError(null);

    const res = await updateBatchRackAndRates({
      batchId: editItem.batchId,
      productId: editItem.productId,
      rackLocation: editRack,
      sellingRate: editSellingRate,
      secondaryRate: editSecondaryRate,
      mrp: editMrp,
      operator: 'ADMIN',
    });

    if (res.success) {
      setEditItem(null);
      loadList(query);
    } else {
      setError(res.error || 'Failed to update rate / rack');
    }
  };

  const actions: DosAction[] = [
    {
      keyLabel: 'F2',
      label: 'Search Product',
      onClick: () => {
        const input = document.getElementById('rack-search-input');
        if (input) input.focus();
      },
    },
    {
      keyLabel: 'F3',
      label: 'Edit Rack & Rates',
      variant: 'primary',
      disabled: batches.length === 0,
      onClick: () => {
        if (batches[selectedIndex]) {
          handleOpenEdit(batches[selectedIndex]);
        }
      },
    },
    {
      keyLabel: 'F5',
      label: 'Refresh',
      onClick: () => loadList(query),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="Rack Location & Selling Rate Setup"
        subtitle="Assign physical storage racks and configure wholesale rates & MRP across batches"
        breadcrumbs={['Stock', 'Inventory Setup', 'Rack Locations & Rates']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Total Batches: {batches.length}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1 border border-black">
              [ERROR] {error}
            </div>
          )}

          {/* Search Header */}
          <div className="bg-brand-surface border border-brand-border p-2 flex items-center gap-3">
            <label className="font-bold text-brand-ink whitespace-nowrap">Search Product / Rack:</label>
            <input
              id="rack-search-input"
              type="text"
              placeholder="Filter by product name, item code, or rack location (e.g. RACK-A1)..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                loadList(e.target.value);
              }}
              className="w-96 bg-white border border-brand-border px-2 py-1 font-bold text-black"
            />
            <button
              type="button"
              onClick={() => loadList(query)}
              className="bg-brand-ink text-white font-bold px-3 py-1 border border-black hover:bg-brand-amber cursor-pointer"
            >
              Search
            </button>
          </div>

          {/* Batches Table */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="w-20 px-2 py-1 text-left">ITEM CODE</th>
                  <th className="px-2 py-1 text-left">PRODUCT NAME</th>
                  <th className="w-24 px-2 py-1 text-left">MANUFACTURER</th>
                  <th className="w-24 px-2 py-1 text-center">RACK / SHELF</th>
                  <th className="w-24 px-2 py-1 text-center">BATCH NO</th>
                  <th className="w-20 px-2 py-1 text-center">EXPIRY</th>
                  <th className="w-20 px-2 py-1 text-right">PUR. COST</th>
                  <th className="w-24 px-2 py-1 text-right">SELLING RATE</th>
                  <th className="w-24 px-2 py-1 text-right">MRP</th>
                  <th className="w-16 px-2 py-1 text-right">STOCK</th>
                  <th className="w-16 px-2 py-1 text-center">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={12} className="text-center py-12 text-gray-500 font-bold">
                      Loading stock batches...
                    </td>
                  </tr>
                ) : batches.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-12 text-gray-500 font-bold">
                      No stock batches found matching your search.
                    </td>
                  </tr>
                ) : (
                  batches.map((b, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <tr
                        key={b.batchId}
                        onClick={() => setSelectedIndex(idx)}
                        className={`border-b border-gray-200 cursor-pointer ${
                          isSelected ? 'bg-cyan-100 font-bold' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        }`}
                      >
                        <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-1 font-bold">{b.productCode}</td>
                        <td className="px-2 py-1 font-bold">{b.productName}</td>
                        <td className="px-2 py-1 text-gray-600">{b.companyName}</td>
                        <td className="px-2 py-1 text-center">
                          <span className="bg-brand-surface px-1.5 py-0.5 border border-brand-border font-bold">
                            {b.rackLocation}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-center font-mono font-bold text-brand-ink">{b.batchNo}</td>
                        <td className="px-2 py-1 text-center text-gray-600">{b.expiryDate}</td>
                        <td className="px-2 py-1 text-right text-gray-600">₹ {b.purchaseRate.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right font-bold text-brand-ink">₹ {b.sellingRate.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right font-bold text-brand-amber">₹ {b.mrp.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right font-bold">{b.stockQty}</td>
                        <td className="px-2 py-1 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(b);
                            }}
                            className="bg-brand-ink text-white px-2 py-0.5 text-[10px] font-bold hover:bg-brand-amber"
                          >
                            Edit
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

      {/* Edit Modal */}
      {editItem && (
        <DosModal
          isOpen={true}
          onClose={() => setEditItem(null)}
          title="EDIT RACK LOCATION & SELLING RATES"
          width="max-w-md"
          variant="amber"
          confirmText="Save Changes [Enter]"
          cancelText="Cancel [Esc]"
          onConfirm={handleSaveEdit}
        >
          <div className="flex flex-col gap-2 font-mono text-xs">
            <div className="bg-gray-100 p-2 border font-bold text-brand-ink">
              {editItem.productName} ({editItem.packaging}) | Batch: {editItem.batchNo}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-1">
              <div>
                <label className="font-bold text-black block">Rack / Shelf Location:</label>
                <input
                  type="text"
                  value={editRack}
                  onChange={(e) => setEditRack(e.target.value)}
                  className="w-full bg-white border border-brand-border px-2 py-1 font-bold uppercase"
                />
              </div>

              <div>
                <label className="font-bold text-black block">Purchase Cost (Read-only):</label>
                <input
                  type="text"
                  disabled
                  value={`₹ ${editItem.purchaseRate.toFixed(2)}`}
                  className="w-full bg-gray-200 border border-gray-400 px-2 py-1 text-right font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-black block">Selling / Wholesale Rate (₹):</label>
                <input
                  type="number"
                  step="0.01"
                  value={editSellingRate}
                  onChange={(e) => setEditSellingRate(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-brand-border px-2 py-1 text-right font-bold text-brand-ink"
                />
              </div>

              <div>
                <label className="font-bold text-black block">Maximum Retail Price - MRP (₹):</label>
                <input
                  type="number"
                  step="0.01"
                  value={editMrp}
                  onChange={(e) => setEditMrp(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-brand-border px-2 py-1 text-right font-bold text-brand-amber"
                />
              </div>
            </div>

            <p className="text-gray-500 text-[11px] mt-1">
              • Note: Selling rate cannot exceed MRP.<br />
              • All price modifications are recorded in the system audit log.
            </p>
          </div>
        </DosModal>
      )}
    </div>
  );
}
