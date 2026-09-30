'use client';

import React from 'react';

export interface StatusBarProps {
  nodeId?: string;
  user?: string;
  systemDate?: string;
  hotkeyHints?: string;
}

export function StatusBar({
  nodeId = 'Counter 1',
  user = 'ADMIN',
  systemDate = '28/09/2026',
  hotkeyHints = 'F1=Help  F3=Delete  Esc=Back',
}: StatusBarProps) {
  return (
    <footer
      data-testid="dos-status-bar"
      className="h-6 bg-brand-ink text-white border-t border-brand-border px-3 flex items-center justify-between font-mono text-[11px] shrink-0 select-none"
    >
      <div className="flex items-center gap-3">
        <span className="text-brand-amber font-bold">Node: {nodeId}</span>
        <span className="text-gray-400">|</span>
        <span className="text-gray-200">User: {user}</span>
        <span className="text-gray-400">|</span>
        <span className="text-gray-200">Date: {systemDate}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-gray-300 font-semibold">{hotkeyHints}</span>
      </div>
    </footer>
  );
}
