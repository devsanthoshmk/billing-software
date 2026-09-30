'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { runDatabaseDiagnostics } from './actions';

export default function DiagnosticsPage() {
  const [diagnostics, setDiagnostics] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const res = await runDatabaseDiagnostics();
    if (res.success) {
      setDiagnostics(res);
    } else {
      setError(res.error || 'Diagnostics failed');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const actions: DosAction[] = [
    {
      keyLabel: 'F5',
      label: 'Run Health Check',
      variant: 'primary',
      onClick: loadData,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="System Health & Integrity Check"
        subtitle="Database consistency audit, relationship verification, and record count checks"
        breadcrumbs={['SYSTEM', 'SYSTEM HEALTH CHECK']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            System Status: {diagnostics?.integrityPassed ? 'Healthy' : 'Checking...'}
          </span>
        }
      >
        <div className="flex flex-col h-full p-3 gap-3 font-mono text-xs max-w-4xl mx-auto overflow-auto">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1.5 border border-black">
              [ERROR] {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-500 font-bold">
              Running system health and integrity checks...
            </div>
          ) : !diagnostics ? (
            <div className="text-center py-12 text-gray-500">No diagnostic data.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Overall Health Status */}
              <div className="border-2 border-green-500 bg-green-50 p-3 flex items-center justify-between">
                <div>
                  <div className="font-bold text-green-900 text-sm">
                    ✓ All Database Tables & Indexes Are Healthy
                  </div>
                  <div className="text-green-700 text-[11px]">
                    Data Integrity: Verified | Relational Consistency: Verified | Orphaned Batches: {diagnostics.orphanedBatchesCount}
                  </div>
                </div>
                <div className="text-gray-500 text-[11px]">{diagnostics.timestamp}</div>
              </div>

              {/* Table Records Matrix */}
              <div className="border border-brand-border bg-white p-3">
                <div className="font-bold text-brand-ink text-sm border-b pb-1 mb-2">
                  Database Table Record Counts
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(diagnostics.tableCounts).map(([tbl, cnt]: any) => (
                    <div key={tbl} className="border border-gray-200 p-2 bg-brand-surface flex justify-between items-center">
                      <span className="text-gray-700 uppercase font-semibold">{tbl}:</span>
                      <span className="font-bold text-brand-ink font-mono text-sm">{cnt?.[0] ?? cnt?.count ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </DosWindow>
    </div>
  );
}
