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
    if (pathname.startsWith('/billing')) return 'POS BILLING > INVOICE ENTRY';
    if (pathname.startsWith('/masters/products')) return 'MASTERS > PRODUCT CATALOG';
    if (pathname.startsWith('/masters/customers')) return 'MASTERS > CUSTOMER DIRECTORY';
    if (pathname.startsWith('/masters/suppliers')) return 'MASTERS > SUPPLIER REGISTRY';
    if (pathname.startsWith('/masters/auxiliary')) return 'MASTERS > AUXILIARY TABLES';
    if (pathname.startsWith('/masters')) return 'MASTERS > NAVIGATION HUB';
    if (pathname.startsWith('/stock')) return 'STOCK > INWARD & VALUATION';
    if (pathname.startsWith('/reports/daily-sales')) return 'REPORTS > DAILY SALES REGISTER';
    if (pathname.startsWith('/reports/stock')) return 'REPORTS > STOCK VALUATION';
    if (pathname.startsWith('/reports/expiry')) return 'REPORTS > SHORT-EXPIRY STATEMENT';
    if (pathname.startsWith('/reports/gst')) return 'REPORTS > STATUTORY GST FILINGS';
    if (pathname.startsWith('/reports')) return 'REPORTS > STATUTORY & SALES';
    if (pathname.startsWith('/accounts/receipts')) return 'ACCOUNTS > CUSTOMER COLLECTIONS';
    if (pathname.startsWith('/accounts/payments')) return 'ACCOUNTS > SUPPLIER PAYMENTS';
    if (pathname.startsWith('/accounts/cheques')) return 'ACCOUNTS > CHEQUE REGISTER';
    if (pathname.startsWith('/accounts')) return 'ACCOUNTS > LEDGERS & COLLECTIONS';
    if (pathname.startsWith('/system/day-end')) return 'SYSTEM > DAY-END AUDIT & CLOSING';
    if (pathname.startsWith('/system')) return 'SYSTEM > CONTROL & DAY-END';
    return 'DASHBOARD';
  };

  return (
    <header
      data-testid="dos-header"
      className="bg-brand-ink border-b-2 border-brand-border text-white px-4 py-1 flex justify-between items-center h-9 shrink-0 font-mono text-xs select-none"
    >
      <div className="flex items-center gap-3">
        <span className="text-brand-amber font-bold tracking-wider">
          SIVA PHARMACEUTICALS
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
        <span className="text-green-400 font-bold">Sys-1√ ONLINE</span>
        <span className="text-gray-400">|</span>
        <span className="text-gray-200">DATE: 28/09/2026</span>
        <span className="text-gray-400">|</span>
        <span className="text-brand-amber font-bold">USER: ADMIN (SPM)</span>
      </div>
    </header>
  );
}
