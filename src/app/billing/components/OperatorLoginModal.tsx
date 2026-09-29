'use client';

import React, { useState } from 'react';
import { DosModal } from '@/components/ui/DosModal';

export interface OperatorLoginModalProps {
  isOpen: boolean;
  onLogin: (operatorName: string) => void;
  systemDate: string;
}

export function OperatorLoginModal({
  isOpen,
  onLogin,
  systemDate,
}: OperatorLoginModalProps) {
  const [operator, setOperator] = useState('ADMIN');

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!operator.trim()) return;
    onLogin(operator.trim().toUpperCase());
  };

  return (
    <DosModal
      isOpen={isOpen}
      onClose={() => {}}
      title="OPERATOR SIGN-IN"
      width="max-w-md"
      confirmText="[Enter: Sign-In]"
      cancelText=""
      onConfirm={handleSubmit}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 font-mono text-xs">
        <div className="bg-[#00AAAA] text-black font-bold p-2 text-center border border-black shadow-[2px_2px_0px_0px_#000]">
          INVOICE PREPARED BY
        </div>

        <div className="flex items-center gap-2 mt-2">
          <label className="font-bold text-brand-ink">OPERATOR CODE / ID:</label>
          <input
            type="text"
            value={operator}
            onChange={(e) => setOperator(e.target.value.toUpperCase())}
            placeholder="e.g. ADMIN, OP-1"
            className="flex-1 bg-white border border-brand-border px-2 py-1 font-bold text-brand-ink focus:outline-brand-amber uppercase"
            autoFocus
            required
          />
        </div>

        <div className="text-[11px] text-gray-600 flex justify-between border-t border-brand-border pt-2 mt-1">
          <span>SYSTEM DATE: {systemDate}</span>
          <span>TERMINAL: NODE-01</span>
        </div>
      </form>
    </DosModal>
  );
}
