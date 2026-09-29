import { sqlite } from '@/lib/db';
import { DailySalesFilter, DailySalesReportData } from './types';

export function getDailySalesReport(filter: DailySalesFilter): DailySalesReportData {
  const { reportDate, operatorId, invoiceSeries } = filter;

  // 1. Executive Summary & Payments
  let summaryQuery = `
    SELECT 
      COUNT(i.id) AS total_invoices_count,
      COALESCE(SUM(i.subtotal_gross), 0) AS total_gross_sales,
      COALESCE(SUM(i.total_line_discount + i.cash_discount_amount), 0) AS total_discounts,
      COALESCE(SUM(i.total_line_discount), 0) AS total_line_discounts,
      COALESCE(SUM(i.cash_discount_amount), 0) AS total_cash_discounts,
      COALESCE(SUM(i.taxable_amount), 0) AS total_taxable_turnover,
      COALESCE(SUM(i.cgst_amount), 0) AS total_cgst,
      COALESCE(SUM(i.sgst_amount), 0) AS total_sgst,
      COALESCE(SUM(i.igst_amount), 0) AS total_igst,
      COALESCE(SUM(i.total_tax_amount), 0) AS total_tax_collected,
      COALESCE(SUM(i.round_off), 0) AS total_round_off,
      COALESCE(SUM(i.net_amount), 0) AS total_net_sales,
      COALESCE(SUM(CASE WHEN i.payment_terms = 'CASH' THEN i.net_amount ELSE 0 END), 0) AS cash_sales_amount,
      COALESCE(SUM(CASE WHEN i.payment_terms = 'CREDIT' THEN i.net_amount ELSE 0 END), 0) AS credit_sales_amount,
      COALESCE(SUM(CASE WHEN i.payment_terms = 'CHEQUE' THEN i.net_amount ELSE 0 END), 0) AS cheque_sales_amount
    FROM invoices i
    WHERE i.invoice_date = ?
      AND i.status != 'CANCELLED'
  `;
  const summaryParams: (string | number)[] = [reportDate];
  if (invoiceSeries) {
    summaryQuery += ` AND i.invoice_series = ?`;
    summaryParams.push(invoiceSeries);
  }

  const summaryRaw = sqlite.prepare(summaryQuery).get(...summaryParams) as any;

  // 2. Returns & Refunds
  const returnsRaw = sqlite.prepare(`
    SELECT 
      COUNT(sr.id) AS returns_count,
      COALESCE(SUM(sr.net_amount), 0) AS returns_net_amount,
      COALESCE(SUM(CASE WHEN sr.return_type = 'CASH_REFUND' THEN sr.net_amount ELSE 0 END), 0) AS cash_refunds_amount,
      COALESCE(SUM(CASE WHEN sr.return_type = 'CREDIT_NOTE' THEN sr.net_amount ELSE 0 END), 0) AS credit_note_returns_amount
    FROM sales_returns sr
    WHERE sr.return_date = ?
      AND sr.is_cancelled = 0
  `).get(reportDate) as any;

  // 3. Collections Received Today
  const collectionsRaw = sqlite.prepare(`
    SELECT 
      COUNT(cr.id) AS collections_count,
      COALESCE(SUM(cr.total_amount), 0) AS total_collections_amount,
      COALESCE(SUM(CASE WHEN cr.payment_mode = 'CASH' THEN cr.total_amount ELSE 0 END), 0) AS cash_collections_amount,
      COALESCE(SUM(CASE WHEN cr.payment_mode = 'CHEQUE' THEN cr.total_amount ELSE 0 END), 0) AS cheque_collections_amount,
      COALESCE(SUM(CASE WHEN cr.payment_mode IN ('NEFT_RTGS', 'UPI') THEN cr.total_amount ELSE 0 END), 0) AS digital_collections_amount
    FROM customer_receipts cr
    WHERE cr.receipt_date = ?
  `).get(reportDate) as any;

  const cashSales = Number(summaryRaw?.cash_sales_amount || 0);
  const cashCollections = Number(collectionsRaw?.cash_collections_amount || 0);
  const cashRefunds = Number(returnsRaw?.cash_refunds_amount || 0);
  const netCashInDrawer = Number((cashSales + cashCollections - cashRefunds).toFixed(2));

  // 4. Cashier Breakdown
  const cashierQuery = `
    SELECT 
      COALESCE(al.user_id, 'ADMIN') AS operatorCode,
      COUNT(DISTINCT i.id) AS billsCount,
      COALESCE(SUM(i.subtotal_gross), 0) AS grossSales,
      COALESCE(SUM(CASE WHEN i.payment_terms = 'CASH' THEN i.net_amount ELSE 0 END), 0) AS cashSales,
      COALESCE(SUM(CASE WHEN i.payment_terms = 'CREDIT' THEN i.net_amount ELSE 0 END), 0) AS creditSales,
      COALESCE(SUM(CASE WHEN i.payment_terms = 'CHEQUE' THEN i.net_amount ELSE 0 END), 0) AS chequeSales,
      COALESCE(SUM(i.net_amount), 0) AS totalNetSales
    FROM invoices i
    LEFT JOIN audit_logs al 
      ON al.entity_id = i.id 
      AND al.action IN ('SALES_INVOICE_CREATE', 'INVOICE_CREATE')
    WHERE i.invoice_date = ?
      AND i.status != 'CANCELLED'
      ${invoiceSeries ? 'AND i.invoice_series = ?' : ''}
    GROUP BY operatorCode
    ORDER BY operatorCode ASC
  `;
  const cashierParams: (string | number)[] = [reportDate];
  if (invoiceSeries) cashierParams.push(invoiceSeries);
  const cashierBreakdown = sqlite.prepare(cashierQuery).all(...cashierParams) as any[];

  // 5. Statutory Tax Summary by Slab (0%, 5%, 12%, 18%, 28%)
  const taxSlabQuery = `
    SELECT 
      ts.code AS taxCode,
      ts.description AS description,
      (ts.cgst_rate + ts.sgst_rate + ts.igst_rate) AS taxRatePct,
      COALESCE(SUM(ii.taxable_amount), 0) AS taxableAmount,
      COALESCE(SUM(ii.cgst_amount), 0) AS cgstAmount,
      COALESCE(SUM(ii.sgst_amount), 0) AS sgstAmount,
      COALESCE(SUM(ii.igst_amount), 0) AS igstAmount,
      COALESCE(SUM(ii.cgst_amount + ii.sgst_amount + ii.igst_amount), 0) AS totalTaxAmount,
      COALESCE(SUM(ii.net_amount), 0) AS totalGrossWithTax
    FROM tax_slabs ts
    LEFT JOIN invoice_items ii ON ii.tax_code = ts.code
    LEFT JOIN invoices i ON i.id = ii.invoice_id AND i.invoice_date = ? AND i.status != 'CANCELLED'
      ${invoiceSeries ? 'AND i.invoice_series = ' + Number(invoiceSeries) : ''}
    GROUP BY ts.code, ts.description, ts.cgst_rate, ts.sgst_rate, ts.igst_rate
    ORDER BY (ts.cgst_rate + ts.sgst_rate + ts.igst_rate) ASC
  `;
  const taxSlabSummary = sqlite.prepare(taxSlabQuery).all(reportDate) as any[];

  // 6. Detailed Bill-Wise Register
  let registerQuery = `
    SELECT 
      i.id,
      i.invoice_no AS invoiceNo,
      i.invoice_time AS invoiceTime,
      i.invoice_series AS invoiceSeries,
      c.code AS customerCode,
      c.name AS customerName,
      i.payment_terms AS paymentTerms,
      i.total_items_count AS itemsCount,
      i.total_quantity AS totalQuantity,
      i.subtotal_gross AS subtotalGross,
      (i.total_line_discount + i.cash_discount_amount) AS discountAmount,
      i.taxable_amount AS taxableAmount,
      i.cgst_amount AS cgstAmount,
      i.sgst_amount AS sgstAmount,
      i.igst_amount AS igstAmount,
      i.total_tax_amount AS totalTaxAmount,
      i.round_off AS roundOff,
      i.net_amount AS netAmount,
      COALESCE(al.user_id, 'ADMIN') AS preparedBy,
      i.status
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    LEFT JOIN audit_logs al ON al.entity_id = i.id AND al.action IN ('SALES_INVOICE_CREATE', 'INVOICE_CREATE')
    WHERE i.invoice_date = ?
      AND i.status != 'CANCELLED'
  `;

  const regParams: (string | number)[] = [reportDate];
  if (operatorId && operatorId !== 'ALL') {
    registerQuery += ` AND COALESCE(al.user_id, 'ADMIN') = ?`;
    regParams.push(operatorId);
  }
  if (invoiceSeries) {
    registerQuery += ` AND i.invoice_series = ?`;
    regParams.push(invoiceSeries);
  }
  registerQuery += ` ORDER BY i.invoice_no ASC`;

  const billWiseRegister = sqlite.prepare(registerQuery).all(...regParams) as any[];

  return {
    summary: {
      reportDate,
      totalInvoicesCount: Number(summaryRaw?.total_invoices_count || 0),
      totalGrossSales: Number(summaryRaw?.total_gross_sales || 0),
      totalLineDiscounts: Number(summaryRaw?.total_line_discounts || 0),
      totalCashDiscounts: Number(summaryRaw?.total_cash_discounts || 0),
      totalTaxableTurnover: Number(summaryRaw?.total_taxable_turnover || 0),
      totalCgst: Number(summaryRaw?.total_cgst || 0),
      totalSgst: Number(summaryRaw?.total_sgst || 0),
      totalIgst: Number(summaryRaw?.total_igst || 0),
      totalTaxCollected: Number(summaryRaw?.total_tax_collected || 0),
      totalRoundOff: Number(summaryRaw?.total_round_off || 0),
      totalNetSales: Number(summaryRaw?.total_net_sales || 0),
      cashSalesAmount: cashSales,
      creditSalesAmount: Number(summaryRaw?.credit_sales_amount || 0),
      chequeSalesAmount: Number(summaryRaw?.cheque_sales_amount || 0),
      returnsCount: Number(returnsRaw?.returns_count || 0),
      returnsNetAmount: Number(returnsRaw?.returns_net_amount || 0),
      cashRefundsAmount: cashRefunds,
      creditNoteReturnsAmount: Number(returnsRaw?.credit_note_returns_amount || 0),
      collectionsCount: Number(collectionsRaw?.collections_count || 0),
      totalCollectionsAmount: Number(collectionsRaw?.total_collections_amount || 0),
      cashCollectionsAmount: cashCollections,
      chequeCollectionsAmount: Number(collectionsRaw?.cheque_collections_amount || 0),
      digitalCollectionsAmount: Number(collectionsRaw?.digital_collections_amount || 0),
      netCashInDrawer,
    },
    cashierBreakdown,
    taxSlabSummary,
    billWiseRegister,
  };
}
