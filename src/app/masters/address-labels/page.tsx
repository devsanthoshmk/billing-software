'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { getAddressLabelsData } from './actions';

export default function AddressLabelsPage() {
  const [partyType, setPartyType] = useState<'CUSTOMERS' | 'SUPPLIERS'>('CUSTOMERS');
  const [areas, setAreas] = useState<any[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [parties, setParties] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'GRID' | 'LABELS' | 'PHONE'>('LABELS');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (type = partyType, area = selectedAreaId) => {
    setLoading(true);
    setError(null);
    const res = await getAddressLabelsData(type, area);
    if (res.success) {
      setAreas(res.areas);
      setParties(res.parties);
    } else {
      setError(res.error || 'Failed to load address data');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const actions: DosAction[] = [
    {
      keyLabel: 'F8',
      label: 'Print Labels',
      variant: 'primary',
      disabled: parties.length === 0,
      onClick: () => window.print(),
    },
    {
      keyLabel: 'F5',
      label: 'Refresh',
      onClick: () => loadData(partyType, selectedAreaId),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="MAILING LABELS &amp; CONTACT DIRECTORY"
        subtitle="[PARCEL MAILING LABELS &amp; CONTACT DIRECTORY] [CHEMISTS &amp; DISTRIBUTORS]"
        breadcrumbs={['MASTERS', 'MAILING LABELS']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            RECORDS LOADED: {parties.length} | VIEW: {viewMode}
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
              <label className="font-bold text-brand-ink">Directory:</label>
              <select
                value={partyType}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setPartyType(val);
                  loadData(val, selectedAreaId);
                }}
                className="w-full bg-white border border-brand-border px-2 py-1 font-bold"
              >
                <option value="CUSTOMERS">Chemists &amp; Hospitals</option>
                <option value="SUPPLIERS">Pharma Distributors</option>
              </select>
            </div>

            {partyType === 'CUSTOMERS' && (
              <div className="col-span-4 flex items-center gap-2">
                <label className="font-bold text-brand-ink">Area:</label>
                <select
                  value={selectedAreaId}
                  onChange={(e) => {
                    setSelectedAreaId(e.target.value);
                    loadData(partyType, e.target.value);
                  }}
                  className="w-full bg-white border border-brand-border px-2 py-1 font-bold"
                >
                  <option value="">-- ALL TERRITORY AREAS --</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="col-span-3 flex items-center gap-2">
              <label className="font-bold text-brand-ink">Layout:</label>
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as any)}
                className="w-full bg-white border border-brand-border px-2 py-1 font-bold"
              >
                <option value="LABELS">Parcel Mailing Labels (Cards)</option>
                <option value="PHONE">Phone &amp; Contact List</option>
                <option value="GRID">Full Details Table</option>
              </select>
            </div>

            <div className="col-span-2 flex justify-end">
              <button
                type="button"
                onClick={() => loadData(partyType, selectedAreaId)}
                className="bg-brand-ink text-white font-bold px-3 py-1 border border-black hover:bg-brand-amber"
              >
                [FILTER]
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white p-2">
            {loading ? (
              <div className="text-center py-12 text-gray-500 font-bold">Loading contact directory...</div>
            ) : parties.length === 0 ? (
              <div className="text-center py-12 text-gray-500 font-bold">No records found matching the selected criteria.</div>
            ) : viewMode === 'LABELS' ? (
              /* 3-Column Label Card Grid */
              <div className="grid grid-cols-3 gap-2">
                {parties.map((p, idx) => (
                  <div key={idx} className="border-2 border-dashed border-black p-2 bg-yellow-50 text-[11px] leading-tight">
                    <div className="font-bold text-brand-ink uppercase">{p.name}</div>
                    <div className="text-gray-600 text-[10px]">CODE: {p.code} | AREA: {p.area || 'MAIN'}</div>
                    <div className="mt-1 text-gray-800">{p.address1}</div>
                    {p.address2 && <div className="text-gray-800">{p.address2}</div>}
                    <div className="text-gray-800">{p.town} {p.pincode && `- ${p.pincode}`}</div>
                    {p.phone && <div className="mt-1 font-bold text-black">PH: {p.phone}</div>}
                    {p.dlNo && <div className="text-[10px] text-gray-600">DL: {p.dlNo}</div>}
                  </div>
                ))}
              </div>
            ) : viewMode === 'PHONE' ? (
              /* Telephone Directory List */
              <div className="grid grid-cols-2 gap-2">
                {parties.map((p, idx) => (
                  <div key={idx} className="border border-brand-border p-1.5 flex justify-between items-center bg-gray-50">
                    <div>
                      <span className="font-bold text-brand-ink">{p.name}</span>
                      <span className="text-gray-500 text-[10px] ml-1">({p.area})</span>
                    </div>
                    <div className="font-mono font-bold text-brand-amber">{p.phone || 'NO PHONE'}</div>
                  </div>
                ))}
              </div>
            ) : (
              /* Full Table Grid */
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-brand-ink text-white z-10">
                  <tr>
                    <th className="w-8 px-1 py-1 text-center">#</th>
                    <th className="w-20 px-2 py-1 text-left">CODE</th>
                    <th className="px-2 py-1 text-left">CUSTOMER / DISTRIBUTOR NAME</th>
                    <th className="px-2 py-1 text-left">ADDRESS</th>
                    <th className="w-24 px-2 py-1 text-left">TOWN</th>
                    <th className="w-28 px-2 py-1 text-left">PHONE</th>
                    <th className="w-32 px-2 py-1 text-left">GSTIN</th>
                  </tr>
                </thead>
                <tbody>
                  {parties.map((p, idx) => (
                    <tr key={idx} className={`border-b border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                      <td className="px-2 py-1 font-bold">{p.code}</td>
                      <td className="px-2 py-1 font-bold">{p.name}</td>
                      <td className="px-2 py-1 text-gray-600">{p.address1}</td>
                      <td className="px-2 py-1 text-gray-600">{p.town}</td>
                      <td className="px-2 py-1 font-mono">{p.phone || '-'}</td>
                      <td className="px-2 py-1 font-mono text-[10px]">{p.gstin || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </DosWindow>
    </div>
  );
}
