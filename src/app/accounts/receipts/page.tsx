'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DosWindow } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import {
  getNextReceiptNo,
  getCustomerOutstandings,
  recordCustomerReceipt,
  getCustomerReceipts,
  deleteCustomerReceipt,
  getCustomersLookup,
  CustomerReceiptLineInput,
} from './actions';
import { OpenBill } from '@/lib/business-engine';

interface CustomerOption {
  id: string;
  code: string;
  name: string;
  closingBalance: number;
  creditLimit: number;
  address: string;
}

export default function CustomerReceiptsPage() {
  const [activeTab, setActiveTab] = useState<'entry' | 'register'>('entry');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [openBills, setOpenBills] = useState<OpenBill[]>([]);
  const [allocations, setAllocations] = useState<Record<string, { allocated: number; discount: number }>>({});

  // Voucher Form State
  const [receiptNo, setReceiptNo] = useState<string>('RCT-000101');
  const [receiptDate, setReceiptDate] = useState<string>('2026-09-28');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'CHEQUE' | 'NEFT_RTGS' | 'UPI' | 'CREDIT_NOTE_ADJUSTMENT'>('CASH');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [discountAllowed, setDiscountAllowed] = useState<string>('0');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [referenceDate, setReferenceDate] = useState<string>('2026-09-28');
  const [bankName, setBankName] = useState<string>('');
  const [branchName, setBranchName] = useState<string>('');
  const [narration, setNarration] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Register state
  const [receiptsList, setReceiptsList] = useState<any[]>([]);
  const [deleteReceiptId, setDeleteReceiptId] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    getCustomersLookup().then(setCustomers).catch(console.error);
    getNextReceiptNo().then(setReceiptNo).catch(console.error);
  }, []);

  const loadReceipts = useCallback(() => {
    getCustomerReceipts().then(setReceiptsList).catch(console.error);
  }, []);

  useEffect(() => {
    if (activeTab === 'register') {
      loadReceipts();
    }
  }, [activeTab, loadReceipts]);

  // When customer changes, load outstandings
  useEffect(() => {
    if (!selectedCustomerId) {
      setOpenBills([]);
      setAllocations({});
      return;
    }
    setLoading(true);
    getCustomerOutstandings(selectedCustomerId)
      .then((bills) => {
        setOpenBills(bills);
        const initialAlloc: Record<string, { allocated: number; discount: number }> = {};
        bills.forEach(b => {
          initialAlloc[b.id] = { allocated: 0, discount: 0 };
        });
        setAllocations(initialAlloc);
      })
      .catch((e) => setErrorMsg(e.message))
      .finally(() => setLoading(false));
  }, [selectedCustomerId]);

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  // Auto-allocate FIFO
  const handleAutoAllocate = () => {
    const amt = parseFloat(totalAmount) || 0;
    if (amt <= 0) {
      setErrorMsg('Please enter a valid collection amount before auto-allocating.');
      return;
    }

    let remaining = amt;
    const newAlloc: Record<string, { allocated: number; discount: number }> = {};

    for (const bill of openBills) {
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
  const numDiscount = parseFloat(discountAllowed) || 0;
  const unallocatedAdvance = Math.max(0, Number((numTotalAmount - totalAllocated).toFixed(2)));

  // Save Voucher
  const handleSaveReceipt = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedCustomerId) {
      setErrorMsg('Please select a customer.');
      return;
    }
    if (numTotalAmount <= 0) {
      setErrorMsg('Collection amount must be greater than zero.');
      return;
    }
    if (paymentMode === 'CHEQUE') {
      if (!referenceNo.trim()) {
        setErrorMsg('Cheque number is mandatory for cheque payment mode.');
        return;
      }
      if (!bankName.trim()) {
        setErrorMsg('Drawn bank name is mandatory for cheque payment mode.');
        return;
      }
    }

    const allocList: CustomerReceiptLineInput[] = [];
    openBills.forEach(b => {
      const alloc = allocations[b.id];
      if (alloc && (alloc.allocated > 0 || alloc.discount > 0)) {
        allocList.push({
          outstandingId: b.id,
          invoiceId: b.invoiceId,
          allocatedAmount: alloc.allocated,
          discountAmount: alloc.discount,
        });
      }
    });

    setLoading(true);
    try {
      const res = await recordCustomerReceipt({
        customerId: selectedCustomerId,
        receiptDate,
        paymentMode,
        totalAmount: numTotalAmount,
        discountAllowed: numDiscount,
        referenceNo: referenceNo.trim() || undefined,
        referenceDate: referenceDate || undefined,
        bankName: bankName.trim() || undefined,
        branchName: branchName.trim() || undefined,
        narration: narration.trim() || undefined,
        allocations: allocList,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to save receipt voucher');
      } else {
        setSuccessMsg(`Receipt ${res.receiptNo} recorded successfully! Advance: ₹${res.unallocatedAmount?.toFixed(2)}`);
        // Refresh customer list to update balance
        getCustomersLookup().then(setCustomers);
        // Refresh outstandings
        getCustomerOutstandings(selectedCustomerId).then(setOpenBills);
        // Reset form
        setTotalAmount('');
        setDiscountAllowed('0');
        setReferenceNo('');
        setBankName('');
        setBranchName('');
        setNarration('');
        getNextReceiptNo().then(setReceiptNo);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReceiptConfirm = async () => {
    if (!deleteReceiptId) return;
    setLoading(true);
    try {
      const res = await deleteCustomerReceipt(deleteReceiptId);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to reverse receipt');
      } else {
        setSuccessMsg('Receipt reversed successfully.');
        loadReceipts();
        getCustomersLookup().then(setCustomers);
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
      setDeleteReceiptId(null);
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
        handleSaveReceipt();
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
      title="Customer Collections & Receipts"
      breadcrumbs={['ACCOUNTS', 'RECEIPTS']}
      actions={[
        { keyLabel: 'F1', label: 'New Receipt', onClick: () => setActiveTab('entry') },
        { keyLabel: 'F4', label: 'Receipts Register', onClick: () => setActiveTab('register') },
        { keyLabel: 'Alt+A', label: 'Auto-Allocate (FIFO)', onClick: handleAutoAllocate },
        { keyLabel: 'F10', label: 'Save Receipt', onClick: handleSaveReceipt },
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
            [F1] COLLECTION VOUCHER ENTRY
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
            [F4] RECEIPTS REGISTER
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
            {/* Top Customer Card */}
            <div className="p-3 bg-brand-surface border border-brand-border grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="block font-bold text-gray-700 mb-1">SELECT CUSTOMER:</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full p-1.5 bg-white border border-brand-border font-bold text-brand-ink"
                >
                  <option value="">-- Select Customer Account --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.code}] {c.name} — Balance: ₹{c.closingBalance.toFixed(2)}
                    </option>
                  ))}
                </select>
                {selectedCustomer && (
                  <p className="text-[11px] text-gray-500 mt-1">{selectedCustomer.address || 'Local'}</p>
                )}
              </div>

              <div>
                <span className="block text-[10px] text-gray-500 font-bold uppercase">CREDIT LIMIT</span>
                <span className="text-sm font-bold">
                  ₹ {selectedCustomer?.creditLimit ? selectedCustomer.creditLimit.toFixed(2) : '0.00'}
                </span>
              </div>

              <div>
                <span className="block text-[10px] text-gray-500 font-bold uppercase">OUTSTANDING BALANCE</span>
                <span className="text-base font-bold text-red-600">
                  ₹ {selectedCustomer ? selectedCustomer.closingBalance.toFixed(2) : '0.00'}
                </span>
              </div>
            </div>

            {/* Voucher Details Input Form */}
            <div className="p-3 bg-white border border-brand-border grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-gray-600 font-bold mb-1">RECEIPT NO:</label>
                <input
                  type="text"
                  readOnly
                  value={receiptNo}
                  className="w-full p-1 bg-gray-100 border border-brand-border font-bold text-brand-ink"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-bold mb-1">RECEIPT DATE:</label>
                <input
                  type="date"
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
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
                  <option value="CASH">CASH</option>
                  <option value="CHEQUE">CHEQUE</option>
                  <option value="NEFT_RTGS">NEFT / RTGS</option>
                  <option value="UPI">UPI</option>
                  <option value="CREDIT_NOTE_ADJUSTMENT">CREDIT NOTE ADJ.</option>
                </select>
              </div>

              <div>
                <label className="block text-brand-amber font-bold mb-1">COLLECTION AMOUNT (₹):</label>
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
                      placeholder="e.g. 123456"
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                      className="w-full p-1 bg-white border border-brand-border"
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
                    <label className="block text-gray-600 font-bold mb-1">BRANCH:</label>
                    <input
                      type="text"
                      placeholder="e.g. Main Branch"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      className="w-full p-1 bg-white border border-brand-border"
                    />
                  </div>
                </>
              )}

              {(paymentMode === 'NEFT_RTGS' || paymentMode === 'UPI') && (
                <div className="sm:col-span-2">
                  <label className="block text-gray-600 font-bold mb-1">UTR / REF NO:</label>
                  <input
                    type="text"
                    placeholder="Bank Transfer Reference / UTR Number"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="w-full p-1 bg-white border border-brand-border"
                  />
                </div>
              )}

              <div className="sm:col-span-2 md:col-span-4">
                <label className="block text-gray-600 font-bold mb-1">NARRATION / REMARKS:</label>
                <input
                  type="text"
                  placeholder="Optional notes or collection remarks"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  className="w-full p-1 bg-white border border-brand-border"
                />
              </div>
            </div>

            {/* Bill-by-Bill Allocation Table */}
            <div className="bg-white border border-brand-border flex flex-col">
              <div className="p-2 bg-brand-surface border-b border-brand-border flex items-center justify-between">
                <span className="font-bold text-brand-ink uppercase">
                  OUTSTANDING INVOICES ALLOCATION (FIFO)
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
                      <th className="p-2 border-r border-brand-border">INV NO</th>
                      <th className="p-2 border-r border-brand-border">DATE</th>
                      <th className="p-2 border-r border-brand-border">DUE DATE</th>
                      <th className="p-2 border-r border-brand-border text-right">ORIGINAL AMT</th>
                      <th className="p-2 border-r border-brand-border text-right">PRIOR PAID</th>
                      <th className="p-2 border-r border-brand-border text-right text-red-600">BALANCE DUE</th>
                      <th className="p-2 border-r border-brand-border text-right w-32 bg-yellow-50">ALLOCATED AMT</th>
                      <th className="p-2 text-right">NEW BALANCE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openBills.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-4 text-center text-gray-500 italic">
                          {selectedCustomerId
                            ? 'No open outstanding bills found for this customer.'
                            : 'Select a customer to view open bills.'}
                        </td>
                      </tr>
                    ) : (
                      openBills.map((b) => {
                        const allocVal = allocations[b.id]?.allocated || 0;
                        const newBal = Math.max(0, Number((b.balanceAmount - allocVal).toFixed(2)));

                        return (
                          <tr key={b.id} className="border-b border-gray-200 hover:bg-blue-50">
                            <td className="p-2 border-r border-brand-border font-bold">{b.invoiceNo}</td>
                            <td className="p-2 border-r border-brand-border">{b.invoiceDate}</td>
                            <td className="p-2 border-r border-brand-border">{b.dueDate}</td>
                            <td className="p-2 border-r border-brand-border text-right">₹{b.originalAmount.toFixed(2)}</td>
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
                  <span className="text-[10px] text-gray-500 block">TOTAL RECEIVED:</span>
                  <span className="text-sm text-brand-ink">₹ {numTotalAmount.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block">TOTAL ALLOCATED:</span>
                  <span className="text-sm text-blue-700">₹ {totalAllocated.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block">DISCOUNT ALLOWED:</span>
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
                onClick={handleSaveReceipt}
                disabled={loading || !selectedCustomerId || numTotalAmount <= 0}
                className="px-6 py-2 bg-brand-ink text-white font-bold hover:bg-brand-ink/90 disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#F05A28]"
              >
                <span>[F10] SAVE RECEIPT</span>
              </button>
            </div>
          </div>
        ) : (
          /* Receipts Register Tab */
          <div className="bg-white border border-brand-border flex flex-col">
            <div className="p-2 bg-brand-surface border-b border-brand-border flex items-center justify-between">
              <span className="font-bold text-brand-ink uppercase">RECEIPTS & COLLECTIONS REGISTER</span>
              <button
                type="button"
                onClick={loadReceipts}
                className="px-2 py-0.5 bg-white border border-brand-border hover:bg-gray-100 font-bold"
              >
                REFRESH
              </button>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-100 border-b border-brand-border sticky top-0">
                  <tr>
                    <th className="p-2 border-r border-brand-border">RCT NO</th>
                    <th className="p-2 border-r border-brand-border">DATE</th>
                    <th className="p-2 border-r border-brand-border">CUSTOMER</th>
                    <th className="p-2 border-r border-brand-border">MODE</th>
                    <th className="p-2 border-r border-brand-border text-right">TOTAL AMOUNT</th>
                    <th className="p-2 border-r border-brand-border">REF / CHQ NO</th>
                    <th className="p-2 border-r border-brand-border">CHQ STATUS</th>
                    <th className="p-2 border-r border-brand-border text-right">ADVANCE</th>
                    <th className="p-2 text-center">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptsList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-4 text-center text-gray-500 italic">
                        No customer receipts found.
                      </td>
                    </tr>
                  ) : (
                    receiptsList.map((r) => (
                      <tr key={r.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="p-2 border-r border-brand-border font-bold text-brand-ink">{r.receiptNo}</td>
                        <td className="p-2 border-r border-brand-border">{r.receiptDate}</td>
                        <td className="p-2 border-r border-brand-border">
                          [{r.customerCode}] {r.customerName}
                        </td>
                        <td className="p-2 border-r border-brand-border font-bold">{r.paymentMode}</td>
                        <td className="p-2 border-r border-brand-border text-right font-bold">
                          ₹{Number(r.totalAmount).toFixed(2)}
                        </td>
                        <td className="p-2 border-r border-brand-border">{r.referenceNo || '-'}</td>
                        <td className="p-2 border-r border-brand-border">
                          {r.paymentMode === 'CHEQUE' ? (
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-bold ${
                                r.chequeStatus === 'CLEARED'
                                  ? 'bg-green-100 text-green-800'
                                  : r.chequeStatus === 'DISHONORED'
                                  ? 'bg-red-100 text-red-800'
                                  : r.chequeStatus === 'DEPOSITED'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {r.chequeStatus}
                            </span>
                          ) : (
                            <span className="text-gray-400">N/A</span>
                          )}
                        </td>
                        <td className="p-2 border-r border-brand-border text-right text-gray-600">
                          ₹{Number(r.unallocatedAmount || 0).toFixed(2)}
                        </td>
                        <td className="p-2 text-center">
                          {r.dayEndLocked ? (
                            <span className="text-gray-400 text-[10px] font-bold">[LOCKED]</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeleteReceiptId(r.id)}
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
          isOpen={!!deleteReceiptId}
          onClose={() => setDeleteReceiptId(null)}
          title="CONFIRM RECEIPT REVERSAL"
          variant="danger"
          confirmText="[Enter: Confirm Reverse]"
          onConfirm={handleDeleteReceiptConfirm}
        >
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold text-red-700">
              Notice: Reversing this collection receipt will restore the balance on all allocated invoices and update the customer ledger accordingly.
            </p>
            <p className="text-xs text-gray-700">
              Are you sure you want to proceed with reversing receipt ID: {deleteReceiptId}?
            </p>
          </div>
        </DosModal>
      </div>
    </DosWindow>
  );
}
