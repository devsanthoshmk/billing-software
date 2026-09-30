'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DosWindow } from '@/components/ui/DosWindow';
import { useKeyboardShortcuts } from '@/lib/keyboard/useKeyboardShortcuts';

export interface DashboardStats {
  totalProducts: number;
  totalBatches: number;
  totalStockUnits: number;
  totalStockValuation: number;
  shortExpiryCount: number;
  totalCustomers: number;
  totalSuppliers: number;
  todayInvoicesCount: number;
  todaySalesAmount: number;
  systemDate: string;
}

interface HomeDashboardClientProps {
  stats: DashboardStats;
}

interface ModuleDefinition {
  id: string;
  title: string;
  code: string;
  shortcut: string;
  path: string;
  colorClass: string;
  bgAccent: string;
  borderAccent: string;
  description: string;
  subRoutes: {
    title: string;
    path: string;
    code: string;
    badge?: string;
    desc: string;
  }[];
}

const SYSTEM_MODULES: ModuleDefinition[] = [
  {
    id: 'billing',
    title: 'POS & Counter Billing',
    code: 'INVPRE',
    shortcut: 'F2',
    path: '/billing',
    colorClass: 'text-[#F05A28]',
    bgAccent: 'bg-orange-50',
    borderAccent: 'border-orange-300',
    description: 'Counter sales, tax invoices, receipt generation, delivery challans, and sales returns.',
    subRoutes: [
      { title: 'POS Counter Billing', path: '/billing', code: 'INVPRE', badge: 'F2', desc: 'Scan or search medicines, apply schemes, and print bills' },
      { title: 'Invoice Copy Reprint', path: '/billing/reprint', code: 'REPRINT', badge: 'RPT', desc: 'Search past invoices and reprint duplicate copies' },
      { title: 'Delivery Challan (DC)', path: '/billing/delivery-challan', code: 'DELCHLN', badge: 'DC', desc: 'Issue goods on delivery challan prior to final tax billing' },
      { title: 'Sales Returns', path: '/billing/returns', code: 'SALERET', badge: 'RET', desc: 'Accept returned medicines and generate customer credit notes' },
      { title: 'Credit & Debit Notes', path: '/billing/notes', code: 'NOTEREG', badge: 'CN/DN', desc: 'Record rate difference adjustments and voucher notes' },
      { title: 'Cancel Invoice', path: '/billing/cancel', code: 'INVCAN', badge: 'CAN', desc: 'Supervisor-authorized bill cancellation with stock restore' },
      { title: 'Party Balance Slip', path: '/billing/party-balance', code: 'PRNPARTY', badge: 'BAL', desc: 'Print customer ledger balance and statement of accounts' },
    ],
  },
  {
    id: 'masters',
    title: 'Master Records & Directories',
    code: 'MASMENU',
    shortcut: 'F3',
    path: '/masters',
    colorClass: 'text-sky-700',
    bgAccent: 'bg-sky-50',
    borderAccent: 'border-sky-300',
    description: 'Medicines catalog, chemist customers, pharma distributors, doctors, salesmen, and price lists.',
    subRoutes: [
      { title: 'Product Master', path: '/masters/products', code: 'MASPROD', badge: '1', desc: 'Medicines catalog, drug schedules (H/H1), rates, and HSN codes' },
      { title: 'Customer Master', path: '/masters/customers', code: 'MASCUST', badge: '2', desc: 'Chemist shops, hospitals, GSTIN, Drug Licenses (20B/21B), and credit limits' },
      { title: 'Supplier Master', path: '/masters/suppliers', code: 'MASSUP', badge: '3', desc: 'Pharma distributors, outstanding payable balances, and bank details' },
      { title: 'Auxiliary Masters', path: '/masters/auxiliary', code: 'MASAUX', badge: '4', desc: 'Registered Doctors, Field Salesmen, Territory Areas, and GST Tax Slabs' },
      { title: 'Price Lists Matrix', path: '/masters/price-lists', code: 'PROFLIST', badge: '5', desc: 'Wholesale PTR, retail MRP, and special scheme price lists' },
      { title: 'Address Labels & Phone', path: '/masters/address-labels', code: 'PHONLIST', badge: '6', desc: 'Courier mailing labels and customer telephone directory' },
    ],
  },
  {
    id: 'stock',
    title: 'Stock & Inventory Management',
    code: 'STKMENU',
    shortcut: 'F4',
    path: '/stock',
    colorClass: 'text-emerald-700',
    bgAccent: 'bg-emerald-50',
    borderAccent: 'border-emerald-300',
    description: 'Goods receipt notes (GRN), batch expiry tracking, physical adjustments, transfers, and claims.',
    subRoutes: [
      { title: 'Purchase Inward (GRN)', path: '/stock/purchase', code: 'PURINW', badge: 'F2', desc: 'Receive supplier shipments with batch numbers, expiry dates, and rates' },
      { title: 'Purchase Returns', path: '/stock/returns', code: 'PURRET', badge: 'F3', desc: 'Return damaged or expired stock to distributors with debit notes' },
      { title: 'Stock Adjustments', path: '/stock/adjustments', code: 'STKADJ', badge: 'F4', desc: 'Reconcile physical stock discrepancies and audit inventory counts' },
      { title: 'Depot Transfers', path: '/stock/transfers', code: 'STKTRN', badge: 'F6', desc: 'Transfer stock between godowns, depots, and branch locations' },
      { title: 'Rack Location & Rates', path: '/stock/rack-management', code: 'RACKMOD', badge: 'F7', desc: 'Assign shelf storage locations and modify selling prices' },
      { title: 'Multi-MRP Reconciler', path: '/stock/multi-mrp', code: 'MULTMRP', badge: 'F8', desc: 'Manage product items with multiple batch MRPs' },
      { title: 'Breakage & Expiry Claims', path: '/stock/claims', code: 'CLMREG', badge: 'F9', desc: 'Register supplier claims for broken or expired medicines' },
      { title: 'HSN & GST Mapping', path: '/stock/hsn-mapping', code: 'HSNMAP', badge: 'F10', desc: 'Batch update HSN codes and statutory GST tax slabs' },
    ],
  },
  {
    id: 'reports',
    title: 'Statutory Reports & Analytics',
    code: 'REPMENU',
    shortcut: 'F5',
    path: '/reports',
    colorClass: 'text-purple-700',
    bgAccent: 'bg-purple-50',
    borderAccent: 'border-purple-300',
    description: 'Daily sales register, stock valuation, short-expiry lists, GST summaries, and turnover analytics.',
    subRoutes: [
      { title: 'Daily Sales Register', path: '/reports/daily-sales', code: 'DSALREG', badge: '1', desc: "Today's sales register, cash drawer tally, and hourly sales" },
      { title: 'Stock Valuation Statement', path: '/reports/stock', code: 'CLOSTK', badge: '2', desc: 'Current closing stock valuation at cost, selling rate, and MRP' },
      { title: 'Short-Expiry Statement', path: '/reports/expiry', code: 'EXPREP', badge: '3', desc: 'Medicines expiring within the next 30, 60, or 90 days' },
      { title: 'Company Sales & Stock', path: '/reports/companies', code: 'COMSAL', badge: '4', desc: 'Manufacturer-wise turnover, sales volume, and gross margins' },
      { title: 'Salesman Commission', path: '/reports/salesmen', code: 'SALESREP', badge: '5', desc: 'Sales rep turnover, monthly targets, and commissions' },
      { title: 'GST Statutory Abstract', path: '/reports/gst', code: 'GSTSTAT', badge: '6', desc: 'Monthly CGST, SGST, and IGST tax summary report' },
      { title: 'GSTR-1 / 3B Data Export', path: '/reports/gst/export', code: 'GSTREXP', badge: '7', desc: 'Export JSON and CSV data files for GST portal filing' },
      { title: 'ABC Inventory Velocity', path: '/reports/stock-movement', code: 'ABCVEL', badge: '8', desc: 'Fast-moving, slow-moving, and non-moving inventory analysis' },
      { title: 'Comparative Analytics', path: '/reports/comparative', code: 'COMPREP', badge: '9', desc: 'Month-on-month and year-on-year sales and growth comparison' },
    ],
  },
  {
    id: 'accounts',
    title: 'Accounts & Financial Ledgers',
    code: 'ACCMENU',
    shortcut: 'F6',
    path: '/accounts',
    colorClass: 'text-amber-800',
    bgAccent: 'bg-amber-50',
    borderAccent: 'border-amber-300',
    description: 'Customer collections, supplier payments, cheque registers, and ageing statements.',
    subRoutes: [
      { title: 'Customer Receipts', path: '/accounts/receipts', code: 'RECPT', badge: '1', desc: 'Record cash, cheque, and UPI collections from chemist shops' },
      { title: 'Supplier Payments', path: '/accounts/payments', code: 'PAYMT', badge: '2', desc: 'Record payments made to pharma distributors and vendors' },
      { title: 'Cheque Lifecycle Register', path: '/accounts/cheques', code: 'CHQREG', badge: '3', desc: 'Track PDC, deposited, cleared, and bounced cheques' },
      { title: 'Bill Ageing Analysis', path: '/accounts/ageing', code: 'AGEING', badge: '4', desc: 'Track overdue receivables by bill age (30, 60, 90+ days)' },
      { title: 'On-Account Settlement', path: '/accounts/on-account', code: 'ONACCT', badge: '5', desc: 'Auto-allocate unadjusted advance receipts to oldest bills (FIFO)' },
    ],
  },
  {
    id: 'system',
    title: 'System Maintenance & Control',
    code: 'SYSMENU',
    shortcut: 'F7',
    path: '/system',
    colorClass: 'text-rose-700',
    bgAccent: 'bg-rose-50',
    borderAccent: 'border-rose-300',
    description: 'Day-end closing, period locks, automated data backups, Tally export, and system diagnostics.',
    subRoutes: [
      { title: 'Day-End Closing & Audit', path: '/system/day-end', code: 'DAYEND', badge: '1', desc: 'Close the day, reconcile cash drawer, and generate audit summary' },
      { title: 'Month-End Period Closing', path: '/system/month-end', code: 'MNTHEND', badge: '2', desc: 'Lock monthly accounting period against past modifications' },
      { title: 'Database Backup & Archive', path: '/system/backup', code: 'DBBACKUP', badge: '3', desc: 'Create an instant timestamped backup of the database' },
      { title: 'Turnover Recalculation', path: '/system/recalculate', code: 'RECALC', badge: '4', desc: 'Recalculate stock totals and resolve balance discrepancies' },
      { title: 'Tally Prime XML Export', path: '/system/tally-export', code: 'TALLYEXP', badge: '5', desc: 'Export accounting vouchers and master records to Tally Prime' },
      { title: 'Database Diagnostics', path: '/system/diagnostics', code: 'DIAG', badge: '6', desc: 'Run database health check and inspect table statistics' },
      { title: 'Supervisor Security Controls', path: '/system/supervisor', code: 'SUPVSR', badge: '7', desc: 'Configure supervisor passwords and administrative permissions' },
    ],
  },
];

