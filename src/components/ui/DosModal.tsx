'use client';

import React, { useEffect, useRef, useId } from 'react';
import { DosAction } from './DosWindow';

export interface DosModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
  width?: string;                        // e.g. "max-w-md", "max-w-xl", "max-w-3xl", "max-w-5xl"
  actions?: DosAction[];                 // Custom action hotkeys in footer
  confirmText?: string;                  // Default "[Enter: Confirm]"
  cancelText?: string;                   // Default "[ESC: Cancel]"
  onConfirm?: () => void;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  variant?: 'default' | 'danger' | 'amber';
  closeOnBackdropClick?: boolean;        // Default false (ERP data protection)
}

// Global modal stack for nested modal management
const activeModalStack: string[] = [];

export function DosModal({
  isOpen,
  onClose,
  title,
  children,
  width = 'max-w-lg',
  actions,
  confirmText = '[Enter: Confirm]',
  cancelText = '[ESC: Cancel]',
  onConfirm,
  initialFocusRef,
  variant = 'default',
  closeOnBackdropClick = false,
}: DosModalProps) {
  const generatedId = useId();
  const modalId = `modal-${generatedId}`;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  // Stack registration & cleanup
  useEffect(() => {
    if (!isOpen) return;

    activeModalStack.push(modalId);
    previouslyFocusedElementRef.current = document.activeElement as HTMLElement;

    // Focus initial element or first focusable
    const timer = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]'
        );
        if (focusables.length > 0) {
          focusables[0].focus();
        } else {
          dialogRef.current.focus();
        }
      }
    }, 30);

    return () => {
      const idx = activeModalStack.lastIndexOf(modalId);
      if (idx !== -1) {
        activeModalStack.splice(idx, 1);
      }
      // Restore focus to previous element
      if (previouslyFocusedElementRef.current && previouslyFocusedElementRef.current.focus) {
        previouslyFocusedElementRef.current.focus();
      }
      clearTimeout(timer);
    };
  }, [isOpen, initialFocusRef, modalId]);

  // Escape key & Focus Trap listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only the top-most modal processes Escape and Tab
      const topModalId = activeModalStack[activeModalStack.length - 1];
      if (topModalId !== modalId) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]'
          )
        );

        if (focusables.length === 0) return;

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const isAmber = variant === 'amber';

  return (
    <div
      data-testid="dos-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 select-none p-4"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        onClick={() => {
          if (closeOnBackdropClick) onClose();
        }}
      />

      {/* Modal Dialog Window */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dos-modal-title"
        data-testid="dos-modal"
        className={`relative z-10 w-full ${width} bg-brand-paper border-2 ${
          isDanger
            ? 'border-red-600 shadow-[6px_6px_0px_0px_#990000]'
            : isAmber
            ? 'border-brand-amber shadow-[6px_6px_0px_0px_#F05A28]'
            : 'border-brand-ink shadow-[6px_6px_0px_0px_#0B192C]'
        } flex flex-col focus:outline-none`}
      >
        {/* Modal Title Bar */}
        <div
          className={`px-3 py-1.5 flex items-center justify-between h-8 ${
            isDanger ? 'bg-red-600 text-white' : isAmber ? 'bg-brand-amber text-white' : 'bg-brand-ink text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-xs">[■]</span>
            <h2 id="dos-modal-title" className="font-mono font-bold text-xs uppercase tracking-wider">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-mono font-bold text-xs hover:bg-white/20 px-1.5 py-0.5 cursor-pointer"
            aria-label="Close dialog"
          >
            [X]
          </button>
        </div>

        {/* Modal Body Canvas */}
        <div className="p-4 bg-brand-paper font-mono text-xs overflow-auto max-h-[75vh]">
          {children}
        </div>

        {/* Modal Action Bar */}
        <div className="bg-brand-surface border-t border-brand-border px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {actions?.map((act, i) => (
              <button
                key={i}
                type="button"
                onClick={act.onClick}
                disabled={act.disabled}
                className="px-2 py-1 bg-white border border-brand-border hover:bg-gray-100 font-mono text-xs font-bold"
              >
                <span className="bg-brand-ink text-white px-1 mr-1">{act.keyLabel}</span>
                <span>{act.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {cancelText && (
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1 bg-white border border-brand-border hover:bg-gray-100 font-mono text-xs font-bold text-brand-text cursor-pointer"
              >
                {cancelText}
              </button>
            )}
            {onConfirm && (
              <button
                type="button"
                onClick={onConfirm}
                className={`px-3 py-1 font-mono text-xs font-bold text-white cursor-pointer ${
                  isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-ink hover:bg-brand-ink/90'
                }`}
              >
                {confirmText}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
