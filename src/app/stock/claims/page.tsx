'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import { getClaimsInitialData, submitBreakageExpiryClaim } from './actions';
import { ProductSearchModal } from '@/app/masters/products/ProductSearchModal';

export default function ClaimsSettlementPage() {
  const [claimType, setClaimType] = useState<'CUSTOMER_CLAIM' | 'COMPANY_CLAIM'>('CUSTOMER_CLAIM');
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const [claimDate, setClaimDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [claimReason, setClaimReason] = useState<string>('EXPIRY');
  const [items, setItems] = useState<any[]>([]);
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [successInfo, setSuccessInfo] = useState<{ claimNo: string; amount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    async function init() {
      const res = await getClaimsInitialData();
      if (res.success) {
        setCustomers(res.customers);
        setSuppliers(res.suppliers);
        if (res.customers.length > 0) {
          setSelectedPartyId(res.customers[0].id);
        }
      }
    }
    init();
  }, []);

  const handleSelectProduct = (prod: any) => {
    const batch = prod.batches?.[0];
    if (!batch) {
      setError(`No batch record found for ${prod.name}`);
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        productId: prod.id,
        batchId: batch.id,
        productName: prod.name,
        packaging: prod.packaging,
        batchNo: batch.batchNo,
        expiryDate: batch.expiryDate,
        quantity: 1,
        rate: claimType === 'CUSTOMER_CLAIM' ? batch.sellingRate : batch.purchaseRate,
      },
    ]);
    setShowProductModal(false);
  };

  const handleSaveClaim = async () => {
    setError(null);
    if (!selectedPartyId) {
      setError('Select party for claim settlement');
      return;
    }
    if (items.length === 0) {
      setError('Add at least 1 claim line item');
      return;
    }

    setIsSubmitting(true);
    const res = await submitBreakageExpiryClaim({
      claimType,
      partyId: selectedPartyId,
      claimDate,
      claimReason: claimReason as any,
      items,
      operator: 'ADMIN',
    });

    if (res.success && res.claimNo) {
      setSuccessInfo({ claimNo: res.claimNo, amount: res.totalAmount || 0 });
      setItems([]);
    } else {
      setError(res.error || 'Claim settlement failed');
    }
    setIsSubmitting(false);
  };

  const actions: DosAction[] = [
    {
      keyLabel: 'F2',
      label: 'Add Product',
      onClick: () => setShowProductModal(true),
    },
    {
      keyLabel: 'F5',
      label: 'Submit Claim',
      variant: 'primary',
      disabled: isSubmitting || items.length === 0,
      onClick: handleSaveClaim,
    },
    {
      keyLabel: 'F12',
      label: 'Clear List',
      variant: 'danger',
      onClick: () => setItems([]),
    },
  ];

  const totalClaimAmount = items.reduce((acc, it) => acc + it.quantity * it.rate, 0);

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="Breakage & Expiry Claims"
        subtitle="Process customer expiry & breakage returns and file supplier replacement debit claims"
        breadcrumbs={['Stock', 'Claims & Returns', 'Breakage & Expiry']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Claim Items: {items.length} | Total Claim Value: ₹ {totalClaimAmount.toFixed(2)}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1 border border-black">
              [ERROR] {error}
            </div>
          )}

          {/* Header Controls */}
          <div className="bg-brand-surface border border-brand-border p-2 grid grid-cols-12 gap-2 items-center">
            <div className="col-span-3 flex items-center gap-2">
              <label className="font-bold text-brand-ink">Claim Flow:</label>
              <select
                value={claimType}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setClaimType(val);
                  setSelectedPartyId(val === 'CUSTOMER_CLAIM' ? customers[0]?.id : suppliers[0]?.id);
                }}
                className="w-full bg-white border border-brand-border px-2 py-1 font-bold"
              >
                <option value="CUSTOMER_CLAIM">1. Customer Return (Credit Note)</option>
                <option value="COMPANY_CLAIM">2. Company / Supplier Claim (Debit Note)</option>
              </select>
            </div>

            <div className="col-span-4 flex items-center gap-2">
              <label className="font-bold text-brand-ink">
                {claimType === 'CUSTOMER_CLAIM' ? 'Customer / Chemist:' : 'Supplier / Manufacturer:'}
              </label>
              <select
                value={selectedPartyId}
                onChange={(e) => setSelectedPartyId(e.target.value)}
                className="w-full bg-[#00AAAA] text-black font-bold border border-black px-2 py-1"
              >
                {claimType === 'CUSTOMER_CLAIM'
                  ? customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.name}
                      </option>
                    ))
                  : suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} - {s.name}
                      </option>
                    ))}
              </select>
            </div>

            <div className="col-span-3 flex items-center gap-2">
              <label className="font-bold text-brand-ink">Reason:</label>
              <select
                value={claimReason}
                onChange={(e) => setClaimReason(e.target.value)}
                className="w-full bg-white border border-brand-border px-2 py-1 font-bold"
              >
                <option value="EXPIRY">1. Expired Medicines</option>
                <option value="BREAKAGE">2. Damaged / Broken Packaging</option>
                <option value="DISSOLUTION_DEFECT">3. Quality Complaint / Defective Product</option>
                <option value="TRANSIT_DAMAGE">4. In-Transit Courier Damage</option>
              </select>
            </div>

            <div className="col-span-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowProductModal(true)}
                className="bg-brand-ink text-white font-bold px-3 py-1 border border-black hover:bg-brand-amber cursor-pointer"
              >
                [+ Add Product (F2)]
              </button>
            </div>
          </div>

          {/* Items Grid */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="px-2 py-1 text-left">PRODUCT NAME</th>
                  <th className="w-24 px-2 py-1 text-left">PACKAGING</th>
                  <th className="w-28 px-2 py-1 text-center">BATCH NO</th>
                  <th className="w-24 px-2 py-1 text-center">EXPIRY</th>
                  <th className="w-24 px-2 py-1 text-right">CLAIM QTY</th>
                  <th className="w-24 px-2 py-1 text-right">RATE</th>
                  <th className="w-28 px-2 py-1 text-right">CLAIM AMOUNT</th>
                  <th className="w-12 px-1 py-1 text-center">DEL</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-500 font-bold">
                      --- NO EXPIRY / BREAKAGE ITEMS IN CLAIM BATCH ---
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => (
                    <tr key={idx} className="border-b border-gray-200">
                      <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                      <td className="px-2 py-1 font-bold">{it.productName}</td>
                      <td className="px-2 py-1 text-gray-600">{it.packaging}</td>
                      <td className="px-2 py-1 text-center font-mono font-bold text-brand-ink">{it.batchNo}</td>
                      <td className="px-2 py-1 text-center text-red-600 font-bold">{it.expiryDate}</td>
                      <td className="px-1 py-0.5 text-right">
                        <input
                          type="number"
                          min="1"
                          value={it.quantity}
                          onChange={(e) => {
                            const val = Math.max(1, parseInt(e.target.value) || 1);
                            setItems((prev) => {
                              const next = [...prev];
                              next[idx].quantity = val;
                              return next;
                            });
                          }}
                          className="w-20 text-right font-bold border border-brand-border px-1 py-0.5"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">₹ {it.rate.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right font-bold text-brand-amber">
                        ₹ {(it.quantity * it.rate).toFixed(2)}
                      </td>
                      <td className="px-1 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-red-600 font-bold hover:bg-red-100 px-1"
                        >
                          X
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DosWindow>

      {/* Product Search Modal */}
      {showProductModal && (
        <ProductSearchModal
          isOpen={showProductModal}
          onClose={() => setShowProductModal(false)}
          onSelectProduct={handleSelectProduct}
        />
      )}

      {/* Success Modal */}
      {successInfo && (
        <DosModal
          isOpen={true}
          onClose={() => setSuccessInfo(null)}
          title="CLAIM PROCESSED SUCCESSFULLY"
          width="max-w-md"
          confirmText="[Enter: OK]"
          onConfirm={() => setSuccessInfo(null)}
        >
          <div className="flex flex-col gap-2 font-mono text-xs text-center py-2">
            <div className="bg-green-100 text-green-800 p-2 border border-green-400 font-bold">
              {claimType === 'CUSTOMER_CLAIM' ? 'CREDIT NOTE ISSUED TO CUSTOMER' : 'DEBIT CLAIM FILED TO SUPPLIER'}
            </div>
            <div className="text-base font-bold text-brand-ink">
              CLAIM REFERENCE NO: {successInfo.claimNo}
            </div>
            <div className="text-lg font-bold text-brand-amber">
              CLAIM TOTAL: ₹ {successInfo.amount.toFixed(2)}
            </div>
          </div>
        </DosModal>
      )}
    </div>
  );
}
