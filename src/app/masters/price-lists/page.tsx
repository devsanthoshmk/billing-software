'use client';

import React, { useState, useEffect } from 'react';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';
import { getPriceListData } from './actions';

export default function PriceListsPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [priceListType, setPriceListType] = useState<string>('WHOLESALE');
  const [priceList, setPriceList] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (comp = '', type = priceListType) => {
    setLoading(true);
    setError(null);
    const res = await getPriceListData({
      companyId: comp,
      priceListType: type as any,
    });
    if (res.success) {
      setCompanies(res.companies);
      setPriceList(res.priceList);
    } else {
      setError(res.error || 'Failed to generate price list');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const actions: DosAction[] = [
    {
      keyLabel: 'F8',
      label: 'Print Catalog',
      variant: 'primary',
      disabled: priceList.length === 0,
      onClick: () => window.print(),
    },
    {
      keyLabel: 'F5',
      label: 'Refresh',
      onClick: () => loadData(selectedCompanyId, priceListType),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="WHOLESALE &amp; RETAIL PRICE LISTS"
        subtitle="[PHARMACEUTICAL PRICE CATALOGS] [WHOLESALE, MRP, NET &amp; DRUG SCHEDULES]"
        breadcrumbs={['MASTERS', 'PRICE LISTS']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            PRODUCTS LISTED: {priceList.length} | TYPE: {priceListType}
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
            <div className="col-span-5 flex items-center gap-2">
              <label className="font-bold text-brand-ink whitespace-nowrap">Manufacturer:</label>
              <select
                value={selectedCompanyId}
                onChange={(e) => {
                  setSelectedCompanyId(e.target.value);
                  loadData(e.target.value, priceListType);
                }}
                className="w-full bg-white border border-brand-border px-2 py-1 font-bold"
              >
                <option value="">-- ALL PHARMACEUTICAL COMPANIES --</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-5 flex items-center gap-2">
              <label className="font-bold text-brand-ink whitespace-nowrap">Price Matrix:</label>
              <select
                value={priceListType}
                onChange={(e) => {
                  setPriceListType(e.target.value);
                  loadData(selectedCompanyId, e.target.value);
                }}
                className="w-full bg-white border border-brand-border px-2 py-1 font-bold"
              >
                <option value="WHOLESALE">1. Wholesale Price List (PTR)</option>
                <option value="MRP">2. Retail MRP Price List</option>
                <option value="NET_RATE">3. Net Rate / Cost Sheet</option>
                <option value="SCHEDULE_H">4. Schedule H / H1 &amp; Controlled Drugs</option>
                <option value="SPECIAL">5. Scheme &amp; Bonus Offer Catalog</option>
                <option value="ALL">6. Complete Price Catalog</option>
              </select>
            </div>

            <div className="col-span-2 flex justify-end">
              <button
                type="button"
                onClick={() => loadData(selectedCompanyId, priceListType)}
                className="bg-brand-ink text-white font-bold px-3 py-1 border border-black hover:bg-brand-amber"
              >
                [GENERATE]
              </button>
            </div>
          </div>

          {/* Price List Table */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="w-20 px-2 py-1 text-left">CODE</th>
                  <th className="px-2 py-1 text-left">PRODUCT NAME</th>
                  <th className="w-28 px-2 py-1 text-left">COMPANY</th>
                  <th className="w-20 px-2 py-1 text-left">PACK</th>
                  <th className="w-20 px-2 py-1 text-center">BATCH</th>
                  <th className="w-20 px-2 py-1 text-center">EXPY</th>
                  <th className="w-20 px-2 py-1 text-right">COST</th>
                  <th className="w-24 px-2 py-1 text-right">WHOLESALE</th>
                  <th className="w-24 px-2 py-1 text-right">MRP</th>
                  <th className="w-16 px-2 py-1 text-center">SCHEME</th>
                  <th className="w-16 px-2 py-1 text-right">STOCK</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={12} className="text-center py-12 text-gray-500 font-bold">
                      Loading price list...
                    </td>
                  </tr>
                ) : priceList.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-12 text-gray-500 font-bold">
                      No products found matching the selected criteria.
                    </td>
                  </tr>
                ) : (
                  priceList.map((item, idx) => (
                    <tr
                      key={idx}
                      className={`border-b border-gray-200 ${
                        item.isScheduleH ? 'bg-amber-50/50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      }`}
                    >
                      <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                      <td className="px-2 py-1 font-bold">{item.code}</td>
                      <td className="px-2 py-1 font-bold">
                        {item.name}
                        {item.isScheduleH && <span className="ml-1 text-[10px] text-red-600 font-bold">[Sch-H]</span>}
                      </td>
                      <td className="px-2 py-1 text-gray-600">{item.company}</td>
                      <td className="px-2 py-1 text-gray-600">{item.packaging}</td>
                      <td className="px-2 py-1 text-center font-mono">{item.batchNo}</td>
                      <td className="px-2 py-1 text-center text-gray-600">{item.expiryDate}</td>
                      <td className="px-2 py-1 text-right text-gray-600">₹ {item.purchaseRate.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right font-bold text-brand-ink">₹ {item.sellingRate.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right font-bold text-brand-amber">₹ {item.mrp.toFixed(2)}</td>
                      <td className="px-2 py-1 text-center font-bold text-green-700">{item.scheme}</td>
                      <td className="px-2 py-1 text-right font-bold">{item.stockQty}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DosWindow>
    </div>
  );
}
