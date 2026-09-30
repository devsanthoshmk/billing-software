'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DosWindow } from '@/components/ui/DosWindow';
import { useKeyboardShortcuts } from '@/lib/keyboard/useKeyboardShortcuts';

export default function MastersHubPage() {
  const router = useRouter();

  const masterSections = [
    {
      code: '1',
      title: 'PRODUCT MASTER',
      desc: 'Medicines catalog, drug schedules (H / H1 / Narcotic), multi-batch inventory, rates, schemes, and HSN codes.',
      path: '/masters/products',
      shortcut: '1',
      tag: 'PRODUCTS',
    },
    {
      code: '2',
      title: 'CUSTOMER MASTER',
      desc: 'Chemist shops, clinics, and hospitals. GSTIN, PAN, Drug Licenses (Form 20B/21B), credit days, and credit limit control.',
      path: '/masters/customers',
      shortcut: '2',
      tag: 'CHEMISTS',
    },
    {
      code: '3',
      title: 'SUPPLIER MASTER',
      desc: 'Pharma distributors and manufacturers. Outstanding payable balances, bank details, and supervisor access control.',
      path: '/masters/suppliers',
      shortcut: '3',
      tag: 'DISTRIBUTORS',
    },
    {
      code: '4',
      title: 'AUXILIARY MASTERS',
      desc: 'Registered Doctors, Field Salesmen, Territory Areas, GST Tax Slabs, and Pharmaceutical Companies.',
      path: '/masters/auxiliary',
      shortcut: '4',
      tag: 'AUXILIARY',
    },
    {
      code: '5',
      title: 'PRICE LIST PRINTING',
      desc: 'Wholesale (PTR), retail MRP, net rate, drug schedule, and scheme price catalogs.',
      path: '/masters/price-lists',
      shortcut: '5',
      tag: 'PRICE LISTS',
    },
    {
      code: '6',
      title: 'ADDRESS LABELS & DIRECTORY',
      desc: 'Parcel courier mailing labels, territory route directory, telephone contacts, and GSTIN registry.',
      path: '/masters/address-labels',
      shortcut: '6',
      tag: 'MAILING',
    },
  ];

  useKeyboardShortcuts([
    { key: '1', description: 'Open Products', action: () => router.push('/masters/products'), allowInInputs: false },
    { key: '2', description: 'Open Customers', action: () => router.push('/masters/customers'), allowInInputs: false },
    { key: '3', description: 'Open Suppliers', action: () => router.push('/masters/suppliers'), allowInInputs: false },
    { key: '4', description: 'Open Auxiliary', action: () => router.push('/masters/auxiliary'), allowInInputs: false },
    { key: '5', description: 'Open Price Lists', action: () => router.push('/masters/price-lists'), allowInInputs: false },
    { key: '6', description: 'Open Address Labels', action: () => router.push('/masters/address-labels'), allowInInputs: false },
    { key: 'Escape', description: 'Back to Billing', action: () => router.push('/billing'), allowInInputs: false },
  ], { scopeId: 'masters-hub', priority: 10 });

  return (
    <DosWindow
      title="MASTER FILES & DIRECTORIES"
      subtitle="[CENTRAL MASTER REGISTRIES]"
      breadcrumbs={['MAIN MENU', 'MASTERS']}
      actions={[
        { keyLabel: '1', label: 'Products', onClick: () => router.push('/masters/products'), variant: 'amber' },
        { keyLabel: '2', label: 'Customers', onClick: () => router.push('/masters/customers'), variant: 'primary' },
        { keyLabel: '3', label: 'Suppliers', onClick: () => router.push('/masters/suppliers'), variant: 'primary' },
        { keyLabel: '4', label: 'Auxiliary', onClick: () => router.push('/masters/auxiliary'), variant: 'primary' },
        { keyLabel: '5', label: 'Price Lists', onClick: () => router.push('/masters/price-lists') },
        { keyLabel: '6', label: 'Labels', onClick: () => router.push('/masters/address-labels') },
        { keyLabel: 'ESC', label: 'Exit to Billing', onClick: () => router.push('/billing') },
      ]}
      statusInfo={<span className="text-green-400 font-bold">● SYSTEM READY &amp; CONNECTED</span>}
    >
      <div className="p-6 max-w-5xl mx-auto flex flex-col gap-6">
        <div className="border border-brand-border bg-brand-surface/40 p-4">
          <h2 className="text-sm font-mono font-bold text-brand-ink uppercase tracking-wider mb-1">
            SELECT MASTER DIRECTORY (PRESS 1..6 OR CLICK)
          </h2>
          <p className="text-xs text-gray-600 font-mono">
            Manage product catalogs, chemist customer accounts, distributor suppliers, auxiliary codes, price sheets, and mailing labels.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {masterSections.map((sec) => (
            <Link
              key={sec.code}
              href={sec.path}
              className="border-2 border-brand-ink bg-white p-4 hover:border-brand-amber transition-none focus:outline-none focus:ring-2 focus:ring-brand-amber group"
            >
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-brand-border/40">
                <div className="flex items-center gap-2">
                  <span className="bg-brand-ink text-white font-mono font-bold text-xs px-2 py-0.5 group-hover:bg-brand-amber">
                    [{sec.shortcut}]
                  </span>
                  <span className="font-mono font-bold text-xs text-brand-ink group-hover:text-brand-amber">
                    {sec.title}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-gray-500 bg-brand-surface px-1.5 py-0.5 font-bold">
                  {sec.tag}
                </span>
              </div>
              <p className="font-mono text-xs text-gray-700 leading-relaxed">
                {sec.desc}
              </p>
            </Link>
          ))}
        </div>

        <div className="border border-brand-border bg-white p-3 flex items-center justify-between font-mono text-xs text-gray-600">
          <span>HOTKEYS: [1] Products  [2] Customers  [3] Suppliers  [4] Auxiliary  [5] Price Lists  [6] Labels  [ESC] Exit</span>
          <span className="text-brand-amber font-bold">ACTIVE PHARMACEUTICAL DIRECTORY</span>
        </div>
      </div>
    </DosWindow>
  );
}
