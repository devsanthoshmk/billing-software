import { sqlite } from '@/lib/db';
import { StockValuationSummary, StockLedgerRow, LowStockAlertRow, ShortExpiryRow } from './types';

export function getStockValuationSummary(asOfDate: string): StockValuationSummary {
  const row = sqlite.prepare(`
    SELECT 
      COUNT(DISTINCT p.id) AS totalActiveProducts,
      COUNT(pb.id) AS totalActiveBatches,
      COALESCE(SUM(pb.stock_qty), 0) AS totalStockUnits,
      COALESCE(SUM(pb.stock_qty * pb.purchase_rate), 0) AS totalValuationCost,
      COALESCE(SUM(pb.stock_qty * pb.selling_rate), 0) AS totalValuationSellingRate,
      COALESCE(SUM(pb.stock_qty * pb.mrp), 0) AS totalValuationMrp,
      COALESCE(SUM(pb.quarantine_qty), 0) AS totalQuarantineUnits,
      COALESCE(SUM(pb.quarantine_qty * pb.purchase_rate), 0) AS quarantineValuationCost
    FROM products p
    JOIN product_batches pb ON pb.product_id = p.id
    WHERE p.is_active = 1 
      AND pb.is_active = 1
      AND pb.stock_qty > 0
  `).get() as any;

  const cost = Number((Number(row?.totalValuationCost || 0)).toFixed(2));
  const selling = Number((Number(row?.totalValuationSellingRate || 0)).toFixed(2));
  const mrp = Number((Number(row?.totalValuationMrp || 0)).toFixed(2));
  const profit = Number((mrp - cost).toFixed(2));
  const marginPct = mrp > 0 ? Number(((profit / mrp) * 100).toFixed(2)) : 0;

  return {
    asOfDate,
    totalActiveProducts: Number(row?.totalActiveProducts || 0),
    totalActiveBatches: Number(row?.totalActiveBatches || 0),
    totalStockUnits: Number(row?.totalStockUnits || 0),
    totalValuationCost: cost,
    totalValuationSellingRate: selling,
    totalValuationMrp: mrp,
    potentialGrossProfit: profit,
    potentialProfitMarginPct: marginPct,
    totalQuarantineUnits: Number(row?.totalQuarantineUnits || 0),
    quarantineValuationCost: Number((Number(row?.quarantineValuationCost || 0)).toFixed(2)),
  };
}

export function getStockLedger(companyId?: string): StockLedgerRow[] {
  let query = `
    SELECT 
      p.id AS productId,
      p.code AS productCode,
      p.name AS productName,
      comp.name AS companyName,
      p.packaging,
      p.hsn_code AS hsnCode,
      p.rack_location AS rackLocation,
      pb.id AS batchId,
      pb.batch_no AS batchNo,
      pb.expiry_date AS expiryDate,
      pb.expiry_month_year AS expiryMonthYear,
      pb.stock_qty AS stockQty,
      pb.purchase_rate AS purchaseRate,
      pb.selling_rate AS sellingRate,
      pb.mrp,
      ROUND(pb.stock_qty * pb.purchase_rate, 2) AS closingValueCost,
      ROUND(pb.stock_qty * pb.mrp, 2) AS closingValueMrp,
      pb.tax_code AS taxCode,
      (ts.cgst_rate + ts.sgst_rate + ts.igst_rate) AS taxRatePct
    FROM product_batches pb
    JOIN products p ON p.id = pb.product_id
    JOIN companies comp ON comp.id = p.company_id
    JOIN tax_slabs ts ON ts.code = pb.tax_code
    WHERE pb.is_active = 1 
      AND pb.stock_qty > 0
  `;
  const params: string[] = [];
  if (companyId && companyId !== 'ALL') {
    query += ` AND comp.id = ?`;
    params.push(companyId);
  }
  query += ` ORDER BY p.name ASC, pb.expiry_date ASC`;

  return sqlite.prepare(query).all(...params) as StockLedgerRow[];
}