export function HomeDashboardClient({ stats }: HomeDashboardClientProps) {
  const router = useRouter();
  const [filterQuery, setFilterQuery] = useState('');

  // Keyboard navigation shortcuts for main hubs
  useKeyboardShortcuts(
    [
      { key: 'F2', description: 'Open Billing', action: () => router.push('/billing'), allowInInputs: false },
      { key: 'F3', description: 'Open Masters', action: () => router.push('/masters'), allowInInputs: false },
      { key: 'F4', description: 'Open Stock', action: () => router.push('/stock'), allowInInputs: false },
      { key: 'F5', description: 'Open Reports', action: () => router.push('/reports'), allowInInputs: false },
      { key: 'F6', description: 'Open Accounts', action: () => router.push('/accounts'), allowInInputs: false },
      { key: 'F7', description: 'Open System', action: () => router.push('/system'), allowInInputs: false },
    ],
    { scopeId: 'home-dashboard-client', priority: 10 }
  );

  // Filtered module list based on search term
  const filteredModules = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return SYSTEM_MODULES;

    return SYSTEM_MODULES.map((mod) => {
      const matchMod =
        mod.title.toLowerCase().includes(q) ||
        mod.description.toLowerCase().includes(q) ||
        mod.code.toLowerCase().includes(q);

      const matchedRoutes = mod.subRoutes.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.desc.toLowerCase().includes(q) ||
          r.code.toLowerCase().includes(q) ||
          (r.badge && r.badge.toLowerCase().includes(q))
      );

      if (matchMod) {
        return mod;
      }
      if (matchedRoutes.length > 0) {
        return {
          ...mod,
          subRoutes: matchedRoutes,
        };
      }
      return null;
    }).filter(Boolean) as ModuleDefinition[];
  }, [filterQuery]);

  const quickLaunchItems = [
    {
      badge: 'F2',
      title: 'SELL MEDICINE (NEW INVOICE)',
      sub: 'Counter Billing & Instant Print',
      desc: 'Scan or search medicine, apply discounts, and generate a GST tax invoice.',
      path: '/billing',
      variant: 'amber' as const,
      border: 'border-l-4 border-l-[#F05A28]',
    },
    {
      badge: 'F4',
      title: 'RECEIVE STOCK (PURCHASE)',
      sub: 'Goods Receipt Note (GRN Entry)',
      desc: 'Record inward supplier delivery with batch numbers, expiry dates, and purchase rates.',
      path: '/stock/purchase',
      variant: 'primary' as const,
      border: 'border-l-4 border-l-emerald-600',
    },
    {
      badge: 'F3',
      title: 'MEDICINE CATALOG',
      sub: 'Product Master & Rate Updates',
      desc: 'Browse medicine directory, check batch stock, update MRPs, and manage drug schedules.',
      path: '/masters/products',
      variant: 'default' as const,
      border: 'border-l-4 border-l-sky-600',
    },
    {
      badge: 'F6',
      title: 'COLLECT PAYMENT (RECEIPT)',
      sub: 'Customer Collections & Cheques',
      desc: 'Record money received from chemists and allocate against outstanding bills.',
      path: '/accounts/receipts',
      variant: 'default' as const,
      border: 'border-l-4 border-l-amber-600',
    },
    {
      badge: 'F5',
      title: "TODAY'S SALES REGISTER",
      sub: 'Daily Sales & Cash Summary',
      desc: "Review today's counter cash collections, credit sales, and turnover.",
      path: '/reports/daily-sales',
      variant: 'default' as const,
      border: 'border-l-4 border-l-purple-600',
    },
    {
      badge: 'F7',
      title: 'DAY-END CLOSING',
      sub: 'Daily Cash Tally & Register Lock',
      desc: 'Reconcile cash drawer, lock daily transactions, and print closing summary.',
      path: '/system/day-end',
      variant: 'danger' as const,
      border: 'border-l-4 border-l-red-600',
    },
  ];

  return (
    <DosWindow
      title="MediSys — Pharmaceutical ERP — Main Dashboard"
      subtitle="[COUNTER 1] [SYSTEM READY]"
      breadcrumbs={['SYSTEM', 'MAIN DASHBOARD']}
      actions={[
        { keyLabel: 'F2', label: 'Billing POS', onClick: () => router.push('/billing'), variant: 'amber' },
        { keyLabel: 'F3', label: 'Masters', onClick: () => router.push('/masters') },
        { keyLabel: 'F4', label: 'Stock Entry', onClick: () => router.push('/stock') },
        { keyLabel: 'F5', label: 'Reports', onClick: () => router.push('/reports') },
        { keyLabel: 'F6', label: 'Accounts', onClick: () => router.push('/accounts') },
        { keyLabel: 'F7', label: 'System Lock', onClick: () => router.push('/system') },
      ]}
      statusInfo={
        <div className="flex items-center gap-2">
          <span className="text-green-400 font-bold">● SYSTEM ONLINE</span>
          <span className="text-gray-400">|</span>
          <span className="text-brand-amber font-bold">DATE: {stats.systemDate}</span>
        </div>
      }
    >
      <div className="p-3 max-w-7xl mx-auto flex flex-col gap-4 font-mono">
        {/* 1. Live System Status & KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {/* Total Cataloged Medicines */}
          <div className="border-2 border-brand-ink bg-white p-2.5 shadow-[2px_2px_0px_0px_#0B192C]">
            <div className="flex justify-between items-start">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                Active Medicines
              </span>
              <span className="text-[9px] bg-sky-100 text-sky-800 font-bold px-1 border border-sky-300">
                F3 MASTERS
              </span>
            </div>
            <div className="text-xl font-bold text-brand-ink mt-1">
              {stats.totalProducts.toLocaleString()}
            </div>
            <div className="text-[11px] text-gray-600 mt-0.5 flex justify-between">
              <span>Batches: <strong className="text-brand-text">{stats.totalBatches}</strong></span>
              <span>Stock: <strong className="text-brand-text">{stats.totalStockUnits.toLocaleString()}</strong></span>
            </div>
          </div>

          {/* Stock Valuation */}
          <div className="border-2 border-brand-ink bg-white p-2.5 shadow-[2px_2px_0px_0px_#0B192C]">
            <div className="flex justify-between items-start">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                Stock Valuation (Cost)
              </span>
              <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1 border border-emerald-300">
                F4 STOCK
              </span>
            </div>
            <div className="text-xl font-bold text-emerald-700 mt-1">
              ₹ {stats.totalStockValuation.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-gray-600 mt-0.5">
              Current warehouse inventory at purchase cost
            </div>
          </div>

          {/* Registered Chemists & Suppliers */}
          <div className="border-2 border-brand-ink bg-white p-2.5 shadow-[2px_2px_0px_0px_#0B192C]">
            <div className="flex justify-between items-start">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                Parties & Network
              </span>
              <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1 border border-amber-300">
                F6 ACCOUNTS
              </span>
            </div>
            <div className="text-xl font-bold text-brand-ink mt-1">
              {stats.totalCustomers + stats.totalSuppliers} <span className="text-xs font-normal text-gray-500">Total</span>
            </div>
            <div className="text-[11px] text-gray-600 mt-0.5 flex justify-between">
              <span>Chemists: <strong className="text-brand-text">{stats.totalCustomers}</strong></span>
              <span>Suppliers: <strong className="text-brand-text">{stats.totalSuppliers}</strong></span>
            </div>
          </div>

          {/* Expiry Watchlist / Alert */}
          <div className="border-2 border-brand-ink bg-white p-2.5 shadow-[2px_2px_0px_0px_#0B192C]">
            <div className="flex justify-between items-start">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                Near Expiry (&lt;90 Days)
              </span>
              <span className={`text-[9px] font-bold px-1 border ${
                stats.shortExpiryCount > 0
                  ? 'bg-red-100 text-red-800 border-red-300 animate-pulse'
                  : 'bg-green-100 text-green-800 border-green-300'
              }`}>
                F5 ALERTS
              </span>
            </div>
            <div className={`text-xl font-bold mt-1 ${
              stats.shortExpiryCount > 0 ? 'text-red-600' : 'text-green-700'
            }`}>
              {stats.shortExpiryCount} <span className="text-xs font-normal text-gray-600">Batches</span>
            </div>
            <div className="text-[11px] text-gray-600 mt-0.5">
              <Link href="/reports/expiry" className="text-brand-amber font-bold hover:underline">
                View Short Expiry List →
              </Link>
            </div>
          </div>
        </div>

        {/* 2. Top Operator Launchpad (Daily Essential Tasks) */}
        <div className="border-2 border-brand-ink bg-brand-surface p-3 shadow-[3px_3px_0px_0px_#0B192C]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-border pb-2 mb-3">
            <div>
              <h2 className="text-xs font-bold text-brand-ink uppercase tracking-wider flex items-center gap-2">
                <span className="bg-[#F05A28] text-white px-1.5 py-0.2">TOP ACTIONS</span>
                DAILY COUNTER TASKS (CLICK OR PRESS HOTKEY)
              </h2>
              <p className="text-[11px] text-gray-600">
                Frequent daily tasks for fast counter operation.
              </p>
            </div>
            <span className="text-[11px] text-gray-500 bg-white px-2 py-0.5 border border-brand-border">
              PRESS <strong className="text-brand-ink">F1..F7</strong> ANYWHERE TO SWITCH MODULES
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {quickLaunchItems.map((item, idx) => (
              <Link
                key={idx}
                href={item.path}
                className={`bg-white border-2 border-brand-ink p-3 hover:bg-orange-50/70 hover:border-[#F05A28] transition-none flex flex-col justify-between shadow-[2px_2px_0px_0px_#0B192C] focus:outline-none focus:ring-2 focus:ring-[#F05A28] ${item.border}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-bold text-brand-ink tracking-wide">
                      {item.title}
                    </span>
                    <span className="bg-brand-ink text-white font-bold text-[11px] px-1.5 py-0.5">
                      {item.badge}
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold text-gray-700 mb-1">
                    {item.sub}
                  </div>
                  <p className="text-[11px] text-gray-500 leading-tight">
                    {item.desc}
                  </p>
                </div>
                <div className="mt-2.5 pt-1.5 border-t border-gray-200 flex justify-between items-center text-[10px] text-gray-500 font-bold">
                  <span className="text-[#F05A28] uppercase">Open Screen →</span>
                  <span className="font-mono text-gray-400">{item.path}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* 3. Universal Interactive Screen Finder & Filter Bar */}
        <div className="border border-brand-border bg-white p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-[2px_2px_0px_0px_#9AA0A6]">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs font-bold text-brand-ink whitespace-nowrap">
              🔍 FIND SCREEN / TASK:
            </span>
            <div className="relative flex-1">
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Type keyword e.g. 'reprint', 'expiry', 'challan', 'tally', 'mrp', 'doctor', 'cheque'..."
                className="w-full border-2 border-brand-ink bg-gray-50 px-3 py-1.5 text-xs text-brand-ink font-mono font-semibold focus:bg-white focus:border-[#F05A28] focus:outline-none"
              />
              {filterQuery && (
                <button
                  type="button"
                  onClick={() => setFilterQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-gray-300 hover:bg-gray-400 text-black px-1.5 py-0.5 font-bold"
                >
                  CLEAR
                </button>
              )}
            </div>
          </div>

          <div className="text-[11px] text-gray-500 flex items-center gap-2 self-end sm:self-center">
            <span>Showing: <strong className="text-brand-ink">{filteredModules.reduce((acc, m) => acc + m.subRoutes.length, 0)}</strong> Screens</span>
          </div>
        </div>

        {/* 4. Complete System Module Matrix (All 35+ Sub-routes Organized) */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-brand-ink uppercase tracking-wider">
              ALL SYSTEM MODULES &amp; OPERATIONS
            </h3>
            <span className="text-[11px] text-gray-500">
              Click any section or sub-item to navigate directly
            </span>
          </div>

          {filteredModules.length === 0 ? (
            <div className="border-2 border-dashed border-gray-400 p-8 text-center bg-white">
              <p className="text-sm font-bold text-gray-700">NO MATCHING SCREEN FOUND</p>
              <p className="text-xs text-gray-500 mt-1">
                No screen or task matches &quot;{filterQuery}&quot;. Try searching for general terms like &quot;sales&quot;, &quot;stock&quot;, or &quot;gst&quot;.
              </p>
              <button
                type="button"
                onClick={() => setFilterQuery('')}
                className="mt-3 bg-brand-ink text-white text-xs px-3 py-1 font-bold hover:bg-[#F05A28]"
              >
                Reset Search
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredModules.map((mod) => (
                <div
                  key={mod.id}
                  className="border-2 border-brand-ink bg-white flex flex-col justify-between shadow-[3px_3px_0px_0px_#0B192C]"
                >
                  {/* Module Header Bar */}
                  <div className="bg-brand-ink text-white p-2.5 flex items-center justify-between border-b border-brand-ink">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="bg-[#F05A28] text-white font-bold text-[10px] px-1 py-0.2">
                          {mod.shortcut}
                        </span>
                        <h4 className="font-bold text-xs uppercase tracking-wider text-white">
                          {mod.title}
                        </h4>
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {mod.code}
                      </span>
                    </div>

                    <Link
                      href={mod.path}
                      className="text-[10px] bg-white/10 hover:bg-white/25 text-gray-200 hover:text-white px-2 py-1 font-bold border border-gray-600 focus:outline-none"
                    >
                      OPEN →
                    </Link>
                  </div>

                  {/* Module Sub-Routes List */}
                  <div className="p-2 flex-1 flex flex-col gap-1 divide-y divide-gray-100">
                    {mod.subRoutes.map((sub, idx) => (
                      <Link
                        key={idx}
                        href={sub.path}
                        className="pt-1.5 first:pt-0 group flex flex-col p-1.5 hover:bg-orange-50/80 transition-none border border-transparent hover:border-orange-200"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-xs text-brand-ink group-hover:text-[#F05A28]">
                            {sub.title}
                          </span>
                          {sub.badge && (
                            <span className="text-[9px] font-mono bg-gray-100 text-gray-700 px-1 border border-gray-300 group-hover:bg-[#F05A28] group-hover:text-white group-hover:border-[#F05A28]">
                              {sub.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-600 mt-0.5 leading-tight">
                          {sub.desc}
                        </p>
                      </Link>
                    ))}
                  </div>

                  {/* Module Bottom Bar */}
                  <div className="bg-brand-surface border-t border-brand-border px-2.5 py-1.5 flex justify-between items-center text-[10px] text-gray-600">
                    <span className="truncate max-w-[200px]">{mod.description}</span>
                    <Link
                      href={mod.path}
                      className="text-[#F05A28] font-bold hover:underline shrink-0 ml-1"
                    >
                      Open {mod.title}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 5. Operator Guidance & Keyboard Cheatsheet */}
        <div className="border border-brand-border bg-brand-surface p-3 text-xs text-gray-700">
          <div className="font-bold uppercase text-brand-ink mb-1 flex items-center gap-2">
            <span>KEYBOARD SHORTCUTS:</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-[11px] font-mono">
            <div className="bg-white p-1 border border-brand-border"><strong className="text-[#F05A28]">F1</strong> : Dashboard</div>
            <div className="bg-white p-1 border border-brand-border"><strong className="text-[#F05A28]">F2</strong> : POS Billing</div>
            <div className="bg-white p-1 border border-brand-border"><strong className="text-[#F05A28]">F3</strong> : Masters</div>
            <div className="bg-white p-1 border border-brand-border"><strong className="text-[#F05A28]">F4</strong> : Stock Entry</div>
            <div className="bg-white p-1 border border-brand-border"><strong className="text-[#F05A28]">F5</strong> : Reports</div>
            <div className="bg-white p-1 border border-brand-border"><strong className="text-[#F05A28]">F6</strong> : Accounts</div>
            <div className="bg-white p-1 border border-brand-border"><strong className="text-[#F05A28]">F7</strong> : System</div>
          </div>
        </div>
      </div>
    </DosWindow>
  );
}
