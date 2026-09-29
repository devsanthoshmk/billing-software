import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { customers, suppliers, products, productBatches, taxSlabs, areas, salesmen, doctors } from './masters';

/**
 * 1. Sales Invoices Header Table (Counterpart: INVOICE.DAT & INVPRE.PRG)
 */
export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(), // UUID v4
  invoiceNo: text('invoice_no').notNull().unique(), // Series 1 (e.g., 'INV-000101') or Series 2 ('INV-030001')
  invoiceSeries: integer('invoice_series').notNull().default(1), // 1 = Local Regular, 2 = Special / Outstation
  invoiceDate: text('invoice_date').notNull(), // ISO-8601: 'YYYY-MM-DD'
  invoiceTime: text('invoice_time').notNull(), // 'HH:MM:SS'
  
  // Party & Reference Foreign Keys
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
  areaId: text('area_id').references(() => areas.id, { onDelete: 'set null' }),
  salesmanId: text('salesman_id').references(() => salesmen.id, { onDelete: 'set null' }),
  doctorId: text('doctor_id').references(() => doctors.id, { onDelete: 'set null' }),
  
  // Business Parameters
  isInterstate: integer('is_interstate', { mode: 'boolean' }).notNull().default(false), // LO == 'O' determines IGST vs CGST/SGST
  paymentTerms: text('payment_terms').notNull().default('CREDIT'), // 'CASH', 'CREDIT', 'CHEQUE' (legacy TERM)
  dueDate: text('due_date').notNull(), // Credit due date
  
  // Financial Turnovers & Summary
  subtotalGross: real('subtotal_gross').notNull().default(0), // Sum of line (Qty * Rate) before line discounts (TOT_AMT)
  totalLineDiscount: real('total_line_discount').notNull().default(0), // Sum of line product discounts (PDISC_AMT)
  cashDiscountPct: real('cash_discount_pct').notNull().default(0), // Bill-level cash discount % (DISC_PER)
  cashDiscountAmount: real('cash_discount_amount').notNull().default(0), // Bill-level cash discount amount (FDISC_AMT)
  taxableAmount: real('taxable_amount').notNull().default(0), // Net turnover subject to tax (FTURN / STURN)
  
  // Statutory GST Breakdown
  cgstAmount: real('cgst_amount').notNull().default(0), // Central GST (50% of GST rate on Intra-state)
  sgstAmount: real('sgst_amount').notNull().default(0), // State GST (50% of GST rate on Intra-state)
  igstAmount: real('igst_amount').notNull().default(0), // Integrated GST (100% of GST rate on Inter-state)
  totalTaxAmount: real('total_tax_amount').notNull().default(0), // cgst + sgst + igst
  
  // Surcharges & Additional Expenses
  freightCharges: real('freight_charges').notNull().default(0), // FC
  boxCharges: real('box_charges').notNull().default(0), // BC
  serviceCharges: real('service_charges').notNull().default(0), // SERCHG
  
  // Tax Collected at Source (TCS)
  tcsPct: real('tcs_pct').notNull().default(0), // TCSPER (e.g. 0.075 or 0.100)
  tcsAmount: real('tcs_amount').notNull().default(0), // TCSAMT
  
  // Round Off & Grand Total
  roundOff: real('round_off').notNull().default(0), // R_OFF (+/- paise)
  netAmount: real('net_amount').notNull().default(0), // NET_AMT (Integer rounded payable)
  
  // Quantities & Packaging Metadata
  totalItemsCount: integer('total_items_count').notNull().default(0), // Number of line items (NOU)
  totalQuantity: integer('total_quantity').notNull().default(0), // Total units billed (NOP)
  totalBoxes: integer('total_boxes').notNull().default(0), // NOBOX
  
  // Compliance & Statutory Snapshots
  customerGstin: text('customer_gstin'), // Snapshot of customer GSTIN at time of invoice
  customerDl20b: text('customer_dl20b'), // Snapshot of Form 20B Drug License
  customerDl21b: text('customer_dl21b'), // Snapshot of Form 21B Drug License
  irnNo: text('irn_no'), // 64-character E-Invoicing Invoice Reference Number
  ackNo: text('ack_no'), // 15-character E-Invoicing Acknowledgment Number
  ackDate: text('ack_date'), // E-Invoicing acknowledgment timestamp
  
  // Logistics & Delivery Challan
  deliveryChallanNo: text('delivery_challan_no'), // DC reference
  lrNo: text('lr_no'), // Lorry Receipt No
  transportName: text('transport_name'), // Transport / Carrier name (LORRY)
  destination: text('destination'),
  
  // Operational Guards & Status
  creditLimitBypassed: integer('credit_limit_bypassed', { mode: 'boolean' }).notNull().default(false), // BYEPASS
  dayEndLocked: integer('day_end_locked', { mode: 'boolean' }).notNull().default(false), // DAYUP == .T.
  status: text('status').notNull().default('FINAL'), // 'DRAFT', 'FINAL', 'CANCELLED'
  isCancelled: integer('is_cancelled', { mode: 'boolean' }).notNull().default(false),
  cancelledAt: text('cancelled_at'),
  cancelledReason: text('cancelled_reason'),
  remarks: text('remarks'), // Header remarks
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_invoices_date').on(table.invoiceDate),
  index('idx_invoices_customer').on(table.customerId),
  index('idx_invoices_status').on(table.status),
  index('idx_invoices_dayend').on(table.dayEndLocked),
]);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

