'use client';

import { useEffect, useRef, useCallback } from 'react';

export interface EnterProgressionOptions {
  onComplete?: () => void;
  formRef?: React.RefObject<HTMLFormElement | HTMLDivElement | null>;
  fieldSelector?: string;
  enabled?: boolean;
}

export function useEnterKeyProgression(options: EnterProgressionOptions = {}) {
  const {
    onComplete,
    formRef: externalFormRef,
    fieldSelector = 'input:not([disabled]):not([readonly]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])',
    enabled = true,
  } = options;

  const internalFormRef = useRef<HTMLDivElement | null>(null);
  const containerRef = externalFormRef || internalFormRef;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;
      if (e.key !== 'Enter') return;

      const target = e.target as HTMLElement;
      if (!containerRef.current || !containerRef.current.contains(target)) return;

      // Do not intercept Enter inside a multiline textarea unless Ctrl+Enter or Shift+Enter
      if (target.tagName === 'TEXTAREA' && !e.ctrlKey) {
        return;
      }

      const focusables = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(fieldSelector)
      );

      const currentIndex = focusables.indexOf(target);
      if (currentIndex === -1) return;

      e.preventDefault();

      if (currentIndex < focusables.length - 1) {
        const nextElement = focusables[currentIndex + 1];
        nextElement.focus();
        if (nextElement instanceof HTMLInputElement && nextElement.type === 'text') {
          nextElement.select();
        }
      } else {
        // Last element reached
        if (onComplete) {
          onComplete();
        }
      }
    },
    [enabled, containerRef, fieldSelector, onComplete]
  );

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    node.addEventListener('keydown', handleKeyDown as any);
    return () => {
      node.removeEventListener('keydown', handleKeyDown as any);
    };
  }, [containerRef, handleKeyDown]);

  return { containerRef };
}
