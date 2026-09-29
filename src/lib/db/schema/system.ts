import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * 1. Global System Configuration (Counterpart: HFILE.DAT & MMENU.PRG)
 * Holds company profile, statutory license numbers, sequential series counters, and global parameters.
 */
export const systemConfig = sqliteTable('system_config', {
  id: text('id').primaryKey().default('default'), // Singleton row ('default')
  
  // Company Profile & Header Printing
  companyName: text('company_name').notNull().default('SIVA PHARMACEUTICAL DISTRIBUTORS'), // COMPNAME
  tradeName: text('trade_name').notNull().default('WHOLESALE SOFTWARE'), // COMPNAM1
  addressLine1: text('address_line1').notNull().default('WHOLESALE ADDRESS,PLACE.'), // COMPADD2
  addressLine2: text('address_line2').default('HOSPITAL ROAD'),
  addressLine3: text('address_line3').default(''),
  addressLine4: text('address_line4').default(''),
  pincode: text('pincode').default('600001'),
  phone: text('phone').default('044-28282828'), // COMPHONE
  email: text('email').default('info@sivapharma.com'),
  
  // Statutory Licensing & GST
  gstin: text('gstin').notNull().default('33AAAAA0000A1Z5'), // COMPTNG4
  pan: text('pan').default('AAAAA0000A'),
  dlNo20b: text('dl_no_20b').notNull().default('TN/CHE/20B/12345'), // Wholesale Drugs Form 20B
  dlNo21b: text('dl_no_21b').notNull().default('TN/CHE/21B/12346'), // Wholesale Drugs Form 21B
  fssaiNo: text('fssai_no').default('10019042000001'),
  stateName: text('state_name').notNull().default('Tamil Nadu'),
  stateCode: text('state_code').notNull().default('33'), // Indian GST State Code (33 = Tamil Nadu)
  
  // Active Working Session State (SYSDT)
  currentWorkingDate: text('current_working_date').notNull().default('2026-09-28'),
  
  // Sequential Transaction Series Counters (from HFILE.DAT)
  nextInvoiceNoSeries1: integer('next_invoice_no_series1').notNull().default(1001), // N_INVNO1
  nextInvoiceNoSeries2: integer('next_invoice_no_series2').notNull().default(30001), // N_INVNO2
  nextSalesReturnNo: integer('next_sales_return_no').notNull().default(101), // N_SRETNO1
  nextPurchaseReturnNo: integer('next_purchase_return_no').notNull().default(101), // N_PRETNO
  nextCreditNoteNo: integer('next_credit_note_no').notNull().default(200001), // CRETNO
  nextDebitNoteNo: integer('next_debit_note_no').notNull().default(100001), // ODEBNO / N_DBNO1
  nextDeliveryChallanNo: integer('next_delivery_challan_no').notNull().default(101), // DCNO
  
  // Automated Wholesale Cash Discount Slabs (from HFILE.DAT)
  cashDiscountSlab1Amount: real('cash_discount_slab1_amount').notNull().default(0), // SLAP1
  cashDiscountSlab1Pct: real('cash_discount_slab1_pct').notNull().default(2.0), // DISC1
  cashDiscountSlab2Amount: real('cash_discount_slab2_amount').notNull().default(200.0), // SLAP2
  cashDiscountSlab2Pct: real('cash_discount_slab2_pct').notNull().default(2.0), // DISC2
  cashDiscountSlab3Amount: real('cash_discount_slab3_amount').notNull().default(0), // SLAP3
  
  // Statutory TCS & HSN Standards
  defaultTcsPct: real('default_tcs_pct').notNull().default(0.100), // TCSPER (0.100%)
  hsnCodeLength: integer('hsn_code_length').notNull().default(8), // LNHSN (Standard 8-digit HSN)
  
  // Invoice Print Templates & Terms
  bankDetailsLine1: text('bank_details_line1').default('BANK: STATE BANK OF INDIA, A/C: 12345678901'),
  bankDetailsLine2: text('bank_details_line2').default('IFSC: SBIN0000123, BRANCH: MAIN BRANCH'),
  invoiceFooterTerms: text('invoice_footer_terms').default('Goods once sold will not be taken back without authorization. Subject to local jurisdiction.'),
  
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type SystemConfig = typeof systemConfig.$inferSelect;
export type NewSystemConfig = typeof systemConfig.$inferInsert;

/**
 * 2. System Access Controls & Password Policies (Counterpart: CTLFILE.DAT)
 * Manages supervisor password gates and modular permission toggles.
 */
export const systemControls = sqliteTable('system_controls', {
  id: text('id').primaryKey().default('default'), // Singleton row
  
  // Legacy Passwords (CTLFILE: UPASSWD, GPASSWD, OPASSWD, PWD)
  adminPasswordHash: text('admin_password_hash').notNull().default('SPM'), // Supervisor password
  managerPasswordHash: text('manager_password_hash').notNull().default('SPM'),
  operatorPasswordHash: text('operator_password_hash').notNull().default('SIVA'),
  
  // Modular Permission Toggles (CTLFILE.DAT logical flags)
  allowRateModification: integer('allow_rate_modification', { mode: 'boolean' }).notNull().default(false), // RTCTL
  allowOutstandingOverride: integer('allow_outstanding_override', { mode: 'boolean' }).notNull().default(false), // OUTCTL
  allowCollectionEdit: integer('allow_collection_edit', { mode: 'boolean' }).notNull().default(false), // COLCTL
  allowReportsAccess: integer('allow_reports_access', { mode: 'boolean' }).notNull().default(true), // REPCTL
  allowDayEndOverride: integer('allow_day_end_override', { mode: 'boolean' }).notNull().default(false), // SYSCTL
  allowCreditNoteAdjustment: integer('allow_credit_note_adjustment', { mode: 'boolean' }).notNull().default(true), // CNADJCTL
  allowCreditNoteCreation: integer('allow_credit_note_creation', { mode: 'boolean' }).notNull().default(true), // CRNOTCTL
  allowInvoiceCancellation: integer('allow_invoice_cancellation', { mode: 'boolean' }).notNull().default(false), // INCANCTL
  allowPaymentModification: integer('allow_payment_modification', { mode: 'boolean' }).notNull().default(false), // PMTCTL
  
  // Strict Pharmacy Business Guards
  enforceCreditLimit: integer('enforce_credit_limit', { mode: 'boolean' }).notNull().default(true), // Block billing if balance > CRLIMIT
  enforceLicenseExpiryBlock: integer('enforce_license_expiry_block', { mode: 'boolean' }).notNull().default(true), // Block billing if customer DL expired
  enforceNegativeMarginBlock: integer('enforce_negative_margin_block', { mode: 'boolean' }).notNull().default(true), // Alert if Rate < PRate
  
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type SystemControls = typeof systemControls.$inferSelect;
export type NewSystemControls = typeof systemControls.$inferInsert;

/**
 * 3. Day-End Accounting Closing Register (Counterpart: DAYEND1.PRG & DAYEND2.PRG)
 * Immutable log created upon daily execution of Day-End routine.
 */
export const dayEndClosings = sqliteTable('day_end_closings', {
  id: text('id').primaryKey(), // UUID v4
  closingDate: text('closing_date').notNull().unique(), // The calendar date being closed (ISO 'YYYY-MM-DD')
  closedAt: text('closed_at').notNull(), // Timestamp of closing execution
  closedByUser: text('closed_by_user').notNull().default('ADMIN'),
  
  // Audited Daily Operational Summary
  totalInvoicesCount: integer('total_invoices_count').notNull().default(0),
  totalSalesGross: real('total_sales_gross').notNull().default(0),
  totalSalesNet: real('total_sales_net').notNull().default(0),
  totalTaxCollected: real('total_tax_collected').notNull().default(0),
  cashSalesAmount: real('cash_sales_amount').notNull().default(0),
  creditSalesAmount: real('credit_sales_amount').notNull().default(0),
  chequeSalesAmount: real('cheque_sales_amount').notNull().default(0),
  
  totalReturnsCount: integer('total_returns_count').notNull().default(0),
  totalReturnsAmount: real('total_returns_amount').notNull().default(0),
  
  totalPurchasesCount: integer('total_purchases_count').notNull().default(0),
  totalPurchasesAmount: real('total_purchases_amount').notNull().default(0),
  
  // Collections Breakdown
  totalCollectionsCash: real('total_collections_cash').notNull().default(0),
  totalCollectionsCheque: real('total_collections_cheque').notNull().default(0),
  totalCollectionsBank: real('total_collections_bank').notNull().default(0),

  // Supplier Payments Breakdown
  totalPaymentsCash: real('total_payments_cash').notNull().default(0),
  totalPaymentsCheque: real('total_payments_cheque').notNull().default(0),
  totalPaymentsBank: real('total_payments_bank').notNull().default(0),

  // Cash Drawer Reconciliation
  openingCashBalance: real('opening_cash_balance').notNull().default(0),
  closingCashBalance: real('closing_cash_balance').notNull().default(0),
  physicalCashCount: real('physical_cash_count').notNull().default(0),
  cashDifference: real('cash_difference').notNull().default(0),
  denominationBreakdown: text('denomination_breakdown'),
  
  nextWorkingDate: text('next_working_date').notNull(), // Date advanced to in systemConfig
  isVerified: integer('is_verified', { mode: 'boolean' }).notNull().default(true),
  remarks: text('remarks'),
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_dayend_closing_date').on(table.closingDate),
]);

export type DayEndClosing = typeof dayEndClosings.$inferSelect;
export type NewDayEndClosing = typeof dayEndClosings.$inferInsert;

/**
 * 4. System Action & Security Audit Log
 * Tracks high-privilege interventions and supervisor overrides.
 */
export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(), // UUID v4
  timestamp: text('timestamp').notNull().default(sql`CURRENT_TIMESTAMP`),
  userId: text('user_id').notNull().default('SYSTEM'),
  
  action: text('action').notNull(), // 'INVOICE_CREATE', 'INVOICE_CANCEL', 'RATE_OVERRIDE', 'CREDIT_LIMIT_BYPASS', 'DAY_END_CLOSE', 'STOCK_ADJUSTMENT'
  entityType: text('entity_type').notNull(), // 'invoice', 'product', 'batch', 'customer', 'supplier', 'collection', 'day_end'
  entityId: text('entity_id').notNull(),
  
  oldValues: text('old_values'), // JSON snapshot of state prior to mutation
  newValues: text('new_values'), // JSON snapshot of updated state
  
  nodeId: text('node_id').default('1'), // Workstation Node ID (1 to 6)
  remarks: text('remarks'),
}, (table) => [
  index('idx_audit_entity').on(table.entityType, table.entityId),
  index('idx_audit_action').on(table.action),
  index('idx_audit_timestamp').on(table.timestamp),
]);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
