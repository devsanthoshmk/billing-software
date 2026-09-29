import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { customers, suppliers } from './masters';
import { invoices, purchases } from './transactions';

/**
 * 1. Customer Outstandings Ledger (Counterpart: CUSOUT1.DAT through CUSOUT9.DAT)
 * Stores bill-by-bill receivable state for every credit invoice generated.
 */
export const customerOutstandings = sqliteTable('customer_outstandings', {
  id: text('id').primaryKey(), // UUID v4
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
  invoiceId: text('invoice_id').notNull().unique().references(() => invoices.id, { onDelete: 'cascade' }),
  
  invoiceNo: text('invoice_no').notNull(),
  invoiceDate: text('invoice_date').notNull(), // ISO-8601: 'YYYY-MM-DD'
  dueDate: text('due_date').notNull(), // Payment due date (DUEDT)
  
  // Ledger Balances
  originalAmount: real('original_amount').notNull(), // INVAMT - Initial invoice bill amount
  paidAmount: real('paid_amount').notNull().default(0), // RDAMT - Accumulated payments & credit adjustments
  balanceAmount: real('balance_amount').notNull(), // RAMT - Current outstanding balance (original - paid)
  
  // Cash Discount Incentives (DISC_PER, DISC_AMT)
  cashDiscountEligible: real('cash_discount_eligible').notNull().default(0),
  cashDiscountGiven: real('cash_discount_given').notNull().default(0),
  
  // Status Tracking
  status: text('status').notNull().default('OPEN'), // 'OPEN', 'PARTIALLY_PAID', 'PAID' (legacy 'OP', 'PD')
  lastPaymentDate: text('last_payment_date'), // RD_DT - Timestamp of latest collection payment
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_cusout_customer').on(table.customerId),
  index('idx_cusout_status').on(table.status),
  index('idx_cusout_duedate').on(table.dueDate),
]);

export type CustomerOutstanding = typeof customerOutstandings.$inferSelect;
export type NewCustomerOutstanding = typeof customerOutstandings.$inferInsert;

/**
 * 2. Customer Collection / Receipt Vouchers (Counterpart: COLENTY3.PRG & CUSLED.DAT)
 */
export const customerReceipts = sqliteTable('customer_receipts', {
  id: text('id').primaryKey(), // UUID v4
  receiptNo: text('receipt_no').notNull().unique(), // e.g. 'RCT-000101'
  receiptDate: text('receipt_date').notNull(), // CDATE - Date payment received
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
  
  // Payment Method
  paymentMode: text('payment_mode').notNull().default('CASH'), // 'CASH', 'CHEQUE', 'NEFT_RTGS', 'UPI', 'CREDIT_NOTE_ADJUSTMENT'
  totalAmount: real('total_amount').notNull(), // CAMT - Total collection amount
  discountAllowed: real('discount_allowed').notNull().default(0), // Cash discount allowed on collection
  
  // Banking & Cheque Details
  referenceNo: text('reference_no'), // CREFNO - Cheque number or bank transfer UTR
  referenceDate: text('reference_date'), // CQDT - Cheque date or transfer date
  bankName: text('bank_name'), // Drawn bank
  branchName: text('branch_name'),
  
  // Cheque Processing Lifecycle (CHPASSD in CUSLED)
  chequeStatus: text('cheque_status').notNull().default('NOT_APPLICABLE'), // 'NOT_APPLICABLE', 'IN_HAND', 'DEPOSITED', 'CLEARED', 'DISHONORED'
  clearanceDate: text('clearance_date'), // Date cleared in bank
  
  // Advance Collection Handling
  unallocatedAmount: real('unallocated_amount').notNull().default(0), // Amount remaining if collection > selected bills
  narration: text('narration'),
  dayEndLocked: integer('day_end_locked', { mode: 'boolean' }).notNull().default(false), // Locked after day-end close
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_receipts_customer').on(table.customerId),
  index('idx_receipts_date').on(table.receiptDate),
  index('idx_receipts_mode').on(table.paymentMode),
]);

export type CustomerReceipt = typeof customerReceipts.$inferSelect;
export type NewCustomerReceipt = typeof customerReceipts.$inferInsert;

/**
 * 3. Customer Receipt Allocations (Counterpart: Bill-by-Bill Allocation in COLENTY3.PRG:220)
 * Normalizes 1-to-many allocation of a receipt across multiple open invoices.
 */
export const customerReceiptAllocations = sqliteTable('customer_receipt_allocations', {
  id: text('id').primaryKey(), // UUID v4
  receiptId: text('receipt_id').notNull().references(() => customerReceipts.id, { onDelete: 'cascade' }),
  outstandingId: text('outstanding_id').notNull().references(() => customerOutstandings.id, { onDelete: 'restrict' }),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id, { onDelete: 'restrict' }),
  
  allocatedAmount: real('allocated_amount').notNull(), // Amount applied to this specific invoice
  discountAmount: real('discount_amount').notNull().default(0), // Cash discount applied to this invoice
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_receipt_alloc_receipt').on(table.receiptId),
  index('idx_receipt_alloc_outstanding').on(table.outstandingId),
  index('idx_receipt_alloc_invoice').on(table.invoiceId),
]);

