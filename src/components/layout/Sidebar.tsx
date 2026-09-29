'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useKeyboardShortcuts } from '@/lib/keyboard/useKeyboardShortcuts';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { label: 'POS Billing', path: '/billing', shortcut: 'F2' },
    { label: 'Masters', path: '/masters', shortcut: 'F3' },
    { label: 'Stock Entry', path: '/stock', shortcut: 'F4' },
    { label: 'Reports', path: '/reports', shortcut: 'F5' },
    { label: 'Accounts', path: '/accounts', shortcut: 'F6' },
    { label: 'System', path: '/system', shortcut: 'F7' },
  ];

  // Global hotkeys to switch modules immediately
  useKeyboardShortcuts(
    navItems.map((item) => ({
      key: item.shortcut,
      description: `Navigate to ${item.label}`,
      action: () => router.push(item.path),
      allowInInputs: false,
    })),
    { scopeId: 'sidebar-nav', priority: 5 }
  );

  return (
    <aside
      data-testid="dos-sidebar"
      className="w-52 bg-brand-ink text-white flex flex-col h-screen border-r-2 border-brand-border select-none shrink-0 font-mono"
    >
      {/* Brand Header */}
      <div className="p-3 border-b border-gray-700 bg-brand-ink">
        <h1 className="text-brand-amber font-bold text-sm tracking-widest uppercase">
          Siva ERP
        </h1>
        <p className="text-[10px] text-gray-400">FOXPRO 2.6 REPLICA</p>
      </div>

      {/* Main Module Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        <ul className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.path);
            return (
              <li key={item.path}>
                <Link
                  href={item.path}
                  data-testid={`nav-item-${item.shortcut.toLowerCase()}`}
                  data-active={isActive ? 'true' : 'false'}
                  className={`flex items-center justify-between px-3 py-2 text-xs transition-none focus:outline-none ${
                    isActive
                      ? 'bg-brand-amber text-white font-bold'
                      : 'hover:bg-white/10 text-gray-200'
                  }`}
                  style={isActive ? { backgroundColor: '#F05A28' } : undefined}
                >
                  <span className="truncate">{item.label}</span>
                  <span
                    className={`text-[10px] px-1 py-0.5 font-bold ${
                      isActive ? 'bg-black/30 text-white' : 'bg-white/10 text-gray-400'
                    }`}
                  >
                    {item.shortcut}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Terminal Node Info */}
      <div className="p-3 border-t border-gray-700 bg-brand-ink text-[11px] text-gray-400 flex flex-col gap-0.5">
        <div className="flex justify-between">
          <span>Terminal:</span>
          <span className="text-white font-bold">Node-1 (T-01)</span>
        </div>
        <div className="flex justify-between">
          <span>Status:</span>
          <span className="text-green-400 font-bold">READY</span>
        </div>
      </div>
    </aside>
  );
}
