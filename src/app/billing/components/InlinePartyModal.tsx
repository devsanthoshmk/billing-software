'use client';

import React, { useState } from 'react';
import { DosModal } from '@/components/ui/DosModal';
import { createInlineCustomer } from '../actions';

export interface InlinePartyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPartyCreated: (newCustomer: any) => void;
  areas: Array<{ id: string; code: string; name: string }>;
  salesmen: Array<{ id: string; code: string; name: string }>;
}

export function InlinePartyModal({
  isOpen,
  onClose,
  onPartyCreated,
  areas,
  salesmen,
}: InlinePartyModalProps) {
  const [name, setName] = useState('');
  const [areaId, setAreaId] = useState(areas[0]?.id || '');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [addressLine3, setAddressLine3] = useState('');
  const [place, setPlace] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [dlNo20, setDlNo20] = useState('');
  const [dlNo21, setDlNo21] = useState('');
  const [billingType, setBillingType] = useState('L');
  const [paymentTerms, setPaymentTerms] = useState('R');
  const [salesmanId, setSalesmanId] = useState(salesmen[0]?.id || '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Customer name is required.');
      return;
    }
    if (!areaId) {
      setError('Please select an area.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createInlineCustomer({
        name,
        areaId,
        addressLine1,
        addressLine2,
        addressLine3,
        addressLine4: place,
        phone,
        gstin,
        dlNo20b: dlNo20,
        dlNo21b: dlNo21,
        billingType,
        paymentTerms,
        salesmanId: salesmanId || null,
      });

      if (res.success && res.customer) {
        onPartyCreated(res.customer);
        onClose();
      } else {
        setError(res.error || 'Failed to create customer.');
      }
    } catch (err: any) {
      setError(err.message || 'Error creating customer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DosModal
      isOpen={isOpen}
      onClose={onClose}
      title="NEW CUSTOMER ENTRY"
      width="max-w-2xl"
      confirmText="[F5: Save & Select]"
      cancelText="[ESC: Cancel]"
      onConfirm={handleSubmit}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 font-mono text-xs">
        {error && (
          <div className="bg-red-600 text-white font-bold p-1.5 border border-black mb-2">
            [ERROR] {error}
          </div>
        )}

        <div className="grid grid-cols-12 gap-2 items-center">
          <label className="col-span-4 font-bold text-brand-ink">Area :</label>
          <div className="col-span-8">
            <select
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              className="w-full bg-white border border-brand-border px-1.5 py-0.5 font-bold"
              required
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>

          <label className="col-span-4 font-bold text-brand-ink">Customer Name :</label>
          <div className="col-span-8">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder="Enter pharmacy or hospital name"
              className="w-full bg-[#00AAAA] text-black font-bold px-1.5 py-0.5 border border-black focus:outline-none"
              autoFocus
              required
            />
          </div>

          <label className="col-span-4 font-bold text-brand-ink">Address Line 1 :</label>
          <div className="col-span-8">
            <input
              type="text"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              placeholder="Shop / Door No., Street"
              className="w-full bg-white border border-brand-border px-1.5 py-0.5"
            />
          </div>

          <label className="col-span-4 font-bold text-brand-ink">Address Line 2 :</label>
          <div className="col-span-8">
            <input
              type="text"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              placeholder="Locality / Landmark"
              className="w-full bg-white border border-brand-border px-1.5 py-0.5"
            />
          </div>

          <label className="col-span-4 font-bold text-brand-ink">Address Line 3 :</label>
          <div className="col-span-8">
            <input
              type="text"
              value={addressLine3}
              onChange={(e) => setAddressLine3(e.target.value)}
              placeholder="Area / Extension"
              className="w-full bg-white border border-brand-border px-1.5 py-0.5"
            />
          </div>

          <label className="col-span-4 font-bold text-brand-ink">City / Town :</label>
          <div className="col-span-8">
            <input
              type="text"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="City / Town"
              className="w-full bg-white border border-brand-border px-1.5 py-0.5"
            />
          </div>

          <label className="col-span-4 font-bold text-brand-ink">Phone Number :</label>
          <div className="col-span-8">
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              className="w-full bg-white border border-brand-border px-1.5 py-0.5"
            />
          </div>

          <label className="col-span-4 font-bold text-brand-ink">GSTIN :</label>
          <div className="col-span-8">
            <input
              type="text"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="15-digit GSTIN (e.g. 33AAAAA0000A1Z5)"
              maxLength={15}
              className="w-full bg-white border border-brand-border px-1.5 py-0.5 uppercase"
            />
          </div>

          <label className="col-span-4 font-bold text-brand-ink">Drug License (20B) :</label>
          <div className="col-span-8">
            <input
              type="text"
              value={dlNo20}
              onChange={(e) => setDlNo20(e.target.value)}
              placeholder="e.g. TN/CHE/20B/12345"
              className="w-full bg-white border border-brand-border px-1.5 py-0.5"
            />
          </div>

          <label className="col-span-4 font-bold text-brand-ink">Drug License (21B) :</label>
          <div className="col-span-8">
            <input
              type="text"
              value={dlNo21}
              onChange={(e) => setDlNo21(e.target.value)}
              placeholder="e.g. TN/CHE/21B/12346"
              className="w-full bg-white border border-brand-border px-1.5 py-0.5"
            />
          </div>

          <label className="col-span-4 font-bold text-brand-ink">GST Type :</label>
          <div className="col-span-8 flex gap-4">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="billingType"
                value="L"
                checked={billingType === 'L'}
                onChange={() => setBillingType('L')}
              />
              <span>Local (CGST + SGST)</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="billingType"
                value="O"
                checked={billingType === 'O'}
                onChange={() => setBillingType('O')}
              />
              <span>Outstation (IGST)</span>
            </label>
          </div>

          <label className="col-span-4 font-bold text-brand-ink">Payment Terms :</label>
          <div className="col-span-8 flex gap-4">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="paymentTerms"
                value="R"
                checked={paymentTerms === 'R'}
                onChange={() => setPaymentTerms('R')}
              />
              <span>Credit</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="paymentTerms"
                value="C"
                checked={paymentTerms === 'C'}
                onChange={() => setPaymentTerms('C')}
              />
              <span>Cash</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="paymentTerms"
                value="H"
                checked={paymentTerms === 'H'}
                onChange={() => setPaymentTerms('H')}
              />
              <span>Cheque</span>
            </label>
          </div>

          <label className="col-span-4 font-bold text-brand-ink">Salesman :</label>
          <div className="col-span-8">
            <select
              value={salesmanId}
              onChange={(e) => setSalesmanId(e.target.value)}
              className="w-full bg-white border border-brand-border px-1.5 py-0.5"
            >
              <option value="">-- Select Salesman --</option>
              {salesmen.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>
    </DosModal>
  );
}
