'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosDataGrid, DosColumnDef } from '@/components/ui/DosDataGrid';
import { DosModal } from '@/components/ui/DosModal';
import { useKeyboardShortcuts } from '@/lib/keyboard/useKeyboardShortcuts';
import { useEnterKeyProgression } from '@/lib/keyboard/useEnterKeyProgression';
import {
  getSuppliersList,
  getSupplierById,
  getNextSupplierCode,
  verifySupervisorPassword,
  getSupplierPayablesSummary,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  SupplierInput,
} from './actions';

type Mode = 'VIEW' | 'ADD' | 'EDIT';

export default function SupplierMasterPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('VIEW');
  const [suppliersList, setSuppliersList] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Form State
  const [formData, setFormData] = useState<SupplierInput>({
    code: '',
    name: '',
    contactPerson: '',
    addressLine1: '',
    addressLine2: '',
    addressLine3: '',
    addressLine4: '',
    pincode: '',
    phone: '',
    email: '',
    gstin: '',
    pan: '',
    drugLicenseNo: '',
    fssaiNo: '',
    tdsFlag: false,
    bankName: '',
    bankAccountNo: '',
    bankIfsc: '',
    glAccountCode: '0014',
    openingBalance: 0,
    currentBalance: 0,
    creditDays: 30,
    defaultDiscountPct: 3.0,
    isBlocked: false,
  });

  // Password Gate Modal State
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState<boolean>(false);
  const [supervisorPassword, setSupervisorPassword] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Payables Modal State (F4)
  const [isPayablesModalOpen, setIsPayablesModalOpen] = useState<boolean>(false);
  const [payablesSummary, setPayablesSummary] = useState<any | null>(null);

  // Delete Modal State (F3)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  const formRef = useRef<HTMLDivElement | null>(null);
  useEnterKeyProgression({
    formRef,
    enabled: mode !== 'VIEW',
  });

  const refreshSuppliers = async (preferredId?: string) => {
    setIsLoading(true);
    try {
      const list = await getSuppliersList(searchQuery);
      setSuppliersList(list);

      if (list.length > 0) {
        let idx = 0;
        if (preferredId) {
          const found = list.findIndex((s: any) => s.id === preferredId);
          if (found !== -1) idx = found;
        }
        setSelectedIndex(idx);
        loadSupplier(list[idx]?.id);
      } else {
        setFormData(getBlankSupplier());
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error loading suppliers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshSuppliers();
  }, [searchQuery]);

  const getBlankSupplier = (): SupplierInput => ({
    code: '',
    name: '',
    contactPerson: '',
    addressLine1: '',
    addressLine2: '',
    addressLine3: '',
    addressLine4: '',
    pincode: '',
    phone: '',
    email: '',
    gstin: '',
    pan: '',
    drugLicenseNo: '',
    fssaiNo: '',
    tdsFlag: false,
    bankName: '',
    bankAccountNo: '',
    bankIfsc: '',
    glAccountCode: '0014',
    openingBalance: 0,
    currentBalance: 0,
    creditDays: 30,
    defaultDiscountPct: 3.0,
    isBlocked: false,
  });

  const loadSupplier = async (id: string) => {
    if (!id) return;
    try {
      const s = await getSupplierById(id);
      if (s) {
        setFormData({
          id: s.id,
          code: s.code,
          name: s.name,
          contactPerson: s.contactPerson || '',
          addressLine1: s.addressLine1 || '',
          addressLine2: s.addressLine2 || '',
          addressLine3: s.addressLine3 || '',
          addressLine4: s.addressLine4 || '',
          pincode: s.pincode || '',
          phone: s.phone || '',
          email: s.email || '',
          gstin: s.gstin || '',
          pan: s.pan || '',
          drugLicenseNo: s.drugLicenseNo || '',
          fssaiNo: s.fssaiNo || '',
          tdsFlag: s.tdsFlag,
          bankName: s.bankName || '',
          bankAccountNo: s.bankAccountNo || '',
          bankIfsc: s.bankIfsc || '',
          glAccountCode: s.glAccountCode || '0014',
          openingBalance: s.openingBalance,
          currentBalance: s.currentBalance,
          creditDays: s.creditDays || 30,
          defaultDiscountPct: s.defaultDiscountPct || 0,
          isBlocked: s.isBlocked,
        });
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error loading supplier details');
    }
  };

  const handleAddNew = async () => {
    const nextCode = await getNextSupplierCode();
    setFormData({
      ...getBlankSupplier(),
      code: nextCode,
    });
    setMode('ADD');
  };

  // Trigger password prompt before entering EDIT mode
  const requestEditMode = () => {
    if (!formData.id) return;
    setSupervisorPassword('');
    setPasswordError(null);
    setIsPasswordModalOpen(true);
  };

  const submitPasswordUnlock = async () => {
    const isValid = await verifySupervisorPassword(supervisorPassword);
    if (isValid) {
      setIsPasswordModalOpen(false);
      setMode('EDIT');
      setStatusNotification('Supervisor password verified. Edit mode unlocked.');
    } else {
      setPasswordError('Supervisor password incorrect. Access denied.');
    }
  };

  const openPayablesSummary = async () => {
    if (!formData.id) return;
    try {
      const summary = await getSupplierPayablesSummary(formData.id);
      setPayablesSummary(summary);
      setIsPayablesModalOpen(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error fetching payables');
    }
  };

  const handleCancel = () => {
    if (mode === 'VIEW') {
      router.push('/masters');
    } else {
      setMode('VIEW');
      if (suppliersList[selectedIndex]) {
        loadSupplier(suppliersList[selectedIndex].id);
      }
    }
  };

  const handleSave = async () => {
    try {
      setErrorMessage(null);
      if (!formData.code.trim()) throw new Error('Supplier Code is required');
      if (!formData.name.trim()) throw new Error('Supplier Name is required');

      if (mode === 'ADD') {
        const res = await createSupplier(formData);
        setStatusNotification('Supplier created successfully');
        setMode('VIEW');
        await refreshSuppliers(res.id);
      } else if (mode === 'EDIT') {
        await updateSupplier(formData);
        setStatusNotification('Supplier updated successfully');
        setMode('VIEW');
        await refreshSuppliers(formData.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Save failed');
    }
  };

  const handleDelete = async () => {
    if (!formData.id) return;
    try {
      setErrorMessage(null);
      await deleteSupplier(formData.id);
      setIsDeleteModalOpen(false);
      setStatusNotification('Supplier deleted successfully');
      await refreshSuppliers();
    } catch (err: any) {
      setIsDeleteModalOpen(false);
      setErrorMessage(err.message || 'Delete rejected');
    }
  };

  useKeyboardShortcuts([
    { key: 'F1', description: 'Add Supplier', action: () => mode === 'VIEW' && handleAddNew(), enabled: mode === 'VIEW' },
    { key: 'F2', description: 'Edit Supplier', action: () => mode === 'VIEW' && requestEditMode(), enabled: mode === 'VIEW' },
    { key: 'F3', description: 'Delete Supplier', action: () => mode === 'VIEW' && formData.id && setIsDeleteModalOpen(true), enabled: mode === 'VIEW' },
    { key: 'F4', description: 'Payables / Save', action: () => (mode === 'VIEW' ? openPayablesSummary() : handleSave()), allowInInputs: true },
    { key: 'Escape', description: 'Cancel / Exit', action: handleCancel, allowInInputs: true },
  ], { scopeId: 'supplier-master', priority: 10 });

  const columns: DosColumnDef<any>[] = [
    { id: 'code', header: 'CODE', accessorKey: 'code', width: 'w-16', align: 'center' },
    { id: 'name', header: 'FIRM NAME', accessorKey: 'name', width: 'w-52' },
    { id: 'phone', header: 'PHONE', accessorKey: 'phone', width: 'w-28' },
    { id: 'balance', header: 'PAYABLE (RS)', accessorKey: 'currentBalance', width: 'w-24', align: 'right', cell: (s) => Number(s.currentBalance || 0).toFixed(2) },
  ];

  const actionButtons: DosAction[] =
    mode === 'VIEW'
      ? [
          { keyLabel: 'F1', label: 'Add', onClick: handleAddNew, variant: 'primary' },
          { keyLabel: 'F2', label: 'Edit (SPM)', onClick: requestEditMode, variant: 'amber' },
          { keyLabel: 'F3', label: 'Delete', onClick: () => setIsDeleteModalOpen(true), variant: 'danger' },
          { keyLabel: 'F4', label: 'Payables', onClick: openPayablesSummary },
          { keyLabel: 'ESC', label: 'Exit Hub', onClick: () => router.push('/masters') },
        ]
      : [
          { keyLabel: 'F4', label: 'Save', onClick: handleSave, variant: 'amber' },
          { keyLabel: 'ESC', label: 'Cancel', onClick: handleCancel },
        ];

  return (
    <>
      <DosWindow
        title="SUPPLIER / VENDOR MASTER MAINTENANCE"
        subtitle={`[SYS-1] [MODE: ${mode}] [SECURITY: SUPERVISOR PROTECTED]`}
        breadcrumbs={['MASTERS', 'SUPPLIERS', mode]}
        actions={actionButtons}
        statusInfo={
          <span className="text-gray-300">
            Current Payable: Rs {Number(formData.currentBalance || 0).toFixed(2)}
          </span>
        }
      >
        <div className="flex h-full overflow-hidden">
          {/* Left Directory Pane */}
          <div className="w-84 border-r-2 border-brand-border bg-white flex flex-col shrink-0 select-none">
            <div className="p-2 border-b border-brand-border bg-brand-surface/50">
              <input
                type="text"
                placeholder="Filter Supplier Name / Code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border border-brand-border bg-white px-2 py-1 text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-brand-amber"
              />
            </div>
            <div className="flex-1 overflow-hidden">
              <DosDataGrid
                columns={columns}
                data={suppliersList}
                selectedIndex={selectedIndex}
                onSelectRow={(item, idx) => {
                  if (mode === 'VIEW') {
                    setSelectedIndex(idx);
                    loadSupplier(item.id);
                  }
                }}
                isLoading={isLoading}
                showLineNumbers={false}
              />
            </div>
            <div className="p-2 border-t border-brand-border bg-brand-surface text-[11px] font-mono flex justify-between text-gray-600">
              <span>Vendors: {suppliersList.length}</span>
              <span>[F2: Edit Gate] [F4: Ledger]</span>
            </div>
          </div>

          {/* Right Detail Pane */}
          <div className="flex-1 flex flex-col overflow-auto bg-brand-paper p-4 font-mono text-xs">
            {errorMessage && (
              <div className="mb-3 p-2 bg-red-100 border border-red-600 text-red-700 font-bold flex justify-between items-center">
                <span>ERROR: {errorMessage}</span>
                <button type="button" onClick={() => setErrorMessage(null)} className="px-1 text-red-900 hover:bg-red-200">[X]</button>
              </div>
            )}
            {statusNotification && (
              <div className="mb-3 p-2 bg-green-100 border border-green-600 text-green-800 font-bold flex justify-between items-center">
                <span>NOTICE: {statusNotification}</span>
                <button type="button" onClick={() => setStatusNotification(null)} className="px-1 text-green-900 hover:bg-green-200">[X]</button>
              </div>
            )}

            <div
              ref={formRef}
              className={`border border-brand-border p-3 ${
                mode === 'VIEW' ? 'bg-brand-surface/20' : 'bg-white shadow-[2px_2px_0px_0px_#0B192C]'
              }`}
            >
              <div className="font-bold text-brand-ink uppercase text-[11px] border-b border-brand-border pb-1 mb-3 flex justify-between">
                <span>SUPPLIER FIRM & COMMERCIAL PROFILE</span>
                <span className="text-gray-500">[ENTER: ADVANCE FIELD]</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* Code */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">SUPPLIER CODE (3-10) *</label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs uppercase disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Firm Name */}
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">FIRM / VENDOR NAME *</label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs uppercase disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Contact Person */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">CONTACT PERSON</label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.contactPerson || ''}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Address Line 1 */}
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">ADDRESS LINE 1</label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.addressLine1 || ''}
                    onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Address Line 2 */}
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">ADDRESS LINE 2</label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.addressLine2 || ''}
                    onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">PHONE NUMBER</label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* GSTIN */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">GSTIN NUMBER</label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.gstin || ''}
                    onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs uppercase disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* PAN */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">PAN NUMBER</label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.pan || ''}
                    onChange={(e) => setFormData({ ...formData, pan: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs uppercase disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Drug License */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">DRUG LICENSE NO</label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.drugLicenseNo || ''}
                    onChange={(e) => setFormData({ ...formData, drugLicenseNo: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Trade Discount */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">DEFAULT DISCOUNT %</label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={mode === 'VIEW'}
                    value={formData.defaultDiscountPct}
                    onChange={(e) => setFormData({ ...formData, defaultDiscountPct: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs tabular-nums disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Credit Days */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">CREDIT DAYS</label>
                  <input
                    type="number"
                    disabled={mode === 'VIEW'}
                    value={formData.creditDays}
                    onChange={(e) => setFormData({ ...formData, creditDays: parseInt(e.target.value, 10) || 0 })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Bank Name */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">BANK NAME</label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.bankName || ''}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Bank Account No */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">BANK ACCOUNT NO</label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.bankAccountNo || ''}
                    onChange={(e) => setFormData({ ...formData, bankAccountNo: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Bank IFSC */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">IFSC CODE</label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.bankIfsc || ''}
                    onChange={(e) => setFormData({ ...formData, bankIfsc: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs uppercase disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* GL Account Code */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">FINANCIAL A/C CODE</label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.glAccountCode || '0014'}
                    onChange={(e) => setFormData({ ...formData, glAccountCode: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Opening Balance */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">OPENING BALANCE</label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={mode === 'VIEW'}
                    value={formData.openingBalance}
                    onChange={(e) => setFormData({ ...formData, openingBalance: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs tabular-nums disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Current Balance */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">CURRENT BALANCE (AP)</label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={mode === 'VIEW'}
                    value={formData.currentBalance}
                    onChange={(e) => setFormData({ ...formData, currentBalance: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs tabular-nums disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber font-bold"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </DosWindow>

      {/* Supervisor Password Modal (T1-F17-02, T2-F17-03) */}
      <DosModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        title="ENTER SUPERVISOR PASSWORD (SPM)"
        variant="amber"
        confirmText="[Enter: Unlock Form]"
        cancelText="[ESC: Cancel]"
        onConfirm={submitPasswordUnlock}
      >
        <div className="flex flex-col gap-3 font-mono text-xs">
          <p className="text-gray-700 font-bold">
            Administrative security gate: Modifying supplier master records requires supervisor authorization.
          </p>
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">
              SUPERVISOR PASSWORD (CASE SENSITIVE):
            </label>
            <input
              type="password"
              autoFocus
              value={supervisorPassword}
              onChange={(e) => setSupervisorPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitPasswordUnlock();
                }
              }}
              placeholder="Enter password..."
              className="w-full border border-brand-border bg-white px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand-amber"
            />
          </div>
          {passwordError && (
            <p className="text-red-600 font-bold text-[11px] bg-red-50 p-1.5 border border-red-300">
              {passwordError}
            </p>
          )}
        </div>
      </DosModal>

      {/* Payables Summary Modal (T1-F17-04) */}
      <DosModal
        isOpen={isPayablesModalOpen}
        onClose={() => setIsPayablesModalOpen(false)}
        title={`[F4] SUPPLIER PAYABLES & LEDGER OVERVIEW: ${payablesSummary?.supplierName || ''}`}
        width="max-w-2xl"
        cancelText="[ESC: Dismiss]"
      >
        <div className="flex flex-col gap-3 font-mono text-xs">
          <div className="border border-brand-border bg-brand-surface/40 p-3 grid grid-cols-2 gap-3">
            <div>
              <span className="text-gray-500 font-bold">Supplier Code: </span>
              <span className="font-bold text-brand-ink">{payablesSummary?.supplierCode}</span>
            </div>
            <div>
              <span className="text-gray-500 font-bold">Opening Balance: </span>
              <span className="font-bold">Rs {Number(payablesSummary?.openingBalance || 0).toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-500 font-bold">Total Purchases: </span>
              <span className="font-bold text-blue-700">
                Rs {Number(payablesSummary?.totalPurchases || 0).toFixed(2)} ({payablesSummary?.purchaseCount} bills)
              </span>
            </div>
            <div>
              <span className="text-gray-500 font-bold">Total Payments: </span>
              <span className="font-bold text-green-700">
                Rs {Number(payablesSummary?.totalPayments || 0).toFixed(2)} ({payablesSummary?.paymentCount} vouchers)
              </span>
            </div>
          </div>

          <div className="p-3 bg-brand-ink text-white flex justify-between items-center text-sm font-bold">
            <span>OUTSTANDING PAYABLE BALANCE:</span>
            <span className="text-brand-amber">
              Rs {Number(payablesSummary?.outstandingPayable || 0).toFixed(2)}
            </span>
          </div>
        </div>
      </DosModal>

      {/* Delete Confirmation Modal */}
      <DosModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="CONFIRM SUPPLIER DELETION <Y/N>?"
        variant="danger"
        confirmText="[Enter: Delete Supplier]"
        cancelText="[ESC: Cancel]"
        onConfirm={handleDelete}
      >
        <div className="flex flex-col gap-2 font-mono text-xs">
          <p className="font-bold text-red-600">
            Are you sure you want to delete this supplier vendor account?
          </p>
          <div className="p-2 bg-brand-surface border border-brand-border text-gray-800">
            <div>Code: {formData.code}</div>
            <div>Name: {formData.name}</div>
            <div>Payable Balance: Rs {Number(formData.currentBalance || 0).toFixed(2)}</div>
          </div>
          <p className="text-gray-600 text-[11px]">
            In accordance with SUPAED.PRG audit invariants, deletion will be rejected if open payables or active purchase bills exist.
          </p>
        </div>
      </DosModal>
    </>
  );
}
