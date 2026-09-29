import { sqliteTable, text, real, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * 1. Statutory Tax Slab Master (Legacy: TFILE.DAT)
 */
export const taxSlabs = sqliteTable('tax_slabs', {
  code: text('code', { length: 2 }).primaryKey(), // Legacy TCODE: '01', '02', '03', '04', '05'
  description: text('description').notNull(),      // e.g. '12% GST', '18% GST', '0% Nil'
  cgstRate: real('cgst_rate').notNull().default(0), // Intra-state Central GST % (e.g. 6.0)
  sgstRate: real('sgst_rate').notNull().default(0), // Intra-state State GST % (e.g. 6.0)
  igstRate: real('igst_rate').notNull().default(0), // Inter-state Integrated GST % (e.g. 12.0)
  
  // Legacy tax audit fields (backwards compatibility)
  stRate: real('st_rate').default(0),              // Legacy Sales Tax %
  scRate: real('sc_rate').default(0),              // Legacy Surcharge %
  cstRate: real('cst_rate').default(0),            // Legacy Central Sales Tax %
  rstRate: real('rst_rate').default(0),            // Legacy Resale Tax %

  // Financial Accounting General Ledger Mappings (Legacy FACODE1..4)
  glSalesAccount: text('gl_sales_account'),        // Sales Account GL Code (FACODE1)
  glTaxAccount: text('gl_tax_account'),            // Output GST GL Code (FACODE2)
  glPurchaseAccount: text('gl_purchase_account'),  // Purchase Account GL Code (FACODE3)
  glPurchTaxAccount: text('gl_purch_tax_account'), // Input Tax Credit (ITC) GL Code (FACODE4)
  
  isExempt: integer('is_exempt', { mode: 'boolean' }).notNull().default(false), // True for '01'
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_tax_slabs_is_active').on(table.isActive),
]);

export type TaxSlab = typeof taxSlabs.$inferSelect;
export type NewTaxSlab = typeof taxSlabs.$inferInsert;

/**
 * 2. Manufacturer / Company Master (Legacy: GROUP.DAT & SUPMAST.DAT)
 */
export const companies = sqliteTable('companies', {
  id: text('id').primaryKey(),                     // UUID / legacy ID
  code: text('code', { length: 10 }).notNull().unique(), // Legacy GPCODE/SUPCODE: 'SKM', 'SBL'
  name: text('name', { length: 100 }).notNull(),   // Manufacturer Company Name
  shortName: text('short_name', { length: 30 }),
  
  // Representative & Contact details (SUPMAST.DAT)
  contactPerson: text('contact_person', { length: 50 }), // Legacy RNAME
  addressLine1: text('address_line1', { length: 100 }),  // Legacy RADD1
  addressLine2: text('address_line2', { length: 100 }),  // Legacy RADD2
  addressLine3: text('address_line3', { length: 100 }),  // Legacy RADD3
  addressLine4: text('address_line4', { length: 100 }),  // Legacy RADD4
  phone: text('phone', { length: 30 }),                  // Legacy RPHON
  email: text('email', { length: 100 }),
  
  // Commercial Policies
  defaultDiscountPct: real('default_discount_pct').default(0), // Legacy SUPDISC
  specialDiscountFlag: integer('special_discount_flag', { mode: 'boolean' }).default(false),
  freeValueScheme: text('free_value_scheme', { length: 1 }).default('Y'), // 'Y'=Free-Value, 'N'=Disc
  isBlocked: integer('is_blocked', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('idx_companies_code').on(table.code),
  index('idx_companies_name').on(table.name),
  index('idx_companies_is_active').on(table.isActive),
]);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

/**
 * 3. Salesman Master (Legacy: SFILE.DAT)
 */
export const salesmen = sqliteTable('salesmen', {
  id: text('id').primaryKey(),                     // UUID / legacy ID
  code: text('code', { length: 5 }).notNull().unique(), // Legacy SCODE: '01', '02'
  name: text('name', { length: 50 }).notNull(),    // Legacy SNAME: 'DIRECT SALES'
  phone: text('phone', { length: 30 }),
  
  // Commission Structures (SFILE.DAT)
  localCommissionPct: real('local_commission_pct').notNull().default(0),      // Legacy LCOMM
  outstationCommissionPct: real('outstation_commission_pct').notNull().default(0), // Legacy OCOMM
  subSalesCommissionPct: real('sub_sales_commission_pct').notNull().default(0),    // Legacy SCOMM
  
  // Sales Performance Tracking Accumulators
  monthlySales: real('monthly_sales').default(0),     // Legacy MSALAMT1
  monthlyReturns: real('monthly_returns').default(0), // Legacy MSALRET1
  yearlySales: real('yearly_sales').default(0),       // Legacy LSALAMT1
  
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('idx_salesmen_code').on(table.code),
  index('idx_salesmen_name').on(table.name),
  index('idx_salesmen_is_active').on(table.isActive),
]);

export type Salesman = typeof salesmen.$inferSelect;
export type NewSalesman = typeof salesmen.$inferInsert;

/**
 * 4. Geographic Area Master (Legacy: AFILE.DAT)
 */
export const areas = sqliteTable('areas', {
  id: text('id').primaryKey(),                     // UUID / legacy ID
  code: text('code', { length: 5 }).notNull().unique(), // Legacy ACODE: '001', '002'
  name: text('name', { length: 50 }).notNull(),    // Legacy ANAME: 'CHENNAI', 'TRICHY'
  district: text('district', { length: 50 }),      // Legacy DIST
  salesmanId: text('salesman_id').references(() => salesmen.id, { onDelete: 'set null' }),
  
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('idx_areas_code').on(table.code),
  index('idx_areas_name').on(table.name),
  index('idx_areas_salesman_id').on(table.salesmanId),
]);

export type Area = typeof areas.$inferSelect;
export type NewArea = typeof areas.$inferInsert;

/**
 * 5. Doctor Master (Legacy: DOCMAST.DAT)
 */
export const doctors = sqliteTable('doctors', {
  id: text('id').primaryKey(),                     // UUID / legacy ID
  code: text('code', { length: 10 }).notNull().unique(), // Legacy DOCNO: '0001'
  name: text('name', { length: 100 }).notNull(),   // Legacy DOCNAME: 'DR.NAME'
  addressLine1: text('address_line1', { length: 100 }), // Legacy DOCADD1
  addressLine2: text('address_line2', { length: 100 }), // Legacy DOCADD2
  addressLine3: text('address_line3', { length: 100 }), // Legacy DOCADD3
  phone: text('phone', { length: 30 }),            // Legacy DPHONE
  registrationNo: text('registration_no', { length: 30 }), // Legacy RCNO (Medical Council Reg)
  qualification: text('qualification', { length: 50 }),
  specialization: text('specialization', { length: 50 }),
  
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('idx_doctors_code').on(table.code),
  index('idx_doctors_name').on(table.name),
  index('idx_doctors_registration').on(table.registrationNo),
]);

export type Doctor = typeof doctors.$inferSelect;
export type NewDoctor = typeof doctors.$inferInsert;

/**
 * 6. Supplier / Vendor Master (Legacy: PARMAST.DAT & SUPMAST.DAT)
 */
export const suppliers = sqliteTable('suppliers', {
  id: text('id').primaryKey(),                     // UUID / legacy ID
  code: text('code', { length: 10 }).notNull().unique(), // Legacy PACODE: '001', '002'
  name: text('name', { length: 100 }).notNull(),   // Legacy PNAME: 'GRAND AYUSH'
  contactPerson: text('contact_person', { length: 50 }),
  
  // Postal & Communication Details (PARMAST.DAT)
  addressLine1: text('address_line1', { length: 100 }), // Legacy PADD1
  addressLine2: text('address_line2', { length: 100 }), // Legacy PADD2
  addressLine3: text('address_line3', { length: 100 }), // Legacy PADD3
  addressLine4: text('address_line4', { length: 100 }), // Legacy PADD4
  pincode: text('pincode', { length: 10 }),
  phone: text('phone', { length: 30 }),                 // Legacy PHONE
  email: text('email', { length: 100 }),
  
  // Statutory Compliance (GSTIN, PAN, Drug Licenses)
  gstin: text('gstin', { length: 15 }),                 // Legacy GSTIN
  pan: text('pan', { length: 10 }),                     // Legacy PAN
  drugLicenseNo: text('drug_license_no', { length: 50 }),
  fssaiNo: text('fssai_no', { length: 20 }),
  tngst: text('tngst', { length: 20 }),                 // Legacy TIN/TNGST
  tdsFlag: integer('tds_flag', { mode: 'boolean' }).notNull().default(false), // Legacy TDSFLAG
  
  // Banking & Financial Accounting Integration (FAUPT.PRG)
  bankName: text('bank_name', { length: 50 }),          // Legacy BANK
  bankAccountNo: text('bank_account_no', { length: 30 }),
  bankIfsc: text('bank_ifsc', { length: 15 }),          // Legacy IFSC
  glAccountCode: text('gl_account_code', { length: 10 }), // Legacy FACODE (e.g. '0014')
  
  // Commercial Terms & Balances
  openingBalance: real('opening_balance').notNull().default(0), // Legacy OPVAL
  currentBalance: real('current_balance').notNull().default(0), // Real-time AP balance
  creditDays: integer('credit_days', { mode: 'number' }).default(30),
  defaultDiscountPct: real('default_discount_pct').default(0),
  isBlocked: integer('is_blocked', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('idx_suppliers_code').on(table.code),
  index('idx_suppliers_name').on(table.name),
  index('idx_suppliers_gstin').on(table.gstin),
  index('idx_suppliers_gl_code').on(table.glAccountCode),
]);

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;

/**
 * 7. Customer Master (Legacy: CUSTMAST.DAT)
 */
export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),                     // UUID / legacy ID
  code: text('code', { length: 10 }).notNull().unique(), // Legacy CCODE: '0001', 'abcd'
  name: text('name', { length: 100 }).notNull(),   // Legacy CNAME: Pharmacy / Hospital Name
  contactPerson: text('contact_person', { length: 50 }),
  
  // Foreign Keys
  areaId: text('area_id').notNull().references(() => areas.id, { onDelete: 'restrict' }),
  salesmanId: text('salesman_id').references(() => salesmen.id, { onDelete: 'set null' }),
  
  // Physical & Communication Details (CUSTMAST.DAT)
  addressLine1: text('address_line1', { length: 100 }), // Legacy CADD1
  addressLine2: text('address_line2', { length: 100 }), // Legacy CADD2
  addressLine3: text('address_line3', { length: 100 }), // Legacy CADD3
  addressLine4: text('address_line4', { length: 100 }), // Legacy CADD4 (Town/Place)
  pincode: text('pincode', { length: 10 }),             // Legacy PINCODE
  phone: text('phone', { length: 50 }),                 // Legacy CPHONE
  email: text('email', { length: 100 }),                // Legacy EMAIL
  billingAddress1: text('billing_address_1', { length: 100 }), // Legacy BADD1
  billingAddress2: text('billing_address_2', { length: 100 }), // Legacy BADD2
  
  // Billing Mode & Logistics
  billingType: text('billing_type', { length: 1 }).notNull().default('L'), // 'L'=Local, 'O'=Outstation
  paymentTerms: text('payment_terms', { length: 1 }).notNull().default('R'), // 'C'=Cash, 'R'=Credit, 'H'=Cheque
  preferredLorry: text('preferred_lorry', { length: 50 }), // Legacy LORRY transport
  routeCode: text('route_code', { length: 10 }),          // Legacy RCCODE
  
  // Statutory Compliance (GSTIN, PAN, Form 20B/21B, FSSAI)
  gstin: text('gstin', { length: 15 }),                 // 15-digit GSTIN
  pan: text('pan', { length: 10 }),                     // 10-digit PAN
  dlNo20b: text('dl_no_20b', { length: 30 }),           // Legacy CDL20 (Form 20B License)
  dlNo21b: text('dl_no_21b', { length: 30 }),           // Legacy CDL21 (Form 21B License)
  dlExpiryDate: text('dl_expiry_date'),                 // Legacy DLDT: ISO 'YYYY-MM-DD'
  fssaiNo: text('fssai_no', { length: 20 }),            // Legacy FSSAI
  tngstNo: text('tngst_no', { length: 20 }),            // Legacy CTNGST
  cstNo: text('cst_no', { length: 20 }),                // Legacy CCSTNO
  
  // Credit & Financial Management (INVPRE.PRG & COLENTY3.PRG)
  creditDays: integer('credit_days', { mode: 'number' }).notNull().default(21), // Legacy CRDAYS
  creditLimit: real('credit_limit').notNull().default(0),                       // Legacy CRLIMIT
  cashCreditDays: integer('cash_credit_days', { mode: 'number' }).default(0),  // Legacy CADAYS
  cashCreditLimit: real('cash_credit_limit').default(0),                       // Legacy CALIMIT
  defaultDiscountPct: real('default_discount_pct').notNull().default(0),       // Legacy DPER
  bypassCreditLimit: integer('bypass_credit_limit', { mode: 'boolean' }).notNull().default(false), // BYEPASS
  openingBalance: real('opening_balance').notNull().default(0),                // Legacy MOPVAL
  closingBalance: real('closing_balance').notNull().default(0),                // Legacy CLBAL
  
  // Regulatory Flags
  isBlocked: integer('is_blocked', { mode: 'boolean' }).notNull().default(false), // Legacy BLOCK
  isTaxExempt: integer('is_tax_exempt', { mode: 'boolean' }).notNull().default(false), // NOTAX
  isTcsApplicable: integer('is_tcs_applicable', { mode: 'boolean' }).notNull().default(false), // TCSFLAG
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  remarks: text('remarks'),                                                    // Legacy REMARK1/2
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('idx_customers_code').on(table.code),
  index('idx_customers_name').on(table.name),
  index('idx_customers_area_id').on(table.areaId),
  index('idx_customers_salesman_id').on(table.salesmanId),
  index('idx_customers_gstin').on(table.gstin),
  index('idx_customers_dl_expiry').on(table.dlExpiryDate),
  index('idx_customers_is_blocked').on(table.isBlocked),
]);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