/**
 * 2. Sales Invoice Line Items Table (Counterpart: INVDET.DAT & INVPRE.PRG)
 */
export const invoiceItems = sqliteTable('invoice_items', {
  id: text('id').primaryKey(), // UUID v4
  invoiceId: text('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(1),
  
  // Product & Batch References
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'restrict' }),
  batchId: text('batch_id').notNull().references(() => productBatches.id, { onDelete: 'restrict' }),
  
  // Immutable Item Snapshots (frozen at time of invoice creation)
  productName: text('product_name').notNull(),
  packaging: text('packaging').notNull(),
  hsnCode: text('hsn_code').notNull(),
  batchNo: text('batch_no').notNull(),
  expiryDate: text('expiry_date').notNull(), // ISO: 'YYYY-MM-DD'
  
  // Quantities
  quantity: integer('quantity').notNull(), // Billed Qty (QTY)
  freeQuantity: integer('free_quantity').notNull().default(0), // Free Scheme Qty (FQTY)
  isReplacement: integer('is_replacement', { mode: 'boolean' }).notNull().default(false), // REPLT
  
  // Rate & Cost Valuations
  purchaseRate: real('purchase_rate').notNull(), // PRATE - Cost price snapshot (for margin alerting & profit reports)
  sellingRate: real('selling_rate').notNull(), // RATE - Selling rate applied
  secondaryRate: real('secondary_rate'), // SERATE
  mrp: real('mrp').notNull(), // Maximum Retail Price
  
  // Line Discounts & Gross
  grossAmount: real('gross_amount').notNull(), // quantity * sellingRate
  tradeDiscountPct: real('trade_discount_pct').notNull().default(0), // PDISC
  tradeDiscountAmount: real('trade_discount_amount').notNull().default(0), // grossAmount * (tradeDiscountPct / 100)
  taxableAmount: real('taxable_amount').notNull(), // grossAmount - tradeDiscountAmount
  
  // Line GST Calculation
  taxCode: text('tax_code', { length: 2 }).notNull().references(() => taxSlabs.code, { onDelete: 'restrict' }), // '01', '02', '03', '04', '05'
  cgstRate: real('cgst_rate').notNull().default(0),
  cgstAmount: real('cgst_amount').notNull().default(0),
  sgstRate: real('sgst_rate').notNull().default(0),
  sgstAmount: real('sgst_amount').notNull().default(0),
  igstRate: real('igst_rate').notNull().default(0),
  igstAmount: real('igst_amount').notNull().default(0),
  
  // Net Line Value
  netAmount: real('net_amount').notNull(), // taxableAmount + cgst + sgst + igst
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_invoice_items_invoice').on(table.invoiceId),
  index('idx_invoice_items_product').on(table.productId),
  index('idx_invoice_items_batch').on(table.batchId),
]);

export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type NewInvoiceItem = typeof invoiceItems.$inferInsert;

/**
 * 3. Purchase Inward / GRN Header Table (Counterpart: COMPUR.DAT, SUPOUT.DAT & PURCHASE.PRG)
 */
