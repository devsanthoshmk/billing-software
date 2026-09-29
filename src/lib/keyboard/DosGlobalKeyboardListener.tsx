'use client';

import { useEffect } from 'react';
import { shortcutRegistry, RESERVED_BROWSER_KEYS } from './useKeyboardShortcuts';

/**
 * Mount once in root layout (`src/app/layout.tsx`) to globally intercept keys.
 */
export function DosGlobalKeyboardListener() {
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Always suppress destructive browser defaults for F1, F3, F5, F6, F7
      if (RESERVED_BROWSER_KEYS.has(e.key)) {
        e.preventDefault();
      }

      // Check if focus is in a form input
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // 2. Search highest-priority registered handler matching key combination
      for (const entry of shortcutRegistry) {
        const h = entry.handler;

        const keyMatches = e.key.toUpperCase() === h.key.toUpperCase();
        const ctrlMatches = !!h.ctrl === (e.ctrlKey || e.metaKey);
        const altMatches = !!h.alt === e.altKey;
        const shiftMatches = !!h.shift === e.shiftKey;

        if (keyMatches && ctrlMatches && altMatches && shiftMatches) {
          // If in input, only allow if allowInInputs is true (or if it's an F-key / Escape)
          const isFKey = /^F\d+$/i.test(h.key);
          const isEscape = h.key.toUpperCase() === 'ESCAPE';
          const canExecuteInInput = h.allowInInputs ?? (isFKey || isEscape);

          if (isInputFocused && !canExecuteInInput) {
            continue; // Let input handle regular typing
          }

          if (h.preventDefault !== false) {
            e.preventDefault();
            e.stopPropagation();
          }

          try {
            h.action(e);
          } catch (err) {
            console.error('Error executing shortcut action:', err);
          }
          return; // Top priority handled event
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, []);

  return null;
}
