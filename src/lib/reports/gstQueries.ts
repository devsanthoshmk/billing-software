import { sqlite } from '@/lib/db';
import { 
  Gstr1B2bInvoiceRow, 
  Gstr1B2cSummaryRow, 
  Gstr1CreditDebitNoteRow, 
  Gstr1HsnSummaryRow, 
  Gstr3bMonthlySummary 
} from './types';

export function getGstr1B2bInvoices(startDate: string, endDate: string): Gstr1B2bInvoiceRow[] {
  return sqlite.prepare(`
    SELECT 
      i.id AS invoiceId,
      i.invoice_no AS invoiceNo,
      i.invoice_date AS invoiceDate,
      c.name AS customerName,
      i.customer_gstin AS customerGstin,
      SUBSTR(i.customer_gstin, 1, 2) AS posStateCode,
      i.is_interstate AS isInterstate,
      'N' AS reverseCharge,
      'Regular' AS invoiceType,
      i.net_amount AS totalInvoiceValue,
      (ts.cgst_rate + ts.sgst_rate + ts.igst_rate) AS taxRatePct,
      ROUND(SUM(ii.taxable_amount), 2) AS taxableValue,
      ROUND(SUM(ii.cgst_amount), 2) AS cgstAmount,
      ROUND(SUM(ii.sgst_amount), 2) AS sgstAmount,
      ROUND(SUM(ii.igst_amount), 2) AS igstAmount
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    JOIN invoice_items ii ON ii.invoice_id = i.id
    JOIN tax_slabs ts ON ts.code = ii.tax_code
    WHERE i.invoice_date BETWEEN ? AND ?
      AND i.status != 'CANCELLED'
      AND i.customer_gstin IS NOT NULL 
      AND TRIM(i.customer_gstin) != ''
    GROUP BY i.id, i.invoice_no, i.invoice_date, c.name, i.customer_gstin, i.is_interstate, i.net_amount, (ts.cgst_rate + ts.sgst_rate + ts.igst_rate)
    ORDER BY i.invoice_date ASC, i.invoice_no ASC
  `).all(startDate, endDate) as Gstr1B2bInvoiceRow[];
}

export function getGstr1B2cSummary(startDate: string, endDate: string): Gstr1B2cSummaryRow[] {
  return sqlite.prepare(`
    SELECT 
      CASE WHEN i.is_interstate = 1 THEN SUBSTR(COALESCE(c.gstin, '33'), 1, 2) ELSE '33' END AS posStateCode,
      (ts.cgst_rate + ts.sgst_rate + ts.igst_rate) AS taxRatePct,
      COUNT(DISTINCT i.id) AS invoicesCount,
      ROUND(SUM(ii.gross_amount), 2) AS grossValue,
      ROUND(SUM(ii.taxable_amount), 2) AS taxableValue,
      ROUND(SUM(ii.cgst_amount), 2) AS cgstAmount,
      ROUND(SUM(ii.sgst_amount), 2) AS sgstAmount,
      ROUND(SUM(ii.igst_amount), 2) AS igstAmount,
      ROUND(SUM(ii.net_amount), 2) AS totalInvoiceValue
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    JOIN invoice_items ii ON ii.invoice_id = i.id
    JOIN tax_slabs ts ON ts.code = ii.tax_code
    WHERE i.invoice_date BETWEEN ? AND ?
      AND i.status != 'CANCELLED'
      AND (i.customer_gstin IS NULL OR TRIM(i.customer_gstin) = '')
    GROUP BY posStateCode, (ts.cgst_rate + ts.sgst_rate + ts.igst_rate)
    ORDER BY posStateCode ASC, taxRatePct ASC
  `).all(startDate, endDate) as Gstr1B2cSummaryRow[];
}

