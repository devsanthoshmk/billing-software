'use server';

import { db, sqlite } from '@/lib/db';
import { dayEndClosings, systemConfig, auditLogs, systemControls, DayEndClosing } from '@/lib/db/schema/system';
import { invoices, purchases, salesReturns } from '@/lib/db/schema/transactions';
import { customerReceipts, supplierPayments } from '@/lib/db/schema/ledgers';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';

export interface DayEndAuditPreviewResult {
  date: string;
  isAlreadyClosed: boolean;
  unfinalizedDraftsCount: number;
  draftInvoiceNumbers: string[];

  // Sales Breakdown
  invoicesCount: number;
  grossSales: number;
  netSales: number;
  taxCollected: number;
  cashSales: number;
  creditSales: number;
  chequeSales: number;
  taxBySlabs: { slabCode: string; description: string; ratePct: number; taxable: number; tax: number }[];

  // Returns & Purchases
  returnsCount: number;
  returnsAmount: number;
  cashRefundsAmount: number;
  purchasesCount: number;
  purchasesAmount: number;

  // Collections & Payments
  collectionsCash: number;
  collectionsCheque: number;
  collectionsBank: number;
  paymentsCash: number;
  paymentsCheque: number;
  paymentsBank: number;

  // Cash Drawer Balance
  openingCashBalance: number;
  expectedCashBalance: number;
  proposedNextWorkingDate: string;
}

export interface ExecuteDayEndInput {
  closingDate: string;
  physicalCashCount: number;
  denominationCounts?: Record<string, number>;
  nextWorkingDate: string;
  closedByUser?: string;
  remarks?: string;
  supervisorPassword?: string;
}

export async function checkDateIsClosed(date: string): Promise<{ isClosed: boolean; closedAt?: string }> {
  const row = sqlite.prepare(`
    SELECT closing_date, closed_at FROM day_end_closings WHERE closing_date = ?
  `).get(date) as { closing_date: string; closed_at: string } | undefined;

  if (row) {
    return { isClosed: true, closedAt: row.closed_at };
  }
  return { isClosed: false };
}

