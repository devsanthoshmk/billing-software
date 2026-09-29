'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { DosModal } from '@/components/ui/DosModal';
import { DosDataGrid, DosColumnDef } from '@/components/ui/DosDataGrid';
import { searchProducts } from './actions';

export interface ProductSearchItem {
  id: string;
  code: string;
  name: string;
  packaging: string;
  packagingDetail?: string | null;
  companyId: string;
  taxCode: string;
  totalStockOnHand: number;
  hsnCode: string;
  rackLocation?: string | null;
  drugScheduleFlag?: string | null;
  isScheduleH?: boolean | null;
  isBlocked?: boolean | null;
  batches?: any[];
}

export interface FlattenedProductBatchRow {
  productId: string;
  batchId?: string;
  code: string;
  name: string;
  packaging: string;
  companyId: string;
  batchNo: string;
  expiry: string;
  stock: number;
  mrp: number;
  sellingRate: number;
  purchaseRate: number;
  totalStockOnHand: number;
  rawProduct: any;
  rawBatch?: any;
}

export interface ProductSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (product: any, batch?: any) => void;
  initialQuery?: string;
}

export function ProductSearchModal({
  isOpen,
  onClose,
  onSelectProduct,
  initialQuery = '',
}: ProductSearchModalProps) {
  const [query, setQuery] = useState<string>(initialQuery);
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [rows, setRows] = useState<FlattenedProductBatchRow[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [outOfStockWarning, setOutOfStockWarning] = useState<FlattenedProductBatchRow | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setSelectedIndex(0);
      setOutOfStockWarning(null);
      setTimeout(() => inputRef.current?.focus(), 50);
      fetchResults(initialQuery, inStockOnly);
    }
  }, [isOpen, initialQuery]);

  const fetchResults = (searchQuery: string, stockOnly: boolean) => {
    setIsLoading(true);
    searchProducts(searchQuery, stockOnly, 50, 0)
      .then((res) => {
        const flattened: FlattenedProductBatchRow[] = [];
        for (const p of res.products) {
          if (p.batches && p.batches.length > 0) {
            for (const b of p.batches) {
              flattened.push({
                productId: p.id,
                batchId: b.id,
                code: p.code,
                name: p.name,
                packaging: p.packaging,
                companyId: p.companyId,
                batchNo: b.batchNo,
                expiry: b.expiryMonthYear || b.expiryDate?.slice(0, 7) || 'N/A',
                stock: b.stockQty,
                mrp: b.mrp,
                sellingRate: b.sellingRate,
                purchaseRate: b.purchaseRate,
                totalStockOnHand: p.totalStockOnHand,
                rawProduct: p,
                rawBatch: b,
              });
            }
          } else {
            flattened.push({
              productId: p.id,
              code: p.code,
              name: p.name,
              packaging: p.packaging,
              companyId: p.companyId,
              batchNo: '---',
              expiry: '---',
              stock: 0,
              mrp: 0,
              sellingRate: 0,
              purchaseRate: 0,
              totalStockOnHand: p.totalStockOnHand,
              rawProduct: p,
            });
          }
        }
        setRows(flattened);
        setSelectedIndex(0);
      })
      .catch((err) => console.error('Search error:', err))
      .finally(() => setIsLoading(false));
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchResults(val, inStockOnly);
    }, 150);
  };

  const toggleInStock = () => {
    const nextVal = !inStockOnly;
    setInStockOnly(nextVal);
    fetchResults(query, nextVal);
  };

  const handleSelectRow = (item: FlattenedProductBatchRow) => {
    if (item.stock <= 0 && item.totalStockOnHand <= 0) {
      setOutOfStockWarning(item);
    } else {
      onSelectProduct(item.rawProduct, item.rawBatch);
      onClose();
    }
  };

  const confirmBackorder = () => {
    if (outOfStockWarning) {
      onSelectProduct(outOfStockWarning.rawProduct, outOfStockWarning.rawBatch);
      setOutOfStockWarning(null);
      onClose();
    }
  };

  const selectedItem = rows[selectedIndex];

  const columns: DosColumnDef<FlattenedProductBatchRow>[] = [
    { id: 'code', header: 'CODE', accessorKey: 'code', width: 'w-16', align: 'center' },
    { id: 'name', header: 'PRODUCT NAME', accessorKey: 'name', width: 'w-44' },
    { id: 'packaging', header: 'PACKING', accessorKey: 'packaging', width: 'w-24' },
    { id: 'batchNo', header: 'BATCH NO', accessorKey: 'batchNo', width: 'w-20' },
    { id: 'expiry', header: 'EXPIRY', accessorKey: 'expiry', width: 'w-16', align: 'center' },
    {
      id: 'stock',
      header: 'STOCK',
      accessorKey: 'stock',
      width: 'w-14',
      align: 'right',
      cell: (r) => (
        <span className={r.stock <= 0 ? 'text-red-600 font-bold' : 'font-bold'}>
          {r.stock}
        </span>
      ),
    },
    {
      id: 'mrp',
      header: 'M.R.P',
      accessorKey: 'mrp',
      width: 'w-16',
      align: 'right',
      cell: (r) => (r.mrp ? r.mrp.toFixed(2) : '-'),
    },
    {
      id: 'sellingRate',
      header: 'PTR / RATE',
      accessorKey: 'sellingRate',
      width: 'w-16',
      align: 'right',
      cell: (r) => (r.sellingRate ? r.sellingRate.toFixed(2) : '-'),
    },
  ];

  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'F5') {
      e.preventDefault();
      toggleInStock();
    }
  };

  return (
    <>
      <DosModal
        isOpen={isOpen}
        onClose={onClose}
        title="[F19] PRODUCT HELP & SEARCH BROWSER"
        width="max-w-5xl"
        cancelText="[ESC: Close]"
      >
        <div onKeyDown={handleModalKeyDown} className="flex flex-col gap-3 font-mono text-xs">
          {/* Top Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border border-brand-border p-2 bg-brand-surface/40">
            <div className="flex-1 flex items-center gap-2 min-w-[280px]">
              <span className="font-bold text-brand-ink">SEARCH:</span>
              <input
                ref={inputRef}
                type="text"
                data-testid="product-search-input"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Type brand, molecule, batch, or barcode... (F5 toggle stock)"
                className="flex-1 border border-brand-border bg-white px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-brand-amber uppercase"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer font-bold select-none text-[11px]">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={toggleInStock}
                  className="w-3.5 h-3.5 accent-brand-amber"
                />
                <span>In Stock Only (&gt;0) [F5]</span>
              </label>
              <span className="text-[11px] text-gray-500 font-semibold">
                Found: {rows.length} records
              </span>
            </div>
          </div>

          {/* Results Table */}
          <div className="h-72 border border-brand-border">
            <DosDataGrid
              columns={columns}
              data={rows}
              selectedIndex={selectedIndex}
              onSelectRow={(_, idx) => setSelectedIndex(idx)}
              onActivateRow={handleSelectRow}
              isLoading={isLoading}
              emptyText={
                query.trim() === ''
                  ? '--- TYPE TO SEARCH MEDICINES ---'
                  : '--- NO PRODUCTS FOUND MATCHING QUERY ---'
              }
              showLineNumbers={true}
              autoFocus={false}
            />
          </div>

          {/* Selected Product Detail Panel */}
          {selectedItem && (
            <div className="border border-brand-ink bg-brand-surface/30 p-2.5 flex flex-col gap-1 text-[11px]">
              <div className="flex justify-between items-center font-bold text-brand-ink pb-1 border-b border-brand-border/40">
                <span>
                  [{selectedItem.code}] {selectedItem.name} — {selectedItem.packaging}
                </span>
                <span className="text-brand-amber">
                  Total SOH: {selectedItem.totalStockOnHand} Units
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-gray-700 pt-0.5">
                <div>
                  <span className="font-semibold text-gray-500">HSN: </span>
                  {selectedItem.rawProduct?.hsnCode || 'N/A'}
                </div>
                <div>
                  <span className="font-semibold text-gray-500">Rack: </span>
                  {selectedItem.rawProduct?.rackLocation || 'UNASSIGNED'}
                </div>
                <div>
                  <span className="font-semibold text-gray-500">Tax Code: </span>
                  {selectedItem.rawProduct?.taxCode || '02'}
                </div>
                <div>
                  <span className="font-semibold text-gray-500">Schedule: </span>
                  <span
                    className={
                      selectedItem.rawProduct?.isScheduleH ? 'text-red-600 font-bold' : ''
                    }
                  >
                    {selectedItem.rawProduct?.drugScheduleFlag || 'NONE'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Footer Guide */}
          <div className="flex items-center justify-between text-[11px] text-gray-500 bg-brand-surface px-2 py-1 border-t border-brand-border">
            <span>[↑/↓: Navigate Rows] [ENTER: Select] [F5: Toggle In-Stock] [ESC: Dismiss]</span>
            <span className="font-bold text-brand-ink">FEATURE F19 READY</span>
          </div>
        </div>
      </DosModal>

      {/* Out of Stock Confirmation Modal (T2-F19-05) */}
      <DosModal
        isOpen={Boolean(outOfStockWarning)}
        onClose={() => setOutOfStockWarning(null)}
        title="OUT OF STOCK WARNING"
        variant="danger"
        confirmText="[Enter: Continue Backorder]"
        cancelText="[ESC: Cancel]"
        onConfirm={confirmBackorder}
      >
        <div className="flex flex-col gap-2 font-mono text-xs">
          <p className="font-bold text-red-600">
            Product has no saleable stock! Continue as backorder?
          </p>
          <div className="p-2 bg-brand-surface border border-brand-border text-gray-800">
            <div>Product: {outOfStockWarning?.name}</div>
            <div>Batch: {outOfStockWarning?.batchNo}</div>
            <div>Current Stock: {outOfStockWarning?.stock} units</div>
          </div>
          <p className="text-gray-600 text-[11px]">
            Press Enter to select this item anyway for backorder billing, or Escape to choose another item.
          </p>
        </div>
      </DosModal>
    </>
  );
}