export function getGstr1CreditDebitNotes(startDate: string, endDate: string): Gstr1CreditDebitNoteRow[] {
  return sqlite.prepare(`
    SELECT 
      sr.id AS returnId,
      sr.return_no AS noteNo,
      sr.return_date AS noteDate,
      'C' AS documentType,
      c.name AS customerName,
      c.gstin AS customerGstin,
      CASE WHEN c.gstin IS NOT NULL AND TRIM(c.gstin) != '' THEN 'B2B' ELSE 'B2C' END AS partyCategory,
      sr.original_invoice_no AS originalInvoiceNo,
      sr.reason,
      ROUND(sr.taxable_amount, 2) AS taxableAmount,
      ROUND(sr.cgst_amount, 2) AS cgstAmount,
      ROUND(sr.sgst_amount, 2) AS sgstAmount,
      ROUND(sr.igst_amount, 2) AS igstAmount,
      ROUND(sr.net_amount, 2) AS totalNoteValue
    FROM sales_returns sr
    JOIN customers c ON c.id = sr.customer_id
    WHERE sr.return_date BETWEEN ? AND ?
      AND sr.is_cancelled = 0
    ORDER BY sr.return_date ASC, sr.return_no ASC
  `).all(startDate, endDate) as Gstr1CreditDebitNoteRow[];
}

export function getGstr1HsnSummary(startDate: string, endDate: string): Gstr1HsnSummaryRow[] {
  return sqlite.prepare(`
    SELECT 
      ii.hsn_code AS hsnCode,
      MIN(p.name) AS description,
      COALESCE(MIN(p.uqc), 'BOX') AS uqc,
      SUM(ii.quantity + ii.free_quantity) AS totalQuantity,
      ROUND(SUM(ii.gross_amount), 2) AS totalValue,
      ROUND(SUM(ii.taxable_amount), 2) AS totalTaxableValue,
      (ts.cgst_rate + ts.sgst_rate + ts.igst_rate) AS taxRatePct,
      ROUND(SUM(ii.cgst_amount), 2) AS cgstAmount,
      ROUND(SUM(ii.sgst_amount), 2) AS sgstAmount,
      ROUND(SUM(ii.igst_amount), 2) AS igstAmount,
      ROUND(SUM(ii.cgst_amount + ii.sgst_amount + ii.igst_amount), 2) AS totalTaxAmount
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    JOIN products p ON p.id = ii.product_id
    JOIN tax_slabs ts ON ts.code = ii.tax_code
    WHERE i.invoice_date BETWEEN ? AND ?
      AND i.status != 'CANCELLED'
    GROUP BY ii.hsn_code, (ts.cgst_rate + ts.sgst_rate + ts.igst_rate)
    ORDER BY ii.hsn_code ASC, taxRatePct ASC
  `).all(startDate, endDate) as Gstr1HsnSummaryRow[];
}