export function getLowStockReorderAlerts(): LowStockAlertRow[] {
  return sqlite.prepare(`
    SELECT 
      p.id AS productId,
      p.code AS productCode,
      p.name AS productName,
      comp.name AS companyName,
      p.packaging,
      p.rack_location AS rackLocation,
      p.total_stock_on_hand AS totalStockOnHand,
      p.reorder_level AS reorderLevel,
      p.min_order_qty AS minOrderQty,
      (p.reorder_level - p.total_stock_on_hand) AS deficitQuantity,
      (
        SELECT sup.name 
        FROM purchases pu 
        JOIN suppliers sup ON sup.id = pu.supplier_id 
        JOIN purchase_items pui ON pui.purchase_id = pu.id 
        WHERE pui.product_id = p.id 
        ORDER BY pu.inward_date DESC 
        LIMIT 1
      ) AS preferredSupplierName,
      (
        SELECT pb.purchase_rate 
        FROM product_batches pb 
        WHERE pb.product_id = p.id 
        ORDER BY pb.created_at DESC 
        LIMIT 1
      ) AS lastPurchaseRate,
      p.last_purchase_date AS lastPurchaseDate
    FROM products p
    JOIN companies comp ON comp.id = p.company_id
    WHERE p.is_active = 1
      AND p.reorder_level > 0
      AND p.total_stock_on_hand <= p.reorder_level
    ORDER BY deficitQuantity DESC
  `).all() as LowStockAlertRow[];
}

export function getShortExpiryReport(asOfDate: string, daysWindow: number = 90): ShortExpiryRow[] {
  // If daysWindow is 0, fetch already expired items only
  // Otherwise fetch items expiring on or before asOfDate + daysWindow
  let dateCondition = '';
  const params: (string | number)[] = [asOfDate, asOfDate, asOfDate, asOfDate, asOfDate];

  if (daysWindow === 0) {
    dateCondition = `AND pb.expiry_date < ?`;
    params.push(asOfDate);
  } else {
    const cutoffDate = new Date(new Date(asOfDate).getTime() + daysWindow * 86400000)
      .toISOString()
      .split('T')[0];
    dateCondition = `AND pb.expiry_date <= ?`;
    params.push(cutoffDate);
  }

  const query = `
    SELECT 
      p.id AS productId,
      p.code AS productCode,
      p.name AS productName,
      comp.name AS companyName,
      p.packaging,
      pb.id AS batchId,
      pb.batch_no AS batchNo,
      pb.expiry_date AS expiryDate,
      pb.expiry_month_year AS expiryMonthYear,
      pb.stock_qty AS stockQty,
      pb.purchase_rate AS purchaseRate,
      pb.mrp,
      ROUND(pb.stock_qty * pb.purchase_rate, 2) AS totalCostValue,
      ROUND(pb.stock_qty * pb.mrp, 2) AS totalMrpValue,
      CAST(ROUND(JULIANDAY(pb.expiry_date) - JULIANDAY(?)) AS INTEGER) AS daysUntilExpiry,
      CASE 
        WHEN pb.expiry_date < ? THEN 'EXPIRED'
        WHEN JULIANDAY(pb.expiry_date) - JULIANDAY(?) <= 30 THEN 'CRITICAL'
        WHEN JULIANDAY(pb.expiry_date) - JULIANDAY(?) <= 60 THEN 'NEAR_EXPIRY'
        WHEN JULIANDAY(pb.expiry_date) - JULIANDAY(?) <= 90 THEN 'WATCH'
        ELSE 'NORMAL'
      END AS expiryStatus
    FROM product_batches pb
    JOIN products p ON p.id = pb.product_id
    JOIN companies comp ON comp.id = p.company_id
    WHERE pb.is_active = 1 
      AND pb.stock_qty > 0
      ${dateCondition}
    ORDER BY pb.expiry_date ASC, p.name ASC
  `;

  return sqlite.prepare(query).all(...params) as ShortExpiryRow[];
}
