'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DosWindow } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import {
  getNextPaymentNo,
  getSupplierOutstandings,
  recordSupplierPayment,
  getSupplierPayments,
  deleteSupplierPayment,
  getSuppliersLookup,
  SupplierPaymentLineInput,
} from './actions';
import { OpenPurchaseBill } from '@/lib/business-engine';

interface SupplierOption {
  id: string;
  code: string;
  name: string;
  currentBalance: number;
  gstin: string;
  address: string;
}

export default function SupplierPaymentsPage() {
  const [activeTab, setActiveTab] = useState<'entry' | 'register'>('entry');
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [openPurchases, setOpenPurchases] = useState<OpenPurchaseBill[]>([]);
  const [allocations, setAllocations] = useState<Record<string, { allocated: number; discount: number }>>({});

  // Voucher Form State
  const [paymentNo, setPaymentNo] = useState<string>('PMT-000101');
  const [paymentDate, setPaymentDate] = useState<string>('2026-09-28');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'CHEQUE' | 'NEFT_RTGS' | 'UPI' | 'DEBIT_NOTE_ADJUSTMENT' | 'DD'>('CHEQUE');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [discountReceived, setDiscountReceived] = useState<string>('0');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [referenceDate, setReferenceDate] = useState<string>('2026-09-28');
  const [bankName, setBankName] = useState<string>('STATE BANK OF INDIA');
  const [bankAccountNo, setBankAccountNo] = useState<string>('');
  const [narration, setNarration] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Register state
  const [paymentsList, setPaymentsList] = useState<any[]>([]);
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    getSuppliersLookup().then(setSuppliers).catch(console.error);
    getNextPaymentNo().then(setPaymentNo).catch(console.error);
  }, []);

  const loadPayments = useCallback(() => {
    getSupplierPayments().then(setPaymentsList).catch(console.error);
  }, []);

  useEffect(() => {
    if (activeTab === 'register') {
      loadPayments();
    }
  }, [activeTab, loadPayments]);

  // When supplier changes, load outstandings
  useEffect(() => {
    if (!selectedSupplierId) {
      setOpenPurchases([]);
      setAllocations({});
      return;
    }
    setLoading(true);
    getSupplierOutstandings(selectedSupplierId)
      .then((bills) => {
        setOpenPurchases(bills);
        const initialAlloc: Record<string, { allocated: number; discount: number }> = {};
        bills.forEach(b => {
          initialAlloc[b.id] = { allocated: 0, discount: 0 };
        });
        setAllocations(initialAlloc);
      })
      .catch((e) => setErrorMsg(e.message))
      .finally(() => setLoading(false));
  }, [selectedSupplierId]);

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);

  // Auto-allocate FIFO
  const handleAutoAllocate = () => {
    const amt = parseFloat(totalAmount) || 0;
    if (amt <= 0) {
      setErrorMsg('Please enter a valid disbursement amount before auto-allocating.');
      return;
    }

    let remaining = amt;
    const newAlloc: Record<string, { allocated: number; discount: number }> = {};

    for (const bill of openPurchases) {
      const needed = bill.balanceAmount;
      if (remaining <= 0) {
        newAlloc[bill.id] = { allocated: 0, discount: 0 };
      } else if (remaining >= needed) {
        newAlloc[bill.id] = { allocated: needed, discount: 0 };
        remaining = Number((remaining - needed).toFixed(2));
      } else {
        newAlloc[bill.id] = { allocated: remaining, discount: 0 };
        remaining = 0;
      }
    }

    setAllocations(newAlloc);
    setErrorMsg(null);
  };

  const handleManualAllocChange = (billId: string, val: string) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setAllocations(prev => ({
      ...prev,
      [billId]: { ...prev[billId], allocated: num },
    }));
  };

  // Compute live totals
  const totalAllocated = Object.values(allocations).reduce((acc, curr) => acc + (curr?.allocated || 0), 0);
  const numTotalAmount = parseFloat(totalAmount) || 0;
  const numDiscount = parseFloat(discountReceived) || 0;
  const unallocatedAdvance = Math.max(0, Number((numTotalAmount - totalAllocated).toFixed(2)));

  // Save Voucher
  const handleSavePayment = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedSupplierId) {
      setErrorMsg('Please select a supplier.');
      return;
    }
    if (numTotalAmount <= 0) {
      setErrorMsg('Disbursement amount must be greater than zero.');
      return;
    }
    if (paymentMode === 'CHEQUE') {
      if (!referenceNo.trim()) {
        setErrorMsg('Cheque number is mandatory for cheque payment mode.');
        return;
      }
      if (!bankName.trim()) {
        setErrorMsg('Issuing bank name is mandatory for cheque payment mode.');
        return;
      }
    }

    const allocList: SupplierPaymentLineInput[] = [];
    openPurchases.forEach(b => {
      const alloc = allocations[b.id];
      if (alloc && (alloc.allocated > 0 || alloc.discount > 0)) {
        allocList.push({
          purchaseId: b.id,
          allocatedAmount: alloc.allocated,
          discountAmount: alloc.discount,
        });
      }
    });

    setLoading(true);
    try {
      const res = await recordSupplierPayment({
        supplierId: selectedSupplierId,
        paymentDate,
        paymentMode,
        totalAmount: numTotalAmount,
        discountReceived: numDiscount,
        referenceNo: referenceNo.trim() || undefined,
        referenceDate: referenceDate || undefined,
        bankName: bankName.trim() || undefined,
        bankAccountNo: bankAccountNo.trim() || undefined,
        narration: narration.trim() || undefined,
        allocations: allocList,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to record supplier payment');
      } else {
        setSuccessMsg(`Payment voucher ${res.paymentNo} recorded successfully! Advance: ₹${res.unallocatedAmount?.toFixed(2)}`);
        // Refresh supplier list
        getSuppliersLookup().then(setSuppliers);
        // Refresh open purchase bills
        getSupplierOutstandings(selectedSupplierId).then(setOpenPurchases);
        // Reset form
        setTotalAmount('');
        setDiscountReceived('0');
        setReferenceNo('');
        setNarration('');
        getNextPaymentNo().then(setPaymentNo);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePaymentConfirm = async () => {
    if (!deletePaymentId) return;
    setLoading(true);
    try {
      const res = await deleteSupplierPayment(deletePaymentId);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to reverse payment');
      } else {
        setSuccessMsg('Payment reversed successfully.');
        loadPayments();
        getSuppliersLookup().then(setSuppliers);
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
      setDeletePaymentId(null);
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setActiveTab('entry');
      } else if (e.key === 'F4') {
        e.preventDefault();
        setActiveTab('register');
      } else if (e.key === 'F10') {
        e.preventDefault();
        handleSavePayment();
      } else if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        handleAutoAllocate();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <DosWindow
      title="Supplier Payments"
      breadcrumbs={['ACCOUNTS', 'PAYMENTS']}
      actions={[
        { keyLabel: 'F1', label: 'New Payment', onClick: () => setActiveTab('entry') },
        { keyLabel: 'F4', label: 'Payments Register', onClick: () => setActiveTab('register') },
        { keyLabel: 'Alt+A', label: 'Auto-Allocate (FIFO)', onClick: handleAutoAllocate },
        { keyLabel: 'F10', label: 'Save Payment', onClick: handleSavePayment },
      ]}
    >
      <div className="flex flex-col gap-4 font-mono text-xs">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-brand-border pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('entry')}
            className={`px-3 py-1 font-bold border ${
              activeTab === 'entry'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [F1] SUPPLIER PAYMENT ENTRY
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('register')}
            className={`px-3 py-1 font-bold border ${
              activeTab === 'register'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [F4] PAYMENTS REGISTER
          </button>
        </div>

        {errorMsg && (
          <div className="p-2 bg-red-100 border border-red-500 text-red-700 font-bold">
            [ERROR]: {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-2 bg-green-100 border border-green-500 text-green-800 font-bold">
            [SUCCESS]: {successMsg}
          </div>
        )}

        {activeTab === 'entry' ? (
          <div className="flex flex-col gap-4">
            {/* Top Supplier Card */}
            <div className="p-3 bg-brand-surface border border-brand-border grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="block font-bold text-gray-700 mb-1">SELECT SUPPLIER:</label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full p-1.5 bg-white border border-brand-border font-bold text-brand-ink"
                >
                  <option value="">-- Select Supplier Account --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      [{s.code}] {s.name} — Balance: ₹{s.currentBalance.toFixed(2)}
                    </option>
                  ))}
                </select>
                {selectedSupplier && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    GSTIN: {selectedSupplier.gstin || 'UNREGISTERED'} | {selectedSupplier.address || 'Local'}
                  </p>
                )}
              </div>

              <div>
                <span className="block text-[10px] text-gray-500 font-bold uppercase">OPEN INWARD BILLS</span>
                <span className="text-sm font-bold text-gray-700">{openPurchases.length} Open Inward Bills</span>
              </div>

              <div>
                <span className="block text-[10px] text-gray-500 font-bold uppercase">CURRENT PAYABLE BALANCE</span>
                <span className="text-base font-bold text-red-600">
                  ₹ {selectedSupplier ? selectedSupplier.currentBalance.toFixed(2) : '0.00'}
                </span>
              </div>
            </div>

            {/* Voucher Details Input Form */}
            <div className="p-3 bg-white border border-brand-border grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-gray-600 font-bold mb-1">PAYMENT NO:</label>
                <input
                  type="text"
                  readOnly
                  value={paymentNo}
                  className="w-full p-1 bg-gray-100 border border-brand-border font-bold text-brand-ink"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-bold mb-1">PAYMENT DATE:</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full p-1 bg-white border border-brand-border"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-bold mb-1">PAYMENT MODE:</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as any)}
                  className="w-full p-1 bg-white border border-brand-border font-bold"
                >
                  <option value="CHEQUE">CHEQUE</option>
                  <option value="CASH">CASH</option>
                  <option value="NEFT_RTGS">NEFT / RTGS</option>
                  <option value="UPI">UPI</option>
                  <option value="DD">DEMAND DRAFT (DD)</option>
                  <option value="DEBIT_NOTE_ADJUSTMENT">DEBIT NOTE ADJ.</option>
                </select>
              </div>

              <div>
                <label className="block text-brand-amber font-bold mb-1">PAYMENT AMOUNT (₹):</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  className="w-full p-1 bg-yellow-50 border-2 border-brand-amber font-bold text-base text-right"
                />
              </div>

              {/* Conditional Cheque / Banking inputs */}
              {paymentMode === 'CHEQUE' && (
                <>
                  <div>
                    <label className="block text-gray-600 font-bold mb-1">CHEQUE NO:</label>
                    <input
                      type="text"
                      placeholder="e.g. 654321"
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                      className="w-full p-1 bg-white border border-brand-border font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-600 font-bold mb-1">CHEQUE DATE:</label>
                    <input
                      type="date"
                      value={referenceDate}
                      onChange={(e) => setReferenceDate(e.target.value)}
                      className="w-full p-1 bg-white border border-brand-border"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-600 font-bold mb-1">BANK NAME:</label>
                    <input
                      type="text"
                      placeholder="e.g. State Bank of India"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full p-1 bg-white border border-brand-border"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-600 font-bold mb-1">BANK A/C NO:</label>
                    <input
                      type="text"
                      placeholder="e.g. 12345678901"
                      value={bankAccountNo}
                      onChange={(e) => setBankAccountNo(e.target.value)}
                      className="w-full p-1 bg-white border border-brand-border"
                    />
                  </div>
                </>
              )}

              {(paymentMode === 'NEFT_RTGS' || paymentMode === 'UPI' || paymentMode === 'DD') && (
                <div className="sm:col-span-2">
                  <label className="block text-gray-600 font-bold mb-1">REF / UTR NO:</label>
                  <input
                    type="text"
                    placeholder="Bank Transfer Reference / UTR Number"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="w-full p-1 bg-white border border-brand-border"
                  />
                </div>
              )}

              <div>
                <label className="block text-gray-600 font-bold mb-1">DISCOUNT RECEIVED (₹):</label>
                <input
                  type="number"
                  step="0.01"
                  value={discountReceived}
                  onChange={(e) => setDiscountReceived(e.target.value)}
                  className="w-full p-1 bg-white border border-brand-border text-right"
                />
              </div>

              <div className="sm:col-span-2 md:col-span-3">
                <label className="block text-gray-600 font-bold mb-1">NARRATION / REMARKS:</label>
                <input
                  type="text"
                  placeholder="Optional notes or supplier payment remarks"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  className="w-full p-1 bg-white border border-brand-border"
                />
              </div>
            </div>

            {/* Inward Purchase Bills Allocation Table */}
            <div className="bg-white border border-brand-border flex flex-col">
              <div className="p-2 bg-brand-surface border-b border-brand-border flex items-center justify-between">
                <span className="font-bold text-brand-ink uppercase">
                  OPEN PURCHASE INVOICES ALLOCATION (FIFO)
                </span>
                <button
                  type="button"
                  onClick={handleAutoAllocate}
                  className="px-3 py-1 bg-brand-ink text-white font-bold hover:bg-brand-ink/90 flex items-center gap-1 cursor-pointer"
                >
                  <span className="bg-brand-amber text-black px-1 text-[10px]">Alt+A</span>
                  <span>AUTO-ALLOCATE (FIFO)</span>
                </button>
              </div>

              <div className="overflow-x-auto max-h-[300px]">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-100 border-b border-brand-border sticky top-0">
                    <tr>
                      <th className="p-2 border-r border-brand-border">INWARD NO</th>
                      <th className="p-2 border-r border-brand-border">BILL NO</th>
                      <th className="p-2 border-r border-brand-border">DATE</th>
                      <th className="p-2 border-r border-brand-border text-right">BILL NET AMT</th>
                      <th className="p-2 border-r border-brand-border text-right">PRIOR PAID</th>
                      <th className="p-2 border-r border-brand-border text-right text-red-600">BALANCE DUE</th>
                      <th className="p-2 border-r border-brand-border text-right w-32 bg-yellow-50">ALLOCATED AMT</th>
                      <th className="p-2 text-right">NEW BALANCE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openPurchases.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-4 text-center text-gray-500 italic">
                          {selectedSupplierId
                            ? 'No open purchase bills found for this supplier.'
                            : 'Select a supplier to view open purchase bills.'}
                        </td>
                      </tr>
                    ) : (
                      openPurchases.map((b) => {
                        const allocVal = allocations[b.id]?.allocated || 0;
                        const newBal = Math.max(0, Number((b.balanceAmount - allocVal).toFixed(2)));

                        return (
                          <tr key={b.id} className="border-b border-gray-200 hover:bg-blue-50">
                            <td className="p-2 border-r border-brand-border font-bold">{b.inwardNo}</td>
                            <td className="p-2 border-r border-brand-border">{b.supplierBillNo || '-'}</td>
                            <td className="p-2 border-r border-brand-border">{b.inwardDate}</td>
                            <td className="p-2 border-r border-brand-border text-right">₹{b.netAmount.toFixed(2)}</td>
                            <td className="p-2 border-r border-brand-border text-right">₹{b.paidAmount.toFixed(2)}</td>
                            <td className="p-2 border-r border-brand-border text-right font-bold text-red-600">
                              ₹{b.balanceAmount.toFixed(2)}
                            </td>
                            <td className="p-1 border-r border-brand-border bg-yellow-50">
                              <input
                                type="number"
                                step="0.01"
                                value={allocations[b.id]?.allocated ?? 0}
                                onChange={(e) => handleManualAllocChange(b.id, e.target.value)}
                                className="w-full p-1 border border-brand-border text-right font-bold bg-white"
                              />
                            </td>
                            <td className={`p-2 text-right font-bold ${newBal === 0 ? 'text-green-600' : 'text-gray-700'}`}>
                              ₹{newBal.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bottom Summary Bar */}
              <div className="p-3 bg-brand-surface border-t border-brand-border grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-bold">
                <div>
                  <span className="text-[10px] text-gray-500 block">TOTAL PAID:</span>
                  <span className="text-sm text-brand-ink">₹ {numTotalAmount.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block">TOTAL ALLOCATED:</span>
                  <span className="text-sm text-blue-700">₹ {totalAllocated.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block">DISCOUNT RECEIVED:</span>
                  <span className="text-sm text-gray-700">₹ {numDiscount.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block">ADVANCE / UNALLOCATED:</span>
                  <span className={`text-sm ${unallocatedAdvance > 0 ? 'text-brand-amber' : 'text-gray-500'}`}>
                    ₹ {unallocatedAdvance.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleSavePayment}
                disabled={loading || !selectedSupplierId || numTotalAmount <= 0}
                className="px-6 py-2 bg-brand-ink text-white font-bold hover:bg-brand-ink/90 disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#F05A28]"
              >
                <span>[F10] SAVE PAYMENT</span>
              </button>
            </div>
          </div>
        ) : (
          /* Payments Register Tab */
          <div className="bg-white border border-brand-border flex flex-col">
            <div className="p-2 bg-brand-surface border-b border-brand-border flex items-center justify-between">
              <span className="font-bold text-brand-ink uppercase">SUPPLIER PAYMENTS REGISTER</span>
              <button
                type="button"
                onClick={loadPayments}
                className="px-2 py-0.5 bg-white border border-brand-border hover:bg-gray-100 font-bold"
              >
                REFRESH
              </button>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-100 border-b border-brand-border sticky top-0">
                  <tr>
                    <th className="p-2 border-r border-brand-border">PMT NO</th>
                    <th className="p-2 border-r border-brand-border">DATE</th>
                    <th className="p-2 border-r border-brand-border">SUPPLIER</th>
                    <th className="p-2 border-r border-brand-border">MODE</th>
                    <th className="p-2 border-r border-brand-border text-right">TOTAL AMOUNT</th>
                    <th className="p-2 border-r border-brand-border">REF / CHQ NO</th>
                    <th className="p-2 border-r border-brand-border">CHQ STATUS</th>
                    <th className="p-2 border-r border-brand-border text-right">ADVANCE</th>
                    <th className="p-2 text-center">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentsList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-4 text-center text-gray-500 italic">
                        No supplier payment vouchers found.
                      </td>
                    </tr>
                  ) : (
                    paymentsList.map((p) => (
                      <tr key={p.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="p-2 border-r border-brand-border font-bold text-brand-ink">{p.paymentNo}</td>
                        <td className="p-2 border-r border-brand-border">{p.paymentDate}</td>
                        <td className="p-2 border-r border-brand-border">
                          [{p.supplierCode}] {p.supplierName}
                        </td>
                        <td className="p-2 border-r border-brand-border font-bold">{p.paymentMode}</td>
                        <td className="p-2 border-r border-brand-border text-right font-bold">
                          ₹{Number(p.totalAmount).toFixed(2)}
                        </td>
                        <td className="p-2 border-r border-brand-border">{p.referenceNo || '-'}</td>
                        <td className="p-2 border-r border-brand-border">
                          {p.paymentMode === 'CHEQUE' ? (
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-bold ${
                                p.chequeStatus === 'PASSED'
                                  ? 'bg-green-100 text-green-800'
                                  : p.chequeStatus === 'CANCELLED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {p.chequeStatus}
                            </span>
                          ) : (
                            <span className="text-gray-400">N/A</span>
                          )}
                        </td>
                        <td className="p-2 border-r border-brand-border text-right text-gray-600">
                          ₹{Number(p.unallocatedAmount || 0).toFixed(2)}
                        </td>
                        <td className="p-2 text-center">
                          {p.dayEndLocked ? (
                            <span className="text-gray-400 text-[10px] font-bold">[LOCKED]</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeletePaymentId(p.id)}
                              className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-300 hover:bg-red-100 text-[11px] font-bold"
                            >
                              REVERSE
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        <DosModal
          isOpen={!!deletePaymentId}
          onClose={() => setDeletePaymentId(null)}
          title="CONFIRM PAYMENT REVERSAL"
          variant="danger"
          confirmText="[Enter: Confirm Reverse]"
          onConfirm={handleDeletePaymentConfirm}
        >
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold text-red-700">
              Notice: Reversing this payment voucher will restore the balance on all allocated purchase invoices and update the supplier ledger accordingly.
            </p>
            <p className="text-xs text-gray-700">
              Are you sure you want to proceed with reversing payment ID: {deletePaymentId}?
            </p>
          </div>
        </DosModal>
      </div>
    </DosWindow>
  );
}