export function getGstr3bMonthlySummary(startDate: string, endDate: string, period: string): Gstr3bMonthlySummary {
  const row = sqlite.prepare(`
    WITH OutwardSales AS (
      SELECT 
        COALESCE(SUM(i.taxable_amount), 0) AS salesTaxable,
        COALESCE(SUM(i.cgst_amount), 0) AS salesCgst,
        COALESCE(SUM(i.sgst_amount), 0) AS salesSgst,
        COALESCE(SUM(i.igst_amount), 0) AS salesIgst,
        COALESCE(SUM(i.total_tax_amount), 0) AS salesTotalTax
      FROM invoices i
      WHERE i.invoice_date BETWEEN ? AND ?
        AND i.status != 'CANCELLED'
    ),
    SalesCreditNotes AS (
      SELECT 
        COALESCE(SUM(sr.taxable_amount), 0) AS sretTaxable,
        COALESCE(SUM(sr.cgst_amount), 0) AS sretCgst,
        COALESCE(SUM(sr.sgst_amount), 0) AS sretSgst,
        COALESCE(SUM(sr.igst_amount), 0) AS sretIgst,
        COALESCE(SUM(sr.cgst_amount + sr.sgst_amount + sr.igst_amount), 0) AS sretTotalTax
      FROM sales_returns sr
      WHERE sr.return_date BETWEEN ? AND ?
        AND sr.is_cancelled = 0
    ),
    InwardPurchases AS (
      SELECT 
        COALESCE(SUM(p.taxable_amount), 0) AS purTaxable,
        COALESCE(SUM(p.cgst_amount), 0) AS purCgst,
        COALESCE(SUM(p.sgst_amount), 0) AS purSgst,
        COALESCE(SUM(p.igst_amount), 0) AS purIgst,
        COALESCE(SUM(p.total_tax_amount), 0) AS purTotalTax
      FROM purchases p
      WHERE p.inward_date BETWEEN ? AND ?
        AND p.status != 'CANCELLED'
    ),
    PurchaseDebitNotes AS (
      SELECT 
        COALESCE(SUM(pr.taxable_amount), 0) AS pretTaxable,
        COALESCE(SUM(pr.cgst_amount), 0) AS pretCgst,
        COALESCE(SUM(pr.sgst_amount), 0) AS pretSgst,
        COALESCE(SUM(pr.igst_amount), 0) AS pretIgst,
        COALESCE(SUM(pr.cgst_amount + pr.sgst_amount + pr.igst_amount), 0) AS pretTotalTax
      FROM purchase_returns pr
      WHERE pr.return_date BETWEEN ? AND ?
        AND pr.is_cancelled = 0
    )
    SELECT 
      (s.salesTaxable - sc.sretTaxable) AS netOutwardTaxable,
      (s.salesCgst - sc.sretCgst) AS netOutputCgst,
      (s.salesSgst - sc.sretSgst) AS netOutputSgst,
      (s.salesIgst - sc.sretIgst) AS netOutputIgst,
      (s.salesTotalTax - sc.sretTotalTax) AS totalOutputTaxLiability,
      (p.purTaxable - pr.pretTaxable) AS netInwardTaxable,
      (p.purCgst - pr.pretCgst) AS netInputCgstItc,
      (p.purSgst - pr.pretSgst) AS netInputSgstItc,
      (p.purIgst - pr.pretIgst) AS netInputIgstItc,
      (p.purTotalTax - pr.pretTotalTax) AS totalEligibleItc
    FROM OutwardSales s
    CROSS JOIN SalesCreditNotes sc
    CROSS JOIN InwardPurchases p
    CROSS JOIN PurchaseDebitNotes pr
  `).get(startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate) as any;

  const outwardTaxable = Number((Number(row?.netOutwardTaxable || 0)).toFixed(2));
  const outwardCgst = Number((Number(row?.netOutputCgst || 0)).toFixed(2));
  const outwardSgst = Number((Number(row?.netOutputSgst || 0)).toFixed(2));
  const outwardIgst = Number((Number(row?.netOutputIgst || 0)).toFixed(2));
  const totalOutwardTax = Number((Number(row?.totalOutputTaxLiability || 0)).toFixed(2));

  const inwardTaxable = Number((Number(row?.netInwardTaxable || 0)).toFixed(2));
  const inputCgst = Number((Number(row?.netInputCgstItc || 0)).toFixed(2));
  const inputSgst = Number((Number(row?.netInputSgstItc || 0)).toFixed(2));
  const inputIgst = Number((Number(row?.netInputIgstItc || 0)).toFixed(2));
  const totalEligibleItc = Number((Number(row?.totalEligibleItc || 0)).toFixed(2));

  const netCgst = Number((outwardCgst - inputCgst).toFixed(2));
  const netSgst = Number((outwardSgst - inputSgst).toFixed(2));
  const netIgst = Number((outwardIgst - inputIgst).toFixed(2));
  const totalNet = Number((totalOutwardTax - totalEligibleItc).toFixed(2));

  return {
    periodMonthYear: period,
    outwardTaxableTurnover: outwardTaxable,
    outwardCgst,
    outwardSgst,
    outwardIgst,
    totalOutwardTaxLiability: totalOutwardTax,
    inwardEligibleTurnover: inwardTaxable,
    inputCgstItc: inputCgst,
    inputSgstItc: inputSgst,
    inputIgstItc: inputIgst,
    totalEligibleItc,
    netCgstPayable: netCgst > 0 ? netCgst : 0,
    netSgstPayable: netSgst > 0 ? netSgst : 0,
    netIgstPayable: netIgst > 0 ? netIgst : 0,
    totalNetTaxPayable: totalNet > 0 ? totalNet : 0,
    excessItcCarryforward: totalNet < 0 ? Math.abs(totalNet) : 0,
  };
}
