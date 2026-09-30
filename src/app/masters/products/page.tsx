'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosDataGrid, DosColumnDef } from '@/components/ui/DosDataGrid';
import { DosModal } from '@/components/ui/DosModal';
import { useKeyboardShortcuts } from '@/lib/keyboard/useKeyboardShortcuts';
import { useEnterKeyProgression } from '@/lib/keyboard/useEnterKeyProgression';
import { ProductSearchModal } from './ProductSearchModal';
import {
  getProductsList,
  getProductWithBatches,
  getNextProductCode,
  createProductWithBatches,
  updateProductWithBatches,
  deleteProduct,
  toggleProductBlocked,
  BatchInput,
  ProductInput,
} from './actions';

type Mode = 'VIEW' | 'ADD' | 'EDIT' | 'BATCH_EDIT';

export default function ProductMasterPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('VIEW');
  const [productsList, setProductsList] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Active product form state
  const [formData, setFormData] = useState<ProductInput>({
    code: '',
    name: '',
    genericName: '',
    companyId: '',
    supplierId: '',
    packaging: '10x10 TAB',
    packagingDetail: '',
    taxCode: '02',
    uqc: 'BOX',
    rackLocation: '',
    hsnCode: '30049099',
    barcode: '',
    drugScheduleFlag: 'NONE',
    isScheduleH: false,
    isPsychotropic: false,
    defaultSupplierDiscountPct: 0,
    minOrderQty: 0,
    reorderLevel: 0,
    warningQty: 0,
    allowInvoiceDiscount: true,
    allowRateModification: true,
    isBlocked: false,
    batches: [],
  });

  // Modal dialog states
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  const formContainerRef = useRef<HTMLDivElement | null>(null);
  useEnterKeyProgression({
    formRef: formContainerRef,
    enabled: mode === 'ADD' || mode === 'EDIT',
    onComplete: () => {
      // Focus first batch row on completing form fields
    },
  });

  // Load initial product list
  const refreshList = async (preferredId?: string) => {
    setIsLoading(true);
    try {
      const list = await getProductsList();
      setProductsList(list);
      if (list.length > 0) {
        let idx = 0;
        if (preferredId) {
          const found = list.findIndex((p: any) => p.id === preferredId);
          if (found !== -1) idx = found;
        }
        setSelectedIndex(idx);
        loadProductDetails(list[idx]?.id);
      } else {
        setFormData(getBlankForm());
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error loading products');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshList();
  }, []);

  const getBlankForm = (): ProductInput => ({
    code: '',
    name: '',
    genericName: '',
    companyId: 'COMP-DEFAULT',
    supplierId: '',
    packaging: '10x10 TAB',
    packagingDetail: '',
    taxCode: '02',
    uqc: 'BOX',
    rackLocation: '',
    hsnCode: '30049099',
    barcode: '',
    drugScheduleFlag: 'NONE',
    isScheduleH: false,
    isPsychotropic: false,
    defaultSupplierDiscountPct: 0,
    minOrderQty: 0,
    reorderLevel: 0,
    warningQty: 0,
    allowInvoiceDiscount: true,
    allowRateModification: true,
    isBlocked: false,
    batches: [
      {
        batchNo: 'BT01',
        expiryMonthYear: '12/28',
        purchaseRate: 20.0,
        sellingRate: 25.0,
        mrp: 30.0,
        stockQty: 100,
        taxCode: '02',
      },
    ],
  });

  const loadProductDetails = async (id: string) => {
    if (!id) return;
    try {
      const prod = await getProductWithBatches(id);
      if (prod) {
        setFormData({
          id: prod.id,
          code: prod.code,
          name: prod.name,
          genericName: prod.packagingDetail || '',
          companyId: prod.companyId,
          supplierId: prod.supplierId || '',
          packaging: prod.packaging,
          packagingDetail: prod.packagingDetail || '',
          taxCode: prod.taxCode || '02',
          uqc: prod.uqc,
          rackLocation: prod.rackLocation || '',
          hsnCode: prod.hsnCode,
          barcode: prod.barcode || '',
          drugScheduleFlag: prod.drugScheduleFlag || 'NONE',
          isScheduleH: prod.isScheduleH,
          isPsychotropic: prod.isPsychotropic,
          defaultSupplierDiscountPct: prod.defaultSupplierDiscountPct || 0,
          minOrderQty: prod.minOrderQty,
          reorderLevel: prod.reorderLevel,
          warningQty: prod.warningQty,
          allowInvoiceDiscount: prod.allowInvoiceDiscount,
          allowRateModification: prod.allowRateModification,
          isBlocked: prod.isBlocked,
          batches: (prod.batches || []).map((b: any) => ({
            id: b.id,
            batchNo: b.batchNo,
            expiryMonthYear: b.expiryMonthYear || b.expiryDate?.slice(0, 7) || '12/28',
            purchaseRate: b.purchaseRate,
            sellingRate: b.sellingRate,
            secondaryRate: b.secondaryRate || 0,
            mrp: b.mrp,
            stockQty: b.stockQty,
            quarantineQty: b.quarantineQty || 0,
            schemeThreshold: b.schemeThreshold || 0,
            schemeFreeQty: b.schemeFreeQty || 0,
            taxCode: b.taxCode,
            offerDiscountPct: b.offerDiscountPct || 0,
            isBlocked: b.isBlocked,
          })),
        });
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error fetching product details');
    }
  };

  // Actions
  const handleAddNew = async () => {
    const nextCode = await getNextProductCode();
    setFormData({
      ...getBlankForm(),
      code: nextCode,
    });
    setMode('ADD');
  };

  const handleEdit = () => {
    if (!formData.id) return;
    setMode('EDIT');
  };

  const handleCancel = () => {
    if (mode === 'VIEW') {
      router.push('/masters');
    } else {
      setMode('VIEW');
      if (productsList[selectedIndex]) {
        loadProductDetails(productsList[selectedIndex].id);
      }
    }
  };

  const handleSave = async () => {
    try {
      setErrorMessage(null);
      if (!formData.code.trim()) throw new Error('Product Code is required');
      if (!formData.name.trim()) throw new Error('Product Name is required');
      if (!formData.packaging.trim()) throw new Error('Packaging is required');
      if (!formData.hsnCode.trim()) throw new Error('HSN Code is required');

      if (mode === 'ADD') {
        const res = await createProductWithBatches(formData);
        setStatusNotification('Product created successfully');
        setMode('VIEW');
        await refreshList(res.id);
      } else if (mode === 'EDIT' || mode === 'BATCH_EDIT') {
        await updateProductWithBatches(formData);
        setStatusNotification('Product updated successfully');
        setMode('VIEW');
        await refreshList(formData.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Save failed');
    }
  };

  const handleDelete = async () => {
    if (!formData.id) return;
    try {
      setErrorMessage(null);
      await deleteProduct(formData.id);
      setIsDeleteModalOpen(false);
      setStatusNotification('Product deleted successfully');
      await refreshList();
    } catch (err: any) {
      setIsDeleteModalOpen(false);
      setErrorMessage(err.message || 'Delete rejected');
    }
  };

  const handleToggleBlock = async () => {
    if (!formData.id) return;
    try {
      const nextBlocked = !formData.isBlocked;
      await toggleProductBlocked(formData.id, nextBlocked);
      setFormData((prev) => ({ ...prev, isBlocked: nextBlocked }));
      setStatusNotification(`Product ${nextBlocked ? 'BLOCKED' : 'UNBLOCKED'} successfully`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to toggle block status');
    }
  };

  const handleAddBatchRow = () => {
    const newBatch: BatchInput = {
      batchNo: `BT${(formData.batches?.length || 0) + 1}`,
      expiryMonthYear: '12/28',
      purchaseRate: 20.0,
      sellingRate: 25.0,
      mrp: 30.0,
      stockQty: 0,
      taxCode: formData.taxCode || '02',
    };
    setFormData((prev) => ({
      ...prev,
      batches: [...(prev.batches || []), newBatch],
    }));
  };

  const updateBatchField = (index: number, field: keyof BatchInput, val: any) => {
    setFormData((prev) => {
      const copy = [...(prev.batches || [])];
      copy[index] = { ...copy[index], [field]: val };
      return { ...prev, batches: copy };
    });
  };

  // Global hotkeys
  useKeyboardShortcuts([
    {
      key: 'F1',
      description: 'Add Product',
      action: () => mode === 'VIEW' && handleAddNew(),
      enabled: mode === 'VIEW',
    },
    {
      key: 'F2',
      description: 'Edit Product',
      action: () => mode === 'VIEW' && handleEdit(),
      enabled: mode === 'VIEW',
    },
    {
      key: 'F3',
      description: 'Delete Product',
      action: () => mode === 'VIEW' && formData.id && setIsDeleteModalOpen(true),
      enabled: mode === 'VIEW',
    },
    {
      key: 'F4',
      description: 'Save Record',
      action: () => (mode === 'ADD' || mode === 'EDIT' || mode === 'BATCH_EDIT') && handleSave(),
      enabled: mode !== 'VIEW',
    },
    {
      key: 'F5',
      description: 'Search Products',
      action: () => setIsSearchOpen(true),
      allowInInputs: true,
    },
    {
      key: 'F6',
      description: 'Toggle Block',
      action: () => mode === 'VIEW' && handleToggleBlock(),
      enabled: mode === 'VIEW',
    },
    {
      key: 'F7',
      description: 'Add Batch Row',
      action: () => (mode === 'ADD' || mode === 'EDIT' || mode === 'BATCH_EDIT') && handleAddBatchRow(),
      enabled: mode !== 'VIEW',
    },
    {
      key: 'Escape',
      description: 'Cancel / Exit',
      action: handleCancel,
      allowInInputs: true,
    },
  ], { scopeId: 'product-master', priority: 10 });

  const filteredProducts = productsList.filter((p) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term);
  });

  const columns: DosColumnDef<any>[] = [
    { id: 'code', header: 'CODE', accessorKey: 'code', width: 'w-16', align: 'center' },
    { id: 'name', header: 'PRODUCT NAME', accessorKey: 'name', width: 'w-52' },
    { id: 'packing', header: 'PACKING', accessorKey: 'packaging', width: 'w-24' },
    { id: 'stock', header: 'STOCK', accessorKey: 'totalStockOnHand', width: 'w-16', align: 'right' },
  ];

  const actionButtons: DosAction[] =
    mode === 'VIEW'
      ? [
          { keyLabel: 'F1', label: 'Add', onClick: handleAddNew, variant: 'primary' },
          { keyLabel: 'F2', label: 'Edit', onClick: handleEdit },
          { keyLabel: 'F3', label: 'Delete', onClick: () => setIsDeleteModalOpen(true), variant: 'danger' },
          { keyLabel: 'F5', label: 'Search', onClick: () => setIsSearchOpen(true), variant: 'amber' },
          { keyLabel: 'F6', label: formData.isBlocked ? 'Unblock' : 'Block', onClick: handleToggleBlock },
          { keyLabel: 'ESC', label: 'Exit Hub', onClick: () => router.push('/masters') },
        ]
      : [
          { keyLabel: 'F4', label: 'Save', onClick: handleSave, variant: 'amber' },
          { keyLabel: 'F7', label: '+Batch', onClick: handleAddBatchRow },
          { keyLabel: 'ESC', label: 'Cancel', onClick: handleCancel },
        ];

  const totalCalculatedStock = (formData.batches || []).reduce(
    (sum, b) => sum + (Number(b.stockQty) || 0),
    0
  );

  return (
    <>
      <DosWindow
        title="PRODUCT MASTER & MEDICINE CATALOG"
        subtitle={`[MEDICINE REGISTRY] [MODE: ${mode}]`}
        breadcrumbs={['MASTERS', 'PRODUCTS', mode]}
        actions={actionButtons}
        statusInfo={
          formData.isBlocked ? (
            <span className="bg-red-600 text-white px-2 py-0.5 font-bold animate-pulse">
              [BLOCKED FOR SALE]
            </span>
          ) : (
            <span className="text-gray-300">Total Stock: {totalCalculatedStock} units</span>
          )
        }
      >
        <div className="flex h-full overflow-hidden">
          {/* Left Directory Pane (BROWSE) */}
          <div className="w-80 border-r-2 border-brand-border bg-white flex flex-col shrink-0 select-none">
            <div className="p-2 border-b border-brand-border bg-brand-surface/50">
              <input
                type="text"
                placeholder="Filter by name/code... (F5)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border border-brand-border bg-white px-2 py-1 text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-brand-amber"
              />
            </div>
            <div className="flex-1 overflow-hidden">
              <DosDataGrid
                columns={columns}
                data={filteredProducts}
                selectedIndex={selectedIndex}
                onSelectRow={(item, idx) => {
                  if (mode === 'VIEW') {
                    setSelectedIndex(idx);
                    loadProductDetails(item.id);
                  }
                }}
                isLoading={isLoading}
                showLineNumbers={false}
              />
            </div>
            <div className="p-2 border-t border-brand-border bg-brand-surface text-[11px] font-mono flex justify-between text-gray-600">
              <span>Total: {productsList.length} products</span>
              <span>[F5: Search Products]</span>
            </div>
          </div>

          {/* Right Detail Pane */}
          <div className="flex-1 flex flex-col overflow-auto bg-brand-paper p-4 font-mono text-xs">
            {/* Status alerts */}
            {errorMessage && (
              <div className="mb-3 p-2 bg-red-100 border border-red-600 text-red-700 font-bold flex justify-between items-center">
                <span>ERROR: {errorMessage}</span>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="px-1 text-red-900 hover:bg-red-200"
                >
                  [X]
                </button>
              </div>
            )}
            {statusNotification && (
              <div className="mb-3 p-2 bg-green-100 border border-green-600 text-green-800 font-bold flex justify-between items-center">
                <span>NOTICE: {statusNotification}</span>
                <button
                  type="button"
                  onClick={() => setStatusNotification(null)}
                  className="px-1 text-green-900 hover:bg-green-200"
                >
                  [X]
                </button>
              </div>
            )}

            {/* Catalog Fields Form */}
            <div
              ref={formContainerRef}
              className={`border border-brand-border p-3 mb-4 ${
                mode === 'VIEW' ? 'bg-brand-surface/20' : 'bg-white shadow-[2px_2px_0px_0px_#0B192C]'
              }`}
            >
              <div className="font-bold text-brand-ink uppercase text-[11px] border-b border-brand-border pb-1 mb-3 flex justify-between">
                <span>1. MEDICINE CATALOG INFORMATION</span>
                <span className="text-gray-500">[ENTER: NEXT FIELD]</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* Code */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
                    PRODUCT CODE *
                  </label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs uppercase disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Name */}
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
                    PRODUCT NAME *
                  </label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs uppercase disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Packaging */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
                    PACKAGING *
                  </label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.packaging}
                    onChange={(e) => setFormData({ ...formData, packaging: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs uppercase disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Generic Molecule / Packaging Detail */}
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
                    GENERIC / MOLECULE COMPOSITION
                  </label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.genericName || ''}
                    onChange={(e) => setFormData({ ...formData, genericName: e.target.value })}
                    placeholder="e.g. PARACETAMOL 650MG"
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs uppercase disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* HSN Code */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
                    HSN CODE *
                  </label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.hsnCode}
                    onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Tax Slab */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
                    TAX SLAB / GST
                  </label>
                  <select
                    disabled={mode === 'VIEW'}
                    value={formData.taxCode}
                    onChange={(e) => setFormData({ ...formData, taxCode: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  >
                    <option value="01">01 - 0.00% (Exempt / Nil)</option>
                    <option value="02">02 - 12.00% GST</option>
                    <option value="03">03 - 18.00% GST</option>
                    <option value="04">04 - 28.00% GST</option>
                    <option value="05">05 - 5.00% GST</option>
                  </select>
                </div>

                {/* Schedule Category */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
                    SCHEDULE CATEGORY
                  </label>
                  <select
                    disabled={mode === 'VIEW'}
                    value={formData.drugScheduleFlag || 'NONE'}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        drugScheduleFlag: e.target.value,
                        isScheduleH: e.target.value === 'H',
                      })
                    }
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  >
                    <option value="NONE">NONE - General Medicine</option>
                    <option value="H">H - Schedule H (Prescription)</option>
                    <option value="H1">H1 - Schedule H1 (Controlled)</option>
                    <option value="X">X - Schedule X (Psychotropic)</option>
                    <option value="NARCOTIC">NARCOTIC - Narcotic Substance</option>
                  </select>
                </div>

                {/* Rack Location */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
                    RACK / SHELF BIN
                  </label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.rackLocation || ''}
                    onChange={(e) => setFormData({ ...formData, rackLocation: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs uppercase disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Barcode */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
                    BARCODE / EAN
                  </label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.barcode || ''}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Reorder Level */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
                    REORDER LEVEL
                  </label>
                  <input
                    type="number"
                    disabled={mode === 'VIEW'}
                    value={formData.reorderLevel}
                    onChange={(e) =>
                      setFormData({ ...formData, reorderLevel: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>
              </div>
            </div>

            {/* Batch Inventory Grid */}
            <div className="border border-brand-border p-3 flex-1 flex flex-col bg-white">
              <div className="font-bold text-brand-ink uppercase text-[11px] border-b border-brand-border pb-1 mb-2 flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <span>2. BATCH INVENTORY &amp; RATES</span>
                  <span className="text-gray-500 font-normal">
                    (Pricing Rule: MRP &ge; Selling Rate &ge; Purchase Rate)
                  </span>
                </span>
                {mode !== 'VIEW' && (
                  <button
                    type="button"
                    onClick={handleAddBatchRow}
                    className="bg-brand-ink text-white px-2 py-0.5 text-xs hover:bg-brand-amber font-bold cursor-pointer"
                  >
                    + Add Batch (F7)
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-auto border border-brand-border">
                <table className="w-full border-collapse font-mono text-xs">
                  <thead className="bg-brand-ink text-white sticky top-0">
                    <tr>
                      <th className="p-1.5 border-r border-gray-600 text-left w-28">BATCH NO</th>
                      <th className="p-1.5 border-r border-gray-600 text-center w-20">EXPIRY (MM/YY)</th>
                      <th className="p-1.5 border-r border-gray-600 text-right w-24">PURCHASE (₹)</th>
                      <th className="p-1.5 border-r border-gray-600 text-right w-24">SELLING / PTR (₹)</th>
                      <th className="p-1.5 border-r border-gray-600 text-right w-24">M.R.P (₹)</th>
                      <th className="p-1.5 border-r border-gray-600 text-right w-20">STOCK</th>
                      <th className="p-1.5 border-r border-gray-600 text-right w-20">MARGIN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(formData.batches || []).map((b, idx) => {
                      const marginPct =
                        b.purchaseRate > 0
                          ? (((b.sellingRate - b.purchaseRate) / b.purchaseRate) * 100).toFixed(1)
                          : '0.0';

                      return (
                        <tr key={idx} className="border-b border-brand-border/60 hover:bg-brand-surface/40">
                          {/* Batch No */}
                          <td className="p-1 border-r border-brand-border">
                            <input
                              type="text"
                              disabled={mode === 'VIEW'}
                              value={b.batchNo}
                              onChange={(e) => updateBatchField(idx, 'batchNo', e.target.value)}
                              className="w-full px-1 py-0.5 border border-transparent focus:border-brand-amber font-mono text-xs uppercase"
                            />
                          </td>

                          {/* Expiry */}
                          <td className="p-1 border-r border-brand-border text-center">
                            <input
                              type="text"
                              disabled={mode === 'VIEW'}
                              value={b.expiryMonthYear || ''}
                              placeholder="MM/YY"
                              onChange={(e) => updateBatchField(idx, 'expiryMonthYear', e.target.value)}
                              className="w-full px-1 py-0.5 text-center border border-transparent focus:border-brand-amber font-mono text-xs"
                            />
                          </td>

                          {/* Purchase Rate */}
                          <td className="p-1 border-r border-brand-border text-right">
                            <input
                              type="number"
                              step="0.01"
                              disabled={mode === 'VIEW'}
                              value={b.purchaseRate}
                              onChange={(e) =>
                                updateBatchField(idx, 'purchaseRate', parseFloat(e.target.value) || 0)
                              }
                              className="w-full px-1 py-0.5 text-right border border-transparent focus:border-brand-amber font-mono text-xs tabular-nums"
                            />
                          </td>

                          {/* Selling Rate */}
                          <td className="p-1 border-r border-brand-border text-right">
                            <input
                              type="number"
                              step="0.01"
                              disabled={mode === 'VIEW'}
                              value={b.sellingRate}
                              onChange={(e) =>
                                updateBatchField(idx, 'sellingRate', parseFloat(e.target.value) || 0)
                              }
                              className="w-full px-1 py-0.5 text-right border border-transparent focus:border-brand-amber font-mono text-xs tabular-nums font-semibold"
                            />
                          </td>

                          {/* MRP */}
                          <td className="p-1 border-r border-brand-border text-right">
                            <input
                              type="number"
                              step="0.01"
                              disabled={mode === 'VIEW'}
                              value={b.mrp}
                              onChange={(e) =>
                                updateBatchField(idx, 'mrp', parseFloat(e.target.value) || 0)
                              }
                              className="w-full px-1 py-0.5 text-right border border-transparent focus:border-brand-amber font-mono text-xs tabular-nums font-bold"
                            />
                          </td>

                          {/* Stock Qty */}
                          <td className="p-1 border-r border-brand-border text-right">
                            <input
                              type="number"
                              disabled={mode === 'VIEW'}
                              value={b.stockQty}
                              onChange={(e) =>
                                updateBatchField(idx, 'stockQty', parseInt(e.target.value, 10) || 0)
                              }
                              className="w-full px-1 py-0.5 text-right border border-transparent focus:border-brand-amber font-mono text-xs tabular-nums"
                            />
                          </td>

                          {/* Margin */}
                          <td className="p-1 text-right tabular-nums font-semibold text-gray-700">
                            {marginPct}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-2 pt-1 border-t border-brand-border flex justify-between items-center text-[11px] text-gray-600">
                <span>
                  Batches: {(formData.batches || []).length} | Total Stock: {totalCalculatedStock} units
                </span>
                <span className="font-bold text-brand-ink">
                  Stock on Hand: {totalCalculatedStock} units
                </span>
              </div>
            </div>
          </div>
        </div>
      </DosWindow>

      {/* Product Search Modal */}
      <ProductSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectProduct={(prod) => {
          loadProductDetails(prod.id);
        }}
      />

      {/* Delete Confirmation Modal */}
      <DosModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="CONFIRM PRODUCT DELETION"
        variant="danger"
        confirmText="[Enter: Delete Product]"
        cancelText="[ESC: Cancel]"
        onConfirm={handleDelete}
      >
        <div className="flex flex-col gap-2 font-mono text-xs">
          <p className="font-bold text-red-600">
            Are you sure you want to permanently delete this medicine from the catalog?
          </p>
          <div className="p-2 bg-brand-surface border border-brand-border text-gray-800">
            <div>Code: {formData.code}</div>
            <div>Name: {formData.name}</div>
            <div>Stock: {totalCalculatedStock} units</div>
          </div>
          <p className="text-gray-600 text-[11px]">
            Products with existing billing or purchase history cannot be deleted. Use [F6: Block] instead to prevent further sales.
          </p>
        </div>
      </DosModal>
    </>
  );
}
