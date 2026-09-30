'use client';

import { useEffect, useRef } from 'react';

export interface ShortcutHandler {
  key: string;                           // "F1", "F2", "Escape", "Enter", "s", "+", etc.
  ctrl?: boolean;                        // Require Ctrl / Cmd
  alt?: boolean;                         // Require Alt
  shift?: boolean;                       // Require Shift
  description?: string;                  // Description for [F1: Help] cheatsheet
  action: (e: KeyboardEvent) => void;    // Handler callback
  allowInInputs?: boolean;               // True: fires even if input/textarea focused (default: true for F-keys & Esc)
  preventDefault?: boolean;              // Default: true
  enabled?: boolean;                     // Optional per-shortcut toggle (default: true)
}

export interface ShortcutOptions {
  enabled?: boolean;                     // Default: true
  scopeId?: string;                      // Identifier for stacking priority
  priority?: number;                     // 0 = Global, 10 = Page, 20 = Modal, 30 = Nested Modal
}

// Reserved keys that must always prevent browser default actions
export const RESERVED_BROWSER_KEYS = new Set(['F1', 'F3', 'F5', 'F6', 'F7']);

export interface RegisteredEntry {
  id: string;
  priority: number;
  handler: ShortcutHandler;
}

// Global registry of active shortcuts ordered by priority
export const shortcutRegistry: RegisteredEntry[] = [];

export function useKeyboardShortcuts(
  shortcuts: ShortcutHandler[],
  options: ShortcutOptions = {}
) {
  const { enabled = true, scopeId = 'default', priority = 10 } = options;
  const shortcutsRef = useRef<ShortcutHandler[]>(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    if (!enabled) return;

    shortcutsRef.current = shortcuts;

    // Register handlers into global registry
    const entries: RegisteredEntry[] = shortcuts
      .filter((h) => h.enabled !== false)
      .map((handler, idx) => ({
        id: `${scopeId}-${idx}-${handler.key}`,
        priority,
        handler: {
          ...handler,
          action: (e: KeyboardEvent) => {
            const latest = shortcutsRef.current.find(
              (s) =>
                s.key.toUpperCase() === handler.key.toUpperCase() &&
                !!s.ctrl === !!handler.ctrl &&
                !!s.alt === !!handler.alt &&
                !!s.shift === !!handler.shift
            );
            if (latest && latest.enabled !== false) {
              latest.action(e);
            } else if (handler.enabled !== false) {
              handler.action(e);
            }
          },
        },
      }));

    shortcutRegistry.push(...entries);
    // Sort descending by priority (highest priority executed first)
    shortcutRegistry.sort((a, b) => b.priority - a.priority);

    return () => {
      // Unregister handlers on unmount
      for (const entry of entries) {
        const idx = shortcutRegistry.indexOf(entry);
        if (idx !== -1) {
          shortcutRegistry.splice(idx, 1);
        }
      }
    };
  }, [enabled, scopeId, priority]);
}
