'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import { getProductsForHsnMapping, updateProductHsnAndTax } from './actions';

export default function HsnMappingPage() {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [taxSlabs, setTaxSlabs] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [editHsn, setEditHsn] = useState<string>('');
  const [editTaxCode, setEditTaxCode] = useState<string>('03');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (search = '') => {
    setLoading(true);
    setError(null);
    const res = await getProductsForHsnMapping(search);
    if (res.success) {
      setProducts(res.products);
      setTaxSlabs(res.taxSlabs);
      setSelectedIndex(0);
    } else {
      setError(res.error || 'Failed to load HSN mappings');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenEdit = (p: any) => {
    setEditItem(p);
    setEditHsn(p.hsnCode || '');
    setEditTaxCode(p.taxCode || '03');
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    setError(null);

    const res = await updateProductHsnAndTax({
      productId: editItem.id,
      hsnCode: editHsn,
      taxCode: editTaxCode,
      operator: 'ADMIN',
    });

    if (res.success) {
      setEditItem(null);
      loadData(query);
    } else {
      setError(res.error || 'Failed to update HSN');
    }
  };

  const actions: DosAction[] = [
    {
      keyLabel: 'F2',
      label: 'Search Product',
      onClick: () => {
        const el = document.getElementById('hsn-search-input');
        if (el) el.focus();
      },
    },
    {
      keyLabel: 'F3',
      label: 'Edit HSN & Tax',
      variant: 'primary',
      disabled: products.length === 0,
      onClick: () => {
        if (products[selectedIndex]) {
          handleOpenEdit(products[selectedIndex]);
        }
      },
    },
    {
      keyLabel: 'F5',
      label: 'Refresh',
      onClick: () => loadData(query),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="HSN & GST Tax Slabs Mapping"
        subtitle="Map product HSN codes and assign statutory GST tax slabs for accurate billing"
        breadcrumbs={['Stock', 'Tax & Compliance', 'HSN & GST Mapping']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Total Products: {products.length}
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
            <label className="font-bold text-brand-ink whitespace-nowrap">Search Product / HSN:</label>
            <input
              id="hsn-search-input"
              type="text"
              placeholder="Search by product name, item code, or HSN code (e.g. 3004)..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                loadData(e.target.value);
              }}
              className="w-96 bg-white border border-brand-border px-2 py-1 font-bold text-black"
            />
            <button
              type="button"
              onClick={() => loadData(query)}
              className="bg-brand-ink text-white font-bold px-3 py-1 border border-black hover:bg-brand-amber cursor-pointer"
            >
              Search
            </button>
          </div>

          {/* Table */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="w-20 px-2 py-1 text-left">ITEM CODE</th>
                  <th className="px-2 py-1 text-left">PRODUCT NAME</th>
                  <th className="w-28 px-2 py-1 text-left">MANUFACTURER</th>
                  <th className="w-24 px-2 py-1 text-left">PACKAGING</th>
                  <th className="w-28 px-2 py-1 text-center">HSN CODE</th>
                  <th className="w-32 px-2 py-1 text-left">GST TAX SLAB</th>
                  <th className="w-16 px-2 py-1 text-center">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-500 font-bold">
                      Loading products and tax slabs...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-500 font-bold">
                      No products found matching your search.
                    </td>
                  </tr>
                ) : (
                  products.map((p, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedIndex(idx)}
                        className={`border-b border-gray-200 cursor-pointer ${
                          isSelected ? 'bg-cyan-100 font-bold' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        }`}
                      >
                        <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-1 font-bold">{p.code}</td>
                        <td className="px-2 py-1 font-bold">{p.name}</td>
                        <td className="px-2 py-1 text-gray-600">{p.company}</td>
                        <td className="px-2 py-1 text-gray-600">{p.packaging}</td>
                        <td className="px-2 py-1 text-center font-mono font-bold text-brand-ink">{p.hsnCode}</td>
                        <td className="px-2 py-1 text-gray-700">
                          <span className="font-bold">{p.taxCode}</span> ({p.taxDescription})
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(p);
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
          title="UPDATE HSN CODE & GST TAX SLAB"
          width="max-w-md"
          variant="amber"
          confirmText="Save [Enter]"
          cancelText="Cancel [Esc]"
          onConfirm={handleSaveEdit}
        >
          <div className="flex flex-col gap-2 font-mono text-xs">
            <div className="bg-gray-100 p-2 border font-bold text-brand-ink">
              {editItem.name} ({editItem.packaging})
            </div>

            <div className="mt-1">
              <label className="font-bold text-black block">HSN Code (4 to 8 Digits):</label>
              <input
                type="text"
                value={editHsn}
                onChange={(e) => setEditHsn(e.target.value)}
                placeholder="e.g. 30049099"
                className="w-full bg-white border border-brand-border px-2 py-1 font-mono font-bold"
              />
            </div>

            <div className="mt-1">
              <label className="font-bold text-black block">GST Tax Slab:</label>
              <select
                value={editTaxCode}
                onChange={(e) => setEditTaxCode(e.target.value)}
                className="w-full bg-white border border-brand-border px-2 py-1 font-bold"
              >
                {taxSlabs.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.code} - {t.description} (CGST {t.cgstRate}% + SGST {t.sgstRate}% / IGST {t.igstRate}%)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </DosModal>
      )}
    </div>
  );
}