export const purchases = sqliteTable('purchases', {
  id: text('id').primaryKey(), // UUID v4
  inwardNo: text('inward_no').notNull().unique(), // Internal Goods Receipt Note No (e.g., 'GRN-000101')
  supplierId: text('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'restrict' }),
  
  // Supplier's Billing Document Details
  supplierBillNo: text('supplier_bill_no').notNull(), // PINVNO
  supplierBillDate: text('supplier_bill_date').notNull(), // PINVDT
  inwardDate: text('inward_date').notNull(), // TRADT - Date received in store
  dueDate: text('due_date').notNull(), // DUEDT - Payment due date
  paymentTerms: text('payment_terms').notNull().default('CREDIT'), // 'CREDIT' | 'CASH'
  isInterstate: integer('is_interstate', { mode: 'boolean' }).notNull().default(false),
  
  // Financial Turnovers
  totalGrossAmount: real('total_gross_amount').notNull().default(0), // Sum of line (Qty * PRate)
  tradeDiscountAmount: real('trade_discount_amount').notNull().default(0), // Total trade discount deducted
  cashDiscountPct: real('cash_discount_pct').notNull().default(0),
  cashDiscountAmount: real('cash_discount_amount').notNull().default(0),
  taxableAmount: real('taxable_amount').notNull().default(0), // Base value eligible for Input Tax Credit
  
  // Input Tax Credit (ITC) Breakdown
  cgstAmount: real('cgst_amount').notNull().default(0),
  sgstAmount: real('sgst_amount').notNull().default(0),
  igstAmount: real('igst_amount').notNull().default(0),
  totalTaxAmount: real('total_tax_amount').notNull().default(0),
  
  // Supplementary Inward Adjustments
  otherChargesAdd: real('other_charges_add').notNull().default(0), // ADDAMT (Freight, insurance, packaging)
  otherChargesLess: real('other_charges_less').notNull().default(0), // LESAMT (Special rebates, adjustments)
  roundOff: real('round_off').notNull().default(0),
  netAmount: real('net_amount').notNull().default(0), // INVAMT - Final payable amount
  
  // Payment Status Tracking
  paidAmount: real('paid_amount').notNull().default(0), // PAIDAMT
  balanceAmount: real('balance_amount').notNull().default(0), // netAmount - paidAmount
  paymentStatus: text('payment_status').notNull().default('UNPAID'), // 'UNPAID', 'PARTIAL', 'PAID'
  
  // Operational Flags
  isTransit: integer('is_transit', { mode: 'boolean' }).notNull().default(false), // Goods in transit flag
  dayEndLocked: integer('day_end_locked', { mode: 'boolean' }).notNull().default(false), // DAYUP
  status: text('status').notNull().default('VERIFIED'), // 'DRAFT', 'VERIFIED', 'CANCELLED'
  remarks: text('remarks'),
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_purchases_supplier').on(table.supplierId),
  index('idx_purchases_inward_date').on(table.inwardDate),
  index('idx_purchases_bill_no').on(table.supplierBillNo),
  index('idx_purchases_payment_status').on(table.paymentStatus),
]);

export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;

/**
 * 4. Purchase Inward Line Items Table (Counterpart: SPUR.DAT, PURCHASE.DAT & PURCHASE.PRG)
 */
export const purchaseItems = sqliteTable('purchase_items', {
  id: text('id').primaryKey(), // UUID v4
  purchaseId: text('purchase_id').notNull().references(() => purchases.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(1),
  
  // Product Reference
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'restrict' }),
  batchId: text('batch_id').references(() => productBatches.id, { onDelete: 'set null' }), // Linked batch
  
  // Inward Batch Attributes
  batchNo: text('batch_no').notNull(), // BAT
  expiryDate: text('expiry_date').notNull(), // EXP
  
  // Quantities
  quantity: integer('quantity').notNull(), // Billed Qty (QTY)
  freeQuantity: integer('free_quantity').notNull().default(0), // Scheme Bonus Free Qty (FQTY)
  schemeThreshold: integer('scheme_threshold').notNull().default(0), // Buy Qty (QY)
  schemeFreeQty: integer('scheme_free_qty').notNull().default(0), // Get Free Qty (FQY)
  
  // Pricing Structure & Margins
  purchaseRate: real('purchase_rate').notNull(), // PRATE - Cost rate per unit
  sellingRate: real('selling_rate').notNull(), // SRATE - Suggested wholesale rate
  secondaryRate: real('secondary_rate'), // SERATE
  mrp: real('mrp').notNull(), // MRP (Invariant: mrp >= sellingRate > purchaseRate)
  targetMarginPct: real('target_margin_pct').default(0), // Operator target markup %
  
  // Line Discounts
  tradeDiscountPct: real('trade_discount_pct').notNull().default(0), // SUPDISC / PDISC
  tradeDiscountAmount: real('trade_discount_amount').notNull().default(0),
  grossAmount: real('gross_amount').notNull(), // quantity * purchaseRate
  taxableAmount: real('taxable_amount').notNull(), // grossAmount - tradeDiscountAmount
  
  // Line Taxes (Input Tax Credit)
  taxCode: text('tax_code', { length: 2 }).notNull().references(() => taxSlabs.code, { onDelete: 'restrict' }),
  cgstRate: real('cgst_rate').notNull().default(0),
  cgstAmount: real('cgst_amount').notNull().default(0),
  sgstRate: real('sgst_rate').notNull().default(0),
  sgstAmount: real('sgst_amount').notNull().default(0),
  igstRate: real('igst_rate').notNull().default(0),
  igstAmount: real('igst_amount').notNull().default(0),
  
  // Net Line Cost
  netAmount: real('net_amount').notNull(), // taxableAmount + cgst + sgst + igst
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_purchase_items_purchase').on(table.purchaseId),
  index('idx_purchase_items_product').on(table.productId),
  index('idx_purchase_items_batch').on(table.batchId),
]);

