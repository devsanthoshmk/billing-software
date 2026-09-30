import React from 'react';
import { HomeDashboardClient, DashboardStats } from './HomeDashboardClient';
import { sqlite } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface StockRollupRow {
  totalProducts: number | null;
  totalBatches: number | null;
  totalStockUnits: number | null;
  totalValuation: number | null;
}

interface ExpiryCountRow {
  shortExpiryCount: number | null;
}

interface CountRow {
  totalCount: number | null;
}

interface InvoiceDailyRow {
  todayInvoicesCount: number | null;
  todaySalesAmount: number | null;
}

function getDashboardOverviewStats(): DashboardStats {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. Products & Stock Rollup
    const stockRow = sqlite.prepare(`
      SELECT 
        COUNT(DISTINCT p.id) AS totalProducts,
        COUNT(pb.id) AS totalBatches,
        COALESCE(SUM(pb.stock_qty), 0) AS totalStockUnits,
        COALESCE(SUM(pb.stock_qty * pb.purchase_rate), 0) AS totalValuation
      FROM products p
      LEFT JOIN product_batches pb ON pb.product_id = p.id AND pb.is_active = 1
      WHERE p.is_active = 1
    `).get() as StockRollupRow | undefined;

    // 2. Short Expiry Batches (< 90 Days from today)
    const ninetyDaysAhead = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const expiryRow = sqlite.prepare(`
      SELECT COUNT(id) AS shortExpiryCount
      FROM product_batches
      WHERE is_active = 1 
        AND stock_qty > 0 
        AND expiry_date <= ?
    `).get(ninetyDaysAhead) as ExpiryCountRow | undefined;

    // 3. Parties Registered
    const custRow = sqlite.prepare(`
      SELECT COUNT(id) AS totalCount FROM customers WHERE is_active = 1
    `).get() as CountRow | undefined;

    const supRow = sqlite.prepare(`
      SELECT COUNT(id) AS totalCount FROM suppliers WHERE is_active = 1
    `).get() as CountRow | undefined;

    // 4. Invoices Today
    const invRow = sqlite.prepare(`
      SELECT 
        COUNT(id) AS todayInvoicesCount,
        COALESCE(SUM(net_amount), 0) AS todaySalesAmount
      FROM invoices
      WHERE invoice_date = ? AND status != 'CANCELLED'
    `).get(today) as InvoiceDailyRow | undefined;

    return {
      totalProducts: Number(stockRow?.totalProducts || 0),
      totalBatches: Number(stockRow?.totalBatches || 0),
      totalStockUnits: Number(stockRow?.totalStockUnits || 0),
      totalStockValuation: Number((Number(stockRow?.totalValuation || 0)).toFixed(2)),
      shortExpiryCount: Number(expiryRow?.shortExpiryCount || 0),
      totalCustomers: Number(custRow?.totalCount || 0),
      totalSuppliers: Number(supRow?.totalCount || 0),
      todayInvoicesCount: Number(invRow?.todayInvoicesCount || 0),
      todaySalesAmount: Number((Number(invRow?.todaySalesAmount || 0)).toFixed(2)),
      systemDate: today,
    };
  } catch (err) {
    console.error('Failed to query dashboard overview stats:', err);
    return {
      totalProducts: 0,
      totalBatches: 0,
      totalStockUnits: 0,
      totalStockValuation: 0,
      shortExpiryCount: 0,
      totalCustomers: 0,
      totalSuppliers: 0,
      todayInvoicesCount: 0,
      todaySalesAmount: 0,
      systemDate: new Date().toISOString().split('T')[0],
    };
  }
}

export default async function HomePage() {
  const stats = getDashboardOverviewStats();
  return <HomeDashboardClient stats={stats} />;
}