export type CustomerReceiptAllocation = typeof customerReceiptAllocations.$inferSelect;
export type NewCustomerReceiptAllocation = typeof customerReceiptAllocations.$inferInsert;

/**
 * 4. Supplier Payment Vouchers (Counterpart: PMTENTY.PRG & SUPLED.DAT)
 */
export const supplierPayments = sqliteTable('supplier_payments', {
  id: text('id').primaryKey(), // UUID v4
  paymentNo: text('payment_no').notNull().unique(), // e.g. 'PMT-000101'
  paymentDate: text('payment_date').notNull(), // TRADT
  supplierId: text('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'restrict' }),
  
  paymentMode: text('payment_mode').notNull().default('CHEQUE'), // 'CASH', 'CHEQUE', 'NEFT_RTGS', 'UPI', 'DEBIT_NOTE_ADJUSTMENT'
  totalAmount: real('total_amount').notNull(), // Total payment disbursed
  discountReceived: real('discount_received').notNull().default(0), // Cash discount earned
  
  referenceNo: text('reference_no'), // Cheque No or UTR
  referenceDate: text('reference_date'),
  bankName: text('bank_name'), // Issuing bank
  bankAccountNo: text('bank_account_no'),
  
  chequeStatus: text('cheque_status').notNull().default('NOT_APPLICABLE'), // 'NOT_APPLICABLE', 'ISSUED', 'PASSED', 'CANCELLED'
  clearanceDate: text('clearance_date'), // PASSDT
  
  unallocatedAmount: real('unallocated_amount').notNull().default(0),
  narration: text('narration'),
  dayEndLocked: integer('day_end_locked', { mode: 'boolean' }).notNull().default(false),
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_supplier_pmt_supplier').on(table.supplierId),
  index('idx_supplier_pmt_date').on(table.paymentDate),
]);

export type SupplierPayment = typeof supplierPayments.$inferSelect;
export type NewSupplierPayment = typeof supplierPayments.$inferInsert;

/**
 * 5. Supplier Payment Allocations (Counterpart: PMTENTY.PRG bill-by-bill allocations)
 */
export const supplierPaymentAllocations = sqliteTable('supplier_payment_allocations', {
  id: text('id').primaryKey(), // UUID v4
  paymentId: text('payment_id').notNull().references(() => supplierPayments.id, { onDelete: 'cascade' }),
  purchaseId: text('purchase_id').notNull().references(() => purchases.id, { onDelete: 'restrict' }),
  
  allocatedAmount: real('allocated_amount').notNull(),
  discountAmount: real('discount_amount').notNull().default(0),
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_supplier_alloc_payment').on(table.paymentId),
  index('idx_supplier_alloc_purchase').on(table.purchaseId),
]);

export type SupplierPaymentAllocation = typeof supplierPaymentAllocations.$inferSelect;
export type NewSupplierPaymentAllocation = typeof supplierPaymentAllocations.$inferInsert;

/**
 * 6. Centralized Cheque Register (Counterpart: CHQREG.DAT & CHQISSU.DAT)
 * Manages full lifecycle of incoming customer cheques and outgoing supplier cheques.
 */
export const chequeRegister = sqliteTable('cheque_register', {
  id: text('id').primaryKey(), // UUID v4
  chequeType: text('cheque_type').notNull(), // 'INCOMING' (Customer Collection) or 'OUTGOING' (Supplier Payment)
  chequeNo: text('cheque_no').notNull(), // CHQNO
  chequeDate: text('cheque_date').notNull(), // CHQDT
  amount: real('amount').notNull(), // CHQAMT
  
  bankName: text('bank_name').notNull(), // BANK
  branchName: text('branch_name'), // TOWN
  isLocalCheque: integer('is_local_cheque', { mode: 'boolean' }).notNull().default(true), // LOCHQ == 'L'
  
  partyType: text('party_type').notNull(), // 'CUSTOMER' or 'SUPPLIER'
  partyId: text('party_id').notNull(), // customer_id or supplier_id
  partyName: text('party_name').notNull(),
  
  receiptId: text('receipt_id').references(() => customerReceipts.id, { onDelete: 'set null' }),
  paymentId: text('payment_id').references(() => supplierPayments.id, { onDelete: 'set null' }),
  
  // Lifecycle Status
  status: text('status').notNull().default('RECEIVED'), // 'RECEIVED', 'ISSUED', 'DEPOSITED', 'CLEARED', 'DISHONORED', 'CANCELLED'
  depositDate: text('deposit_date'),
  clearanceDate: text('clearance_date'), // PASSDT / PRNDT
  dishonorDate: text('dishonor_date'), // Date returned bounced
  dishonorReason: text('dishonor_reason'), // 'INSUFFICIENT_FUNDS', 'SIGNATURE_MISMATCH', 'STOP_PAYMENT'
  
  remarks: text('remarks'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_chqreg_no').on(table.chequeNo),
  index('idx_chqreg_party').on(table.partyId),
  index('idx_chqreg_status').on(table.status),
  index('idx_chqreg_type').on(table.chequeType),
]);

export type ChequeRecord = typeof chequeRegister.$inferSelect;
export type NewChequeRecord = typeof chequeRegister.$inferInsert;