export async function getDayEndAuditPreview(date?: string): Promise<DayEndAuditPreviewResult> {
  const config = sqlite.prepare('SELECT current_working_date FROM system_config WHERE id = ?').get('default') as any;
  const targetDate = date || config?.current_working_date || '2026-09-28';

  // 1. Check if closed
  const closedCheck = await checkDateIsClosed(targetDate);

  // 2. Draft invoices check
  const draftRows = sqlite.prepare(`
    SELECT invoice_no FROM invoices 
    WHERE invoice_date = ? AND status = 'DRAFT'
  `).all(targetDate) as { invoice_no: string }[];

  // 3. Sales aggregation
  const salesRow = sqlite.prepare(`
    SELECT 
      COUNT(id) AS invoices_count,
      COALESCE(SUM(subtotal_gross), 0) AS gross_sales,
      COALESCE(SUM(net_amount), 0) AS net_sales,
      COALESCE(SUM(total_tax_amount), 0) AS tax_collected,
      COALESCE(SUM(CASE WHEN payment_terms = 'CASH' THEN net_amount ELSE 0 END), 0) AS cash_sales,
      COALESCE(SUM(CASE WHEN payment_terms = 'CREDIT' THEN net_amount ELSE 0 END), 0) AS credit_sales,
      COALESCE(SUM(CASE WHEN payment_terms = 'CHEQUE' THEN net_amount ELSE 0 END), 0) AS cheque_sales
    FROM invoices
    WHERE invoice_date = ? AND status != 'CANCELLED'
  `).get(targetDate) as any;

  // 4. Tax slabs breakdown
  const taxSlabRows = sqlite.prepare(`
    SELECT 
      ts.code AS slabCode,
      ts.description,
      (ts.cgst_rate + ts.sgst_rate + ts.igst_rate) AS ratePct,
      COALESCE(SUM(ii.taxable_amount), 0) AS taxable,
      COALESCE(SUM(ii.cgst_amount + ii.sgst_amount + ii.igst_amount), 0) AS tax
    FROM tax_slabs ts
    LEFT JOIN invoice_items ii ON ii.tax_code = ts.code
    LEFT JOIN invoices i ON i.id = ii.invoice_id AND i.invoice_date = ? AND i.status != 'CANCELLED'
    GROUP BY ts.code, ts.description, ratePct
    ORDER BY ratePct ASC
  `).all(targetDate) as any[];

  // 5. Sales Returns
  const returnsRow = sqlite.prepare(`
    SELECT 
      COUNT(id) AS returns_count,
      COALESCE(SUM(net_amount), 0) AS returns_amount,
      COALESCE(SUM(CASE WHEN return_type = 'CASH_REFUND' THEN net_amount ELSE 0 END), 0) AS cash_refunds
    FROM sales_returns
    WHERE return_date = ? AND is_cancelled = 0
  `).get(targetDate) as any;

  // 6. Purchases Inward
  const purchasesRow = sqlite.prepare(`
    SELECT 
      COUNT(id) AS purchases_count,
      COALESCE(SUM(net_amount), 0) AS purchases_amount
    FROM purchases
    WHERE inward_date = ? AND status != 'CANCELLED'
  `).get(targetDate) as any;

  // 7. Customer Collections
  const collectionsRow = sqlite.prepare(`
    SELECT 
      COALESCE(SUM(CASE WHEN payment_mode = 'CASH' THEN total_amount ELSE 0 END), 0) AS cash_coll,
      COALESCE(SUM(CASE WHEN payment_mode = 'CHEQUE' THEN total_amount ELSE 0 END), 0) AS chq_coll,
      COALESCE(SUM(CASE WHEN payment_mode IN ('NEFT_RTGS', 'UPI') THEN total_amount ELSE 0 END), 0) AS bank_coll
    FROM customer_receipts
    WHERE receipt_date = ?
  `).get(targetDate) as any;

  // 8. Supplier Payments
  const paymentsRow = sqlite.prepare(`
    SELECT 
      COALESCE(SUM(CASE WHEN payment_mode = 'CASH' THEN total_amount ELSE 0 END), 0) AS cash_pmt,
      COALESCE(SUM(CASE WHEN payment_mode = 'CHEQUE' THEN total_amount ELSE 0 END), 0) AS chq_pmt,
      COALESCE(SUM(CASE WHEN payment_mode IN ('NEFT_RTGS', 'UPI', 'DD') THEN total_amount ELSE 0 END), 0) AS bank_pmt
    FROM supplier_payments
    WHERE payment_date = ?
  `).get(targetDate) as any;

  // 9. Opening cash balance from prior day closing
  const prevClosing = sqlite.prepare(`
    SELECT closing_cash_balance FROM day_end_closings
    WHERE closing_date < ?
    ORDER BY closing_date DESC LIMIT 1
  `).get(targetDate) as { closing_cash_balance?: number } | undefined;

  const openingCash = Number(prevClosing?.closing_cash_balance || 0);
  const cashSales = Number(salesRow?.cash_sales || 0);
  const collCash = Number(collectionsRow?.cash_coll || 0);
  const pmtCash = Number(paymentsRow?.cash_pmt || 0);
  const cashRefunds = Number(returnsRow?.cash_refunds || 0);

  // FoxPro cash reconciliation formula:
  // Expected = Opening + Cash Sales + Cash Collections - Cash Payments - Cash Refunds
  const expectedCash = Number((openingCash + cashSales + collCash - pmtCash - cashRefunds).toFixed(2));

  // Compute next day
  const nextDateObj = new Date(new Date(targetDate).getTime() + 86400000);
  const proposedNextWorkingDate = nextDateObj.toISOString().split('T')[0];

  return {
    date: targetDate,
    isAlreadyClosed: closedCheck.isClosed,
    unfinalizedDraftsCount: draftRows.length,
    draftInvoiceNumbers: draftRows.map(r => r.invoice_no),
    invoicesCount: Number(salesRow?.invoices_count || 0),
    grossSales: Number(salesRow?.gross_sales || 0),
    netSales: Number(salesRow?.net_sales || 0),
    taxCollected: Number(salesRow?.tax_collected || 0),
    cashSales,
    creditSales: Number(salesRow?.credit_sales || 0),
    chequeSales: Number(salesRow?.cheque_sales || 0),
    taxBySlabs: taxSlabRows.map(r => ({
      slabCode: r.slabCode,
      description: r.description,
      ratePct: Number(r.ratePct || 0),
      taxable: Number(r.taxable || 0),
      tax: Number(r.tax || 0),
    })),
    returnsCount: Number(returnsRow?.returns_count || 0),
    returnsAmount: Number(returnsRow?.returns_amount || 0),
    cashRefundsAmount: cashRefunds,
    purchasesCount: Number(purchasesRow?.purchases_count || 0),
    purchasesAmount: Number(purchasesRow?.purchases_amount || 0),
    collectionsCash: collCash,
    collectionsCheque: Number(collectionsRow?.chq_coll || 0),
    collectionsBank: Number(collectionsRow?.bank_coll || 0),
    paymentsCash: pmtCash,
    paymentsCheque: Number(paymentsRow?.chq_pmt || 0),
    paymentsBank: Number(paymentsRow?.bank_pmt || 0),
    openingCashBalance: openingCash,
    expectedCashBalance: expectedCash,
    proposedNextWorkingDate,
  };
}

