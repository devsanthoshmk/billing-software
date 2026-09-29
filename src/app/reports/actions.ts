'use server';

import { sqlite } from '@/lib/db';
import {
  DailySalesFilter,
  DailySalesReportData,
  StockValuationSummary,
  StockLedgerRow,
  LowStockAlertRow,
  ShortExpiryRow,
  Gstr1B2bInvoiceRow,
  Gstr1B2cSummaryRow,
  Gstr1CreditDebitNoteRow,
  Gstr1HsnSummaryRow,
  Gstr3bMonthlySummary,
  getDailySalesReport,
  getStockValuationSummary,
  getStockLedger,
  getLowStockReorderAlerts,
  getShortExpiryReport,
  getGstr1B2bInvoices,
  getGstr1B2cSummary,
  getGstr1CreditDebitNotes,
  getGstr1HsnSummary,
  getGstr3bMonthlySummary,
} from '@/lib/reports';

export async function fetchDailySalesReport(filter: DailySalesFilter): Promise<DailySalesReportData> {
  return getDailySalesReport(filter);
}

export async function fetchStockValuationSummary(asOfDate: string): Promise<StockValuationSummary> {
  return getStockValuationSummary(asOfDate);
}

export async function fetchStockLedger(companyId?: string): Promise<StockLedgerRow[]> {
  return getStockLedger(companyId);
}

export async function fetchLowStockAlerts(): Promise<LowStockAlertRow[]> {
  return getLowStockReorderAlerts();
}

export async function fetchShortExpiryReport(asOfDate: string, daysWindow: number = 90): Promise<ShortExpiryRow[]> {
  return getShortExpiryReport(asOfDate, daysWindow);
}

export async function fetchGstr1B2b(startDate: string, endDate: string): Promise<Gstr1B2bInvoiceRow[]> {
  return getGstr1B2bInvoices(startDate, endDate);
}

export async function fetchGstr1B2c(startDate: string, endDate: string): Promise<Gstr1B2cSummaryRow[]> {
  return getGstr1B2cSummary(startDate, endDate);
}

export async function fetchGstr1Notes(startDate: string, endDate: string): Promise<Gstr1CreditDebitNoteRow[]> {
  return getGstr1CreditDebitNotes(startDate, endDate);
}

export async function fetchGstr1Hsn(startDate: string, endDate: string): Promise<Gstr1HsnSummaryRow[]> {
  return getGstr1HsnSummary(startDate, endDate);
}

export async function fetchGstr3bSummary(startDate: string, endDate: string, period: string): Promise<Gstr3bMonthlySummary> {
  return getGstr3bMonthlySummary(startDate, endDate, period);
}

export async function getCompaniesList(): Promise<{ id: string; code: string; name: string }[]> {
  return sqlite.prepare('SELECT id, code, name FROM companies ORDER BY name ASC').all() as any[];
}
