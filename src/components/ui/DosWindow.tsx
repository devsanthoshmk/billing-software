'use client';

import React, { useMemo } from 'react';
import { useKeyboardShortcuts } from '@/lib/keyboard/useKeyboardShortcuts';

export interface DosAction {
  keyLabel: string;                      // e.g. "F1", "F2", "ESC", "ENTER", "Alt+N"
  label: string;                         // e.g. "Help", "Save", "Exit", "New Item"
  onClick?: () => void;                  // Click action (also bound via keyboard listener)
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger' | 'amber';
}

export interface DosWindowProps {
  title: string;                         // Window title, e.g. "PRODUCT MASTER MAINTENANCE"
  subtitle?: string;                     // Optional status cue, e.g. "[SYS-1] [MODE: VIEW]"
  breadcrumbs?: string[];                // Optional breadcrumb segments, e.g. ["MASTERS", "PRODUCTS"]
  actions?: DosAction[];                 // Action hotkeys rendered in the action bar
  statusInfo?: React.ReactNode;          // Right-aligned status information (e.g. record counter)
  headerExtra?: React.ReactNode;         // Inline header utilities (e.g. quick search or filter toggle)
  children?: React.ReactNode;            // Window content canvas
  className?: string;                    // Additional classes for root container
  bodyClassName?: string;                // Additional classes for content canvas
  bordered?: boolean;                    // Outer 2px wireframe border (default: true)
  footer?: React.ReactNode;              // Optional customized footer bar
}

export function DosWindow({
  title,
  subtitle,
  breadcrumbs,
  actions = [],
  statusInfo,
  headerExtra,
  children,
  className = '',
  bodyClassName = '',
  bordered = true,
  footer,
}: DosWindowProps) {
  // Automatically register actions that have keyLabel and onClick with keyboard shortcut registry
  const mappedShortcuts = useMemo(() => {
    return actions
      .filter((a) => a.onClick && !a.disabled)
      .map((a) => {
        let normalizedKey = a.keyLabel.trim();
        if (normalizedKey.toUpperCase() === 'ESC') {
          normalizedKey = 'Escape';
        }
        let ctrl = false;
        let alt = false;
        let shift = false;
        let key = normalizedKey;

        const parts = normalizedKey.split('+');
        if (parts.length > 1) {
          for (let i = 0; i < parts.length - 1; i++) {
            const mod = parts[i].trim().toLowerCase();
            if (mod === 'ctrl' || mod === 'control') ctrl = true;
            if (mod === 'alt') alt = true;
            if (mod === 'shift') shift = true;
          }
          key = parts[parts.length - 1].trim();
          if (key.toUpperCase() === 'ESC') {
            key = 'Escape';
          }
        }

        const isFKey = /^F\d+$/i.test(key);
        const isEscape = key.toUpperCase() === 'ESCAPE';
        return {
          key,
          ctrl,
          alt,
          shift,
          description: a.label,
          action: () => {
            if (a.onClick && !a.disabled) {
              a.onClick();
            }
          },
          allowInInputs: isFKey || isEscape,
        };
      });
  }, [actions]);

  const actionKeySig = actions.map((a) => `${a.keyLabel}:${a.disabled}`).join('|');
  useKeyboardShortcuts(mappedShortcuts, {
    scopeId: `dos-window-${title}-${actionKeySig}`,
    priority: 5,
  });
  return (
    <div
      data-testid="dos-window"
      className={`flex flex-col h-full bg-brand-paper select-none ${
        bordered ? 'border-2 border-brand-ink shadow-[3px_3px_0px_0px_#0B192C]' : ''
      } ${className}`}
    >
      {/* 1. Main Title Bar */}
      <div className="bg-brand-ink text-white px-3 py-1 flex items-center justify-between h-8 shrink-0 border-b border-brand-ink">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="text-brand-amber font-mono font-bold">[■]</span>
          <h1 className="font-mono font-bold text-xs uppercase tracking-wider truncate">
            {title.toUpperCase()}
          </h1>
          {subtitle && (
            <span className="text-[11px] text-gray-300 font-mono hidden sm:inline-block">
              {subtitle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {headerExtra}
          {statusInfo && (
            <div className="text-[11px] text-gray-300 font-mono">
              {statusInfo}
            </div>
          )}
        </div>
      </div>

      {/* 2. Sub-Header & Action Key Strip */}
      {(breadcrumbs || actions.length > 0) && (
        <div className="bg-brand-surface border-b border-brand-border px-3 py-1 flex flex-wrap items-center justify-between gap-2 min-h-7 shrink-0 text-xs font-mono">
          {breadcrumbs && (
            <div className="flex items-center gap-1.5 text-gray-600 font-semibold text-[11px]">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="text-brand-border">/</span>}
                  <span className={idx === breadcrumbs.length - 1 ? 'text-brand-ink font-bold' : ''}>
                    {crumb}
                  </span>
                </React.Fragment>
              ))}
            </div>
          )}

          {actions.length > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              {actions.map((action, idx) => {
                const isAmber = action.variant === 'amber';
                const isDanger = action.variant === 'danger';
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={action.disabled}
                    onClick={action.onClick}
                    className="flex items-center border border-brand-border text-[11px] bg-white hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-1 focus:ring-brand-amber cursor-pointer px-1 py-0.5"
                  >
                    <span
                      className={`font-mono font-bold px-1 mr-1 ${
                        isAmber
                          ? 'bg-brand-amber text-white'
                          : isDanger
                          ? 'bg-red-600 text-white'
                          : 'bg-brand-ink text-white'
                      }`}
                    >
                      {action.keyLabel}
                    </span>
                    <span className="font-mono text-brand-text pr-1">{action.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. Window Content Canvas */}
      <div className={`flex-1 overflow-auto bg-brand-paper ${bodyClassName}`}>
        {children}
      </div>

      {/* 4. Window Footer / Status Line */}
      {footer ? (
        <div className="shrink-0">{footer}</div>
      ) : (
        <div className="bg-brand-surface border-t border-brand-border px-3 py-1 flex items-center justify-between text-[11px] font-mono text-gray-600 h-6 shrink-0">
          <span>Use ARROW KEYS [↑↓] to navigate, [ENTER] to select, [ESC] to exit</span>
          <span className="font-semibold text-brand-ink">SYS-1 (READY)</span>
        </div>
      )}
    </div>
  );
}
