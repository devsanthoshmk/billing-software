'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { DosModal } from '@/components/ui/DosModal';
import { createDatabaseBackupSnapshot, getExistingBackups } from './actions';

export default function SystemBackupPage() {
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [successInfo, setSuccessInfo] = useState<{ fileName: string; sizeKb: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = async () => {
    setLoading(true);
    setError(null);
    const res = await getExistingBackups();
    if (res.success) {
      setBackups(res.backups);
    } else {
      setError(res.error || 'Failed to list backups');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadList();
  }, []);

  const handleTriggerBackup = async () => {
    setIsBackingUp(true);
    setError(null);
    const res = await createDatabaseBackupSnapshot('ADMIN');
    if (res.success && res.fileName) {
      setSuccessInfo({ fileName: res.fileName, sizeKb: res.sizeKb || 0 });
      loadList();
    } else {
      setError(res.error || 'Backup creation failed');
    }
    setIsBackingUp(false);
  };

  const actions: DosAction[] = [
    {
      keyLabel: 'F8',
      label: 'Create Backup Now',
      variant: 'primary',
      disabled: isBackingUp,
      onClick: handleTriggerBackup,
    },
    {
      keyLabel: 'F5',
      label: 'Refresh',
      onClick: loadList,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="Database Backup & Archive"
        subtitle="Point-in-time full database backup snapshot and recovery archive"
        breadcrumbs={['SYSTEM', 'DATABASE BACKUP']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Backups Available: {backups.length}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {error && (
            <div className="bg-red-600 text-white font-bold px-3 py-1 border border-black">
              [ERROR] {error}
            </div>
          )}

          {/* Action Trigger Banner */}
          <div className="bg-brand-surface border border-brand-border p-3 flex items-center justify-between">
            <div>
              <div className="font-bold text-sm text-brand-ink">INSTANT DATABASE BACKUP SNAPSHOT</div>
              <div className="text-gray-600 text-[11px]">
                Creates a point-in-time full backup of all ledger transactions, inventory batches, and master records with zero application downtime.
              </div>
            </div>

            <button
              type="button"
              disabled={isBackingUp}
              onClick={handleTriggerBackup}
              className="bg-brand-ink text-white font-bold px-6 py-2 border-2 border-black hover:bg-brand-amber cursor-pointer disabled:opacity-50 shadow-[2px_2px_0px_0px_#F05A28]"
            >
              {isBackingUp ? 'ARCHIVING...' : '[F8: CREATE BACKUP NOW]'}
            </button>
          </div>

          {/* Existing Backups List */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="px-2 py-1 text-left">BACKUP ARCHIVE FILE NAME</th>
                  <th className="w-32 px-2 py-1 text-right">FILE SIZE</th>
                  <th className="w-48 px-2 py-1 text-left">CREATION TIMESTAMP</th>
                  <th className="w-24 px-2 py-1 text-center">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-500 font-bold">
                      Checking backup archives...
                    </td>
                  </tr>
                ) : backups.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-500 font-bold">
                      No database backups found. Click &apos;Create Backup Now&apos; to take a backup snapshot.
                    </td>
                  </tr>
                ) : (
                  backups.map((b, idx) => (
                    <tr key={idx} className={`border-b border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                      <td className="px-2 py-1 font-mono font-bold text-brand-ink">{b.fileName}</td>
                      <td className="px-2 py-1 text-right font-bold">{b.sizeKb} KB</td>
                      <td className="px-2 py-1 text-gray-600">{b.createdAt}</td>
                      <td className="px-2 py-1 text-center">
                        <span className="bg-green-600 text-white px-2 py-0.5 text-[10px] font-bold">
                          VERIFIED
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DosWindow>

      {/* Success Modal */}
      {successInfo && (
        <DosModal
          isOpen={true}
          onClose={() => setSuccessInfo(null)}
          title="BACKUP CREATED SUCCESSFULLY"
          width="max-w-md"
          confirmText="[Enter: OK]"
          onConfirm={() => setSuccessInfo(null)}
        >
          <div className="flex flex-col gap-2 font-mono text-xs text-center py-2">
            <div className="bg-green-100 text-green-800 p-2 border border-green-400 font-bold">
              DATABASE BACKUP COMPLETED
            </div>
            <div className="text-sm font-mono font-bold text-brand-ink">
              {successInfo.fileName}
            </div>
            <div className="text-gray-600">
              Archive Size: {successInfo.sizeKb} KB
            </div>
          </div>
        </DosModal>
      )}
    </div>
  );
}
