'use client';

import React, { useState } from 'react';
import { DosModal } from '@/components/ui/DosModal';
import { createInlineSupplier } from '../inward/actions';

export interface InlineSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSupplierCreated: (newSupplier: any) => void;
}

export function InlineSupplierModal({
  isOpen,
  onClose,
  onSupplierCreated,
}: InlineSupplierModalProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [place, setPlace] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [creditDays, setCreditDays] = useState(30);
  const [discountPct, setDiscountPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Supplier Name is required!');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createInlineSupplier({
        name,
        addressLine1: address,
        place,
        phone,
        gstin,
        creditDays,
        defaultDiscountPct: discountPct,
      });

      if (res.success && res.supplier) {
        onSupplierCreated(res.supplier);
        onClose();
      } else {
        setError(res.error || 'Failed to create supplier');
      }
    } catch (err: any) {
      setError(err.message || 'Error creating supplier');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DosModal
      isOpen={isOpen}
      onClose={onClose}
      title="NEW SUPPLIER REGISTRATION (+)"
      width="max-w-xl"
      confirmText="[F5: Save Supplier]"
      cancelText="[ESC: Cancel]"
      onConfirm={handleSubmit}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 font-mono text-xs">
        {error && (
          <div className="bg-red-600 text-white font-bold p-1 border border-black">
            [ERROR] {error}
          </div>
        )}

        <div className="grid grid-cols-12 gap-2 items-center">
          <label className="col-span-4 font-bold text-brand-ink">Supplier Name :</label>
          <div className="col-span-8">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder="COMPANY / DISTRIBUTOR NAME"
              className="w-full bg-[#00AAAA] text-black font-bold px-1.5 py-0.5 border border-black focus:outline-none uppercase"
              autoFocus
              required
            />
          </div>

          <label className="col-span-4 font-bold text-brand-ink">Address :</label>
          <div className="col-span-8">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Door No, Street"
              className="w-full bg-white border border-brand-border px-1.5 py-0.5"
            />
          </div>

          <label className="col-span-4 font-bold text-brand-ink">City / Place :</label>
          <div className="col-span-8">
            <input
              type="text"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="City / Town"
              className="w-full bg-white border border-brand-border px-1.5 py-0.5"
            />
          </div>

          <label className="col-span-4 font-bold text-brand-ink">Phone :</label>
          <div className="col-span-8">
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Contact digits"
              className="w-full bg-white border border-brand-border px-1.5 py-0.5"
            />
          </div>

          <label className="col-span-4 font-bold text-brand-ink">GST Number :</label>
          <div className="col-span-8">
            <input
              type="text"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="15-character GSTIN"
              className="w-full bg-white border border-brand-border px-1.5 py-0.5 uppercase"
            />
          </div>

          <label className="col-span-4 font-bold text-brand-ink">Credit Days :</label>
          <div className="col-span-8">
            <input
              type="number"
              value={creditDays}
              onChange={(e) => setCreditDays(parseInt(e.target.value) || 0)}
              className="w-24 bg-white border border-brand-border px-1.5 py-0.5"
            />
          </div>

          <label className="col-span-4 font-bold text-brand-ink">Default Disc% :</label>
          <div className="col-span-8">
            <input
              type="number"
              step="0.01"
              value={discountPct}
              onChange={(e) => setDiscountPct(parseFloat(e.target.value) || 0)}
              className="w-24 bg-white border border-brand-border px-1.5 py-0.5"
            />
          </div>
        </div>
      </form>
    </DosModal>
  );
}
