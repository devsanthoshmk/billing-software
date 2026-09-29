'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosDataGrid, DosColumnDef } from '@/components/ui/DosDataGrid';
import { DosModal } from '@/components/ui/DosModal';
import { useKeyboardShortcuts } from '@/lib/keyboard/useKeyboardShortcuts';
import {
  getDoctors, createDoctor, updateDoctor, deleteDoctor,
  getSalesmen, createSalesman, updateSalesman, deleteSalesman,
  getAreas, createArea, updateArea, deleteArea,
  getTaxSlabs, createTaxSlab, updateTaxSlab, deleteTaxSlab,
  getCompanies, createCompany, updateCompany, deleteCompany, getCompanyProducts,
} from './actions';

type SubTab = 'DOCTORS' | 'SALESMEN' | 'AREAS' | 'TAX_SLABS' | 'COMPANIES';
type Mode = 'VIEW' | 'ADD' | 'EDIT';

export default function AuxiliaryMastersPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SubTab>('DOCTORS');
  const [mode, setMode] = useState<Mode>('VIEW');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // Data sets
  const [doctorsList, setDoctorsList] = useState<any[]>([]);
  const [salesmenList, setSalesmenList] = useState<any[]>([]);
  const [areasList, setAreasList] = useState<any[]>([]);
  const [taxSlabsList, setTaxSlabsList] = useState<any[]>([]);
  const [companiesList, setCompaniesList] = useState<any[]>([]);
  const [companyProducts, setCompanyProducts] = useState<any[]>([]);

  // Active edit state
  const [activeItem, setActiveItem] = useState<any>({});
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);
  const [taxWarning, setTaxWarning] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [d, s, a, t, c] = await Promise.all([
        getDoctors(),
        getSalesmen(),
        getAreas(),
        getTaxSlabs(),
        getCompanies(),
      ]);
      setDoctorsList(d);
      setSalesmenList(s);
      setAreasList(a);
      setTaxSlabsList(t);
      setCompaniesList(c);

      // Select initial item for active tab
      const currentList =
        activeTab === 'DOCTORS' ? d :
        activeTab === 'SALESMEN' ? s :
        activeTab === 'AREAS' ? a :
        activeTab === 'TAX_SLABS' ? t : c;

      if (currentList.length > 0) {
        setSelectedIndex(0);
        setActiveItem(currentList[0]);
        if (activeTab === 'COMPANIES' && (currentList[0] as any)?.id) {
          getCompanyProducts((currentList[0] as any).id).then((res) => setCompanyProducts(res.items));
        }
      } else {
        setActiveItem({});
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error loading auxiliary masters');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const switchTab = (tab: SubTab) => {
    setActiveTab(tab);
    setMode('VIEW');
    setErrorMessage(null);
    setStatusNotification(null);
    setTaxWarning(null);
  };

  const handleAddNew = () => {
    if (activeTab === 'DOCTORS') {
      setActiveItem({
        code: `DR${(doctorsList.length + 1).toString().padStart(2, '0')}`,
        name: 'DR. ',
        registrationNo: 'MCI/2026/',
        qualification: 'MBBS',
        specialization: 'GENERAL',
      });
    } else if (activeTab === 'SALESMEN') {
      setActiveItem({
        code: `SM${(salesmenList.length + 1).toString().padStart(2, '0')}`,
        name: '',
        phone: '',
        localCommissionPct: 3.0,
      });
    } else if (activeTab === 'AREAS') {
      setActiveItem({
        code: `A${(areasList.length + 1).toString().padStart(2, '0')}`,
        name: '',
        district: 'CENTRAL',
        salesmanId: salesmenList[0]?.id || null,
      });
    } else if (activeTab === 'TAX_SLABS') {
      setActiveItem({
        code: '06',
        description: 'NEW GST SLAB',
        cgstRate: 2.5,
        sgstRate: 2.5,
        igstRate: 5.0,
        scRate: 0.0,
      });
    } else if (activeTab === 'COMPANIES') {
      setActiveItem({
        code: `GP${(companiesList.length + 1).toString().padStart(2, '0')}`,
        name: '',
        shortName: '',
        defaultDiscountPct: 5.0,
        freeValueScheme: 'Y',
      });
    }
    setMode('ADD');
  };

  const handleEdit = () => {
    if (!activeItem.code && !activeItem.id) return;
    if (activeTab === 'TAX_SLABS') {
      setTaxWarning('Note: Modifying tax slab rates affects future billing only');
    }
    setMode('EDIT');
  };

  const handleCancel = () => {
    if (mode === 'VIEW') {
      router.push('/masters');
    } else {
      setMode('VIEW');
      setTaxWarning(null);
      loadData();
    }
  };

  const handleSave = async () => {
    try {
      setErrorMessage(null);
      if (activeTab === 'DOCTORS') {
        if (mode === 'ADD') await createDoctor(activeItem);
        else await updateDoctor(activeItem);
      } else if (activeTab === 'SALESMEN') {
        if (mode === 'ADD') await createSalesman(activeItem);
        else await updateSalesman(activeItem);
      } else if (activeTab === 'AREAS') {
        if (mode === 'ADD') await createArea(activeItem);
        else await updateArea(activeItem);
      } else if (activeTab === 'TAX_SLABS') {
        if (mode === 'ADD') await createTaxSlab(activeItem);
        else {
          const res = await updateTaxSlab(activeItem);
          if (res.warning) setStatusNotification(res.warning);
        }
      } else if (activeTab === 'COMPANIES') {
        if (mode === 'ADD') await createCompany(activeItem);
        else await updateCompany(activeItem);
      }
      setStatusNotification('Record saved successfully');
      setMode('VIEW');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Save failed');
    }
  };

  const handleDelete = async () => {
    try {
      setErrorMessage(null);
      if (activeTab === 'DOCTORS') await deleteDoctor(activeItem.id);
      else if (activeTab === 'SALESMEN') await deleteSalesman(activeItem.id);
      else if (activeTab === 'AREAS') await deleteArea(activeItem.id);
      else if (activeTab === 'TAX_SLABS') await deleteTaxSlab(activeItem.code);
      else if (activeTab === 'COMPANIES') await deleteCompany(activeItem.id);

      setIsDeleteModalOpen(false);
      setStatusNotification('Record deleted successfully');
      await loadData();
    } catch (err: any) {
      setIsDeleteModalOpen(false);
      setErrorMessage(err.message || 'Delete rejected');
    }
  };

  // Shortcuts
  useKeyboardShortcuts([
    { key: '1', description: 'Tab: Doctors', action: () => mode === 'VIEW' && switchTab('DOCTORS'), allowInInputs: false },
    { key: '2', description: 'Tab: Salesmen', action: () => mode === 'VIEW' && switchTab('SALESMEN'), allowInInputs: false },
    { key: '3', description: 'Tab: Areas', action: () => mode === 'VIEW' && switchTab('AREAS'), allowInInputs: false },
    { key: '4', description: 'Tab: Tax Slabs', action: () => mode === 'VIEW' && switchTab('TAX_SLABS'), allowInInputs: false },
    { key: '5', description: 'Tab: Companies', action: () => mode === 'VIEW' && switchTab('COMPANIES'), allowInInputs: false },
    { key: 'F1', description: 'Add Record', action: () => mode === 'VIEW' && handleAddNew(), enabled: mode === 'VIEW' },
    { key: 'F2', description: 'Edit Record', action: () => mode === 'VIEW' && handleEdit(), enabled: mode === 'VIEW' },
    { key: 'F3', description: 'Delete Record', action: () => mode === 'VIEW' && setIsDeleteModalOpen(true), enabled: mode === 'VIEW' },
    { key: 'F4', description: 'Save Record', action: () => mode !== 'VIEW' && handleSave(), enabled: mode !== 'VIEW' },
    { key: 'Escape', description: 'Cancel / Exit', action: handleCancel, allowInInputs: true },
  ], { scopeId: 'auxiliary-masters', priority: 10 });

  const tabs: { id: SubTab; label: string; num: string }[] = [
    { id: 'DOCTORS', label: 'Doctors', num: '1' },
    { id: 'SALESMEN', label: 'Salesmen', num: '2' },
    { id: 'AREAS', label: 'Territory Areas', num: '3' },
    { id: 'TAX_SLABS', label: 'GST Tax Slabs', num: '4' },
    { id: 'COMPANIES', label: 'Mfr Companies', num: '5' },
  ];

  const actionButtons: DosAction[] =
    mode === 'VIEW'
      ? [
          { keyLabel: 'F1', label: 'Add', onClick: handleAddNew, variant: 'primary' },
          { keyLabel: 'F2', label: 'Edit', onClick: handleEdit },
          { keyLabel: 'F3', label: 'Delete', onClick: () => setIsDeleteModalOpen(true), variant: 'danger' },
          { keyLabel: 'ESC', label: 'Exit Hub', onClick: () => router.push('/masters') },
        ]
      : [
          { keyLabel: 'F4', label: 'Save', onClick: handleSave, variant: 'amber' },
          { keyLabel: 'ESC', label: 'Cancel', onClick: handleCancel },
        ];

  return (
    <>
      <DosWindow
        title={`AUXILIARY ENTITIES: ${activeTab.replace('_', ' ')}`}
        subtitle={`[SYS-1] [MODE: ${mode}]`}
        breadcrumbs={['MASTERS', 'AUXILIARY', activeTab]}
        actions={actionButtons}
        statusInfo={<span className="text-gray-300">KEYS: [1..5: TABS] [F1: ADD] [F2: EDIT] [F3: DEL]</span>}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Sub-Master Tab Strip */}
          <div className="bg-brand-surface border-b border-brand-border px-3 py-1 flex items-center gap-1.5 shrink-0 select-none">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => switchTab(tab.id)}
                  className={`px-3 py-1 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer border border-brand-border transition-none ${
                    isActive
                      ? 'bg-brand-amber text-white border-brand-ink'
                      : 'bg-white hover:bg-gray-100 text-brand-text'
                  }`}
                >
                  <span className={`px-1 text-[10px] ${isActive ? 'bg-black/30 text-white' : 'bg-brand-ink text-white'}`}>
                    {tab.num}
                  </span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Main Workspace */}
          <div className="flex-1 flex overflow-hidden font-mono text-xs">
            {/* Left Grid Pane */}
            <div className="w-80 border-r-2 border-brand-border bg-white flex flex-col shrink-0 select-none">
              <div className="flex-1 overflow-hidden">
                {activeTab === 'DOCTORS' && (
                  <DosDataGrid
                    columns={[
                      { id: 'code', header: 'CODE', accessorKey: 'code', width: 'w-16', align: 'center' },
                      { id: 'name', header: 'DOCTOR NAME', accessorKey: 'name', width: 'w-48' },
                      { id: 'reg', header: 'REG NO', accessorKey: 'registrationNo', width: 'w-24' },
                    ]}
                    data={doctorsList}
                    selectedIndex={selectedIndex}
                    onSelectRow={(item, idx) => {
                      if (mode === 'VIEW') {
                        setSelectedIndex(idx);
                        setActiveItem(item);
                      }
                    }}
                    isLoading={isLoading}
                    showLineNumbers={false}
                  />
                )}
                {activeTab === 'SALESMEN' && (
                  <DosDataGrid
                    columns={[
                      { id: 'code', header: 'CODE', accessorKey: 'code', width: 'w-16', align: 'center' },
                      { id: 'name', header: 'NAME', accessorKey: 'name', width: 'w-44' },
                      { id: 'comm', header: 'COMM %', accessorKey: 'localCommissionPct', width: 'w-20', align: 'right', cell: (s) => `${s.localCommissionPct}%` },
                    ]}
                    data={salesmenList}
                    selectedIndex={selectedIndex}
                    onSelectRow={(item, idx) => {
                      if (mode === 'VIEW') {
                        setSelectedIndex(idx);
                        setActiveItem(item);
                      }
                    }}
                    isLoading={isLoading}
                    showLineNumbers={false}
                  />
                )}
                {activeTab === 'AREAS' && (
                  <DosDataGrid
                    columns={[
                      { id: 'code', header: 'CODE', accessorKey: 'code', width: 'w-16', align: 'center' },
                      { id: 'name', header: 'AREA NAME', accessorKey: 'name', width: 'w-44' },
                      { id: 'dist', header: 'DISTRICT', accessorKey: 'district', width: 'w-24' },
                    ]}
                    data={areasList}
                    selectedIndex={selectedIndex}
                    onSelectRow={(item, idx) => {
                      if (mode === 'VIEW') {
                        setSelectedIndex(idx);
                        setActiveItem(item);
                      }
                    }}
                    isLoading={isLoading}
                    showLineNumbers={false}
                  />
                )}
                {activeTab === 'TAX_SLABS' && (
                  <DosDataGrid
                    columns={[
                      { id: 'code', header: 'CODE', accessorKey: 'code', width: 'w-16', align: 'center' },
                      { id: 'desc', header: 'TAX DESCRIPTION', accessorKey: 'description', width: 'w-44' },
                      { id: 'igst', header: 'IGST %', accessorKey: 'igstRate', width: 'w-20', align: 'right', cell: (t) => `${t.igstRate}%` },
                    ]}
                    data={taxSlabsList}
                    selectedIndex={selectedIndex}
                    onSelectRow={(item, idx) => {
                      if (mode === 'VIEW') {
                        setSelectedIndex(idx);
                        setActiveItem(item);
                      }
                    }}
                    isLoading={isLoading}
                    showLineNumbers={false}
                  />
                )}
                {activeTab === 'COMPANIES' && (
                  <DosDataGrid
                    columns={[
                      { id: 'code', header: 'CODE', accessorKey: 'code', width: 'w-16', align: 'center' },
                      { id: 'name', header: 'COMPANY NAME', accessorKey: 'name', width: 'w-44' },
                      { id: 'disc', header: 'DISC %', accessorKey: 'defaultDiscountPct', width: 'w-20', align: 'right', cell: (c) => `${c.defaultDiscountPct}%` },
                    ]}
                    data={companiesList}
                    selectedIndex={selectedIndex}
                    onSelectRow={(item, idx) => {
                      if (mode === 'VIEW') {
                        setSelectedIndex(idx);
                        setActiveItem(item);
                        if (item?.id) {
                          getCompanyProducts(item.id).then((res) => setCompanyProducts(res.items));
                        }
                      }
                    }}
                    isLoading={isLoading}
                    showLineNumbers={false}
                  />
                )}
              </div>
            </div>

            {/* Right Form Pane */}
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
              {taxWarning && (
                <div className="mb-3 p-2 bg-amber-100 border border-brand-amber text-brand-ink font-bold flex justify-between items-center">
                  <span>WARNING: {taxWarning}</span>
                </div>
              )}

              {/* Doctors Form */}
              {activeTab === 'DOCTORS' && (
                <div className="border border-brand-border p-3 bg-white flex flex-col gap-3">
                  <div className="font-bold text-brand-ink uppercase text-[11px] border-b border-brand-border pb-1">
                    DOCTOR REGISTRATION DETAILS (PRESCRIPTION INTEGRATION)
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">DOCTOR CODE *</label>
                      <input
                        type="text"
                        disabled={mode === 'VIEW'}
                        value={activeItem.code || ''}
                        onChange={(e) => setActiveItem({ ...activeItem, code: e.target.value })}
                        className="w-full border border-brand-border bg-white px-2 py-1 uppercase disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">REGISTRATION NO (MCI/STATE) *</label>
                      <input
                        type="text"
                        disabled={mode === 'VIEW'}
                        value={activeItem.registrationNo || ''}
                        onChange={(e) => setActiveItem({ ...activeItem, registrationNo: e.target.value })}
                        placeholder="MCI/2018/00912"
                        className="w-full border border-brand-border bg-white px-2 py-1 uppercase disabled:bg-gray-100"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">DOCTOR NAME *</label>
                      <input
                        type="text"
                        disabled={mode === 'VIEW'}
                        value={activeItem.name || ''}
                        onChange={(e) => setActiveItem({ ...activeItem, name: e.target.value })}
                        className="w-full border border-brand-border bg-white px-2 py-1 uppercase disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">QUALIFICATION</label>
                      <input
                        type="text"
                        disabled={mode === 'VIEW'}
                        value={activeItem.qualification || ''}
                        onChange={(e) => setActiveItem({ ...activeItem, qualification: e.target.value })}
                        className="w-full border border-brand-border bg-white px-2 py-1 disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">SPECIALIZATION</label>
                      <input
                        type="text"
                        disabled={mode === 'VIEW'}
                        value={activeItem.specialization || ''}
                        onChange={(e) => setActiveItem({ ...activeItem, specialization: e.target.value })}
                        className="w-full border border-brand-border bg-white px-2 py-1 disabled:bg-gray-100"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">CLINIC / HOSPITAL ADDRESS</label>
                      <input
                        type="text"
                        disabled={mode === 'VIEW'}
                        value={activeItem.addressLine1 || ''}
                        onChange={(e) => setActiveItem({ ...activeItem, addressLine1: e.target.value })}
                        className="w-full border border-brand-border bg-white px-2 py-1 disabled:bg-gray-100"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Salesmen Form */}
              {activeTab === 'SALESMEN' && (
                <div className="border border-brand-border p-3 bg-white flex flex-col gap-3">
                  <div className="font-bold text-brand-ink uppercase text-[11px] border-b border-brand-border pb-1">
                    SALES REPRESENTATIVE & COMMISSION PROFILE
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">SALESMAN CODE *</label>
                      <input
                        type="text"
                        disabled={mode === 'VIEW'}
                        value={activeItem.code || ''}
                        onChange={(e) => setActiveItem({ ...activeItem, code: e.target.value })}
                        className="w-full border border-brand-border bg-white px-2 py-1 uppercase disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">MOBILE PHONE</label>
                      <input
                        type="text"
                        disabled={mode === 'VIEW'}
                        value={activeItem.phone || ''}
                        onChange={(e) => setActiveItem({ ...activeItem, phone: e.target.value })}
                        className="w-full border border-brand-border bg-white px-2 py-1 disabled:bg-gray-100"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">SALESMAN NAME *</label>
                      <input
                        type="text"
                        disabled={mode === 'VIEW'}
                        value={activeItem.name || ''}
                        onChange={(e) => setActiveItem({ ...activeItem, name: e.target.value })}
                        className="w-full border border-brand-border bg-white px-2 py-1 uppercase disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">LOCAL COMMISSION % (0-50%)</label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={mode === 'VIEW'}
                        value={activeItem.localCommissionPct || 0}
                        onChange={(e) => setActiveItem({ ...activeItem, localCommissionPct: parseFloat(e.target.value) || 0 })}
                        className="w-full border border-brand-border bg-white px-2 py-1 disabled:bg-gray-100 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">OUTSTATION COMMISSION %</label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={mode === 'VIEW'}
                        value={activeItem.outstationCommissionPct || 0}
                        onChange={(e) => setActiveItem({ ...activeItem, outstationCommissionPct: parseFloat(e.target.value) || 0 })}
                        className="w-full border border-brand-border bg-white px-2 py-1 disabled:bg-gray-100 tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Areas Form */}
              {activeTab === 'AREAS' && (
                <div className="border border-brand-border p-3 bg-white flex flex-col gap-3">
                  <div className="font-bold text-brand-ink uppercase text-[11px] border-b border-brand-border pb-1">
                    TERRITORY AREA & ROUTE ASSIGNMENT
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">AREA CODE *</label>
                      <input
                        type="text"
                        disabled={mode === 'VIEW'}
                        value={activeItem.code || ''}
                        onChange={(e) => setActiveItem({ ...activeItem, code: e.target.value })}
                        className="w-full border border-brand-border bg-white px-2 py-1 uppercase disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">DISTRICT</label>
                      <input
                        type="text"
                        disabled={mode === 'VIEW'}
                        value={activeItem.district || ''}
                        onChange={(e) => setActiveItem({ ...activeItem, district: e.target.value })}
                        className="w-full border border-brand-border bg-white px-2 py-1 uppercase disabled:bg-gray-100"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">TERRITORY AREA NAME *</label>
                      <input
                        type="text"
                        disabled={mode === 'VIEW'}
                        value={activeItem.name || ''}
                        onChange={(e) => setActiveItem({ ...activeItem, name: e.target.value })}
                        className="w-full border border-brand-border bg-white px-2 py-1 uppercase disabled:bg-gray-100"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">ASSIGNED SALESMAN</label>
                      <select
                        disabled={mode === 'VIEW'}
                        value={activeItem.salesmanId || ''}
                        onChange={(e) => setActiveItem({ ...activeItem, salesmanId: e.target.value || null })}
                        className="w-full border border-brand-border bg-white px-2 py-1 disabled:bg-gray-100"
                      >
                        <option value="">-- UNASSIGNED --</option>
                        {salesmenList.map((sm) => (
                          <option key={sm.id} value={sm.id}>
                            [{sm.code}] {sm.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Tax Slabs Form */}
              {activeTab === 'TAX_SLABS' && (
                <div className="border border-brand-border p-3 bg-white flex flex-col gap-3">
                  <div className="font-bold text-brand-ink uppercase text-[11px] border-b border-brand-border pb-1 flex justify-between">
                    <span>STATUTORY GST TAX SLAB</span>
                    {activeItem.code === '01' && (
                      <span className="text-brand-amber font-bold">[IMMUTABLE EXEMPT CODE 01]</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">TAX CODE (2 DIGITS) *</label>
                      <input
                        type="text"
                        disabled={mode === 'VIEW' || mode === 'EDIT'}
                        value={activeItem.code || ''}
                        onChange={(e) => setActiveItem({ ...activeItem, code: e.target.value })}
                        className="w-full border border-brand-border bg-white px-2 py-1 uppercase disabled:bg-gray-100 font-bold"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">TAX DESCRIPTION *</label>
                      <input
                        type="text"
                        disabled={mode === 'VIEW'}
                        value={activeItem.description || ''}
                        onChange={(e) => setActiveItem({ ...activeItem, description: e.target.value })}
                        className="w-full border border-brand-border bg-white px-2 py-1 uppercase disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">CGST RATE %</label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={mode === 'VIEW'}
                        value={activeItem.cgstRate || 0}
                        onChange={(e) => setActiveItem({ ...activeItem, cgstRate: parseFloat(e.target.value) || 0 })}
                        className="w-full border border-brand-border bg-white px-2 py-1 disabled:bg-gray-100 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">SGST RATE %</label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={mode === 'VIEW'}
                        value={activeItem.sgstRate || 0}
                        onChange={(e) => setActiveItem({ ...activeItem, sgstRate: parseFloat(e.target.value) || 0 })}
                        className="w-full border border-brand-border bg-white px-2 py-1 disabled:bg-gray-100 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">IGST RATE %</label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={mode === 'VIEW'}
                        value={activeItem.igstRate || 0}
                        onChange={(e) => setActiveItem({ ...activeItem, igstRate: parseFloat(e.target.value) || 0 })}
                        className="w-full border border-brand-border bg-white px-2 py-1 disabled:bg-gray-100 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-0.5">SURCHARGE / CESS %</label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={mode === 'VIEW'}
                        value={activeItem.scRate || 0}
                        onChange={(e) => setActiveItem({ ...activeItem, scRate: parseFloat(e.target.value) || 0 })}
                        className="w-full border border-brand-border bg-white px-2 py-1 disabled:bg-gray-100 tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Companies Form & Product Catalog */}
              {activeTab === 'COMPANIES' && (
                <div className="flex flex-col gap-4 flex-1">
                  <div className="border border-brand-border p-3 bg-white flex flex-col gap-3">
                    <div className="font-bold text-brand-ink uppercase text-[11px] border-b border-brand-border pb-1">
                      MANUFACTURER COMPANY PROFILE
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-0.5">COMPANY CODE *</label>
                        <input
                          type="text"
                          disabled={mode === 'VIEW'}
                          value={activeItem.code || ''}
                          onChange={(e) => setActiveItem({ ...activeItem, code: e.target.value })}
                          className="w-full border border-brand-border bg-white px-2 py-1 uppercase disabled:bg-gray-100 font-bold"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-bold text-gray-700 mb-0.5">COMPANY NAME *</label>
                        <input
                          type="text"
                          disabled={mode === 'VIEW'}
                          value={activeItem.name || ''}
                          onChange={(e) => setActiveItem({ ...activeItem, name: e.target.value })}
                          className="w-full border border-brand-border bg-white px-2 py-1 uppercase disabled:bg-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-0.5">DEFAULT DISCOUNT %</label>
                        <input
                          type="number"
                          step="0.01"
                          disabled={mode === 'VIEW'}
                          value={activeItem.defaultDiscountPct || 0}
                          onChange={(e) => setActiveItem({ ...activeItem, defaultDiscountPct: parseFloat(e.target.value) || 0 })}
                          className="w-full border border-brand-border bg-white px-2 py-1 disabled:bg-gray-100 tabular-nums"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Company Products Sub-list (T2-F18-05) */}
                  <div className="border border-brand-border bg-white p-3 flex-1 flex flex-col">
                    <div className="font-bold text-brand-ink uppercase text-[11px] border-b border-brand-border pb-1 mb-2 flex justify-between">
                      <span>CATALOG MEDICINES TAGGED TO THIS COMPANY</span>
                      <span className="text-gray-500">Total: {companyProducts.length} products</span>
                    </div>
                    <div className="flex-1 overflow-auto border border-brand-border h-40">
                      <table className="w-full border-collapse font-mono text-xs">
                        <thead className="bg-brand-ink text-white sticky top-0">
                          <tr>
                            <th className="p-1 border-r text-left w-20">CODE</th>
                            <th className="p-1 border-r text-left">PRODUCT NAME</th>
                            <th className="p-1 border-r text-left w-28">PACKING</th>
                            <th className="p-1 text-right w-20">STOCK</th>
                          </tr>
                        </thead>
                        <tbody>
                          {companyProducts.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="p-4 text-center text-gray-400">
                                --- NO PRODUCTS TAGGED TO THIS COMPANY ---
                              </td>
                            </tr>
                          ) : (
                            companyProducts.map((p) => (
                              <tr key={p.id} className="border-b border-brand-border hover:bg-gray-50">
                                <td className="p-1 border-r text-center">{p.code}</td>
                                <td className="p-1 border-r">{p.name}</td>
                                <td className="p-1 border-r">{p.packaging}</td>
                                <td className="p-1 text-right tabular-nums">{p.totalStockOnHand}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DosWindow>

      {/* Delete Confirmation Modal */}
      <DosModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title={`CONFIRM ${activeTab} DELETION <Y/N>?`}
        variant="danger"
        confirmText="[Enter: Delete]"
        cancelText="[ESC: Cancel]"
        onConfirm={handleDelete}
      >
        <div className="flex flex-col gap-2 font-mono text-xs">
          <p className="font-bold text-red-600">
            Are you sure you want to delete this {activeTab.toLowerCase()} record?
          </p>
          <div className="p-2 bg-brand-surface border border-brand-border text-gray-800">
            <div>Code: {activeItem.code}</div>
            <div>Name: {activeItem.name || activeItem.description}</div>
          </div>
          <p className="text-gray-600 text-[11px]">
            Statutory referential guards prevent deletion if dependent transactions, customers, or products exist.
          </p>
        </div>
      </DosModal>
    </>
  );
}
