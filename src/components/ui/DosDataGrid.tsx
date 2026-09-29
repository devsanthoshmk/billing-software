'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

export interface DosColumnDef<T> {
  id: string;
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T, index: number) => React.ReactNode;
  width?: string;                         // e.g. "w-16", "w-48", "120px"
  align?: 'left' | 'center' | 'right';    // Default 'left'
  headerAlign?: 'left' | 'center' | 'right';
}

export interface DosDataGridProps<T> {
  columns: DosColumnDef<T>[];
  data: T[];
  selectedIndex?: number;
  onSelectRow?: (item: T, index: number) => void;
  onActivateRow?: (item: T, index: number) => void; // Enter or double-click
  onDeleteRow?: (item: T, index: number) => void;   // Delete key (F3 or Del)
  keyField?: keyof T;
  emptyText?: string;
  isLoading?: boolean;
  pageSize?: number;                     // Paging step for PageUp/PageDown (default 12)
  highlightVariant?: 'amber' | 'ink';    // Default: 'amber'
  autoFocus?: boolean;
  showLineNumbers?: boolean;
  footerSummary?: React.ReactNode;
  maxHeight?: string;
}

export function DosDataGrid<T extends Record<string, any>>({
  columns,
  data,
  selectedIndex: controlledIndex,
  onSelectRow,
  onActivateRow,
  onDeleteRow,
  keyField,
  emptyText = '--- NO RECORDS MATCH SEARCH CRITERIA ---',
  isLoading = false,
  pageSize = 12,
  highlightVariant = 'amber',
  autoFocus = true,
  showLineNumbers = true,
  footerSummary,
  maxHeight,
}: DosDataGridProps<T>) {
  const [internalIndex, setInternalIndex] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeRowRef = useRef<HTMLTableRowElement | null>(null);

  const activeIndex = controlledIndex !== undefined ? controlledIndex : internalIndex;

  // Auto-scroll active row into view
  useEffect(() => {
    if (activeRowRef.current && typeof activeRowRef.current.scrollIntoView === 'function') {
      activeRowRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  // Auto-focus container on mount
  useEffect(() => {
    if (autoFocus && containerRef.current) {
      containerRef.current.focus();
    }
  }, [autoFocus]);

  const setIndex = useCallback(
    (newIndex: number) => {
      if (data.length === 0) return;
      const clamped = Math.max(0, Math.min(data.length - 1, newIndex));
      if (controlledIndex === undefined) {
        setInternalIndex(clamped);
      }
      if (data[clamped] && onSelectRow) {
        onSelectRow(data[clamped], clamped);
      }
    },
    [data, controlledIndex, onSelectRow]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (data.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        setIndex(activeIndex + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        setIndex(activeIndex - 1);
        break;
      case 'PageDown':
        e.preventDefault();
        e.stopPropagation();
        setIndex(activeIndex + pageSize);
        break;
      case 'PageUp':
        e.preventDefault();
        e.stopPropagation();
        setIndex(activeIndex - pageSize);
        break;
      case 'Home':
        e.preventDefault();
        e.stopPropagation();
        setIndex(0);
        break;
      case 'End':
        e.preventDefault();
        e.stopPropagation();
        setIndex(data.length - 1);
        break;
      case 'Enter':
        e.preventDefault();
        e.stopPropagation();
        if (data[activeIndex] && onActivateRow) {
          onActivateRow(data[activeIndex], activeIndex);
        }
        break;
      case 'Delete':
        if (data[activeIndex] && onDeleteRow) {
          e.preventDefault();
          e.stopPropagation();
          onDeleteRow(data[activeIndex], activeIndex);
        }
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      data-testid="dos-datagrid"
      onKeyDown={handleKeyDown}
      style={{ maxHeight: maxHeight || '100%' }}
      className="flex flex-col h-full w-full overflow-hidden focus:outline-none select-none font-mono text-xs"
    >
      <div className="flex-1 overflow-auto border border-brand-border bg-white">
        <table className="w-full border-collapse">
          {/* Table Header */}
          <thead className="sticky top-0 bg-brand-ink text-white z-10 shadow-sm">
            <tr>
              {showLineNumbers && (
                <th className="w-10 text-center px-2 py-1.5 border-r border-brand-border/40 font-bold uppercase text-[11px] tracking-wider">
                  #
                </th>
              )}
              {columns.map((col) => {
                const alignClass =
                  col.headerAlign === 'right'
                    ? 'text-right'
                    : col.headerAlign === 'center'
                    ? 'text-center'
                    : col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-left';

                return (
                  <th
                    key={col.id}
                    className={`px-2 py-1.5 border-r border-brand-border/40 font-bold uppercase text-[11px] tracking-wider ${col.width || ''} ${alignClass}`}
                  >
                    {col.header}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={columns.length + (showLineNumbers ? 1 : 0)}
                  className="p-8 text-center text-gray-500 font-mono tracking-widest bg-brand-surface"
                >
                  [ FETCHING DATA FROM DATABASE ... ]
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (showLineNumbers ? 1 : 0)}
                  className="p-8 text-center text-gray-500 font-mono tracking-wider bg-brand-surface"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              data.map((item, rowIdx) => {
                const isActive = rowIdx === activeIndex;
                const rowKey = keyField && item[keyField] ? String(item[keyField]) : rowIdx;

                const activeRowClass = isActive
                  ? highlightVariant === 'amber'
                    ? 'bg-brand-amber text-white font-semibold'
                    : 'bg-brand-ink text-white font-semibold border-l-4 border-brand-amber'
                  : rowIdx % 2 === 0
                  ? 'bg-white hover:bg-gray-100 text-brand-text'
                  : 'bg-brand-surface/40 hover:bg-gray-100 text-brand-text';

                return (
                  <tr
                    key={rowKey}
                    ref={isActive ? activeRowRef : null}
                    data-testid={`datagrid-row-${rowIdx}`}
                    data-active={isActive ? 'true' : 'false'}
                    onClick={() => setIndex(rowIdx)}
                    onDoubleClick={() => onActivateRow && onActivateRow(item, rowIdx)}
                    className={`cursor-pointer transition-none border-b border-brand-border/50 ${activeRowClass}`}
                  >
                    {showLineNumbers && (
                      <td className="px-2 py-1 text-center border-r border-brand-border/40 tabular-nums">
                        {isActive ? <span className="text-white font-bold">▶</span> : rowIdx + 1}
                      </td>
                    )}
                    {columns.map((col) => {
                      const alignClass =
                        col.align === 'right'
                          ? 'text-right tabular-nums'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left';

                      return (
                        <td
                          key={col.id}
                          className={`px-2 py-1 border-r border-brand-border/40 truncate ${col.width || ''} ${alignClass}`}
                        >
                          {col.cell
                            ? col.cell(item, rowIdx)
                            : col.accessorKey && item[col.accessorKey] !== undefined
                            ? String(item[col.accessorKey])
                            : ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Grid Footer Bar */}
      {footerSummary && (
        <div className="bg-brand-surface border-t border-brand-border px-3 py-1 text-xs font-mono shrink-0">
          {footerSummary}
        </div>
      )}
    </div>
  );
}
