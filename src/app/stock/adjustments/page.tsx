'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import {
  reconcileStockCount,
  modifyBatchRates,
  getBatchesWithProducts,
  AdjustmentReason,
} from './actions';

export default function StockAdjustmentsPage() {
  const [activeTab, setActiveTab] = useState<'RECONCILE' | 'RATES'>('RECONCILE');
  const [systemDate, setSystemDate] = useState(new Date().toISOString().split('T')[0]);
  const [operator, setOperator] = useState('ADMIN');

  // Batches master list
  const [batchesList, setBatchesList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Reconciliation state
  const [reconcileRows, setReconcileRows] = useState<
    Array<{
      productId: string;
      productCode: string;
      productName: string;
      batchId: string;
      batchNo: string;
      systemQty: number;
      physicalQty: number;
      variance: number;
      reason: AdjustmentReason;
      remarks?: string;
    }>
  >([]);

  // Rate modification state
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [editPurchaseRate, setEditPurchaseRate] = useState(0);
  const [editSellingRate, setEditSellingRate] = useState(0);
  const [editSecondaryRate, setEditSecondaryRate] = useState(0);
  const [editMrp, setEditMrp] = useState(0);
  const [rateReason, setRateReason] = useState('Annual price list revision');

  // Status & Modals
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadBatches();
  }, []);

  const loadBatches = async () => {
    try {
      const data = await getBatchesWithProducts();
      setBatchesList(data);

      // Preload reconcile rows
      const initRows = data.map((b) => ({
        productId: b.productId,
        productCode: b.product?.code || 'ITEM',
        productName: b.product?.name || 'Medicine',
        batchId: b.id,
        batchNo: b.batchNo,
        systemQty: b.stockQty,
        physicalQty: b.stockQty, // defaults to system
        variance: 0,
        reason: 'FOUND' as AdjustmentReason,
        remarks: '',
      }));
      setReconcileRows(initRows);

      if (data.length > 0) {
        handleSelectBatchForRates(data[0]);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error loading batches');
    }
  };

  const handleSelectBatchForRates = (batch: any) => {
    setSelectedBatchId(batch.id);
    setEditPurchaseRate(batch.purchaseRate);
    setEditSellingRate(batch.sellingRate);
    setEditSecondaryRate(batch.secondaryRate || 0);
    setEditMrp(batch.mrp);
  };

  // Filtered rows for reconcile
  const filteredRows = reconcileRows.filter(
    (r) =>
      r.productCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.batchNo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handlePhysicalQtyChange = (batchId: string, count: number) => {
    setReconcileRows((prev) =>
      prev.map((r) => {
        if (r.batchId === batchId) {
          const variance = count - r.systemQty;
          let defaultReason: AdjustmentReason = r.reason;
          if (variance > 0) defaultReason = 'FOUND';
          else if (variance < 0 && r.reason === 'FOUND') defaultReason = 'DAMAGE';
          return {
            ...r,
            physicalQty: count,
            variance,
            reason: defaultReason,
          };
        }
        return r;
      })
    );
  };

  const handleReasonChange = (batchId: string, reason: AdjustmentReason) => {
    setReconcileRows((prev) =>
      prev.map((r) => (r.batchId === batchId ? { ...r, reason } : r))
    );
  };

  // Submit Physical Reconciliation
  const handleCommitReconciliation = async () => {
    setErrorMessage(null);
    const modified = reconcileRows.filter((r) => r.variance !== 0);

    if (modified.length === 0) {
      setErrorMessage('No discrepancies found between physical count and system stock.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await reconcileStockCount({
        adjustmentDate: systemDate,
        operatorId: operator,
        adjustments: modified.map((m) => ({
          productId: m.productId,
          batchId: m.batchId,
          systemQty: m.systemQty,
          physicalCountQty: m.physicalQty,
          reason: m.reason,
          remarks: m.remarks,
        })),
      });

      if (res.success) {
        setSuccessMessage(`Stock adjustments successfully recorded for ${res.adjustedCount} batch(es).`);
        loadBatches();
      } else {
        setErrorMessage(res.error || 'Failed to reconcile physical count');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error executing reconciliation');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Rate Modification
  const handleSaveRates = async () => {
    setErrorMessage(null);
    if (!selectedBatchId) {
      setErrorMessage('Select a batch first.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await modifyBatchRates({
        batchId: selectedBatchId,
        purchaseRate: editPurchaseRate,
        sellingRate: editSellingRate,
        secondaryRate: editSecondaryRate,
        mrp: editMrp,
        reason: rateReason,
        operatorId: operator,
      });

      if (res.success) {
        setSuccessMessage('Batch rates updated successfully.');
        loadBatches();
      } else {
        setErrorMessage(res.error || 'Failed to update rates');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error updating batch rates');
    } finally {
      setIsSubmitting(false);
    }
  };

  const discrepanciesCount = reconcileRows.filter((r) => r.variance !== 0).length;

  const actions: DosAction[] = [
    {
      keyLabel: 'F5',
      label: activeTab === 'RECONCILE' ? 'Save Adjustments' : 'Save Rates',
      variant: 'primary',
      onClick: activeTab === 'RECONCILE' ? handleCommitReconciliation : handleSaveRates,
      disabled: isSubmitting,
    },
    {
      keyLabel: 'F12',
      label: 'Reset',
      variant: 'danger',
      onClick: loadBatches,
    },
  ];

  const activeBatchObj = batchesList.find((b) => b.id === selectedBatchId);

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="Stock Count Adjustments & Batch Price Setup"
        subtitle="Physical warehouse audit reconciliation, stock discrepancies & selling rate updates"
        breadcrumbs={['Stock', 'Adjustments', activeTab === 'RECONCILE' ? 'Physical Stock Audit' : 'Batch Price Setup']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            {activeTab === 'RECONCILE'
              ? `Discrepancies: ${discrepanciesCount}`
              : `Batch: ${activeBatchObj?.batchNo || 'None'}`}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {errorMessage && (
            <div className="bg-red-600 text-white font-bold p-1.5 border border-black">
              [ERROR] {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="bg-green-100 text-green-900 font-bold p-1.5 border border-green-500 flex justify-between items-center">
              <span>[SUCCESS] {successMessage}</span>
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="underline text-xs"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Mode Switcher */}
          <div className="flex gap-2 border-b border-brand-border pb-1">
            <button
              type="button"
              onClick={() => setActiveTab('RECONCILE')}
              className={`px-4 py-1.5 font-bold cursor-pointer border ${
                activeTab === 'RECONCILE'
                  ? 'bg-brand-ink text-white border-black'
                  : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
              }`}
            >
              [1. Physical Stock Count & Reconciliation]
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('RATES')}
              className={`px-4 py-1.5 font-bold cursor-pointer border ${
                activeTab === 'RATES'
                  ? 'bg-brand-ink text-white border-black'
                  : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
              }`}
            >
              [2. Batch Selling Rates & MRP Setup]
            </button>
          </div>

          {/* TAB 1: Physical Count Reconciliation */}
          {activeTab === 'RECONCILE' && (
            <div className="flex flex-col flex-1 gap-2 overflow-hidden">
              <div className="bg-brand-surface border border-brand-border p-2 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <label className="font-bold text-brand-ink">Filter Batches:</label>
                  <input
                    type="text"
                    placeholder="Search by code, product, batch..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-72 bg-white border border-brand-border px-2 py-0.5"
                  />
                </div>
                <div className="flex items-center gap-4 text-gray-600">
                  <span>Date: {systemDate}</span>
                  <span>Operator: {operator}</span>
                </div>
              </div>

              {/* Disposition Rule Notice */}
              <div className="bg-blue-50 border border-blue-300 p-1.5 text-blue-900 text-[11px]">
                <strong>Adjustment Guidelines:</strong> Shortages marked <em>Damage</em> or <em>Expired</em> are transferred to quarantine stock. Shortages marked <em>Shrinkage</em> or <em>Lab Sample</em> are written off. Excess stock marked <em>Found</em> is added to active saleable inventory.
              </div>

              <div className="flex-1 border border-brand-border overflow-auto bg-white min-h-48">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-brand-ink text-white z-10">
                    <tr>
                      <th className="w-8 px-1 py-1 text-center">#</th>
                      <th className="w-20 px-2 py-1 text-left">ITEM CODE</th>
                      <th className="px-2 py-1 text-left">PRODUCT NAME</th>
                      <th className="w-24 px-2 py-1 text-center">BATCH NO</th>
                      <th className="w-20 px-2 py-1 text-right">SYSTEM QTY</th>
                      <th className="w-24 px-2 py-1 text-right">PHYSICAL COUNT</th>
                      <th className="w-20 px-2 py-1 text-right">VARIANCE</th>
                      <th className="w-36 px-2 py-1 text-left">ADJUSTMENT REASON</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-gray-500 font-bold">
                          --- NO BATCHES MATCH FILTER ---
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((r, idx) => {
                        const hasDiff = r.variance !== 0;
                        const isShortage = r.variance < 0;

                        return (
                          <tr
                            key={r.batchId}
                            className={`border-b border-gray-200 ${
                              hasDiff ? (isShortage ? 'bg-red-50' : 'bg-green-50') : ''
                            }`}
                          >
                            <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                            <td className="px-2 py-1 font-bold">{r.productCode}</td>
                            <td className="px-2 py-1 font-bold">{r.productName}</td>
                            <td className="px-2 py-1 text-center font-mono font-bold">
                              {r.batchNo}
                            </td>
                            <td className="px-2 py-1 text-right font-bold text-gray-700">
                              {r.systemQty}
                            </td>
                            <td className="px-2 py-0.5 text-right">
                              <input
                                type="number"
                                min="0"
                                value={r.physicalQty}
                                onChange={(e) =>
                                  handlePhysicalQtyChange(
                                    r.batchId,
                                    Math.max(0, parseInt(e.target.value) || 0)
                                  )
                                }
                                className={`w-18 text-right px-1 py-0.5 border font-bold ${
                                  hasDiff
                                    ? 'bg-amber-100 border-amber-600'
                                    : 'bg-white border-brand-border'
                                }`}
                              />
                            </td>
                            <td
                              className={`px-2 py-1 text-right font-bold ${
                                r.variance > 0
                                  ? 'text-green-700'
                                  : r.variance < 0
                                  ? 'text-red-700'
                                  : 'text-gray-400'
                              }`}
                            >
                              {r.variance > 0 ? `+${r.variance}` : r.variance}
                            </td>
                            <td className="px-2 py-0.5">
                              {hasDiff ? (
                                <select
                                  value={r.reason}
                                  onChange={(e) =>
                                    handleReasonChange(r.batchId, e.target.value as any)
                                  }
                                  className="w-full bg-white border border-brand-border px-1 py-0.5 font-bold"
                                >
                                  {isShortage ? (
                                    <>
                                      <option value="DAMAGE">Damaged Goods (Quarantine)</option>
                                      <option value="EXPIRED">Expired Stock (Quarantine)</option>
                                      <option value="THEFT_SHRINK">Stock Shrinkage (Write-off)</option>
                                      <option value="LAB_LOSS">Lab / Quality Sample (Write-off)</option>
                                      <option value="DATA_FIX">Counting Correction</option>
                                    </>
                                  ) : (
                                    <>
                                      <option value="FOUND">Surplus Stock (Add to Stock)</option>
                                      <option value="DATA_FIX">Counting Correction</option>
                                    </>
                                  )}
                                </select>
                              ) : (
                                <span className="text-gray-400">Matches System Stock</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Action Bar */}
              <div className="bg-brand-surface border border-brand-border p-2 flex justify-between items-center">
                <span className="text-gray-600">
                  Batches with Stock Discrepancies: <strong>{discrepanciesCount}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleCommitReconciliation}
                  disabled={isSubmitting || discrepanciesCount === 0}
                  className="bg-brand-ink text-white font-bold px-6 py-2 border-2 border-black hover:bg-brand-amber disabled:opacity-50"
                >
                  {isSubmitting ? 'SAVING...' : '[F5: APPLY STOCK ADJUSTMENTS]'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Batch Rate Modification */}
          {activeTab === 'RATES' && (
            <div className="flex flex-col flex-1 gap-3 max-w-3xl">
              <div className="bg-brand-surface border border-brand-border p-3 grid grid-cols-12 gap-3 items-center">
                <label className="col-span-4 font-bold text-brand-ink">Select Product Batch:</label>
                <div className="col-span-8">
                  <select
                    value={selectedBatchId}
                    onChange={(e) => {
                      const b = batchesList.find((item) => item.id === e.target.value);
                      if (b) handleSelectBatchForRates(b);
                    }}
                    className="w-full bg-[#00AAAA] text-black font-bold px-2 py-1 border border-black focus:outline-none"
                  >
                    {batchesList.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.product?.code} - {b.product?.name} | Batch: {b.batchNo} (Qty: {b.stockQty})
                      </option>
                    ))}
                  </select>
                </div>

                <label className="col-span-4 font-bold text-brand-ink">Purchase Cost Rate (₹):</label>
                <div className="col-span-8">
                  <input
                    type="number"
                    step="0.01"
                    value={editPurchaseRate}
                    onChange={(e) => setEditPurchaseRate(parseFloat(e.target.value) || 0)}
                    className="w-48 bg-white border border-brand-border px-2 py-1 font-bold text-right"
                    required
                  />
                </div>

                <label className="col-span-4 font-bold text-brand-ink">Wholesale / Selling Rate (₹):</label>
                <div className="col-span-8">
                  <input
                    type="number"
                    step="0.01"
                    value={editSellingRate}
                    onChange={(e) => setEditSellingRate(parseFloat(e.target.value) || 0)}
                    className="w-48 bg-white border border-brand-border px-2 py-1 font-bold text-blue-700 text-right"
                    required
                  />
                </div>

                <label className="col-span-4 font-bold text-brand-ink">Special / Secondary Rate (₹):</label>
                <div className="col-span-8">
                  <input
                    type="number"
                    step="0.01"
                    value={editSecondaryRate}
                    onChange={(e) => setEditSecondaryRate(parseFloat(e.target.value) || 0)}
                    className="w-48 bg-white border border-brand-border px-2 py-1 text-right"
                  />
                </div>

                <label className="col-span-4 font-bold text-brand-ink">Maximum Retail Price - MRP (₹):</label>
                <div className="col-span-8">
                  <input
                    type="number"
                    step="0.01"
                    value={editMrp}
                    onChange={(e) => setEditMrp(parseFloat(e.target.value) || 0)}
                    className="w-48 bg-white border border-brand-border px-2 py-1 font-bold text-right"
                    required
                  />
                </div>

                <label className="col-span-4 font-bold text-brand-ink">Price Revision Remarks:</label>
                <div className="col-span-8">
                  <input
                    type="text"
                    value={rateReason}
                    onChange={(e) => setRateReason(e.target.value)}
                    placeholder="e.g. Price revision as per manufacturer price list"
                    className="w-full bg-white border border-brand-border px-2 py-1"
                  />
                </div>
              </div>

              {/* Invariant Validator Status */}
              <div className="border border-brand-border p-3 bg-white">
                <span className="font-bold text-brand-ink block mb-2">PRICING VALIDATION CHECK:</span>
                <ul className="flex flex-col gap-1 text-[11px]">
                  <li className={editPurchaseRate > 0 ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
                    ✓ Purchase Rate &gt; 0: ₹ {editPurchaseRate.toFixed(2)}
                  </li>
                  <li className={editSellingRate >= editPurchaseRate ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
                    {editSellingRate >= editPurchaseRate ? '✓' : '✗'} Non-Negative Margin (Selling Rate &gt;= Purchase Rate): Margin ₹ {(editSellingRate - editPurchaseRate).toFixed(2)}
                  </li>
                  <li className={editMrp >= editSellingRate ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
                    {editMrp >= editSellingRate ? '✓' : '✗'} Maximum Retail Price (MRP &gt;= Selling Rate): Ceiling headroom ₹ {(editMrp - editSellingRate).toFixed(2)}
                  </li>
                </ul>
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={handleSaveRates}
                  disabled={isSubmitting || editSellingRate > editMrp || editSellingRate < editPurchaseRate}
                  className="bg-brand-ink text-white font-bold px-8 py-2 border-2 border-black hover:bg-brand-amber cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'SAVING...' : '[F5: SAVE BATCH RATES]'}
                </button>
              </div>
            </div>
          )}
        </div>
      </DosWindow>
    </div>
  );
}
