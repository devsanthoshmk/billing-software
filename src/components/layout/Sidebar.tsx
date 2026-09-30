'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useKeyboardShortcuts } from '@/lib/keyboard/useKeyboardShortcuts';

export interface SubRoute {
  title: string;
  path: string;
  code: string;
  badge?: string;
  hint: string;
}

export interface NavModule {
  id: string;
  label: string;
  shortcut: string;
  path: string;
  code: string;
  color: string;
  subRoutes: SubRoute[];
}

export const NAV_MODULES: NavModule[] = [
  {
    id: 'billing',
    label: 'POS Billing',
    shortcut: 'F2',
    path: '/billing',
    code: 'INVPRE',
    color: '#F05A28',
    subRoutes: [
      { title: 'POS Counter Billing', path: '/billing', code: 'INVPRE', badge: 'F2', hint: 'Create sales invoice & print bill' },
      { title: 'Invoice Reprint', path: '/billing/reprint', code: 'REPRINT', badge: 'RPT', hint: 'Search and reprint duplicate bills' },
      { title: 'Delivery Challan (DC)', path: '/billing/delivery-challan', code: 'DELCHLN', badge: 'DC', hint: 'Issue goods on delivery slip' },
      { title: 'Sales Returns', path: '/billing/returns', code: 'SALERET', badge: 'RET', hint: 'Customer medicine return voucher' },
      { title: 'Credit & Debit Notes', path: '/billing/notes', code: 'NOTEREG', badge: 'CN/DN', hint: 'Price difference credit & debit' },
      { title: 'Cancel Invoice', path: '/billing/cancel', code: 'INVCAN', badge: 'CAN', hint: 'Supervisor-authorized bill cancellation' },
      { title: 'Party Balance Slip', path: '/billing/party-balance', code: 'PRNPARTY', badge: 'BAL', hint: 'Customer ledger balance slip' },
    ],
  },
  {
    id: 'masters',
    label: 'Masters',
    shortcut: 'F3',
    path: '/masters',
    code: 'MASMENU',
    color: '#0284C7',
    subRoutes: [
      { title: 'Product Master', path: '/masters/products', code: 'MASPROD', badge: '1', hint: 'Medicines, batches, MRP & HSN' },
      { title: 'Customer Master', path: '/masters/customers', code: 'MASCUST', badge: '2', hint: 'Chemists, DL 20B/21B, credit limits' },
      { title: 'Supplier Master', path: '/masters/suppliers', code: 'MASSUP', badge: '3', hint: 'Pharma distributors & payables' },
      { title: 'Auxiliary Masters', path: '/masters/auxiliary', code: 'MASAUX', badge: '4', hint: 'Doctors, salesmen, areas & tax slabs' },
      { title: 'Price Lists Matrix', path: '/masters/price-lists', code: 'PROFLIST', badge: '5', hint: 'Wholesale & retail price catalogs' },
      { title: 'Address Labels', path: '/masters/address-labels', code: 'PHONLIST', badge: '6', hint: 'Mailing labels & contact directory' },
    ],
  },
  {
    id: 'stock',
    label: 'Stock Entry',
    shortcut: 'F4',
    path: '/stock',
    code: 'STKMENU',
    color: '#059669',
    subRoutes: [
      { title: 'Purchase Inward (GRN)', path: '/stock/purchase', code: 'PURINW', badge: 'F2', hint: 'Receive inward stock from distributor' },
      { title: 'Purchase Returns', path: '/stock/returns', code: 'PURRET', badge: 'F3', hint: 'Debit note return to distributor' },
      { title: 'Stock Adjustments', path: '/stock/adjustments', code: 'STKADJ', badge: 'F4', hint: 'Physical count audit & breakage' },
      { title: 'Depot Transfers', path: '/stock/transfers', code: 'STKTRN', badge: 'F6', hint: 'Inter-branch stock transfers' },
      { title: 'Rack & Rate Mod', path: '/stock/rack-management', code: 'RACKMOD', badge: 'F7', hint: 'Shelf locations & selling rates' },
      { title: 'Multi-MRP Reconciler', path: '/stock/multi-mrp', code: 'MULTMRP', badge: 'F8', hint: 'Handle duplicate batch MRPs' },
      { title: 'Breakage & Claims', path: '/stock/claims', code: 'CLMREG', badge: 'F9', hint: 'Distributor damage claims register' },
      { title: 'HSN & GST Mapping', path: '/stock/hsn-mapping', code: 'HSNMAP', badge: 'F10', hint: 'Update HSN & GST tax slabs' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    shortcut: 'F5',
    path: '/reports',
    code: 'REPMENU',
    color: '#7C3AED',
    subRoutes: [
      { title: 'Daily Sales Register', path: '/reports/daily-sales', code: 'DSALREG', badge: '1', hint: "Today's sales, cash & turnover" },
      { title: 'Stock Valuation', path: '/reports/stock', code: 'CLOSTK', badge: '2', hint: 'Closing stock at cost & MRP' },
      { title: 'Short-Expiry Alert', path: '/reports/expiry', code: 'EXPREP', badge: '3', hint: 'Medicines expiring in 30-90 days' },
      { title: 'Company Sales & Stock', path: '/reports/companies', code: 'COMSAL', badge: '4', hint: 'Manufacturer sales & margins' },
      { title: 'Salesman Commission', path: '/reports/salesmen', code: 'SALESREP', badge: '5', hint: 'Sales rep performance & targets' },
      { title: 'GST Statutory Abstract', path: '/reports/gst', code: 'GSTSTAT', badge: '6', hint: 'Monthly CGST/SGST tax summary' },
      { title: 'GSTR-1 / 3B Export', path: '/reports/gst/export', code: 'GSTREXP', badge: '7', hint: 'Portal JSON / CSV data exports' },
      { title: 'ABC Inventory Velocity', path: '/reports/stock-movement', code: 'ABCVEL', badge: '8', hint: 'Fast & slow-moving medicines' },
      { title: 'Comparative Analytics', path: '/reports/comparative', code: 'COMPREP', badge: '9', hint: 'Period-on-period growth analysis' },
    ],
  },
  {
    id: 'accounts',
    label: 'Accounts',
    shortcut: 'F6',
    path: '/accounts',
    code: 'ACCMENU',
    color: '#D97706',
    subRoutes: [
      { title: 'Customer Receipts', path: '/accounts/receipts', code: 'RECPT', badge: '1', hint: 'Cash/cheque collection from chemists' },
      { title: 'Supplier Payments', path: '/accounts/payments', code: 'PAYMT', badge: '2', hint: 'Disbursements to pharma distributors' },
      { title: 'Cheque Register', path: '/accounts/cheques', code: 'CHQREG', badge: '3', hint: 'PDC, deposited & cleared cheques' },
      { title: 'Bill Ageing Analysis', path: '/accounts/ageing', code: 'AGEING', badge: '4', hint: 'Overdue receivables (30/60/90+ days)' },
      { title: 'On-Account Settlement', path: '/accounts/on-account', code: 'ONACCT', badge: '5', hint: 'FIFO auto-allocation of advances' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    shortcut: 'F7',
    path: '/system',
    code: 'SYSMENU',
    color: '#DC2626',
    subRoutes: [
      { title: 'Day-End Audit', path: '/system/day-end', code: 'DAYEND', badge: '1', hint: 'Daily register lock & cash tally' },
      { title: 'Month-End Closing', path: '/system/month-end', code: 'MNTHEND', badge: '2', hint: 'Lock monthly accounting period' },
      { title: 'Database Backup', path: '/system/backup', code: 'DBBACKUP', badge: '3', hint: '1-click data snapshot backup' },
      { title: 'Turnover Recalculation', path: '/system/recalculate', code: 'RECALC', badge: '4', hint: 'Recalculate stock & fix balances' },
      { title: 'Tally XML Bridge', path: '/system/tally-export', code: 'TALLYEXP', badge: '5', hint: 'Export transactions to Tally Prime' },
      { title: 'Database Diagnostics', path: '/system/diagnostics', code: 'DIAG', badge: '6', hint: 'Database integrity & health check' },
      { title: 'Supervisor Security', path: '/system/supervisor', code: 'SUPVSR', badge: '7', hint: 'Password controls & permissions' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  // Search filter query state
  const [searchQuery, setSearchQuery] = useState('');
  // Expanded modules tracker
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    billing: true,
    masters: false,
    stock: false,
    reports: false,
    accounts: false,
    system: false,
  });

  // Automatically expand the active module based on route
  useEffect(() => {
    NAV_MODULES.forEach((mod) => {
      if (pathname.startsWith(mod.path)) {
        setExpandedModules((prev) => ({ ...prev, [mod.id]: true }));
      }
    });
  }, [pathname]);

  const toggleModule = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedModules((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Keyboard navigation shortcuts
  const shortcutList = useMemo(() => {
    const list = [
      {
        key: 'F1',
        description: 'Navigate to Dashboard / Home',
        action: () => router.push('/'),
        allowInInputs: false,
      },
      ...NAV_MODULES.map((mod) => ({
        key: mod.shortcut,
        description: `Navigate to ${mod.label}`,
        action: () => router.push(mod.path),
        allowInInputs: false,
      })),
    ];
    return list;
  }, [router]);

  useKeyboardShortcuts(shortcutList, { scopeId: 'sidebar-nav', priority: 5 });

  // Filtered sub-routes when searching
  const filteredScreens = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;

    const matches: { module: NavModule; route: SubRoute }[] = [];
    NAV_MODULES.forEach((mod) => {
      mod.subRoutes.forEach((route) => {
        if (
          route.title.toLowerCase().includes(q) ||
          route.code.toLowerCase().includes(q) ||
          route.hint.toLowerCase().includes(q) ||
          mod.label.toLowerCase().includes(q) ||
          (route.badge && route.badge.toLowerCase().includes(q))
        ) {
          matches.push({ module: mod, route });
        }
      });
    });
    return matches;
  }, [searchQuery]);

  const isHomeActive = pathname === '/';

  return (
    <aside
      data-testid="dos-sidebar"
      className="w-60 bg-brand-ink text-white flex flex-col h-screen border-r-2 border-brand-border select-none shrink-0 font-mono text-xs"
    >
      {/* 1. Header / Branding */}
      <div className="p-2.5 border-b border-gray-700 bg-brand-ink flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-brand-amber font-bold text-sm tracking-wider">MediSys</span>
            <span className="text-[10px] bg-brand-amber text-white font-bold px-1 py-0.2">v2.6</span>
          </div>
          <p className="text-[10px] text-gray-400">Pharmaceutical ERP</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-green-400 font-bold block">● READY</span>
          <span className="text-[9px] text-gray-400">COUNTER 1</span>
        </div>
      </div>

      {/* 2. Quick Search Screen Jumper */}
      <div className="p-2 border-b border-gray-800 bg-black/30">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 Find screen / task..."
            aria-label="Filter screens and tasks"
            className="w-full bg-black/40 border border-gray-700 text-gray-200 placeholder-gray-500 text-[11px] px-2 py-1 focus:border-brand-amber focus:bg-black/80 font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-[11px] px-1 font-bold"
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* 3. Navigation Tree Canvas */}
      <nav className="flex-1 py-1.5 overflow-y-auto overflow-x-hidden">
        {/* If search query active, show search results list */}
        {filteredScreens ? (
          <div className="px-1 py-1 flex flex-col gap-1">
            <div className="px-2 py-1 text-[10px] text-gray-400 font-bold uppercase tracking-wider flex justify-between">
              <span>Matching ({filteredScreens.length})</span>
              <button
                onClick={() => setSearchQuery('')}
                className="text-brand-amber hover:underline lowercase"
              >
                clear
              </button>
            </div>
            {filteredScreens.length === 0 ? (
              <div className="px-3 py-4 text-center text-gray-500 text-[11px]">
                No screens match &quot;{searchQuery}&quot;
              </div>
            ) : (
              filteredScreens.map(({ module: mod, route }, idx) => {
                const isItemActive = pathname === route.path;
                return (
                  <Link
                    key={`${route.path}-${idx}`}
                    href={route.path}
                    onClick={() => setSearchQuery('')}
                    className={`px-2 py-1.5 border flex flex-col gap-0.5 transition-none ${
                      isItemActive
                        ? 'bg-brand-amber text-white border-white font-bold'
                        : 'bg-white/5 border-gray-800 hover:bg-white/15 text-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[11px] truncate">{route.title}</span>
                      <span className="text-[9px] bg-black/40 px-1 text-gray-300 font-mono">
                        {route.code}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span className="truncate">{route.hint}</span>
                      <span className="text-brand-amber font-semibold shrink-0 ml-1">{mod.label}</span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        ) : (
          /* Normal Module Accordion View */
          <div className="flex flex-col gap-0.5 px-1">
            {/* Top Level: F1 Dashboard / Home */}
            <Link
              href="/"
              data-testid="nav-item-f1"
              data-active={isHomeActive ? 'true' : 'false'}
              className={`flex items-center justify-between px-2.5 py-1.5 text-xs transition-none border ${
                isHomeActive
                  ? 'bg-brand-amber text-white border-white font-bold'
                  : 'bg-white/5 border-transparent hover:bg-white/10 text-gray-200'
              }`}
              style={isHomeActive ? { backgroundColor: '#F05A28' } : undefined}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-brand-amber font-bold">[⊞]</span>
                <span className="truncate font-bold">Home Dashboard</span>
              </div>
              <span
                className={`text-[10px] px-1 py-0.2 font-bold ${
                  isHomeActive ? 'bg-black/30 text-white' : 'bg-white/10 text-gray-300'
                }`}
              >
                F1
              </span>
            </Link>

            <div className="h-[1px] bg-gray-800 my-1 mx-1" />

            {/* Modules (F2 to F7) */}
            {NAV_MODULES.map((mod) => {
              const isModActive = pathname.startsWith(mod.path);
              const isExpanded = !!expandedModules[mod.id];

              return (
                <div key={mod.id} className="flex flex-col mb-0.5">
                  {/* Module Header Row */}
                  <div
                    className={`flex items-center justify-between px-2 py-1 text-xs border ${
                      isModActive && pathname === mod.path
                        ? 'bg-brand-amber text-white border-brand-amber font-bold'
                        : isModActive
                        ? 'bg-white/15 text-white border-gray-600 font-semibold'
                        : 'bg-white/5 border-transparent hover:bg-white/10 text-gray-200'
                    }`}
                  >
                    {/* Clickable link to main module page */}
                    <Link
                      href={mod.path}
                      data-testid={`nav-item-${mod.shortcut.toLowerCase()}`}
                      data-active={isModActive ? 'true' : 'false'}
                      className="flex-1 flex items-center justify-between overflow-hidden pr-1 focus:outline-none"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-bold text-[11px] truncate">{mod.label}</span>
                      </div>
                      <span
                        className={`text-[9px] px-1 py-0.2 font-bold shrink-0 ${
                          isModActive ? 'bg-black/30 text-white' : 'bg-white/10 text-gray-400'
                        }`}
                      >
                        {mod.shortcut}
                      </span>
                    </Link>

                    {/* Expand/Collapse Accordion Toggle */}
                    <button
                      type="button"
                      onClick={(e) => toggleModule(mod.id, e)}
                      aria-label={`Toggle ${mod.label} sub-routes`}
                      className="p-1 text-gray-400 hover:text-white hover:bg-white/20 ml-1 text-[10px] font-bold"
                      title={isExpanded ? 'Collapse sub-menu' : 'Expand sub-menu'}
                    >
                      {isExpanded ? '▼' : '▶'}
                    </button>
                  </div>

                  {/* Sub-routes Drawer */}
                  {isExpanded && (
                    <ul className="flex flex-col bg-black/25 border-l-2 border-gray-700 ml-2 pl-1 py-0.5 my-0.5 gap-0.5">
                      {mod.subRoutes.map((sub) => {
                        const isSubActive =
                          pathname === sub.path ||
                          (sub.path === '/billing' && pathname === '/billing/pos');

                        return (
                          <li key={sub.path}>
                            <Link
                              href={sub.path}
                              title={`${sub.title} (${sub.code}) — ${sub.hint}`}
                              className={`flex items-center justify-between px-2 py-1 text-[11px] transition-none focus:outline-none ${
                                isSubActive
                                  ? 'bg-brand-amber text-white font-bold'
                                  : 'hover:bg-white/15 text-gray-300 hover:text-white'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="text-gray-500 font-bold text-[9px]">•</span>
                                <span className="truncate">{sub.title}</span>
                              </div>
                              {sub.badge && (
                                <span
                                  className={`text-[9px] px-1 font-mono shrink-0 ml-1 ${
                                    isSubActive
                                      ? 'bg-black/30 text-white'
                                      : 'bg-white/10 text-gray-400'
                                  }`}
                                >
                                  {sub.badge}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </nav>

      {/* 4. Terminal Node & System Status Footer */}
      <div className="p-2 border-t border-gray-700 bg-brand-ink text-[10px] text-gray-400 flex flex-col gap-0.5">
        <div className="flex justify-between items-center">
          <span>Terminal:</span>
          <span className="text-white font-bold">Counter 1 (Main)</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Database:</span>
          <span className="text-blue-400 font-bold">Connected</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Hotkeys:</span>
          <span className="text-brand-amber font-bold">F1..F7 Active</span>
        </div>
      </div>
    </aside>
  );
}