/**
 * 8. Product Master (Legacy: MEDIMAST.DAT Catalog Fields)
 */
export const products = sqliteTable('products', {
  id: text('id').primaryKey(),                     // UUID / legacy ID
  code: text('code', { length: 10 }).notNull().unique(), // Legacy MDCODE: '00001'
  name: text('name', { length: 100 }).notNull(),   // Legacy MDNAME: 'DOLO 650'
  
  // Foreign Keys
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  supplierId: text('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  taxCode: text('tax_code', { length: 2 }).notNull().references(() => taxSlabs.code, { onDelete: 'restrict' }),
  
  // Packaging & Logistics (MEDIMAST.DAT)
  packaging: text('packaging', { length: 30 }).notNull(), // Legacy PACKG: '10x10 TAB', 'TABLET'
  packagingDetail: text('packaging_detail', { length: 50 }), // Legacy DETAIL
  uqc: text('uqc', { length: 10 }).notNull().default('BOX'), // Legacy UQC: 'BOX', 'TBS', 'BTL', 'TAB'
  rackLocation: text('rack_location', { length: 20 }),       // Legacy RACK: Warehouse bin shelf
  
  // Statutory Regulatory Classifications
  hsnCode: text('hsn_code', { length: 15 }).notNull(),      // Legacy HSN: '30049099'
  barcode: text('barcode', { length: 50 }),                 // Legacy PRODID
  drugScheduleFlag: text('drug_schedule_flag', { length: 5 }), // Legacy DIFLAG: 'H', 'H1', 'X'
  isScheduleH: integer('is_schedule_h', { mode: 'boolean' }).notNull().default(false),
  isPsychotropic: integer('is_psychotropic', { mode: 'boolean' }).notNull().default(false), // PSYFLAG
  
  // Commercial Terms & Order Policies
  defaultSupplierDiscountPct: real('default_supplier_discount_pct').default(0), // Legacy SUPDISC
  minOrderQty: integer('min_order_qty', { mode: 'number' }).notNull().default(0), // Legacy MINORD
  reorderLevel: integer('reorder_level', { mode: 'number' }).notNull().default(0), // Legacy ROQTY
  warningQty: integer('warning_qty', { mode: 'number' }).notNull().default(0),     // Legacy WANQTY
  allowInvoiceDiscount: integer('allow_invoice_discount', { mode: 'boolean' }).notNull().default(true), // INVDISC
  allowRateModification: integer('allow_rate_modification', { mode: 'boolean' }).notNull().default(true), // ALTRTE
  
  // Status Flags
  isBlocked: integer('is_blocked', { mode: 'boolean' }).notNull().default(false), // Legacy BLOCK
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  
  // Fast Cached Stock On Hand (Maintained atomically on batch transactions)
  totalStockOnHand: integer('total_stock_on_hand', { mode: 'number' }).notNull().default(0), // SOH
  
  // Transaction Timestamp Audit
  lastSaleDate: text('last_sale_date'),             // Legacy LSALDT: ISO 'YYYY-MM-DD'
  lastPurchaseDate: text('last_purchase_date'),     // Legacy LPURDT: ISO 'YYYY-MM-DD'
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('idx_products_code').on(table.code),
  index('idx_products_name').on(table.name),
  index('idx_products_company_id').on(table.companyId),
  index('idx_products_supplier_id').on(table.supplierId),
  index('idx_products_hsn_code').on(table.hsnCode),
  index('idx_products_tax_code').on(table.taxCode),
  index('idx_products_rack').on(table.rackLocation),
  index('idx_products_is_blocked').on(table.isBlocked),
]);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

/**
 * 9. Product Batches (Normalized 1-to-many relationship replacing FoxPro's 9 fixed slots BAT1..9)
 */
export const productBatches = sqliteTable('product_batches', {
  id: text('id').primaryKey(),                     // UUID / batch ID
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  
  // Batch Identification (Legacy BAT1..9 & EXP1..9)
  batchNo: text('batch_no', { length: 30 }).notNull(), // Legacy BAT1..9: '1234', 'BT24018'
  expiryDate: text('expiry_date').notNull(),          // Legacy EXP1..9: ISO 'YYYY-MM-DD'
  expiryMonthYear: text('expiry_month_year', { length: 7 }), // UI Helper: 'MM/YY' (e.g. '08/27')
  
  // Rates & Financial Pricing (2 Decimal Precision)
  purchaseRate: real('purchase_rate').notNull(),      // Legacy PRATE1..9: Cost rate
  sellingRate: real('selling_rate').notNull(),        // Legacy SRATE1..9: Standard wholesale price
  secondaryRate: real('secondary_rate').default(0),   // Legacy SERATE1..9: Tier/Special price
  mrp: real('mrp').notNull(),                         // Legacy MRP1..9: Maximum Retail Price
  
  // Physical Stock Inventory
  stockQty: integer('stock_qty', { mode: 'number' }).notNull().default(0), // Legacy QTY1..9
  quarantineQty: integer('quarantine_qty', { mode: 'number' }).notNull().default(0), // Expired/Damaged
  
  // Indian Pharma Bonus / Scheme Configuration (INVPRE.PRG:589)
  // Formula: FreeQty = floor(BilledQty / schemeThreshold) * schemeFreeQty
  schemeThreshold: integer('scheme_threshold', { mode: 'number' }).notNull().default(0), // Legacy QY1..9 (Buy Qty)
  schemeFreeQty: integer('scheme_free_qty', { mode: 'number' }).notNull().default(0),     // Legacy FQY1..9 (Free Qty)
  
  // Tax Slab & Special Offer
  taxCode: text('tax_code', { length: 2 }).notNull().references(() => taxSlabs.code, { onDelete: 'restrict' }),
  offerDiscountPct: real('offer_discount_pct').default(0), // Legacy OFFDIS1..9
  
  // Operational History
  lastPurchaseDate: text('last_purchase_date'),       // Legacy LPDT1..9: ISO 'YYYY-MM-DD'
  isBlocked: integer('is_blocked', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('idx_product_batches_prod_batch').on(table.productId, table.batchNo),
  index('idx_product_batches_batch_no').on(table.batchNo),
  index('idx_product_batches_expiry_date').on(table.expiryDate), // Crucial for FIFO & near-expiry
  index('idx_product_batches_stock_qty').on(table.stockQty),     // Filter active stock > 0
  index('idx_product_batches_product_id').on(table.productId),
]);

export type ProductBatch = typeof productBatches.$inferSelect;
export type NewProductBatch = typeof productBatches.$inferInsert;
