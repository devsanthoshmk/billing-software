'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { generateTallyXmlExport } from './actions';

export default function TallyExportPage() {
  const [startDate, setStartDate] = useState<string>('2026-09-01');
  const [endDate, setEndDate] = useState<string>('2026-09-30');
  const [exportResult, setExportResult] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const res = await generateTallyXmlExport(startDate, endDate);
    if (res.success) {
      setExportResult(res);
    } else {
      setError(res.error || 'Failed to generate Tally XML');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDownloadXml = () => {
    if (!exportResult?.xmlContent) return;
    const blob = new Blob([exportResult.xmlContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TALLY_PRIME_EXPORT_${startDate}_to_${endDate}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const actions: DosAction[] = [
    {
      keyLabel: 'F8',
      label: 'Download Tally XML',
      variant: 'primary',
      disabled: !exportResult,
      onClick: handleDownloadXml,
    },
    {
      keyLabel: 'F5',
      label: 'Refresh',
      onClick: loadData,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="Tally Prime Accounting Export"
        subtitle="Export sales invoices and collection receipt vouchers directly into Tally Prime XML format"
        breadcrumbs={['SYSTEM', 'TALLY EXPORT']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Total Vouchers: {(exportResult?.invoicesCount || 0) + (exportResult?.receiptsCount || 0)}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1 border border-black">
              [ERROR] {error}
            </div>
          )}

          {/* Controls */}
          <div className="bg-brand-surface border border-brand-border p-2 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="font-bold text-brand-ink">From:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-white border border-brand-border px-2 py-1 font-bold"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="font-bold text-brand-ink">To:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-white border border-brand-border px-2 py-1 font-bold"
                />
              </div>

              <button
                type="button"
                onClick={loadData}
                className="bg-brand-ink text-white font-bold px-3 py-1 border border-black hover:bg-brand-amber cursor-pointer"
              >
                [GENERATE EXPORT]
              </button>
            </div>

            <button
              type="button"
              disabled={!exportResult}
              onClick={handleDownloadXml}
              className="bg-brand-amber text-white font-bold px-4 py-1 border border-black hover:bg-brand-amber/80 cursor-pointer disabled:opacity-50"
            >
              [F8: DOWNLOAD XML FILE]
            </button>
          </div>

          {/* XML Preview */}
          <div className="flex-1 border border-brand-border bg-black text-green-400 p-3 overflow-auto max-h-[65vh]">
            {loading ? (
              <div className="text-center py-12 text-gray-500">Generating Tally Prime export...</div>
            ) : (
              <pre className="whitespace-pre font-mono text-[11px] leading-tight">
                {exportResult?.xmlContent || 'No vouchers found for selected period.'}
              </pre>
            )}
          </div>
        </div>
      </DosWindow>
    </div>
  );
}