export async function executeDayEndClosing(
  input: ExecuteDayEndInput
): Promise<{ success: boolean; closingId?: string; error?: string }> {
  try {
    const preview = await getDayEndAuditPreview(input.closingDate);

    if (preview.isAlreadyClosed) {
      return { success: false, error: `Business date ${input.closingDate} has already been closed.` };
    }

    // Check drafts
    if (preview.unfinalizedDraftsCount > 0) {
      if (input.supervisorPassword !== 'SPM') {
        return {
          success: false,
          error: `Cannot close day: ${preview.unfinalizedDraftsCount} unfinalized draft invoice(s) exist [${preview.draftInvoiceNumbers.join(', ')}]. Supervisor override required.`,
        };
      }
    }

    const variance = Number((input.physicalCashCount - preview.expectedCashBalance).toFixed(2));
    if (variance !== 0) {
      if (!input.supervisorPassword || input.supervisorPassword !== 'SPM') {
        return {
          success: false,
          error: `Cash drawer variance detected: Rs. ${variance} (Physical: ${input.physicalCashCount}, Expected: ${preview.expectedCashBalance}). Supervisor authorization password required to close with variance.`,
        };
      }
    }

    const closingId = crypto.randomUUID();
    const closedAt = new Date().toISOString();
    const denominationStr = input.denominationCounts ? JSON.stringify(input.denominationCounts) : null;

    db.transaction((tx) => {
      // 1. Insert closing register row
      tx.insert(dayEndClosings).values({
        id: closingId,
        closingDate: input.closingDate,
        closedAt,
        closedByUser: input.closedByUser || 'ADMIN',
        totalInvoicesCount: preview.invoicesCount,
        totalSalesGross: preview.grossSales,
        totalSalesNet: preview.netSales,
        totalTaxCollected: preview.taxCollected,
        cashSalesAmount: preview.cashSales,
        creditSalesAmount: preview.creditSales,
        chequeSalesAmount: preview.chequeSales,
        totalReturnsCount: preview.returnsCount,
        totalReturnsAmount: preview.returnsAmount,
        totalPurchasesCount: preview.purchasesCount,
        totalPurchasesAmount: preview.purchasesAmount,
        totalCollectionsCash: preview.collectionsCash,
        totalCollectionsCheque: preview.collectionsCheque,
        totalCollectionsBank: preview.collectionsBank,
        totalPaymentsCash: preview.paymentsCash,
        totalPaymentsCheque: preview.paymentsCheque,
        totalPaymentsBank: preview.paymentsBank,
        openingCashBalance: preview.openingCashBalance,
        closingCashBalance: preview.expectedCashBalance,
        physicalCashCount: input.physicalCashCount,
        cashDifference: variance,
        denominationBreakdown: denominationStr,
        nextWorkingDate: input.nextWorkingDate,
        isVerified: true,
        remarks: input.remarks || null,
      }).run();

      // 2. Lock transactions for that date
      tx.update(invoices)
        .set({ dayEndLocked: true })
        .where(eq(invoices.invoiceDate, input.closingDate))
        .run();

      tx.update(purchases)
        .set({ dayEndLocked: true })
        .where(eq(purchases.inwardDate, input.closingDate))
        .run();

      tx.update(salesReturns)
        .set({ dayEndLocked: true })
        .where(eq(salesReturns.returnDate, input.closingDate))
        .run();

      tx.update(customerReceipts)
        .set({ dayEndLocked: true })
        .where(eq(customerReceipts.receiptDate, input.closingDate))
        .run();

      tx.update(supplierPayments)
        .set({ dayEndLocked: true })
        .where(eq(supplierPayments.paymentDate, input.closingDate))
        .run();

      // 3. Advance system business working date
      tx.update(systemConfig)
        .set({ currentWorkingDate: input.nextWorkingDate })
        .where(eq(systemConfig.id, 'default'))
        .run();

      // 4. Audit Log
      tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        userId: input.closedByUser || 'ADMIN',
        action: 'DAY_END_CLOSE',
        entityType: 'day_end',
        entityId: closingId,
        remarks: `Day-end closing completed for ${input.closingDate}. Next working date: ${input.nextWorkingDate}. Cash variance: Rs. ${variance}`,
      }).run();
    });

    return {
      success: true,
      closingId,
    };
  } catch (err: any) {
    console.error('Error executing day-end closing:', err);
    return {
      success: false,
      error: err.message || 'Failed to execute day-end closing',
    };
  }
}

export async function getDayEndClosingHistory(): Promise<DayEndClosing[]> {
  return sqlite.prepare(`
    SELECT * FROM day_end_closings ORDER BY closing_date DESC LIMIT 30
  `).all() as DayEndClosing[];
}
