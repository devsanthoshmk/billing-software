import React from 'react';
import Link from 'next/link';
import { sqlite } from '@/lib/db';
import { DosWindow } from '@/components/ui/DosWindow';

export const dynamic = 'force-dynamic';

export default function AccountsDashboardPage() {
  // Aggregate KPIs
  const arRow = sqlite.prepare(`
    SELECT 
      COALESCE(SUM(balance_amount), 0) AS total_ar,
      COUNT(id) AS open_bills_count
    FROM customer_outstandings
    WHERE balance_amount > 0
  `).get() as any;

  const apRow = sqlite.prepare(`
    SELECT 
      COALESCE(SUM(balance_amount), 0) AS total_ap,
      COUNT(id) AS open_purchases_count
    FROM purchases
    WHERE balance_amount > 0 AND status != 'CANCELLED'
  `).get() as any;

  const chqInHand = sqlite.prepare(`
    SELECT 
      COUNT(id) AS count,
      COALESCE(SUM(amount), 0) AS total_amt
    FROM cheque_register
    WHERE cheque_type = 'INCOMING' AND status = 'RECEIVED'
  `).get() as any;

  const chqDishonored = sqlite.prepare(`
    SELECT 
      COUNT(id) AS count,
      COALESCE(SUM(amount), 0) AS total_amt
    FROM cheque_register
    WHERE status = 'DISHONORED'
  `).get() as any;

  const totalAR = Number(arRow?.total_ar || 0);
  const totalAP = Number(apRow?.total_ap || 0);

  const menuOptions = [
    {
      num: '1',
      hotkey: 'F1',
      title: 'Customer Collections & Receipts',
      desc: 'Record bill-by-bill collections, FIFO allocations, customer balance adjustments, and manage advances',
      href: '/accounts/receipts',
    },
    {
      num: '2',
      hotkey: 'F2',
      title: 'Supplier Payments',
      desc: 'Disburse payments against purchase bills, track supplier payables, and record cash or cheque vouchers',
      href: '/accounts/payments',
    },
    {
      num: '3',
      hotkey: 'F3',
      title: 'Cheque Register & Status',
      desc: 'Central cheque tracker: deposits, bank clearances, and dishonor rollback handling',
      href: '/accounts/cheques',
    },
    {
      num: '4',
      hotkey: 'F4',
      title: 'Customer Overdue Ageing',
      desc: 'Monitor receivables across 30, 60, 90, and 120+ day buckets with overdue interest tracking',
      href: '/accounts/ageing',
    },
    {
      num: '5',
      hotkey: 'F5',
      title: 'Advance Payment Settlement',
      desc: 'Reconcile unallocated advance collection receipts against open customer invoices via FIFO',
      href: '/accounts/on-account',
    },
    {
      num: '6',
      hotkey: 'F6',
      title: 'Bank Clearance & Cheques In-Hand',
      desc: 'View all pending customer cheques awaiting bank deposit or clearance',
      href: '/accounts/cheques?tab=in_hand',
    },
  ];

  return (
    <DosWindow
      title="Customer & Supplier Accounts Ledger"
      breadcrumbs={['MAIN MENU', 'ACCOUNTS & LEDGERS']}
    >
      <div className="flex flex-col gap-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3 bg-brand-surface border border-brand-border flex flex-col">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              TOTAL RECEIVABLES (A/R)
            </span>
            <span className="text-xl font-bold font-mono text-brand-ink">
              ₹ {totalAR.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-gray-500 mt-1">
              {arRow?.open_bills_count || 0} Open Customer Bills
            </span>
          </div>

          <div className="p-3 bg-brand-surface border border-brand-border flex flex-col">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              TOTAL PAYABLES (A/P)
            </span>
            <span className="text-xl font-bold font-mono text-red-600">
              ₹ {totalAP.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-gray-500 mt-1">
              {apRow?.open_purchases_count || 0} Open Purchase Bills
            </span>
          </div>

          <div className="p-3 bg-brand-surface border border-brand-border flex flex-col">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              CHEQUES IN-HAND (UNCREDITED)
            </span>
            <span className="text-xl font-bold font-mono text-brand-amber">
              ₹ {Number(chqInHand?.total_amt || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-gray-500 mt-1">
              {chqInHand?.count || 0} Cheques Received
            </span>
          </div>

          <div className="p-3 bg-brand-surface border border-brand-border flex flex-col">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              DISHONORED / BOUNCED
            </span>
            <span className="text-xl font-bold font-mono text-red-700">
              {chqDishonored?.count || 0} Cheques
            </span>
            <span className="text-[10px] text-red-600 mt-1 font-bold">
              ₹ {Number(chqDishonored?.total_amt || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Menu Navigation Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {menuOptions.map((opt) => (
            <Link
              key={opt.num}
              href={opt.href}
              className="p-4 bg-white border border-brand-border hover:border-brand-ink hover:shadow-[4px_4px_0px_0px_#0B192C] transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="w-6 h-6 bg-brand-ink text-white font-mono text-xs font-bold flex items-center justify-center">
                    {opt.num}
                  </span>
                  <span className="text-[10px] font-mono bg-gray-100 text-gray-700 px-1.5 py-0.5 border border-gray-300">
                    {opt.hotkey}
                  </span>
                </div>
                <h3 className="font-mono font-bold text-sm text-brand-ink group-hover:text-brand-amber mb-1">
                  {opt.title}
                </h3>
                <p className="text-xs text-gray-600 line-clamp-2">{opt.desc}</p>
              </div>
              <div className="mt-4 pt-2 border-t border-gray-100 flex items-center justify-between text-xs font-mono text-brand-ink font-bold">
                <span>OPEN SCREEN</span>
                <span>&rarr;</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </DosWindow>
  );
}