export type PurchaseItem = typeof purchaseItems.$inferSelect;
export type NewPurchaseItem = typeof purchaseItems.$inferInsert;

/**
 * 5. Sales Returns / Credit Notes Header Table (Counterpart: SRETURN.DAT & SRETPRE.PRG)
 */
export const salesReturns = sqliteTable('sales_returns', {
  id: text('id').primaryKey(), // UUID v4
  returnNo: text('return_no').notNull().unique(), // SRETNO (e.g. 'SR-000101')
  returnDate: text('return_date').notNull(), // SRETDT
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
  originalInvoiceId: text('original_invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
  originalInvoiceNo: text('original_invoice_no'),
  
  returnType: text('return_type').notNull().default('CREDIT_NOTE'), // 'CREDIT_NOTE', 'CASH_REFUND', 'REPLACEMENT'
  reason: text('reason').notNull().default('EXPIRED'), // 'EXPIRED', 'DAMAGED', 'RATE_DIFFERENCE', 'EXCESS_STOCK'
  
  // Financial Summary
  totalGrossAmount: real('total_gross_amount').notNull().default(0),
  totalDiscountAmount: real('total_discount_amount').notNull().default(0),
  taxableAmount: real('taxable_amount').notNull().default(0),
  cgstAmount: real('cgst_amount').notNull().default(0),
  sgstAmount: real('sgst_amount').notNull().default(0),
  igstAmount: real('igst_amount').notNull().default(0),
  roundOff: real('round_off').notNull().default(0),
  netAmount: real('net_amount').notNull().default(0), // Total refund / credit amount
  
  // Adjustment against Outstanding Bills (COLENTY / CNADJ.PRG)
  adjustedAmount: real('adjusted_amount').notNull().default(0), // ADAMT
  balanceAmount: real('balance_amount').notNull().default(0), // netAmount - adjustedAmount
  isFullyAdjusted: integer('is_fully_adjusted', { mode: 'boolean' }).notNull().default(false),
  
  // Operational Status
  dayEndLocked: integer('day_end_locked', { mode: 'boolean' }).notNull().default(false), // DAYUP
  isCancelled: integer('is_cancelled', { mode: 'boolean' }).notNull().default(false),
  remarks: text('remarks'),
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_sales_returns_customer').on(table.customerId),
  index('idx_sales_returns_date').on(table.returnDate),
]);

export type SalesReturn = typeof salesReturns.$inferSelect;
export type NewSalesReturn = typeof salesReturns.$inferInsert;

/**
 * 6. Sales Return Items Table (Counterpart: SRETDET.DAT & SRETPRE.PRG)
 */
export const salesReturnItems = sqliteTable('sales_return_items', {
  id: text('id').primaryKey(), // UUID v4
  salesReturnId: text('sales_return_id').notNull().references(() => salesReturns.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(1),
  
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'restrict' }),
  batchId: text('batch_id').references(() => productBatches.id, { onDelete: 'set null' }),
  
  batchNo: text('batch_no').notNull(),
  expiryDate: text('expiry_date').notNull(),
  quantity: integer('quantity').notNull(), // Returned Qty
  freeQuantity: integer('free_quantity').notNull().default(0),
  
  rate: real('rate').notNull(), // Selling rate returned
  purchaseRate: real('purchase_rate').notNull(), // Cost rate
  discountPct: real('discount_pct').notNull().default(0),
  taxableAmount: real('taxable_amount').notNull(),
  
  taxCode: text('tax_code', { length: 2 }).notNull().references(() => taxSlabs.code, { onDelete: 'restrict' }),
  cgstRate: real('cgst_rate').notNull().default(0),
  cgstAmount: real('cgst_amount').notNull().default(0),
  sgstRate: real('sgst_rate').notNull().default(0),
  sgstAmount: real('sgst_amount').notNull().default(0),
  igstRate: real('igst_rate').notNull().default(0),
  igstAmount: real('igst_amount').notNull().default(0),
  netAmount: real('net_amount').notNull(),
  
  // Stock Disposition Flag
  restockInventory: integer('restock_inventory', { mode: 'boolean' }).notNull().default(true), // If false, routes to quarantine
  reason: text('reason'),
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_sales_return_items_return').on(table.salesReturnId),
  index('idx_sales_return_items_product').on(table.productId),
]);

