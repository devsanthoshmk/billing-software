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
      desc: 'Medicines catalog, regulatory drug schedules (H/H1/Psychotropic), multi-batch inventory, rates, schemes & HSN codes.',
      path: '/masters/products',
      shortcut: '1',
      tag: 'FEATURE F15 / F19',
    },
    {
      code: '2',
      title: 'CUSTOMER MASTER',
      desc: 'B2B pharmacies, clinics & hospitals. GSTIN, PAN, Form 20B/21B drug licenses, credit days & credit limit enforcement.',
      path: '/masters/customers',
      shortcut: '2',
      tag: 'FEATURE F16',
    },
    {
      code: '3',
      title: 'SUPPLIER MASTER',
      desc: 'Pharma distributors & manufacturers. AP ledger balance, bank IFSC details & supervisor password-gated access.',
      path: '/masters/suppliers',
      shortcut: '3',
      tag: 'FEATURE F17 (SPM)',
    },
    {
      code: '4',
      title: 'AUXILIARY MASTERS',
      desc: 'Registered Doctors, Field Salesmen, Territory Areas, GST Tax Slabs (01 Nil protected) & Manufacturer Companies.',
      path: '/masters/auxiliary',
      shortcut: '4',
      tag: 'FEATURE F18',
    },
  ];

  useKeyboardShortcuts([
    { key: '1', description: 'Open Products', action: () => router.push('/masters/products'), allowInInputs: false },
    { key: '2', description: 'Open Customers', action: () => router.push('/masters/customers'), allowInInputs: false },
    { key: '3', description: 'Open Suppliers', action: () => router.push('/masters/suppliers'), allowInInputs: false },
    { key: '4', description: 'Open Auxiliary', action: () => router.push('/masters/auxiliary'), allowInInputs: false },
    { key: 'Escape', description: 'Back to Billing', action: () => router.push('/billing'), allowInInputs: false },
  ], { scopeId: 'masters-hub', priority: 10 });

  return (
    <DosWindow
      title="MASTER FILES MAINTENANCE MENU"
      subtitle="[SYS-1] [MAMENU.PRG / REPLICA]"
      breadcrumbs={['MAIN MENU', 'MASTERS']}
      actions={[
        { keyLabel: '1', label: 'Products', onClick: () => router.push('/masters/products'), variant: 'amber' },
        { keyLabel: '2', label: 'Customers', onClick: () => router.push('/masters/customers'), variant: 'primary' },
        { keyLabel: '3', label: 'Suppliers', onClick: () => router.push('/masters/suppliers'), variant: 'primary' },
        { keyLabel: '4', label: 'Auxiliary', onClick: () => router.push('/masters/auxiliary'), variant: 'primary' },
        { keyLabel: 'ESC', label: 'Exit to Billing', onClick: () => router.push('/billing') },
      ]}
      statusInfo={<span className="text-green-400 font-bold">DATABASE CONNECTED (WAL)</span>}
    >
      <div className="p-6 max-w-5xl mx-auto flex flex-col gap-6">
        <div className="border border-brand-border bg-brand-surface/40 p-4">
          <h2 className="text-sm font-mono font-bold text-brand-ink uppercase tracking-wider mb-1">
            SELECT MASTER SUBSYSTEM (PRESS 1..4 OR CLICK)
          </h2>
          <p className="text-xs text-gray-600 font-mono">
            Direct 1-to-1 operational recreation of FoxPro 2.6 master records. All transactional rules,
            regulatory checks, GST tax slab invariants, and deletion guards are active.
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
                <span className="text-[10px] font-mono text-gray-500 bg-brand-surface px-1.5 py-0.5">
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
          <span>HOTKEYS: [1] Products  [2] Customers  [3] Suppliers  [4] Auxiliary  [ESC] Exit</span>
          <span className="text-brand-amber font-bold">STRICT 0-RADIUS TERMINAL BRUTALISM</span>
        </div>
      </div>
    </DosWindow>
  );
}
