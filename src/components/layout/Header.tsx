'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function Header() {
  const pathname = usePathname();
  const [capsLock, setCapsLock] = useState<boolean>(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      setCapsLock(e.getModifierState('CapsLock'));
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey);
    };
  }, []);

  const getBreadcrumbs = () => {
    // Billing
    if (pathname.startsWith('/billing/reprint')) return 'BILLING > INVOICE REPRINT';
    if (pathname.startsWith('/billing/delivery-challan')) return 'BILLING > DELIVERY CHALLANS (DC)';
    if (pathname.startsWith('/billing/cancel')) return 'BILLING > INVOICE CANCELLATION';
    if (pathname.startsWith('/billing/party-balance')) return 'BILLING > CUSTOMER BALANCE SLIP';
    if (pathname.startsWith('/billing/notes')) return 'BILLING > CREDIT & DEBIT NOTES';
    if (pathname.startsWith('/billing/returns')) return 'BILLING > SALES RETURNS';
    if (pathname.startsWith('/billing/pos') || pathname === '/billing') return 'POS BILLING > SALES ENTRY';
    if (pathname.startsWith('/billing')) return 'POS BILLING > SALES HUB';

    // Masters
    if (pathname.startsWith('/masters/products')) return 'MASTERS > PRODUCT CATALOG';
    if (pathname.startsWith('/masters/customers')) return 'MASTERS > CUSTOMER DIRECTORY';
    if (pathname.startsWith('/masters/suppliers')) return 'MASTERS > SUPPLIER REGISTRY';
    if (pathname.startsWith('/masters/auxiliary')) return 'MASTERS > AUXILIARY CODES';
    if (pathname.startsWith('/masters/price-lists')) return 'MASTERS > PRICE LISTS';
    if (pathname.startsWith('/masters/address-labels')) return 'MASTERS > MAILING LABELS & DIRECTORY';
    if (pathname.startsWith('/masters')) return 'MASTERS > NAVIGATION';

    // Stock
    if (pathname.startsWith('/stock/purchase') || pathname.startsWith('/stock/inward')) return 'STOCK > PURCHASE INWARD (GRN)';
    if (pathname.startsWith('/stock/returns')) return 'STOCK > PURCHASE RETURNS';
    if (pathname.startsWith('/stock/adjustments')) return 'STOCK > PHYSICAL STOCK AUDIT';
    if (pathname.startsWith('/stock/transfers')) return 'STOCK > DEPOT TRANSFERS';
    if (pathname.startsWith('/stock/rack-management')) return 'STOCK > RACK & RATE MANAGEMENT';
    if (pathname.startsWith('/stock/multi-mrp')) return 'STOCK > BATCH MRP MANAGER';
    if (pathname.startsWith('/stock/claims')) return 'STOCK > BREAKAGE & EXPIRY CLAIMS';
    if (pathname.startsWith('/stock/hsn-mapping')) return 'STOCK > HSN & GST MAPPING';
    if (pathname.startsWith('/stock')) return 'STOCK > INVENTORY HUB';

    // Accounts
    if (pathname.startsWith('/accounts/receipts')) return 'ACCOUNTS > CUSTOMER COLLECTIONS';
    if (pathname.startsWith('/accounts/payments')) return 'ACCOUNTS > SUPPLIER PAYMENTS';
    if (pathname.startsWith('/accounts/cheques')) return 'ACCOUNTS > CHEQUE REGISTER';
    if (pathname.startsWith('/accounts/ageing')) return 'ACCOUNTS > BILL AGEING & OVERDUE';
    if (pathname.startsWith('/accounts/on-account')) return 'ACCOUNTS > ADVANCE SETTLEMENT (FIFO)';
    if (pathname.startsWith('/accounts')) return 'ACCOUNTS > LEDGERS & ACCOUNTS';

    // Reports
    if (pathname.startsWith('/reports/daily-sales')) return 'REPORTS > DAILY SALES REGISTER';
    if (pathname.startsWith('/reports/stock')) return 'REPORTS > STOCK VALUATION';
    if (pathname.startsWith('/reports/expiry')) return 'REPORTS > SHORT-EXPIRY STATEMENT';
    if (pathname.startsWith('/reports/companies')) return 'REPORTS > COMPANY SALES & STOCK';
    if (pathname.startsWith('/reports/salesmen')) return 'REPORTS > SALES COMMISSION & TARGETS';
    if (pathname.startsWith('/reports/gst/export')) return 'REPORTS > GSTR-1 & 3B EXPORT';
    if (pathname.startsWith('/reports/gst')) return 'REPORTS > GST TAX SUMMARY';
    if (pathname.startsWith('/reports/stock-movement')) return 'REPORTS > FAST & SLOW MOVING STOCK';
    if (pathname.startsWith('/reports/comparative')) return 'REPORTS > PERIOD COMPARISON';
    if (pathname.startsWith('/reports')) return 'REPORTS > REPORTS & STATEMENTS';

    // System
    if (pathname.startsWith('/system/day-end')) return 'SYSTEM > DAY-END CLOSING';
    if (pathname.startsWith('/system/month-end')) return 'SYSTEM > MONTH-END CLOSING';
    if (pathname.startsWith('/system/backup')) return 'SYSTEM > DATABASE BACKUP';
    if (pathname.startsWith('/system/recalculate')) return 'SYSTEM > RECALCULATE BALANCES';
    if (pathname.startsWith('/system/tally-export')) return 'SYSTEM > TALLY PRIME EXPORT';
    if (pathname.startsWith('/system/diagnostics')) return 'SYSTEM > SYSTEM DIAGNOSTICS';
    if (pathname.startsWith('/system/supervisor')) return 'SYSTEM > SUPERVISOR SECURITY';
    if (pathname.startsWith('/system')) return 'SYSTEM > SYSTEM CONTROL';

    if (pathname === '/') return 'DASHBOARD > OVERVIEW';

    return 'DASHBOARD';
  };

  return (
    <header
      data-testid="dos-header"
      className="bg-brand-ink border-b-2 border-brand-border text-white px-4 py-1 flex justify-between items-center h-9 shrink-0 font-mono text-xs select-none"
    >
      <div className="flex items-center gap-3">
        <span className="text-brand-amber font-bold tracking-wider">
          MediSys
        </span>
        <span className="text-gray-500">|</span>
        <span className="text-gray-300 font-semibold">{getBreadcrumbs()}</span>
      </div>

      <div className="flex items-center gap-4 text-[11px]">
        {capsLock && (
          <span className="bg-brand-amber text-white px-1.5 py-0.5 font-bold animate-pulse">
            CAPS
          </span>
        )}
        <span className="text-green-400 font-bold">● ONLINE</span>
        <span className="text-gray-400">|</span>
        <span className="text-gray-200">DATE: 28/09/2026</span>
        <span className="text-gray-400">|</span>
        <span className="text-brand-amber font-bold">USER: ADMIN</span>
      </div>
    </header>
  );
}
