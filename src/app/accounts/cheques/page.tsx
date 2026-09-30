'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DosWindow } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import {
  getChequeRegister,
  depositCheque,
  clearCheque,
  dishonorCheque,
  cancelCheque,
  recordIndependentCheque,
  ChequeFilter,
} from './actions';
import { ChequeRecord } from '@/lib/db/schema/ledgers';

export default function ChequeRegisterPage() {
  const [filterType, setFilterType] = useState<'ALL' | 'INCOMING' | 'OUTGOING'>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cheques, setCheques] = useState<ChequeRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal States
  const [selectedCheque, setSelectedCheque] = useState<ChequeRecord | null>(null);
  const [actionType, setActionType] = useState<'deposit' | 'clear' | 'dishonor' | 'cancel' | 'new' | null>(null);

  // Deposit Form
  const [depositDate, setDepositDate] = useState<string>('2026-09-28');

  // Clearance Form
  const [clearanceDate, setClearanceDate] = useState<string>('2026-09-28');

  // Dishonor Form
  const [dishonorDate, setDishonorDate] = useState<string>('2026-09-28');
  const [dishonorReason, setDishonorReason] = useState<string>('INSUFFICIENT_FUNDS');
  const [dishonorCharge, setDishonorCharge] = useState<string>('50');

  // New Independent Cheque Form
  const [newChqType, setNewChqType] = useState<'INCOMING' | 'OUTGOING'>('INCOMING');
  const [newChqNo, setNewChqNo] = useState<string>('');
  const [newChqDate, setNewChqDate] = useState<string>('2026-09-28');
  const [newChqAmt, setNewChqAmt] = useState<string>('');
  const [newBankName, setNewBankName] = useState<string>('');
  const [newBranchName, setNewBranchName] = useState<string>('');
  const [newPartyName, setNewPartyName] = useState<string>('');
  const [newRemarks, setNewRemarks] = useState<string>('');

  const loadCheques = useCallback(() => {
    setLoading(true);
    const filter: ChequeFilter = {
      type: filterType,
      status: filterStatus as any,
      searchQuery: searchQuery.trim() || undefined,
    };
    getChequeRegister(filter)
      .then(setCheques)
      .catch((e) => setErrorMsg(e.message))
      .finally(() => setLoading(false));
  }, [filterType, filterStatus, searchQuery]);

  useEffect(() => {
    loadCheques();
  }, [loadCheques]);

  // Handle Actions
  const handleDepositSubmit = async () => {
    if (!selectedCheque) return;
    setLoading(true);
    const res = await depositCheque(selectedCheque.id, depositDate);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to deposit cheque');
    } else {
      setSuccessMsg(`Cheque ${selectedCheque.chequeNo} marked as DEPOSITED on ${depositDate}.`);
      setActionType(null);
      loadCheques();
    }
  };

  const handleClearSubmit = async () => {
    if (!selectedCheque) return;
    setLoading(true);
    const res = await clearCheque(selectedCheque.id, clearanceDate);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to clear cheque');
    } else {
      setSuccessMsg(`Cheque ${selectedCheque.chequeNo} CLEARED successfully on ${clearanceDate}.`);
      setActionType(null);
      loadCheques();
    }
  };

  const handleDishonorSubmit = async () => {
    if (!selectedCheque) return;
    setLoading(true);
    const charge = parseFloat(dishonorCharge) || 0;
    const res = await dishonorCheque({
      chequeId: selectedCheque.id,
      dishonorDate,
      dishonorReason,
      dishonorCharge: charge,
    });
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to dishonor cheque');
    } else {
      setSuccessMsg(
        `Cheque ${selectedCheque.chequeNo} DISHONORED. Restored ${res.restoredBillsCount} invoice(s). New Customer AR: ₹${res.newClosingBalance.toFixed(2)}`
      );
      setActionType(null);
      loadCheques();
    }
  };

  const handleNewChequeSubmit = async () => {
    if (!newChqNo.trim() || !newBankName.trim() || !newPartyName.trim() || !newChqAmt) {
      setErrorMsg('Cheque number, bank name, party name, and amount are required.');
      return;
    }
    const amt = parseFloat(newChqAmt);
    if (amt <= 0) {
      setErrorMsg('Amount must be positive.');
      return;
    }

    setLoading(true);
    const res = await recordIndependentCheque({
      chequeType: newChqType,
      chequeNo: newChqNo.trim(),
      chequeDate: newChqDate,
      amount: amt,
      bankName: newBankName.trim(),
      branchName: newBranchName.trim() || undefined,
      partyType: newChqType === 'INCOMING' ? 'CUSTOMER' : 'SUPPLIER',
      partyId: 'EXTERNAL',
      partyName: newPartyName.trim(),
      remarks: newRemarks.trim() || undefined,
    });
    setLoading(false);

    if (!res.success) {
      setErrorMsg(res.error || 'Failed to create cheque');
    } else {
      setSuccessMsg(`Cheque ${newChqNo} recorded successfully.`);
      setActionType(null);
      setNewChqNo('');
      setNewChqAmt('');
      setNewBankName('');
      setNewBranchName('');
      setNewPartyName('');
      setNewRemarks('');
      loadCheques();
    }
  };

  return (
    <DosWindow
      title="Cheque Register & Status"
      breadcrumbs={['ACCOUNTS', 'CHEQUES']}
      actions={[
        { keyLabel: 'N', label: 'New Cheque', onClick: () => setActionType('new') },
        { keyLabel: 'F5', label: 'Refresh', onClick: loadCheques },
      ]}
    >
      <div className="flex flex-col gap-4 font-mono text-xs">
        {/* Filter Tab Bar */}
        <div className="flex flex-wrap items-center gap-1 border-b border-brand-border pb-2">
          <button
            type="button"
            onClick={() => { setFilterType('ALL'); setFilterStatus('ALL'); }}
            className={`px-2.5 py-1 font-bold border ${
              filterType === 'ALL' && filterStatus === 'ALL'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [F1] ALL CHEQUES
          </button>
          <button
            type="button"
            onClick={() => { setFilterType('INCOMING'); setFilterStatus('ALL'); }}
            className={`px-2.5 py-1 font-bold border ${
              filterType === 'INCOMING' && filterStatus === 'ALL'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [F2] CUSTOMER CHEQUES (IN)
          </button>
          <button
            type="button"
            onClick={() => { setFilterType('OUTGOING'); setFilterStatus('ALL'); }}
            className={`px-2.5 py-1 font-bold border ${
              filterType === 'OUTGOING' && filterStatus === 'ALL'
                ? 'bg-brand-ink text-white border-brand-ink'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [F3] SUPPLIER CHEQUES (OUT)
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('RECEIVED')}
            className={`px-2.5 py-1 font-bold border ${
              filterStatus === 'RECEIVED'
                ? 'bg-yellow-500 text-black border-yellow-600'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [F4] IN-HAND / PENDING
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('DEPOSITED')}
            className={`px-2.5 py-1 font-bold border ${
              filterStatus === 'DEPOSITED'
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [F5] DEPOSITED
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('CLEARED')}
            className={`px-2.5 py-1 font-bold border ${
              filterStatus === 'CLEARED'
                ? 'bg-green-600 text-white border-green-700'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [F6] CLEARED
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('DISHONORED')}
            className={`px-2.5 py-1 font-bold border ${
              filterStatus === 'DISHONORED'
                ? 'bg-red-600 text-white border-red-700'
                : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
            }`}
          >
            [F7] DISHONORED
          </button>
        </div>

        {/* Filter Strip */}
        <div className="p-2 bg-brand-surface border border-brand-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <span className="font-bold text-gray-700">SEARCH:</span>
            <input
              type="text"
              placeholder="Search Cheque No, Party Name, Bank..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="p-1 bg-white border border-brand-border flex-1 max-w-md font-mono text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActionType('new')}
              className="px-3 py-1 bg-brand-ink text-white font-bold hover:bg-brand-ink/90 flex items-center gap-1 cursor-pointer"
            >
              <span>[N] ADD CHEQUE</span>
            </button>
          </div>
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

        {/* Cheque Register Grid */}
        <div className="bg-white border border-brand-border flex flex-col">
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 border-b border-brand-border sticky top-0">
                <tr>
                  <th className="p-2 border-r border-brand-border">TYPE</th>
                  <th className="p-2 border-r border-brand-border">CHQ NO</th>
                  <th className="p-2 border-r border-brand-border">CHQ DATE</th>
                  <th className="p-2 border-r border-brand-border">PARTY NAME</th>
                  <th className="p-2 border-r border-brand-border">BANK & BRANCH</th>
                  <th className="p-2 border-r border-brand-border text-right">AMOUNT (₹)</th>
                  <th className="p-2 border-r border-brand-border">STATUS</th>
                  <th className="p-2 border-r border-brand-border">DEPOSIT DT</th>
                  <th className="p-2 border-r border-brand-border">CLEAR DT</th>
                  <th className="p-2 text-center">LIFECYCLE ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {cheques.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-4 text-center text-gray-500 italic">
                      No cheque records matching current filter criteria.
                    </td>
                  </tr>
                ) : (
                  cheques.map((c) => {
                    const isIncoming = c.chequeType === 'INCOMING';

                    return (
                      <tr key={c.id} className="border-b border-gray-200 hover:bg-blue-50">
                        <td className="p-2 border-r border-brand-border">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold ${
                              isIncoming ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800'
                            }`}
                          >
                            {isIncoming ? 'IN (CUST)' : 'OUT (SUP)'}
                          </span>
                        </td>
                        <td className="p-2 border-r border-brand-border font-bold text-brand-ink">{c.chequeNo}</td>
                        <td className="p-2 border-r border-brand-border">{c.chequeDate}</td>
                        <td className="p-2 border-r border-brand-border font-bold">{c.partyName}</td>
                        <td className="p-2 border-r border-brand-border text-[11px] text-gray-600">
                          {c.bankName} {c.branchName ? `(${c.branchName})` : ''}
                        </td>
                        <td className="p-2 border-r border-brand-border text-right font-bold">
                          ₹{Number(c.amount).toFixed(2)}
                        </td>
                        <td className="p-2 border-r border-brand-border">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold ${
                              c.status === 'CLEARED'
                                ? 'bg-green-100 text-green-800 border border-green-300'
                                : c.status === 'DISHONORED'
                                ? 'bg-red-100 text-red-800 border border-red-300'
                                : c.status === 'DEPOSITED'
                                ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                : c.status === 'CANCELLED'
                                ? 'bg-gray-100 text-gray-500'
                                : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="p-2 border-r border-brand-border">{c.depositDate || '-'}</td>
                        <td className="p-2 border-r border-brand-border">{c.clearanceDate || '-'}</td>
                        <td className="p-2 text-center flex items-center justify-center gap-1">
                          {/* Deposit Action */}
                          {c.status === 'RECEIVED' && isIncoming && (
                            <button
                              type="button"
                              onClick={() => { setSelectedCheque(c); setActionType('deposit'); }}
                              className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-300 hover:bg-blue-100 text-[10px] font-bold"
                            >
                              DEPOSIT
                            </button>
                          )}

                          {/* Clear Action */}
                          {(c.status === 'RECEIVED' || c.status === 'DEPOSITED' || c.status === 'ISSUED') && (
                            <button
                              type="button"
                              onClick={() => { setSelectedCheque(c); setActionType('clear'); }}
                              className="px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-300 hover:bg-green-100 text-[10px] font-bold"
                            >
                              CLEAR
                            </button>
                          )}

                          {/* Dishonor / Bounce Action */}
                          {isIncoming && c.status !== 'DISHONORED' && c.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={() => { setSelectedCheque(c); setActionType('dishonor'); }}
                              className="px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-300 hover:bg-red-100 text-[10px] font-bold"
                            >
                              BOUNCE
                            </button>
                          )}

                          {c.status === 'CLEARED' && (
                            <span className="text-green-700 text-[10px] font-bold">PASSED</span>
                          )}
                          {c.status === 'DISHONORED' && (
                            <span className="text-red-700 text-[10px] font-bold">REVERSED</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Deposit Modal */}
        <DosModal
          isOpen={actionType === 'deposit'}
          onClose={() => setActionType(null)}
          title={`DEPOSIT CHEQUE - [${selectedCheque?.chequeNo}]`}
          confirmText="[Enter: Confirm Deposit]"
          onConfirm={handleDepositSubmit}
        >
          <div className="flex flex-col gap-3">
            <p className="text-xs text-gray-700">
              Cheque No: <span className="font-bold">{selectedCheque?.chequeNo}</span> | Amount:{' '}
              <span className="font-bold">₹{selectedCheque ? Number(selectedCheque.amount).toFixed(2) : '0'}</span> | Party:{' '}
              <span className="font-bold">{selectedCheque?.partyName}</span>
            </p>
            <div>
              <label className="block font-bold mb-1">DEPOSIT DATE:</label>
              <input
                type="date"
                value={depositDate}
                onChange={(e) => setDepositDate(e.target.value)}
                className="w-full p-1 bg-white border border-brand-border font-bold"
              />
            </div>
          </div>
        </DosModal>

        {/* Clearance Modal */}
        <DosModal
          isOpen={actionType === 'clear'}
          onClose={() => setActionType(null)}
          title={`CLEAR CHEQUE IN BANK - [${selectedCheque?.chequeNo}]`}
          confirmText="[Enter: Confirm Clearance]"
          onConfirm={handleClearSubmit}
        >
          <div className="flex flex-col gap-3">
            <p className="text-xs text-gray-700">
              Cheque No: <span className="font-bold">{selectedCheque?.chequeNo}</span> | Amount:{' '}
              <span className="font-bold">₹{selectedCheque ? Number(selectedCheque.amount).toFixed(2) : '0'}</span> | Party:{' '}
              <span className="font-bold">{selectedCheque?.partyName}</span>
            </p>
            <div>
              <label className="block font-bold mb-1">BANK CLEARANCE DATE:</label>
              <input
                type="date"
                value={clearanceDate}
                onChange={(e) => setClearanceDate(e.target.value)}
                className="w-full p-1 bg-white border border-brand-border font-bold"
              />
            </div>
          </div>
        </DosModal>

        {/* Dishonor / Bounce Modal */}
        <DosModal
          isOpen={actionType === 'dishonor'}
          onClose={() => setActionType(null)}
          title={`Cheque Dishonor / Bounce - [${selectedCheque?.chequeNo}]`}
          variant="danger"
          confirmText="[Enter: Confirm Dishonor]"
          onConfirm={handleDishonorSubmit}
        >
          <div className="flex flex-col gap-3">
            <div className="p-2 bg-red-50 border border-red-300 text-red-800 text-[11px] leading-relaxed">
              <strong>Notice:</strong> Mark cheque as dishonored / bounced? This will reopen the original invoices and debit the customer balance by ₹{selectedCheque?.amount} plus penalty fee.
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold mb-1">RETURN DATE:</label>
                <input
                  type="date"
                  value={dishonorDate}
                  onChange={(e) => setDishonorDate(e.target.value)}
                  className="w-full p-1 bg-white border border-brand-border"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">RETURN CHARGE / PENALTY (₹):</label>
                <input
                  type="number"
                  step="0.01"
                  value={dishonorCharge}
                  onChange={(e) => setDishonorCharge(e.target.value)}
                  className="w-full p-1 bg-white border border-brand-border font-bold text-red-600"
                />
              </div>

              <div className="col-span-2">
                <label className="block font-bold mb-1">DISHONOR REASON:</label>
                <select
                  value={dishonorReason}
                  onChange={(e) => setDishonorReason(e.target.value)}
                  className="w-full p-1 bg-white border border-brand-border font-bold"
                >
                  <option value="INSUFFICIENT_FUNDS">Insufficient Funds</option>
                  <option value="SIGNATURE_MISMATCH">Signature Differs / Mismatch</option>
                  <option value="STOP_PAYMENT">Payment Stopped by Drawer</option>
                  <option value="EXPIRED">Cheque Outdated / Expired</option>
                  <option value="OTHER">Other Technical Reason</option>
                </select>
              </div>
            </div>
          </div>
        </DosModal>

        {/* Add Independent Cheque Modal */}
        <DosModal
          isOpen={actionType === 'new'}
          onClose={() => setActionType(null)}
          title="Add Cheque Entry"
          confirmText="[Enter: Save Cheque]"
          onConfirm={handleNewChequeSubmit}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold mb-1">CHEQUE TYPE:</label>
              <select
                value={newChqType}
                onChange={(e) => setNewChqType(e.target.value as any)}
                className="w-full p-1 bg-white border border-brand-border font-bold"
              >
                <option value="INCOMING">INCOMING (FROM CUSTOMER)</option>
                <option value="OUTGOING">OUTGOING (TO SUPPLIER)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold mb-1">CHEQUE NO:</label>
              <input
                type="text"
                value={newChqNo}
                onChange={(e) => setNewChqNo(e.target.value)}
                className="w-full p-1 bg-white border border-brand-border font-bold"
              />
            </div>

            <div>
              <label className="block font-bold mb-1">CHEQUE DATE:</label>
              <input
                type="date"
                value={newChqDate}
                onChange={(e) => setNewChqDate(e.target.value)}
                className="w-full p-1 bg-white border border-brand-border"
              />
            </div>

            <div>
              <label className="block font-bold mb-1">AMOUNT (₹):</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={newChqAmt}
                onChange={(e) => setNewChqAmt(e.target.value)}
                className="w-full p-1 bg-white border border-brand-border font-bold text-right"
              />
            </div>

            <div>
              <label className="block font-bold mb-1">PARTY NAME:</label>
              <input
                type="text"
                placeholder="Customer or Vendor Name"
                value={newPartyName}
                onChange={(e) => setNewPartyName(e.target.value)}
                className="w-full p-1 bg-white border border-brand-border"
              />
            </div>

            <div>
              <label className="block font-bold mb-1">BANK NAME:</label>
              <input
                type="text"
                placeholder="Bank Name"
                value={newBankName}
                onChange={(e) => setNewBankName(e.target.value)}
                className="w-full p-1 bg-white border border-brand-border"
              />
            </div>

            <div className="col-span-2">
              <label className="block font-bold mb-1">BRANCH / REMARKS:</label>
              <input
                type="text"
                placeholder="Town / Branch / Notes"
                value={newRemarks}
                onChange={(e) => setNewRemarks(e.target.value)}
                className="w-full p-1 bg-white border border-brand-border"
              />
            </div>
          </div>
        </DosModal>
      </div>
    </DosWindow>
  );
}
