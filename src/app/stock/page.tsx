import Link from 'next/link';
import { db } from '@/lib/db';
import { products, productBatches } from '@/lib/db/schema/masters';
import { asc, desc, sql } from 'drizzle-orm';
import { DosWindow, DosAction } from '@/components/ui/DosWindow';

export default async function StockDashboard() {
  const allBatches = await db.query.productBatches.findMany({
    orderBy: [asc(productBatches.expiryDate)],
    with: {
      product: true,
    },
  });

  const totalBatches = allBatches.length;
  const totalStockUnits = allBatches.reduce((sum, b) => sum + b.stockQty, 0);
  const totalQuarantineUnits = allBatches.reduce((sum, b) => sum + b.quarantineQty, 0);
  const totalValuation = allBatches.reduce((sum, b) => sum + (b.stockQty * b.purchaseRate), 0);

  const actions: DosAction[] = [
    { keyLabel: 'F2', label: 'Purchase Inward' },
    { keyLabel: 'F3', label: 'Purchase Returns' },
    { keyLabel: 'F4', label: 'Stock Adjustments' },
    { keyLabel: 'F6', label: 'Branch Transfers' },
    { keyLabel: 'F7', label: 'Rack & Rate Setup' },
    { keyLabel: 'F8', label: 'Multi-MRP Batches' },
    { keyLabel: 'F9', label: 'Expiry & Damage Claims' },
    { keyLabel: 'F10', label: 'HSN & Tax Slabs' },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-paper">
      <DosWindow
        title="Stock & Inventory Control"
        subtitle="Real-time batch tracking, stock valuation, warehouse transfers & claim settlements"
        breadcrumbs={['Stock', 'Inventory Dashboard']}
        actions={actions}
        statusInfo={
          <span className="text-brand-amber font-bold">
            Batches: {totalBatches} | Total Valuation: ₹ {totalValuation.toFixed(2)}
          </span>
        }
      >
        <div className="flex flex-col h-full p-2 gap-2 font-mono text-xs">
          {/* Quick Action Navigation Buttons */}
          <div className="bg-brand-surface border border-brand-border p-2 flex flex-wrap gap-2 items-center justify-between">
            <div className="flex flex-wrap gap-1.5">
              <Link
                href="/stock/purchase"
                className="bg-brand-ink text-white font-bold px-2.5 py-1 border border-black hover:bg-brand-amber flex items-center gap-1"
              >
                <span className="bg-brand-amber text-white px-1 text-[10px]">F2</span>
                <span>Purchase Inward (GRN)</span>
              </Link>
              <Link
                href="/stock/returns"
                className="bg-brand-ink text-white font-bold px-2.5 py-1 border border-black hover:bg-brand-amber flex items-center gap-1"
              >
                <span className="bg-brand-amber text-white px-1 text-[10px]">F3</span>
                <span>Purchase Returns</span>
              </Link>
              <Link
                href="/stock/adjustments"
                className="bg-brand-ink text-white font-bold px-2.5 py-1 border border-black hover:bg-brand-amber flex items-center gap-1"
              >
                <span className="bg-brand-amber text-white px-1 text-[10px]">F4</span>
                <span>Stock Adjustments</span>
              </Link>
              <Link
                href="/stock/transfers"
                className="bg-brand-ink text-white font-bold px-2.5 py-1 border border-black hover:bg-brand-amber flex items-center gap-1"
              >
                <span className="bg-brand-amber text-white px-1 text-[10px]">F6</span>
                <span>Branch Transfers</span>
              </Link>
              <Link
                href="/stock/rack-management"
                className="bg-brand-ink text-white font-bold px-2.5 py-1 border border-black hover:bg-brand-amber flex items-center gap-1"
              >
                <span className="bg-brand-amber text-white px-1 text-[10px]">F7</span>
                <span>Rack & Rate Setup</span>
              </Link>
              <Link
                href="/stock/multi-mrp"
                className="bg-brand-ink text-white font-bold px-2.5 py-1 border border-black hover:bg-brand-amber flex items-center gap-1"
              >
                <span className="bg-brand-amber text-white px-1 text-[10px]">F8</span>
                <span>Multi-MRP Batches</span>
              </Link>
              <Link
                href="/stock/claims"
                className="bg-brand-ink text-white font-bold px-2.5 py-1 border border-black hover:bg-brand-amber flex items-center gap-1"
              >
                <span className="bg-brand-amber text-white px-1 text-[10px]">F9</span>
                <span>Expiry Claims</span>
              </Link>
              <Link
                href="/stock/hsn-mapping"
                className="bg-brand-ink text-white font-bold px-2.5 py-1 border border-black hover:bg-brand-amber flex items-center gap-1"
              >
                <span className="bg-brand-amber text-white px-1 text-[10px]">F10</span>
                <span>HSN & Tax Slabs</span>
              </Link>
            </div>

            <div className="flex gap-4 text-brand-ink">
              <span>Saleable Stock: <strong>{totalStockUnits}</strong></span>
              <span>Quarantine: <strong className="text-red-600">{totalQuarantineUnits}</strong></span>
            </div>
          </div>

          {/* Batches Table */}
          <div className="flex-1 border border-brand-border overflow-auto bg-white min-h-48">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-brand-ink text-white z-10">
                <tr>
                  <th className="w-8 px-1 py-1 text-center">#</th>
                  <th className="w-20 px-2 py-1 text-left">ITEM CODE</th>
                  <th className="px-2 py-1 text-left">PRODUCT NAME</th>
                  <th className="w-24 px-2 py-1 text-center">BATCH NO</th>
                  <th className="w-20 px-2 py-1 text-center">EXPIRY</th>
                  <th className="w-20 px-2 py-1 text-right">SALEABLE</th>
                  <th className="w-20 px-2 py-1 text-right">QUARANTINE</th>
                  <th className="w-20 px-2 py-1 text-right">PUR. RATE</th>
                  <th className="w-20 px-2 py-1 text-right">SEL. RATE</th>
                  <th className="w-20 px-2 py-1 text-right">MRP</th>
                  <th className="w-24 px-2 py-1 text-right">TOTAL VALUE</th>
                </tr>
              </thead>
              <tbody>
                {allBatches.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-gray-500 font-bold">
                      --- NO INVENTORY BATCHES RECORDED ---
                    </td>
                  </tr>
                ) : (
                  allBatches.map((b, idx) => {
                    const valuation = b.stockQty * b.purchaseRate;
                    const isLow = b.stockQty <= 0;

                    return (
                      <tr
                        key={b.id}
                        className={`border-b border-gray-200 ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        }`}
                      >
                        <td className="px-1 py-1 text-center text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-1 font-bold">{b.product?.code}</td>
                        <td className="px-2 py-1 font-bold">{b.product?.name}</td>
                        <td className="px-2 py-1 text-center font-bold">{b.batchNo}</td>
                        <td className="px-2 py-1 text-center">{b.expiryMonthYear || b.expiryDate}</td>
                        <td
                          className={`px-2 py-1 text-right font-bold ${
                            isLow ? 'text-red-600' : 'text-green-800'
                          }`}
                        >
                          {b.stockQty}
                        </td>
                        <td className="px-2 py-1 text-right text-red-600 font-bold">
                          {b.quarantineQty > 0 ? b.quarantineQty : '-'}
                        </td>
                        <td className="px-2 py-1 text-right">{b.purchaseRate.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right">{b.sellingRate.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right font-bold">{b.mrp.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right font-bold text-brand-ink">
                          ₹ {valuation.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Summary */}
          <div className="bg-brand-surface border border-brand-border p-2 flex justify-between text-[11px] text-gray-600">
            <span>Total Batches Tracked: {totalBatches}</span>
            <span>Total Stock Valuation (at Purchase Cost): ₹ {totalValuation.toFixed(2)}</span>
          </div>
        </div>
      </DosWindow>
    </div>
  );
}
