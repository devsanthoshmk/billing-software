/**
 * Milestone 5 Report Domain Contracts (Features F29, F30, F31)
 * Siva Wholesale & Pharmacy ERP
 */

// ----------------------------------------------------
// F29: Daily Sales & Cashier Report Contracts
// ----------------------------------------------------
export interface DailySalesFilter {
  reportDate: string; // ISO 'YYYY-MM-DD'
  operatorId?: string; // 'ALL' or specific operator
  invoiceSeries?: number; // 1, 2, or undefined for ALL
}

export interface DailySalesSummary {
  reportDate: string;
  totalInvoicesCount: number;
  totalGrossSales: number;
  totalLineDiscounts: number;
  totalCashDiscounts: number;
  totalTaxableTurnover: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalTaxCollected: number;
  totalRoundOff: number;
  totalNetSales: number;

  // Payment Breakdown
  cashSalesAmount: number;
  creditSalesAmount: number;
  chequeSalesAmount: number;

  // Returns & Refunds
  returnsCount: number;
  returnsNetAmount: number;
  cashRefundsAmount: number;
  creditNoteReturnsAmount: number;

  // Collections Inflow
  collectionsCount: number;
  totalCollectionsAmount: number;
  cashCollectionsAmount: number;
  chequeCollectionsAmount: number;
  digitalCollectionsAmount: number;

  // Reconciled Drawer Cash
  netCashInDrawer: number; // cashSales + cashCollections - cashRefunds
}

export interface CashierBreakdownRow {
  operatorCode: string;
  billsCount: number;
  grossSales: number;
  cashSales: number;
  creditSales: number;
  chequeSales: number;
  totalNetSales: number;
}

export interface TaxSlabSummaryRow {
  taxCode: string; // '01', '05', '02', '03', '04'
  description: string;
  taxRatePct: number; // 0, 5, 12, 18, 28
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTaxAmount: number;
  totalGrossWithTax: number;
}

export interface BillWiseSalesRow {
  id: string;
  invoiceNo: string;
  invoiceTime: string;
  invoiceSeries: number;
  customerCode: string;
  customerName: string;
  paymentTerms: string; // 'CASH', 'CREDIT', 'CHEQUE'
  itemsCount: number;
  totalQuantity: number;
  subtotalGross: number;
  discountAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTaxAmount: number;
  roundOff: number;
  netAmount: number;
  preparedBy: string;
  status: string;
}

export interface DailySalesReportData {
  summary: DailySalesSummary;
  cashierBreakdown: CashierBreakdownRow[];
  taxSlabSummary: TaxSlabSummaryRow[];
  billWiseRegister: BillWiseSalesRow[];
}

// ----------------------------------------------------
// F30: Stock Ledger & Expiry Contracts
// ----------------------------------------------------
export interface StockValuationSummary {
  asOfDate: string;
  totalActiveProducts: number;
  totalActiveBatches: number;
  totalStockUnits: number;
  totalValuationCost: number; // purchaseRate * qty
  totalValuationSellingRate: number; // sellingRate * qty
  totalValuationMrp: number; // mrp * qty
  potentialGrossProfit: number; // mrpValuation - costValuation
  potentialProfitMarginPct: number;
  totalQuarantineUnits: number;
  quarantineValuationCost: number;
}

export interface StockLedgerRow {
  productId: string;
  productCode: string;
  productName: string;
  companyName: string;
  packaging: string;
  hsnCode: string;
  rackLocation: string | null;
  batchId: string;
  batchNo: string;
  expiryDate: string;
  expiryMonthYear: string | null;
  stockQty: number;
  purchaseRate: number;
  sellingRate: number;
  mrp: number;
  closingValueCost: number;
  closingValueMrp: number;
  taxCode: string;
  taxRatePct: number;
}

export interface LowStockAlertRow {
  productId: string;
  productCode: string;
  productName: string;
  companyName: string;
  packaging: string;
  rackLocation: string | null;
  totalStockOnHand: number;
  reorderLevel: number;
  minOrderQty: number;
  deficitQuantity: number; // reorderLevel - totalStockOnHand
  preferredSupplierName: string | null;
  lastPurchaseRate: number | null;
  lastPurchaseDate: string | null;
}

export interface ShortExpiryRow {
  productId: string;
  productCode: string;
  productName: string;
  companyName: string;
  packaging: string;
  batchId: string;
  batchNo: string;
  expiryDate: string;
  expiryMonthYear: string | null;
  stockQty: number;
  purchaseRate: number;
  mrp: number;
  totalCostValue: number;
  totalMrpValue: number;
  daysUntilExpiry: number;
  expiryStatus: 'EXPIRED' | 'CRITICAL' | 'NEAR_EXPIRY' | 'WATCH' | 'NORMAL';
}

// ----------------------------------------------------
// F31: Statutory GST Reports Contracts
// ----------------------------------------------------
export interface Gstr1B2bInvoiceRow {
  invoiceId: string;
  invoiceNo: string;
  invoiceDate: string;
  customerName: string;
  customerGstin: string;
  posStateCode: string;
  isInterstate: boolean;
  reverseCharge: 'N';
  invoiceType: 'Regular';
  totalInvoiceValue: number;
  taxRatePct: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
}

export interface Gstr1B2cSummaryRow {
  posStateCode: string;
  taxRatePct: number;
  invoicesCount: number;
  grossValue: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalInvoiceValue: number;
}

export interface Gstr1CreditDebitNoteRow {
  returnId: string;
  noteNo: string;
  noteDate: string;
  documentType: 'C' | 'D'; // C = Credit Note, D = Debit Note
  customerName: string;
  customerGstin: string | null;
  partyCategory: 'B2B' | 'B2C';
  originalInvoiceNo: string | null;
  reason: string;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalNoteValue: number;
}

export interface Gstr1HsnSummaryRow {
  hsnCode: string;
  description: string;
  uqc: string;
  totalQuantity: number;
  totalValue: number;
  totalTaxableValue: number;
  taxRatePct: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTaxAmount: number;
}

export interface Gstr3bMonthlySummary {
  periodMonthYear: string; // e.g. '09-2026'

  // Table 3.1: Outward Supplies (Turnover - Returns)
  outwardTaxableTurnover: number;
  outwardCgst: number;
  outwardSgst: number;
  outwardIgst: number;
  totalOutwardTaxLiability: number;

  // Table 4: Eligible Input Tax Credit (ITC) (Purchases - Returns)
  inwardEligibleTurnover: number;
  inputCgstItc: number;
  inputSgstItc: number;
  inputIgstItc: number;
  totalEligibleItc: number;

  // Table 6: Tax Payment / Net Liability
  netCgstPayable: number; // outwardCgst - inputCgstItc (if > 0, cash payable; if < 0, carryforward)
  netSgstPayable: number;
  netIgstPayable: number;
  totalNetTaxPayable: number;

  // Excess Credit Carryforward
  excessItcCarryforward: number;
}
