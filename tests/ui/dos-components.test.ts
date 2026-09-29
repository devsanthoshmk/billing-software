import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DosWindow } from '../../src/components/ui/DosWindow';
import { DosDataGrid } from '../../src/components/ui/DosDataGrid';
import { DosModal } from '../../src/components/ui/DosModal';
import { StatusBar } from '../../src/components/layout/StatusBar';
import {
  shortcutRegistry,
  RESERVED_BROWSER_KEYS,
} from '../../src/lib/keyboard/useKeyboardShortcuts';

describe('Feature F14: Terminal Brutalism UI Component Shell', () => {
  describe('1. DosWindow Component (T1-F14-01)', () => {
    it('renders with 0-radius brutalist frame, title bar, and actions', () => {
      const html = renderToStaticMarkup(
        React.createElement(DosWindow, {
          title: 'Product Master',
          subtitle: '[SYS-1]',
          breadcrumbs: ['MASTERS', 'PRODUCTS'],
          actions: [
            { keyLabel: 'F1', label: 'Help' },
            { keyLabel: 'F2', label: 'Save', variant: 'amber' },
          ],
          children: React.createElement('div', { id: 'test-canvas' }, 'Canvas Content'),
        })
      );

      // Verify Title & Subtitle
      expect(html).toContain('PRODUCT MASTER');
      expect(html).toContain('[SYS-1]');

      // Verify 0-radius brutalist styling tokens
      expect(html).toContain('bg-brand-ink');
      expect(html).toContain('shadow-[3px_3px_0px_0px_#0B192C]');

      // Verify Breadcrumbs
      expect(html).toContain('MASTERS');
      expect(html).toContain('PRODUCTS');

      // Verify Actions
      expect(html).toContain('F1');
      expect(html).toContain('Help');
      expect(html).toContain('F2');
      expect(html).toContain('Save');

      // Verify Canvas Content
      expect(html).toContain('Canvas Content');
    });
  });

  describe('2. DosDataGrid Component (T1-F14-02, T2-F14-01, T2-F14-05)', () => {
    const mockColumns = [
      { id: 'code', header: 'CODE', accessorKey: 'code' as const, width: 'w-16' },
      { id: 'name', header: 'PRODUCT NAME', accessorKey: 'name' as const },
      { id: 'stock', header: 'STOCK', accessorKey: 'stock' as const, align: 'right' as const },
    ];

    const mockData = [
      { code: '00001', name: 'DOLO 650 & CITRIZINE <SPECIAL>', stock: 150 },
      { code: '00002', name: 'PARACETAMOL 500 "FORTE"', stock: 80 },
    ];

    it('renders sticky header and active row with amber highlight', () => {
      const html = renderToStaticMarkup(
        React.createElement(DosDataGrid, {
          columns: mockColumns,
          data: mockData,
          selectedIndex: 0,
        })
      );

      expect(html).toContain('CODE');
      expect(html).toContain('PRODUCT NAME');
      expect(html).toContain('STOCK');

      // Active row receives Safety Amber highlight and cursor ▶
      expect(html).toContain('bg-brand-amber');
      expect(html).toContain('▶');

      // Row data present
      expect(html).toContain('00001');
      expect(html).toContain('150');
    });

    it('safely escapes special characters (&, <, >, ", \') in cells (T2-F14-05)', () => {
      const html = renderToStaticMarkup(
        React.createElement(DosDataGrid, {
          columns: mockColumns,
          data: mockData,
          selectedIndex: 0,
        })
      );

      // React escapes special characters safely in DOM
      expect(html).toContain('&amp;');
      expect(html).toContain('&lt;SPECIAL&gt;');
      expect(html).toContain('&quot;FORTE&quot;');
    });

    it('renders empty text banner when no data matching', () => {
      const html = renderToStaticMarkup(
        React.createElement(DosDataGrid, {
          columns: mockColumns,
          data: [],
          emptyText: 'NO RECORDS FOUND',
        })
      );

      expect(html).toContain('NO RECORDS FOUND');
    });
  });

  describe('3. DosModal Component (T1-F14-03, T2-F14-03)', () => {
    it('renders modal dialog with aria attributes, brutalist border, and cancel/confirm buttons', () => {
      const html = renderToStaticMarkup(
        React.createElement(DosModal, {
          isOpen: true,
          onClose: () => {},
          title: 'CONFIRM DELETE',
          confirmText: '[Enter: Confirm]',
          cancelText: '[ESC: Cancel]',
          onConfirm: () => {},
          children: React.createElement('p', null, 'Delete confirmation body'),
        })
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('CONFIRM DELETE');
      expect(html).toContain('[Enter: Confirm]');
      expect(html).toContain('[ESC: Cancel]');
      expect(html).toContain('Delete confirmation body');
      expect(html).toContain('shadow-[6px_6px_0px_0px_#0B192C]');
    });

    it('renders null when isOpen is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(DosModal, {
          isOpen: false,
          onClose: () => {},
          title: 'HIDDEN MODAL',
          children: 'Hidden content',
        })
      );

      expect(html).toBe('');
    });
  });

  describe('4. Keyboard Hotkeys & Reserved Browser Keys (T1-F14-04, T2-F14-02)', () => {
    it('reserves destructive browser function keys F1, F3, F5, F6, F7', () => {
      expect(RESERVED_BROWSER_KEYS.has('F1')).toBe(true);
      expect(RESERVED_BROWSER_KEYS.has('F3')).toBe(true);
      expect(RESERVED_BROWSER_KEYS.has('F5')).toBe(true);
      expect(RESERVED_BROWSER_KEYS.has('F6')).toBe(true);
      expect(RESERVED_BROWSER_KEYS.has('F7')).toBe(true);
      // F12 DevTools is allowed to bubble
      expect(RESERVED_BROWSER_KEYS.has('F12')).toBe(false);
    });

    it('preserves normal handling for unregistered keystrokes without errors (T2-F14-02)', () => {
      expect(() => {
        // Simulating unregistered key lookup in shortcutRegistry
        const match = shortcutRegistry.find((e) => e.handler.key === 'Alt+Z');
        expect(match).toBeUndefined();
      }).not.toThrow();
    });
  });

  describe('5. Status Bar Terminal Hints (T1-F14-04)', () => {
    it('displays Node ID, Active User, System Date, and Hotkey hints', () => {
      const html = renderToStaticMarkup(
        React.createElement(StatusBar, {
          nodeId: 'SYS-1',
          user: 'ADMIN',
          systemDate: '28/09/2026',
          hotkeyHints: 'F1=Help  F3=Del  Esc=Back',
        })
      );

      expect(html).toContain('Node: SYS-1');
      expect(html).toContain('User: ADMIN');
      expect(html).toContain('Date: 28/09/2026');
      expect(html).toContain('F1=Help  F3=Del  Esc=Back');
    });
  });
});