export type SalesReturnItem = typeof salesReturnItems.$inferSelect;
export type NewSalesReturnItem = typeof salesReturnItems.$inferInsert;

/**
 * 7. Purchase Returns / Supplier Debit Notes Header Table (Counterpart: PRETURN.DAT & PRETPRE.PRG)
 */
export const purchaseReturns = sqliteTable('purchase_returns', {
  id: text('id').primaryKey(), // UUID v4
  returnNo: text('return_no').notNull().unique(), // PRETNO (e.g. 'PR-000101')
  returnDate: text('return_date').notNull(), // PRETDT
  supplierId: text('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'restrict' }),
  purchaseId: text('purchase_id').references(() => purchases.id, { onDelete: 'set null' }),
  supplierBillNo: text('supplier_bill_no'),
  
  // Financial Summary
  totalGrossAmount: real('total_gross_amount').notNull().default(0),
  discountAmount: real('discount_amount').notNull().default(0),
  taxableAmount: real('taxable_amount').notNull().default(0),
  cgstAmount: real('cgst_amount').notNull().default(0),
  sgstAmount: real('sgst_amount').notNull().default(0),
  igstAmount: real('igst_amount').notNull().default(0),
  roundOff: real('round_off').notNull().default(0),
  netAmount: real('net_amount').notNull().default(0),
  
  adjustedAmount: real('adjusted_amount').notNull().default(0), // Offset against supplier outstandings
  balanceAmount: real('balance_amount').notNull().default(0),
  isFullyAdjusted: integer('is_fully_adjusted', { mode: 'boolean' }).notNull().default(false),
  
  // Transport & Dispatch
  lrNo: text('lr_no'), // LRNO
  lrDate: text('lr_date'), // LRDT
  transportName: text('transport_name'), // LRY
  
  dayEndLocked: integer('day_end_locked', { mode: 'boolean' }).notNull().default(false),
  isCancelled: integer('is_cancelled', { mode: 'boolean' }).notNull().default(false),
  remarks: text('remarks'),
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_purchase_returns_supplier').on(table.supplierId),
  index('idx_purchase_returns_date').on(table.returnDate),
]);

export type PurchaseReturn = typeof purchaseReturns.$inferSelect;
export type NewPurchaseReturn = typeof purchaseReturns.$inferInsert;

/**
 * 8. Purchase Return Items Table (Counterpart: PRETDET.DAT & PRETPRE.PRG)
 */
export const purchaseReturnItems = sqliteTable('purchase_return_items', {
  id: text('id').primaryKey(), // UUID v4
  purchaseReturnId: text('purchase_return_id').notNull().references(() => purchaseReturns.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(1),
  
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'restrict' }),
  batchId: text('batch_id').references(() => productBatches.id, { onDelete: 'set null' }),
  
  batchNo: text('batch_no').notNull(),
  expiryDate: text('expiry_date').notNull(),
  quantity: integer('quantity').notNull(),
  freeQuantity: integer('free_quantity').notNull().default(0),
  
  purchaseRate: real('purchase_rate').notNull(),
  mrp: real('mrp').notNull(),
  taxableAmount: real('taxable_amount').notNull(),
  
  taxCode: text('tax_code', { length: 2 }).notNull().references(() => taxSlabs.code, { onDelete: 'restrict' }),
  cgstRate: real('cgst_rate').notNull().default(0),
  cgstAmount: real('cgst_amount').notNull().default(0),
  sgstRate: real('sgst_rate').notNull().default(0),
  sgstAmount: real('sgst_amount').notNull().default(0),
  igstRate: real('igst_rate').notNull().default(0),
  igstAmount: real('igst_amount').notNull().default(0),
  netAmount: real('net_amount').notNull(),
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_purchase_return_items_return').on(table.purchaseReturnId),
  index('idx_purchase_return_items_product').on(table.productId),
]);

