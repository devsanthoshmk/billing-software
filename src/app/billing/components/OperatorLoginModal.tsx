'use client';

import React, { useState, useEffect } from 'react';
import { DosModal } from '@/components/ui/DosModal';

export interface OperatorLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (operatorName: string) => void;
  currentOperator?: string;
  systemDate: string;
}

export function OperatorLoginModal({
  isOpen,
  onClose,
  onLogin,
  currentOperator = 'ADMIN',
  systemDate,
}: OperatorLoginModalProps) {
  const [operator, setOperator] = useState(currentOperator || 'ADMIN');

  useEffect(() => {
    if (isOpen) {
      setOperator(currentOperator || 'ADMIN');
    }
  }, [isOpen, currentOperator]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const finalOp = operator.trim().toUpperCase() || 'ADMIN';
    onLogin(finalOp);
  };

  return (
    <DosModal
      isOpen={isOpen}
      onClose={onClose}
      title="OPERATOR SIGN-IN"
      width="max-w-md"
      confirmText="[Enter: Sign In]"
      cancelText="[ESC: Cancel]"
      onConfirm={handleSubmit}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 font-mono text-xs">
        <div className="bg-[#00AAAA] text-black font-bold p-2 text-center border border-black shadow-[2px_2px_0px_0px_#000]">
          BILLING OPERATOR
        </div>

        <div className="flex items-center gap-2 mt-2">
          <label className="font-bold text-brand-ink">Operator Code:</label>
          <input
            type="text"
            value={operator}
            onChange={(e) => setOperator(e.target.value.toUpperCase())}
            placeholder="Enter operator code (e.g. OP1, ADMIN)"
            className="flex-1 bg-white border border-brand-border px-2 py-1 font-bold text-brand-ink focus:outline-brand-amber uppercase"
            autoFocus
            required
          />
        </div>

        <div className="text-[11px] text-gray-600 flex justify-between border-t border-brand-border pt-2 mt-1">
          <span>Date: {systemDate}</span>
          <span>Terminal: POS-01</span>
        </div>
      </form>
    </DosModal>
  );
}
