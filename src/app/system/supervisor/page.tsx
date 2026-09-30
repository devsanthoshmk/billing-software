'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { getSupervisorSettings, updateSupervisorSettings } from './actions';

export default function SupervisorControlsPage() {
  const [allowRateMod, setAllowRateMod] = useState(false);
  const [allowOutOverride, setAllowOutOverride] = useState(false);
  const [allowColEdit, setAllowColEdit] = useState(false);
  const [allowInvCancel, setAllowInvCancel] = useState(false);
  const [enforceCreditLimit, setEnforceCreditLimit] = useState(true);
  const [enforceDlBlock, setEnforceDlBlock] = useState(true);
  const [enforceMarginBlock, setEnforceMarginBlock] = useState(true);
  const [operatorPwd, setOperatorPwd] = useState('');
  const [adminPwd, setAdminPwd] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const res = await getSupervisorSettings();
    if (res.success && res.controls) {
      const c = res.controls;
      setAllowRateMod(Boolean(c.allowRateModification));
      setAllowOutOverride(Boolean(c.allowOutstandingOverride));
      setAllowColEdit(Boolean(c.allowCollectionEdit));
      setAllowInvCancel(Boolean(c.allowInvoiceCancellation));
      setEnforceCreditLimit(Boolean(c.enforceCreditLimit));
      setEnforceDlBlock(Boolean(c.enforceLicenseExpiryBlock));
      setEnforceMarginBlock(Boolean(c.enforceNegativeMarginBlock));
    } else {
      setError(res.error || 'Failed to load supervisor settings');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);
    const res = await updateSupervisorSettings({
      allowRateModification: allowRateMod,
      allowOutstandingOverride: allowOutOverride,
      allowCollectionEdit: allowColEdit,
      allowInvoiceCancellation: allowInvCancel,
      enforceCreditLimit,
      enforceLicenseExpiryBlock: enforceDlBlock,
      enforceNegativeMarginBlock: enforceMarginBlock,
      operatorPassword: operatorPwd,
      adminPassword: adminPwd,
      operator: 'ADMIN',
    });

    if (res.success) {
      setSuccessMsg('Supervisor control parameters saved successfully.');
    } else {
      setError(res.error || 'Failed to update settings');
    }
    setIsSaving(false);
  };

  const actions: DosAction[] = [
    {
      keyLabel: 'F5',
      label: 'Save Settings',
      variant: 'primary',
      disabled: isSaving,
      onClick: handleSave,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="Supervisor Security & Policy Settings"
        subtitle="Pharmacy regulatory safeguards, credit limits, rate modification permissions, and supervisor credentials"
        breadcrumbs={['SYSTEM', 'SUPERVISOR SETTINGS']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Security Policy: Active
          </span>
        }
      >
        <div className="flex flex-col h-full p-3 gap-3 font-mono text-xs max-w-3xl mx-auto overflow-auto">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1.5 border border-black">
              [ERROR] {error}
            </div>
          )}
          {successMsg && (
            <div className="bg-green-100 text-green-900 font-bold px-3 py-1.5 border border-green-400">
              ✓ {successMsg}
            </div>
          )}

          {/* Business & Regulatory Guards */}
          <div className="border border-brand-border bg-white p-3">
            <div className="font-bold text-sm text-brand-ink border-b pb-1 mb-3">
              1. REGULATORY COMPLIANCE & BUSINESS CONTROLS
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enforceDlBlock}
                  onChange={(e) => setEnforceDlBlock(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="font-bold text-brand-ink">
                  Enforce Drug License Expiry Check (Block sales billing to customers with expired Form 20B / 21B licenses)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enforceCreditLimit}
                  onChange={(e) => setEnforceCreditLimit(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="font-bold text-brand-ink">
                  Enforce Customer Credit Limit (Require supervisor authorization when invoice exceeds credit limit)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enforceMarginBlock}
                  onChange={(e) => setEnforceMarginBlock(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="font-bold text-brand-ink">
                  Negative Margin & DPCO Price Guard (Prevent selling below purchase cost or above printed MRP)
                </span>
              </label>
            </div>
          </div>

          {/* Operational Permissions */}
          <div className="border border-brand-border bg-white p-3">
            <div className="font-bold text-sm text-brand-ink border-b pb-1 mb-3">
              2. USER PERMISSIONS & OVERRIDE AUTHORIZATIONS
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowRateMod}
                  onChange={(e) => setAllowRateMod(e.target.checked)}
                  className="w-4 h-4"
                />
                <span>Allow Selling Rate Modification at Billing</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowOutOverride}
                  onChange={(e) => setAllowOutOverride(e.target.checked)}
                  className="w-4 h-4"
                />
                <span>Allow Overdue Customer Invoice Billing Override</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowColEdit}
                  onChange={(e) => setAllowColEdit(e.target.checked)}
                  className="w-4 h-4"
                />
                <span>Allow Editing Collection & Receipt Vouchers</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowInvCancel}
                  onChange={(e) => setAllowInvCancel(e.target.checked)}
                  className="w-4 h-4"
                />
                <span>Allow Invoice Cancellation by Operators</span>
              </label>
            </div>
          </div>

          {/* Password Settings */}
          <div className="border border-brand-border bg-white p-3">
            <div className="font-bold text-sm text-brand-ink border-b pb-1 mb-3">
              3. SYSTEM & SUPERVISOR PASSWORDS
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">Operator Master Password:</label>
                <input
                  type="password"
                  placeholder="Leave blank to keep unchanged"
                  value={operatorPwd}
                  onChange={(e) => setOperatorPwd(e.target.value)}
                  className="w-full bg-white border border-brand-border px-2 py-1"
                />
              </div>

              <div>
                <label className="font-bold block mb-1">Supervisor Admin Password:</label>
                <input
                  type="password"
                  placeholder="Leave blank to keep unchanged"
                  value={adminPwd}
                  onChange={(e) => setAdminPwd(e.target.value)}
                  className="w-full bg-white border border-brand-border px-2 py-1"
                />
              </div>
            </div>
          </div>
        </div>
      </DosWindow>
    </div>
  );
}