export type PurchaseReturnItem = typeof purchaseReturnItems.$inferSelect;
export type NewPurchaseReturnItem = typeof purchaseReturnItems.$inferInsert;

/**
 * 9. Credit Notes Voucher Table (Financial Adjustments outside Stock Returns: CNDET.DAT, OCRENO)
 */
export const creditNotes = sqliteTable('credit_notes', {
  id: text('id').primaryKey(), // UUID v4
  noteNo: text('note_no').notNull().unique(), // e.g., 'CN-200001'
  date: text('date').notNull(), // ISO: 'YYYY-MM-DD'
  partyType: text('party_type').notNull().default('CUSTOMER'), // 'CUSTOMER' or 'SUPPLIER'
  partyId: text('party_id').notNull(), // customer_id or supplier_id
  
  noteType: text('note_type').notNull().default('RATE_DIFFERENCE'), // 'RATE_DIFFERENCE', 'SCHEME_DISCOUNT', 'EXPIRY_DAMAGE_CLAIM', 'OTHER'
  referenceInvoiceId: text('reference_invoice_id'),
  referenceInvoiceNo: text('reference_invoice_no'),
  
  taxableAmount: real('taxable_amount').notNull().default(0),
  cgstAmount: real('cgst_amount').notNull().default(0),
  sgstAmount: real('sgst_amount').notNull().default(0),
  igstAmount: real('igst_amount').notNull().default(0),
  totalAmount: real('total_amount').notNull().default(0),
  
  adjustedAmount: real('adjusted_amount').notNull().default(0),
  balanceAmount: real('balance_amount').notNull().default(0),
  status: text('status').notNull().default('OPEN'), // 'OPEN', 'PARTIAL', 'ADJUSTED', 'CANCELLED'
  
  remarks: text('remarks'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_credit_notes_party').on(table.partyId),
  index('idx_credit_notes_status').on(table.status),
]);

export type CreditNote = typeof creditNotes.$inferSelect;
export type NewCreditNote = typeof creditNotes.$inferInsert;

/**
 * 10. Debit Notes Voucher Table (Financial Adjustments: ODEBNO, N_DBNO1..2)
 */
export const debitNotes = sqliteTable('debit_notes', {
  id: text('id').primaryKey(), // UUID v4
  noteNo: text('note_no').notNull().unique(), // e.g., 'DN-100001'
  date: text('date').notNull(),
  partyType: text('party_type').notNull().default('SUPPLIER'), // 'SUPPLIER' or 'CUSTOMER'
  partyId: text('party_id').notNull(),
  
  noteType: text('note_type').notNull().default('PURCHASE_RETURN'), // 'PURCHASE_RETURN', 'RATE_DIFFERENCE', 'INTEREST_PENALTY', 'EXPENSE_RECOVERY'
  referenceInvoiceId: text('reference_invoice_id'),
  referenceInvoiceNo: text('reference_invoice_no'),
  
  taxableAmount: real('taxable_amount').notNull().default(0),
  cgstAmount: real('cgst_amount').notNull().default(0),
  sgstAmount: real('sgst_amount').notNull().default(0),
  igstAmount: real('igst_amount').notNull().default(0),
  totalAmount: real('total_amount').notNull().default(0),
  
  adjustedAmount: real('adjusted_amount').notNull().default(0),
  balanceAmount: real('balance_amount').notNull().default(0),
  status: text('status').notNull().default('OPEN'),
  
  remarks: text('remarks'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_debit_notes_party').on(table.partyId),
  index('idx_debit_notes_status').on(table.status),
]);

export type DebitNote = typeof debitNotes.$inferSelect;
export type NewDebitNote = typeof debitNotes.$inferInsert;
