'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosDataGrid, DosColumnDef } from '@/components/ui/DosDataGrid';
import { DosModal } from '@/components/ui/DosModal';
import { useKeyboardShortcuts } from '@/lib/keyboard/useKeyboardShortcuts';
import { useEnterKeyProgression } from '@/lib/keyboard/useEnterKeyProgression';
import {
  getCustomersList,
  getCustomerById,
  getNextCustomerCode,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  toggleCustomerBlocked,
  CustomerInput,
} from './actions';
import { getAreas } from '../auxiliary/actions';

type Mode = 'VIEW' | 'ADD' | 'EDIT';

export default function CustomerMasterPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('VIEW');
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [areasList, setAreasList] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [areaFilter, setAreaFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Active Customer Form
  const [formData, setFormData] = useState<CustomerInput>({
    code: '',
    name: '',
    contactPerson: '',
    areaId: '',
    salesmanId: null,
    addressLine1: '',
    addressLine2: '',
    addressLine3: '',
    addressLine4: '',
    pincode: '',
    phone: '',
    email: '',
    billingType: 'L',
    paymentTerms: 'R',
    preferredLorry: '',
    routeCode: '',
    gstin: '',
    pan: '',
    dlNo20b: '',
    dlNo21b: '',
    dlExpiryDate: '',
    fssaiNo: '',
    creditDays: 21,
    creditLimit: 50000,
    defaultDiscountPct: 0,
    openingBalance: 0,
    closingBalance: 0,
    isBlocked: false,
    isTaxExempt: false,
    isTcsApplicable: false,
    remarks: '',
  });

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  const formRef = useRef<HTMLDivElement | null>(null);
  useEnterKeyProgression({
    formRef,
    enabled: mode !== 'VIEW',
  });

  const refreshCustomers = async (preferredId?: string) => {
    setIsLoading(true);
    try {
      const [custList, aList] = await Promise.all([
        getCustomersList(searchQuery, areaFilter),
        getAreas(),
      ]);
      setCustomersList(custList);
      setAreasList(aList);

      if (custList.length > 0) {
        let idx = 0;
        if (preferredId) {
          const found = custList.findIndex((c: any) => c.id === preferredId);
          if (found !== -1) idx = found;
        }
        setSelectedIndex(idx);
        loadCustomer(custList[idx]?.id);
      } else {
        setFormData(getBlankCustomer(aList[0]?.id || ''));
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error loading customers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshCustomers();
  }, [searchQuery, areaFilter]);

  const getBlankCustomer = (defaultAreaId: string = ''): CustomerInput => ({
    code: '',
    name: '',
    contactPerson: '',
    areaId: defaultAreaId,
    salesmanId: null,
    addressLine1: '',
    addressLine2: '',
    addressLine3: '',
    addressLine4: '',
    pincode: '',
    phone: '',
    email: '',
    billingType: 'L',
    paymentTerms: 'R',
    preferredLorry: '',
    routeCode: '',
    gstin: '',
    pan: '',
    dlNo20b: '',
    dlNo21b: '',
    dlExpiryDate: '2028-12-31',
    fssaiNo: '',
    creditDays: 21,
    creditLimit: 50000,
    defaultDiscountPct: 0,
    openingBalance: 0,
    closingBalance: 0,
    isBlocked: false,
    isTaxExempt: false,
    isTcsApplicable: false,
    remarks: '',
  });

  const loadCustomer = async (id: string) => {
    if (!id) return;
    try {
      const c = await getCustomerById(id);
      if (c) {
        setFormData({
          id: c.id,
          code: c.code,
          name: c.name,
          contactPerson: c.contactPerson || '',
          areaId: c.areaId,
          salesmanId: c.salesmanId || null,
          addressLine1: c.addressLine1 || '',
          addressLine2: c.addressLine2 || '',
          addressLine3: c.addressLine3 || '',
          addressLine4: c.addressLine4 || '',
          pincode: c.pincode || '',
          phone: c.phone || '',
          email: c.email || '',
          billingType: c.billingType || 'L',
          paymentTerms: c.paymentTerms || 'R',
          preferredLorry: c.preferredLorry || '',
          routeCode: c.routeCode || '',
          gstin: c.gstin || '',
          pan: c.pan || '',
          dlNo20b: c.dlNo20b || '',
          dlNo21b: c.dlNo21b || '',
          dlExpiryDate: c.dlExpiryDate || '',
          fssaiNo: c.fssaiNo || '',
          creditDays: c.creditDays,
          creditLimit: c.creditLimit,
          defaultDiscountPct: c.defaultDiscountPct,
          openingBalance: c.openingBalance,
          closingBalance: c.closingBalance,
          isBlocked: c.isBlocked,
          isTaxExempt: c.isTaxExempt,
          isTcsApplicable: c.isTcsApplicable,
          remarks: c.remarks || '',
        });
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error fetching customer details');
    }
  };

  const handleAddNew = async () => {
    const nextCode = await getNextCustomerCode();
    setFormData({
      ...getBlankCustomer(areasList[0]?.id || ''),
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
      if (customersList[selectedIndex]) {
        loadCustomer(customersList[selectedIndex].id);
      }
    }
  };

  const handleSave = async () => {
    try {
      setErrorMessage(null);
      if (!formData.name.trim()) throw new Error('Customer Name is required');
      if (!formData.code.trim()) throw new Error('Customer Code is required');
      if (!formData.areaId) throw new Error('Area assignment is required');

      if (mode === 'ADD') {
        const res = await createCustomer(formData);
        setStatusNotification('Customer created successfully');
        setMode('VIEW');
        await refreshCustomers(res.id);
      } else if (mode === 'EDIT') {
        await updateCustomer(formData);
        setStatusNotification('Customer updated successfully');
        setMode('VIEW');
        await refreshCustomers(formData.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Save failed');
    }
  };

  const handleDelete = async () => {
    if (!formData.id) return;
    try {
      setErrorMessage(null);
      await deleteCustomer(formData.id);
      setIsDeleteModalOpen(false);
      setStatusNotification('Customer deleted successfully');
      await refreshCustomers();
    } catch (err: any) {
      setIsDeleteModalOpen(false);
      setErrorMessage(err.message || 'Delete rejected');
    }
  };

  const handleToggleBlock = async () => {
    if (!formData.id) return;
    try {
      const nextBlocked = !formData.isBlocked;
      await toggleCustomerBlocked(formData.id, nextBlocked);
      setFormData((prev) => ({ ...prev, isBlocked: nextBlocked }));
      setStatusNotification(`Customer ${nextBlocked ? 'BLOCKED' : 'ACTIVE'} status updated`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Toggle block failed');
    }
  };

  useKeyboardShortcuts([
    { key: 'F1', description: 'Add Customer', action: () => mode === 'VIEW' && handleAddNew(), enabled: mode === 'VIEW' },
    { key: 'F2', description: 'Edit Customer', action: () => mode === 'VIEW' && handleEdit(), enabled: mode === 'VIEW' },
    { key: 'F3', description: 'Delete Customer', action: () => mode === 'VIEW' && formData.id && setIsDeleteModalOpen(true), enabled: mode === 'VIEW' },
    { key: 'F4', description: 'Save Record', action: () => mode !== 'VIEW' && handleSave(), enabled: mode !== 'VIEW' },
    { key: 'F6', description: 'Toggle Block', action: () => mode === 'VIEW' && handleToggleBlock(), enabled: mode === 'VIEW' },
    { key: 'Escape', description: 'Cancel / Back', action: handleCancel, allowInInputs: true },
  ], { scopeId: 'customer-master', priority: 10 });

  const columns: DosColumnDef<any>[] = [
    { id: 'code', header: 'CODE', accessorKey: 'code', width: 'w-16', align: 'center' },
    { id: 'name', header: 'CUSTOMER NAME', accessorKey: 'name', width: 'w-52' },
    { id: 'area', header: 'AREA', accessorKey: 'area', width: 'w-24', cell: (c) => c.area?.name || 'N/A' },
    { id: 'balance', header: 'BALANCE', accessorKey: 'closingBalance', width: 'w-20', align: 'right', cell: (c) => Number(c.closingBalance || 0).toFixed(2) },
  ];

  const actionButtons: DosAction[] =
    mode === 'VIEW'
      ? [
          { keyLabel: 'F1', label: 'Add', onClick: handleAddNew, variant: 'primary' },
          { keyLabel: 'F2', label: 'Edit', onClick: handleEdit },
          { keyLabel: 'F3', label: 'Delete', onClick: () => setIsDeleteModalOpen(true), variant: 'danger' },
          { keyLabel: 'F6', label: formData.isBlocked ? 'Unblock' : 'Block', onClick: handleToggleBlock },
          { keyLabel: 'ESC', label: 'Exit Hub', onClick: () => router.push('/masters') },
        ]
      : [
          { keyLabel: 'F4', label: 'Save', onClick: handleSave, variant: 'amber' },
          { keyLabel: 'ESC', label: 'Cancel', onClick: handleCancel },
        ];

  return (
    <>
      <DosWindow
        title="CUSTOMER MASTER DIRECTORY"
        subtitle={`[CHEMIST & HOSPITAL ACCOUNTS] [MODE: ${mode}]`}
        breadcrumbs={['MASTERS', 'CUSTOMERS', mode]}
        actions={actionButtons}
        statusInfo={
          formData.isBlocked ? (
            <span className="bg-red-600 text-white px-2 py-0.5 font-bold animate-pulse">
              [ACCOUNT BLOCKED]
            </span>
          ) : (
            <span className="text-gray-300">
              Outstanding Balance: ₹{Number(formData.closingBalance || 0).toFixed(2)}
            </span>
          )
        }
      >
        <div className="flex h-full overflow-hidden">
          {/* Left Directory Pane */}
          <div className="w-84 border-r-2 border-brand-border bg-white flex flex-col shrink-0 select-none">
            <div className="p-2 border-b border-brand-border bg-brand-surface/50 flex flex-col gap-1.5">
              <input
                type="text"
                placeholder="Filter Name/Code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border border-brand-border bg-white px-2 py-1 text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-brand-amber"
              />
              <input
                type="text"
                placeholder="Filter Area Name/Code..."
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value)}
                className="w-full border border-brand-border bg-white px-2 py-1 text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-brand-amber"
              />
            </div>
            <div className="flex-1 overflow-hidden">
              <DosDataGrid
                columns={columns}
                data={customersList}
                selectedIndex={selectedIndex}
                onSelectRow={(item, idx) => {
                  if (mode === 'VIEW') {
                    setSelectedIndex(idx);
                    loadCustomer(item.id);
                  }
                }}
                isLoading={isLoading}
                showLineNumbers={false}
              />
            </div>
            <div className="p-2 border-t border-brand-border bg-brand-surface text-[11px] font-mono flex justify-between text-gray-600">
              <span>Total Chemist Accounts: {customersList.length}</span>
              <span>[F1: Add Customer]</span>
            </div>
          </div>

          {/* Right Detail Form */}
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
                <span>CUSTOMER DETAILS &amp; DRUG LICENSES</span>
                <span className="text-gray-500">[ENTER: NEXT FIELD]</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* Code */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">CUSTOMER CODE *</label>
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
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">PHARMACY / HOSPITAL NAME *</label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs uppercase disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Area Dropdown */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">TERRITORY AREA *</label>
                  <select
                    disabled={mode === 'VIEW'}
                    value={formData.areaId}
                    onChange={(e) => setFormData({ ...formData, areaId: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  >
                    <option value="">-- SELECT AREA --</option>
                    {areasList.map((a) => (
                      <option key={a.id} value={a.id}>
                        [{a.code}] {a.name}
                      </option>
                    ))}
                  </select>
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
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">ADDRESS LINE 2 (TOWN / PLACE)</label>
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
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">GSTIN (15 CHARS)</label>
                  <input
                    type="text"
                    maxLength={15}
                    disabled={mode === 'VIEW'}
                    value={formData.gstin || ''}
                    onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                    placeholder="33AAAAA0000A1Z5"
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs uppercase disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* PAN */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">PAN NUMBER</label>
                  <input
                    type="text"
                    maxLength={10}
                    disabled={mode === 'VIEW'}
                    value={formData.pan || ''}
                    onChange={(e) => setFormData({ ...formData, pan: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs uppercase disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* DL No 20B */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">DRUG LICENSE 20B</label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.dlNo20b || ''}
                    onChange={(e) => setFormData({ ...formData, dlNo20b: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs uppercase disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* DL No 21B */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">DRUG LICENSE 21B</label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.dlNo21b || ''}
                    onChange={(e) => setFormData({ ...formData, dlNo21b: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs uppercase disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* DL Expiry Date */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">DL EXPIRY (YYYY-MM-DD)</label>
                  <input
                    type="date"
                    disabled={mode === 'VIEW'}
                    value={formData.dlExpiryDate || ''}
                    onChange={(e) => setFormData({ ...formData, dlExpiryDate: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Credit Days */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">CREDIT PERIOD (DAYS)</label>
                  <input
                    type="number"
                    disabled={mode === 'VIEW'}
                    value={formData.creditDays}
                    onChange={(e) => setFormData({ ...formData, creditDays: parseInt(e.target.value, 10) || 0 })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Credit Limit */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">CREDIT LIMIT (₹)</label>
                  <input
                    type="number"
                    step="1000"
                    disabled={mode === 'VIEW'}
                    value={formData.creditLimit}
                    onChange={(e) => setFormData({ ...formData, creditLimit: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs tabular-nums disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Payment Terms */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">PAYMENT TERMS</label>
                  <select
                    disabled={mode === 'VIEW' || formData.creditDays === 0}
                    value={formData.creditDays === 0 ? 'C' : formData.paymentTerms}
                    onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  >
                    <option value="C">C - Cash Party</option>
                    <option value="R">R - Credit Party</option>
                    <option value="H">H - Cheque Party</option>
                  </select>
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

                {/* Closing / Current Balance */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-0.5">CURRENT BALANCE</label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={mode === 'VIEW'}
                    value={formData.closingBalance}
                    onChange={(e) => setFormData({ ...formData, closingBalance: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-brand-border bg-white px-2 py-1 font-mono text-xs tabular-nums disabled:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-amber"
                  />
                </div>

                {/* Tax-Exempt Toggle */}
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer font-bold select-none text-[11px]">
                    <input
                      type="checkbox"
                      disabled={mode === 'VIEW'}
                      checked={Boolean(formData.isTaxExempt)}
                      onChange={(e) => setFormData({ ...formData, isTaxExempt: e.target.checked })}
                      className="w-4 h-4 accent-brand-amber"
                    />
                    <span>TAX EXEMPT PARTY</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DosWindow>

      {/* Delete Confirmation Modal */}
      <DosModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="CONFIRM CUSTOMER DELETION"
        variant="danger"
        confirmText="[Enter: Delete Customer]"
        cancelText="[ESC: Cancel]"
        onConfirm={handleDelete}
      >
        <div className="flex flex-col gap-2 font-mono text-xs">
          <p className="font-bold text-red-600">
            Are you sure you want to permanently delete this customer account?
          </p>
          <div className="p-2 bg-brand-surface border border-brand-border text-gray-800">
            <div>Code: {formData.code}</div>
            <div>Name: {formData.name}</div>
            <div>Current Balance: ₹{Number(formData.closingBalance || 0).toFixed(2)}</div>
          </div>
          <p className="text-gray-600 text-[11px]">
            Customer accounts with existing invoices or outstanding ledger transactions cannot be deleted. Use [F6: Block] to prevent further billing.
          </p>
        </div>
      </DosModal>
    </>
  );
}
