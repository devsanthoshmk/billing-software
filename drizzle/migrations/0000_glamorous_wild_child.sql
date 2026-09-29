CREATE TABLE `areas` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text(5) NOT NULL,
	`name` text(50) NOT NULL,
	`district` text(50),
	`salesman_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`salesman_id`) REFERENCES `salesmen`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `areas_code_unique` ON `areas` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_areas_code` ON `areas` (`code`);--> statement-breakpoint
CREATE INDEX `idx_areas_name` ON `areas` (`name`);--> statement-breakpoint
CREATE INDEX `idx_areas_salesman_id` ON `areas` (`salesman_id`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text(10) NOT NULL,
	`name` text(100) NOT NULL,
	`short_name` text(30),
	`contact_person` text(50),
	`address_line1` text(100),
	`address_line2` text(100),
	`address_line3` text(100),
	`address_line4` text(100),
	`phone` text(30),
	`email` text(100),
	`default_discount_pct` real DEFAULT 0,
	`special_discount_flag` integer DEFAULT false,
	`free_value_scheme` text(1) DEFAULT 'Y',
	`is_blocked` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_code_unique` ON `companies` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_companies_code` ON `companies` (`code`);--> statement-breakpoint
CREATE INDEX `idx_companies_name` ON `companies` (`name`);--> statement-breakpoint
CREATE INDEX `idx_companies_is_active` ON `companies` (`is_active`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text(10) NOT NULL,
	`name` text(100) NOT NULL,
	`contact_person` text(50),
	`area_id` text NOT NULL,
	`salesman_id` text,
	`address_line1` text(100),
	`address_line2` text(100),
	`address_line3` text(100),
	`address_line4` text(100),
	`pincode` text(10),
	`phone` text(50),
	`email` text(100),
	`billing_address_1` text(100),
	`billing_address_2` text(100),
	`billing_type` text(1) DEFAULT 'L' NOT NULL,
	`payment_terms` text(1) DEFAULT 'R' NOT NULL,
	`preferred_lorry` text(50),
	`route_code` text(10),
	`gstin` text(15),
	`pan` text(10),
	`dl_no_20b` text(30),
	`dl_no_21b` text(30),
	`dl_expiry_date` text,
	`fssai_no` text(20),
	`tngst_no` text(20),
	`cst_no` text(20),
	`credit_days` integer DEFAULT 21 NOT NULL,
	`credit_limit` real DEFAULT 0 NOT NULL,
	`cash_credit_days` integer DEFAULT 0,
	`cash_credit_limit` real DEFAULT 0,
	`default_discount_pct` real DEFAULT 0 NOT NULL,
	`bypass_credit_limit` integer DEFAULT false NOT NULL,
	`opening_balance` real DEFAULT 0 NOT NULL,
	`closing_balance` real DEFAULT 0 NOT NULL,
	`is_blocked` integer DEFAULT false NOT NULL,
	`is_tax_exempt` integer DEFAULT false NOT NULL,
	`is_tcs_applicable` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`remarks` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`salesman_id`) REFERENCES `salesmen`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_code_unique` ON `customers` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customers_code` ON `customers` (`code`);--> statement-breakpoint
CREATE INDEX `idx_customers_name` ON `customers` (`name`);--> statement-breakpoint
CREATE INDEX `idx_customers_area_id` ON `customers` (`area_id`);--> statement-breakpoint
CREATE INDEX `idx_customers_salesman_id` ON `customers` (`salesman_id`);--> statement-breakpoint
CREATE INDEX `idx_customers_gstin` ON `customers` (`gstin`);--> statement-breakpoint
CREATE INDEX `idx_customers_dl_expiry` ON `customers` (`dl_expiry_date`);--> statement-breakpoint
CREATE INDEX `idx_customers_is_blocked` ON `customers` (`is_blocked`);--> statement-breakpoint
CREATE TABLE `doctors` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text(10) NOT NULL,
	`name` text(100) NOT NULL,
	`address_line1` text(100),
	`address_line2` text(100),
	`address_line3` text(100),
	`phone` text(30),
	`registration_no` text(30),
	`qualification` text(50),
	`specialization` text(50),
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `doctors_code_unique` ON `doctors` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_doctors_code` ON `doctors` (`code`);--> statement-breakpoint
CREATE INDEX `idx_doctors_name` ON `doctors` (`name`);--> statement-breakpoint
CREATE INDEX `idx_doctors_registration` ON `doctors` (`registration_no`);--> statement-breakpoint
CREATE TABLE `product_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`batch_no` text(30) NOT NULL,
	`expiry_date` text NOT NULL,
	`expiry_month_year` text(7),
	`purchase_rate` real NOT NULL,
	`selling_rate` real NOT NULL,
	`secondary_rate` real DEFAULT 0,
	`mrp` real NOT NULL,
	`stock_qty` integer DEFAULT 0 NOT NULL,
	`quarantine_qty` integer DEFAULT 0 NOT NULL,
	`scheme_threshold` integer DEFAULT 0 NOT NULL,
	`scheme_free_qty` integer DEFAULT 0 NOT NULL,
	`tax_code` text(2) NOT NULL,
	`offer_discount_pct` real DEFAULT 0,
	`last_purchase_date` text,
	`is_blocked` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tax_code`) REFERENCES `tax_slabs`(`code`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_product_batches_prod_batch` ON `product_batches` (`product_id`,`batch_no`);--> statement-breakpoint
CREATE INDEX `idx_product_batches_batch_no` ON `product_batches` (`batch_no`);--> statement-breakpoint
CREATE INDEX `idx_product_batches_expiry_date` ON `product_batches` (`expiry_date`);--> statement-breakpoint
CREATE INDEX `idx_product_batches_stock_qty` ON `product_batches` (`stock_qty`);--> statement-breakpoint
CREATE INDEX `idx_product_batches_product_id` ON `product_batches` (`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text(10) NOT NULL,
	`name` text(100) NOT NULL,
	`company_id` text NOT NULL,
	`supplier_id` text,
	`tax_code` text(2) NOT NULL,
	`packaging` text(30) NOT NULL,
	`packaging_detail` text(50),
	`uqc` text(10) DEFAULT 'BOX' NOT NULL,
	`rack_location` text(20),
	`hsn_code` text(15) NOT NULL,
	`barcode` text(50),
	`drug_schedule_flag` text(5),
	`is_schedule_h` integer DEFAULT false NOT NULL,
	`is_psychotropic` integer DEFAULT false NOT NULL,
	`default_supplier_discount_pct` real DEFAULT 0,
	`min_order_qty` integer DEFAULT 0 NOT NULL,
	`reorder_level` integer DEFAULT 0 NOT NULL,
	`warning_qty` integer DEFAULT 0 NOT NULL,
	`allow_invoice_discount` integer DEFAULT true NOT NULL,
	`allow_rate_modification` integer DEFAULT true NOT NULL,
	`is_blocked` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`total_stock_on_hand` integer DEFAULT 0 NOT NULL,
	`last_sale_date` text,
	`last_purchase_date` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`tax_code`) REFERENCES `tax_slabs`(`code`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_code_unique` ON `products` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_code` ON `products` (`code`);--> statement-breakpoint
CREATE INDEX `idx_products_name` ON `products` (`name`);--> statement-breakpoint
CREATE INDEX `idx_products_company_id` ON `products` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_products_supplier_id` ON `products` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `idx_products_hsn_code` ON `products` (`hsn_code`);--> statement-breakpoint
CREATE INDEX `idx_products_tax_code` ON `products` (`tax_code`);--> statement-breakpoint
CREATE INDEX `idx_products_rack` ON `products` (`rack_location`);--> statement-breakpoint
CREATE INDEX `idx_products_is_blocked` ON `products` (`is_blocked`);--> statement-breakpoint
CREATE TABLE `salesmen` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text(5) NOT NULL,
	`name` text(50) NOT NULL,
	`phone` text(30),
	`local_commission_pct` real DEFAULT 0 NOT NULL,
	`outstation_commission_pct` real DEFAULT 0 NOT NULL,
	`sub_sales_commission_pct` real DEFAULT 0 NOT NULL,
	`monthly_sales` real DEFAULT 0,
	`monthly_returns` real DEFAULT 0,
	`yearly_sales` real DEFAULT 0,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `salesmen_code_unique` ON `salesmen` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_salesmen_code` ON `salesmen` (`code`);--> statement-breakpoint
CREATE INDEX `idx_salesmen_name` ON `salesmen` (`name`);--> statement-breakpoint
CREATE INDEX `idx_salesmen_is_active` ON `salesmen` (`is_active`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text(10) NOT NULL,
	`name` text(100) NOT NULL,
	`contact_person` text(50),
	`address_line1` text(100),
	`address_line2` text(100),
	`address_line3` text(100),
	`address_line4` text(100),
	`pincode` text(10),
	`phone` text(30),
	`email` text(100),
	`gstin` text(15),
	`pan` text(10),
	`drug_license_no` text(50),
	`fssai_no` text(20),
	`tngst` text(20),
	`tds_flag` integer DEFAULT false NOT NULL,
	`bank_name` text(50),
	`bank_account_no` text(30),
	`bank_ifsc` text(15),
	`gl_account_code` text(10),
	`opening_balance` real DEFAULT 0 NOT NULL,
	`current_balance` real DEFAULT 0 NOT NULL,
	`credit_days` integer DEFAULT 30,
	`default_discount_pct` real DEFAULT 0,
	`is_blocked` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_code_unique` ON `suppliers` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_suppliers_code` ON `suppliers` (`code`);--> statement-breakpoint
CREATE INDEX `idx_suppliers_name` ON `suppliers` (`name`);--> statement-breakpoint
CREATE INDEX `idx_suppliers_gstin` ON `suppliers` (`gstin`);--> statement-breakpoint
CREATE INDEX `idx_suppliers_gl_code` ON `suppliers` (`gl_account_code`);--> statement-breakpoint
CREATE TABLE `tax_slabs` (
	`code` text(2) PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`cgst_rate` real DEFAULT 0 NOT NULL,
	`sgst_rate` real DEFAULT 0 NOT NULL,
	`igst_rate` real DEFAULT 0 NOT NULL,
	`st_rate` real DEFAULT 0,
	`sc_rate` real DEFAULT 0,
	`cst_rate` real DEFAULT 0,
	`rst_rate` real DEFAULT 0,
	`gl_sales_account` text,
	`gl_tax_account` text,
	`gl_purchase_account` text,
	`gl_purch_tax_account` text,
	`is_exempt` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tax_slabs_is_active` ON `tax_slabs` (`is_active`);--> statement-breakpoint
CREATE TABLE `credit_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`note_no` text NOT NULL,
	`date` text NOT NULL,
	`party_type` text DEFAULT 'CUSTOMER' NOT NULL,
	`party_id` text NOT NULL,
	`note_type` text DEFAULT 'RATE_DIFFERENCE' NOT NULL,
	`reference_invoice_id` text,
	`reference_invoice_no` text,
	`taxable_amount` real DEFAULT 0 NOT NULL,
	`cgst_amount` real DEFAULT 0 NOT NULL,
	`sgst_amount` real DEFAULT 0 NOT NULL,
	`igst_amount` real DEFAULT 0 NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`adjusted_amount` real DEFAULT 0 NOT NULL,
	`balance_amount` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`remarks` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_notes_note_no_unique` ON `credit_notes` (`note_no`);--> statement-breakpoint
CREATE INDEX `idx_credit_notes_party` ON `credit_notes` (`party_id`);--> statement-breakpoint
CREATE INDEX `idx_credit_notes_status` ON `credit_notes` (`status`);--> statement-breakpoint
CREATE TABLE `debit_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`note_no` text NOT NULL,
	`date` text NOT NULL,
	`party_type` text DEFAULT 'SUPPLIER' NOT NULL,
	`party_id` text NOT NULL,
	`note_type` text DEFAULT 'PURCHASE_RETURN' NOT NULL,
	`reference_invoice_id` text,
	`reference_invoice_no` text,
	`taxable_amount` real DEFAULT 0 NOT NULL,
	`cgst_amount` real DEFAULT 0 NOT NULL,
	`sgst_amount` real DEFAULT 0 NOT NULL,
	`igst_amount` real DEFAULT 0 NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`adjusted_amount` real DEFAULT 0 NOT NULL,
	`balance_amount` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`remarks` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `debit_notes_note_no_unique` ON `debit_notes` (`note_no`);--> statement-breakpoint
CREATE INDEX `idx_debit_notes_party` ON `debit_notes` (`party_id`);--> statement-breakpoint
CREATE INDEX `idx_debit_notes_status` ON `debit_notes` (`status`);--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`sort_order` integer DEFAULT 1 NOT NULL,
	`product_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`product_name` text NOT NULL,
	`packaging` text NOT NULL,
	`hsn_code` text NOT NULL,
	`batch_no` text NOT NULL,
	`expiry_date` text NOT NULL,
	`quantity` integer NOT NULL,
	`free_quantity` integer DEFAULT 0 NOT NULL,
	`is_replacement` integer DEFAULT false NOT NULL,
	`purchase_rate` real NOT NULL,
	`selling_rate` real NOT NULL,
	`secondary_rate` real,
	`mrp` real NOT NULL,
	`gross_amount` real NOT NULL,
	`trade_discount_pct` real DEFAULT 0 NOT NULL,
	`trade_discount_amount` real DEFAULT 0 NOT NULL,
	`taxable_amount` real NOT NULL,
	`tax_code` text(2) NOT NULL,
	`cgst_rate` real DEFAULT 0 NOT NULL,
	`cgst_amount` real DEFAULT 0 NOT NULL,
	`sgst_rate` real DEFAULT 0 NOT NULL,
	`sgst_amount` real DEFAULT 0 NOT NULL,
	`igst_rate` real DEFAULT 0 NOT NULL,
	`igst_amount` real DEFAULT 0 NOT NULL,
	`net_amount` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`batch_id`) REFERENCES `product_batches`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tax_code`) REFERENCES `tax_slabs`(`code`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_invoice_items_invoice` ON `invoice_items` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_invoice_items_product` ON `invoice_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `idx_invoice_items_batch` ON `invoice_items` (`batch_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_no` text NOT NULL,
	`invoice_series` integer DEFAULT 1 NOT NULL,
	`invoice_date` text NOT NULL,
	`invoice_time` text NOT NULL,
	`customer_id` text NOT NULL,
	`area_id` text,
	`salesman_id` text,
	`doctor_id` text,
	`is_interstate` integer DEFAULT false NOT NULL,
	`payment_terms` text DEFAULT 'CREDIT' NOT NULL,
	`due_date` text NOT NULL,
	`subtotal_gross` real DEFAULT 0 NOT NULL,
	`total_line_discount` real DEFAULT 0 NOT NULL,
	`cash_discount_pct` real DEFAULT 0 NOT NULL,
	`cash_discount_amount` real DEFAULT 0 NOT NULL,
	`taxable_amount` real DEFAULT 0 NOT NULL,
	`cgst_amount` real DEFAULT 0 NOT NULL,
	`sgst_amount` real DEFAULT 0 NOT NULL,
	`igst_amount` real DEFAULT 0 NOT NULL,
	`total_tax_amount` real DEFAULT 0 NOT NULL,
	`freight_charges` real DEFAULT 0 NOT NULL,
	`box_charges` real DEFAULT 0 NOT NULL,
	`service_charges` real DEFAULT 0 NOT NULL,
	`tcs_pct` real DEFAULT 0 NOT NULL,
	`tcs_amount` real DEFAULT 0 NOT NULL,
	`round_off` real DEFAULT 0 NOT NULL,
	`net_amount` real DEFAULT 0 NOT NULL,
	`total_items_count` integer DEFAULT 0 NOT NULL,
	`total_quantity` integer DEFAULT 0 NOT NULL,
	`total_boxes` integer DEFAULT 0 NOT NULL,
	`customer_gstin` text,
	`customer_dl20b` text,
	`customer_dl21b` text,
	`irn_no` text,
	`ack_no` text,
	`ack_date` text,
	`delivery_challan_no` text,
	`lr_no` text,
	`transport_name` text,
	`destination` text,
	`credit_limit_bypassed` integer DEFAULT false NOT NULL,
	`day_end_locked` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'FINAL' NOT NULL,
	`is_cancelled` integer DEFAULT false NOT NULL,
	`cancelled_at` text,
	`cancelled_reason` text,
	`remarks` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`salesman_id`) REFERENCES `salesmen`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_invoice_no_unique` ON `invoices` (`invoice_no`);--> statement-breakpoint
CREATE INDEX `idx_invoices_date` ON `invoices` (`invoice_date`);--> statement-breakpoint
CREATE INDEX `idx_invoices_customer` ON `invoices` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_invoices_status` ON `invoices` (`status`);--> statement-breakpoint
CREATE INDEX `idx_invoices_dayend` ON `invoices` (`day_end_locked`);--> statement-breakpoint
CREATE TABLE `purchase_items` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_id` text NOT NULL,
	`sort_order` integer DEFAULT 1 NOT NULL,
	`product_id` text NOT NULL,
	`batch_id` text,
	`batch_no` text NOT NULL,
	`expiry_date` text NOT NULL,
	`quantity` integer NOT NULL,
	`free_quantity` integer DEFAULT 0 NOT NULL,
	`scheme_threshold` integer DEFAULT 0 NOT NULL,
	`scheme_free_qty` integer DEFAULT 0 NOT NULL,
	`purchase_rate` real NOT NULL,
	`selling_rate` real NOT NULL,
	`secondary_rate` real,
	`mrp` real NOT NULL,
	`target_margin_pct` real DEFAULT 0,
	`trade_discount_pct` real DEFAULT 0 NOT NULL,
	`trade_discount_amount` real DEFAULT 0 NOT NULL,
	`gross_amount` real NOT NULL,
	`taxable_amount` real NOT NULL,
	`tax_code` text(2) NOT NULL,
	`cgst_rate` real DEFAULT 0 NOT NULL,
	`cgst_amount` real DEFAULT 0 NOT NULL,
	`sgst_rate` real DEFAULT 0 NOT NULL,
	`sgst_amount` real DEFAULT 0 NOT NULL,
	`igst_rate` real DEFAULT 0 NOT NULL,
	`igst_amount` real DEFAULT 0 NOT NULL,
	`net_amount` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`batch_id`) REFERENCES `product_batches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`tax_code`) REFERENCES `tax_slabs`(`code`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_purchase_items_purchase` ON `purchase_items` (`purchase_id`);--> statement-breakpoint
CREATE INDEX `idx_purchase_items_product` ON `purchase_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `idx_purchase_items_batch` ON `purchase_items` (`batch_id`);--> statement-breakpoint
CREATE TABLE `purchase_return_items` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_return_id` text NOT NULL,
	`sort_order` integer DEFAULT 1 NOT NULL,
	`product_id` text NOT NULL,
	`batch_id` text,
	`batch_no` text NOT NULL,
	`expiry_date` text NOT NULL,
	`quantity` integer NOT NULL,
	`free_quantity` integer DEFAULT 0 NOT NULL,
	`purchase_rate` real NOT NULL,
	`mrp` real NOT NULL,
	`taxable_amount` real NOT NULL,
	`tax_code` text(2) NOT NULL,
	`cgst_rate` real DEFAULT 0 NOT NULL,
	`cgst_amount` real DEFAULT 0 NOT NULL,
	`sgst_rate` real DEFAULT 0 NOT NULL,
	`sgst_amount` real DEFAULT 0 NOT NULL,
	`igst_rate` real DEFAULT 0 NOT NULL,
	`igst_amount` real DEFAULT 0 NOT NULL,
	`net_amount` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`purchase_return_id`) REFERENCES `purchase_returns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`batch_id`) REFERENCES `product_batches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`tax_code`) REFERENCES `tax_slabs`(`code`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_purchase_return_items_return` ON `purchase_return_items` (`purchase_return_id`);--> statement-breakpoint
CREATE INDEX `idx_purchase_return_items_product` ON `purchase_return_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `purchase_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`return_no` text NOT NULL,
	`return_date` text NOT NULL,
	`supplier_id` text NOT NULL,
	`purchase_id` text,
	`supplier_bill_no` text,
	`total_gross_amount` real DEFAULT 0 NOT NULL,
	`discount_amount` real DEFAULT 0 NOT NULL,
	`taxable_amount` real DEFAULT 0 NOT NULL,
	`cgst_amount` real DEFAULT 0 NOT NULL,
	`sgst_amount` real DEFAULT 0 NOT NULL,
	`igst_amount` real DEFAULT 0 NOT NULL,
	`round_off` real DEFAULT 0 NOT NULL,
	`net_amount` real DEFAULT 0 NOT NULL,
	`adjusted_amount` real DEFAULT 0 NOT NULL,
	`balance_amount` real DEFAULT 0 NOT NULL,
	`is_fully_adjusted` integer DEFAULT false NOT NULL,
	`lr_no` text,
	`lr_date` text,
	`transport_name` text,
	`day_end_locked` integer DEFAULT false NOT NULL,
	`is_cancelled` integer DEFAULT false NOT NULL,
	`remarks` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_returns_return_no_unique` ON `purchase_returns` (`return_no`);--> statement-breakpoint
CREATE INDEX `idx_purchase_returns_supplier` ON `purchase_returns` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `idx_purchase_returns_date` ON `purchase_returns` (`return_date`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`inward_no` text NOT NULL,
	`supplier_id` text NOT NULL,
	`supplier_bill_no` text NOT NULL,
	`supplier_bill_date` text NOT NULL,
	`inward_date` text NOT NULL,
	`due_date` text NOT NULL,
	`payment_terms` text DEFAULT 'CREDIT' NOT NULL,
	`is_interstate` integer DEFAULT false NOT NULL,
	`total_gross_amount` real DEFAULT 0 NOT NULL,
	`trade_discount_amount` real DEFAULT 0 NOT NULL,
	`cash_discount_pct` real DEFAULT 0 NOT NULL,
	`cash_discount_amount` real DEFAULT 0 NOT NULL,
	`taxable_amount` real DEFAULT 0 NOT NULL,
	`cgst_amount` real DEFAULT 0 NOT NULL,
	`sgst_amount` real DEFAULT 0 NOT NULL,
	`igst_amount` real DEFAULT 0 NOT NULL,
	`total_tax_amount` real DEFAULT 0 NOT NULL,
	`other_charges_add` real DEFAULT 0 NOT NULL,
	`other_charges_less` real DEFAULT 0 NOT NULL,
	`round_off` real DEFAULT 0 NOT NULL,
	`net_amount` real DEFAULT 0 NOT NULL,
	`paid_amount` real DEFAULT 0 NOT NULL,
	`balance_amount` real DEFAULT 0 NOT NULL,
	`payment_status` text DEFAULT 'UNPAID' NOT NULL,
	`is_transit` integer DEFAULT false NOT NULL,
	`day_end_locked` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'VERIFIED' NOT NULL,
	`remarks` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchases_inward_no_unique` ON `purchases` (`inward_no`);--> statement-breakpoint
CREATE INDEX `idx_purchases_supplier` ON `purchases` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `idx_purchases_inward_date` ON `purchases` (`inward_date`);--> statement-breakpoint
CREATE INDEX `idx_purchases_bill_no` ON `purchases` (`supplier_bill_no`);--> statement-breakpoint
CREATE INDEX `idx_purchases_payment_status` ON `purchases` (`payment_status`);--> statement-breakpoint
CREATE TABLE `sales_return_items` (
	`id` text PRIMARY KEY NOT NULL,
	`sales_return_id` text NOT NULL,
	`sort_order` integer DEFAULT 1 NOT NULL,
	`product_id` text NOT NULL,
	`batch_id` text,
	`batch_no` text NOT NULL,
	`expiry_date` text NOT NULL,
	`quantity` integer NOT NULL,
	`free_quantity` integer DEFAULT 0 NOT NULL,
	`rate` real NOT NULL,
	`purchase_rate` real NOT NULL,
	`discount_pct` real DEFAULT 0 NOT NULL,
	`taxable_amount` real NOT NULL,
	`tax_code` text(2) NOT NULL,
	`cgst_rate` real DEFAULT 0 NOT NULL,
	`cgst_amount` real DEFAULT 0 NOT NULL,
	`sgst_rate` real DEFAULT 0 NOT NULL,
	`sgst_amount` real DEFAULT 0 NOT NULL,
	`igst_rate` real DEFAULT 0 NOT NULL,
	`igst_amount` real DEFAULT 0 NOT NULL,
	`net_amount` real NOT NULL,
	`restock_inventory` integer DEFAULT true NOT NULL,
	`reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`sales_return_id`) REFERENCES `sales_returns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`batch_id`) REFERENCES `product_batches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`tax_code`) REFERENCES `tax_slabs`(`code`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_sales_return_items_return` ON `sales_return_items` (`sales_return_id`);--> statement-breakpoint
CREATE INDEX `idx_sales_return_items_product` ON `sales_return_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `sales_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`return_no` text NOT NULL,
	`return_date` text NOT NULL,
	`customer_id` text NOT NULL,
	`original_invoice_id` text,
	`original_invoice_no` text,
	`return_type` text DEFAULT 'CREDIT_NOTE' NOT NULL,
	`reason` text DEFAULT 'EXPIRED' NOT NULL,
	`total_gross_amount` real DEFAULT 0 NOT NULL,
	`total_discount_amount` real DEFAULT 0 NOT NULL,
	`taxable_amount` real DEFAULT 0 NOT NULL,
	`cgst_amount` real DEFAULT 0 NOT NULL,
	`sgst_amount` real DEFAULT 0 NOT NULL,
	`igst_amount` real DEFAULT 0 NOT NULL,
	`round_off` real DEFAULT 0 NOT NULL,
	`net_amount` real DEFAULT 0 NOT NULL,
	`adjusted_amount` real DEFAULT 0 NOT NULL,
	`balance_amount` real DEFAULT 0 NOT NULL,
	`is_fully_adjusted` integer DEFAULT false NOT NULL,
	`day_end_locked` integer DEFAULT false NOT NULL,
	`is_cancelled` integer DEFAULT false NOT NULL,
	`remarks` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`original_invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_returns_return_no_unique` ON `sales_returns` (`return_no`);--> statement-breakpoint
CREATE INDEX `idx_sales_returns_customer` ON `sales_returns` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_sales_returns_date` ON `sales_returns` (`return_date`);--> statement-breakpoint
CREATE TABLE `cheque_register` (
	`id` text PRIMARY KEY NOT NULL,
	`cheque_type` text NOT NULL,
	`cheque_no` text NOT NULL,
	`cheque_date` text NOT NULL,
	`amount` real NOT NULL,
	`bank_name` text NOT NULL,
	`branch_name` text,
	`is_local_cheque` integer DEFAULT true NOT NULL,
	`party_type` text NOT NULL,
	`party_id` text NOT NULL,
	`party_name` text NOT NULL,
	`receipt_id` text,
	`payment_id` text,
	`status` text DEFAULT 'RECEIVED' NOT NULL,
	`deposit_date` text,
	`clearance_date` text,
	`dishonor_date` text,
	`dishonor_reason` text,
	`remarks` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `customer_receipts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`payment_id`) REFERENCES `supplier_payments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_chqreg_no` ON `cheque_register` (`cheque_no`);--> statement-breakpoint
CREATE INDEX `idx_chqreg_party` ON `cheque_register` (`party_id`);--> statement-breakpoint
CREATE INDEX `idx_chqreg_status` ON `cheque_register` (`status`);--> statement-breakpoint
CREATE INDEX `idx_chqreg_type` ON `cheque_register` (`cheque_type`);--> statement-breakpoint
CREATE TABLE `customer_outstandings` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`invoice_no` text NOT NULL,
	`invoice_date` text NOT NULL,
	`due_date` text NOT NULL,
	`original_amount` real NOT NULL,
	`paid_amount` real DEFAULT 0 NOT NULL,
	`balance_amount` real NOT NULL,
	`cash_discount_eligible` real DEFAULT 0 NOT NULL,
	`cash_discount_given` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`last_payment_date` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_outstandings_invoice_id_unique` ON `customer_outstandings` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_cusout_customer` ON `customer_outstandings` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_cusout_status` ON `customer_outstandings` (`status`);--> statement-breakpoint
CREATE INDEX `idx_cusout_duedate` ON `customer_outstandings` (`due_date`);--> statement-breakpoint
CREATE TABLE `customer_receipt_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`outstanding_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`allocated_amount` real NOT NULL,
	`discount_amount` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `customer_receipts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`outstanding_id`) REFERENCES `customer_outstandings`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_receipt_alloc_receipt` ON `customer_receipt_allocations` (`receipt_id`);--> statement-breakpoint
CREATE INDEX `idx_receipt_alloc_outstanding` ON `customer_receipt_allocations` (`outstanding_id`);--> statement-breakpoint
CREATE INDEX `idx_receipt_alloc_invoice` ON `customer_receipt_allocations` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `customer_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_no` text NOT NULL,
	`receipt_date` text NOT NULL,
	`customer_id` text NOT NULL,
	`payment_mode` text DEFAULT 'CASH' NOT NULL,
	`total_amount` real NOT NULL,
	`discount_allowed` real DEFAULT 0 NOT NULL,
	`reference_no` text,
	`reference_date` text,
	`bank_name` text,
	`branch_name` text,
	`cheque_status` text DEFAULT 'NOT_APPLICABLE' NOT NULL,
	`clearance_date` text,
	`unallocated_amount` real DEFAULT 0 NOT NULL,
	`narration` text,
	`day_end_locked` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_receipts_receipt_no_unique` ON `customer_receipts` (`receipt_no`);--> statement-breakpoint
CREATE INDEX `idx_receipts_customer` ON `customer_receipts` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_receipts_date` ON `customer_receipts` (`receipt_date`);--> statement-breakpoint
CREATE INDEX `idx_receipts_mode` ON `customer_receipts` (`payment_mode`);--> statement-breakpoint
CREATE TABLE `supplier_payment_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`purchase_id` text NOT NULL,
	`allocated_amount` real NOT NULL,
	`discount_amount` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `supplier_payments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_supplier_alloc_payment` ON `supplier_payment_allocations` (`payment_id`);--> statement-breakpoint
CREATE INDEX `idx_supplier_alloc_purchase` ON `supplier_payment_allocations` (`purchase_id`);--> statement-breakpoint
CREATE TABLE `supplier_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_no` text NOT NULL,
	`payment_date` text NOT NULL,
	`supplier_id` text NOT NULL,
	`payment_mode` text DEFAULT 'CHEQUE' NOT NULL,
	`total_amount` real NOT NULL,
	`discount_received` real DEFAULT 0 NOT NULL,
	`reference_no` text,
	`reference_date` text,
	`bank_name` text,
	`bank_account_no` text,
	`cheque_status` text DEFAULT 'NOT_APPLICABLE' NOT NULL,
	`clearance_date` text,
	`unallocated_amount` real DEFAULT 0 NOT NULL,
	`narration` text,
	`day_end_locked` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplier_payments_payment_no_unique` ON `supplier_payments` (`payment_no`);--> statement-breakpoint
CREATE INDEX `idx_supplier_pmt_supplier` ON `supplier_payments` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `idx_supplier_pmt_date` ON `supplier_payments` (`payment_date`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`user_id` text DEFAULT 'SYSTEM' NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`old_values` text,
	`new_values` text,
	`node_id` text DEFAULT '1',
	`remarks` text
);
--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_action` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX `idx_audit_timestamp` ON `audit_logs` (`timestamp`);--> statement-breakpoint
CREATE TABLE `day_end_closings` (
	`id` text PRIMARY KEY NOT NULL,
	`closing_date` text NOT NULL,
	`closed_at` text NOT NULL,
	`closed_by_user` text DEFAULT 'ADMIN' NOT NULL,
	`total_invoices_count` integer DEFAULT 0 NOT NULL,
	`total_sales_gross` real DEFAULT 0 NOT NULL,
	`total_sales_net` real DEFAULT 0 NOT NULL,
	`total_tax_collected` real DEFAULT 0 NOT NULL,
	`total_returns_count` integer DEFAULT 0 NOT NULL,
	`total_returns_amount` real DEFAULT 0 NOT NULL,
	`total_purchases_count` integer DEFAULT 0 NOT NULL,
	`total_purchases_amount` real DEFAULT 0 NOT NULL,
	`total_collections_cash` real DEFAULT 0 NOT NULL,
	`total_collections_cheque` real DEFAULT 0 NOT NULL,
	`total_collections_bank` real DEFAULT 0 NOT NULL,
	`next_working_date` text NOT NULL,
	`is_verified` integer DEFAULT true NOT NULL,
	`remarks` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `day_end_closings_closing_date_unique` ON `day_end_closings` (`closing_date`);--> statement-breakpoint
CREATE INDEX `idx_dayend_closing_date` ON `day_end_closings` (`closing_date`);--> statement-breakpoint
CREATE TABLE `system_config` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`company_name` text DEFAULT 'SIVA PHARMACEUTICAL DISTRIBUTORS' NOT NULL,
	`trade_name` text DEFAULT 'WHOLESALE SOFTWARE' NOT NULL,
	`address_line1` text DEFAULT 'WHOLESALE ADDRESS,PLACE.' NOT NULL,
	`address_line2` text DEFAULT 'HOSPITAL ROAD',
	`address_line3` text DEFAULT '',
	`address_line4` text DEFAULT '',
	`pincode` text DEFAULT '600001',
	`phone` text DEFAULT '044-28282828',
	`email` text DEFAULT 'info@sivapharma.com',
	`gstin` text DEFAULT '33AAAAA0000A1Z5' NOT NULL,
	`pan` text DEFAULT 'AAAAA0000A',
	`dl_no_20b` text DEFAULT 'TN/CHE/20B/12345' NOT NULL,
	`dl_no_21b` text DEFAULT 'TN/CHE/21B/12346' NOT NULL,
	`fssai_no` text DEFAULT '10019042000001',
	`state_name` text DEFAULT 'Tamil Nadu' NOT NULL,
	`state_code` text DEFAULT '33' NOT NULL,
	`current_working_date` text DEFAULT '2026-09-28' NOT NULL,
	`next_invoice_no_series1` integer DEFAULT 1001 NOT NULL,
	`next_invoice_no_series2` integer DEFAULT 30001 NOT NULL,
	`next_sales_return_no` integer DEFAULT 101 NOT NULL,
	`next_purchase_return_no` integer DEFAULT 101 NOT NULL,
	`next_credit_note_no` integer DEFAULT 200001 NOT NULL,
	`next_debit_note_no` integer DEFAULT 100001 NOT NULL,
	`next_delivery_challan_no` integer DEFAULT 101 NOT NULL,
	`cash_discount_slab1_amount` real DEFAULT 0 NOT NULL,
	`cash_discount_slab1_pct` real DEFAULT 2 NOT NULL,
	`cash_discount_slab2_amount` real DEFAULT 200 NOT NULL,
	`cash_discount_slab2_pct` real DEFAULT 2 NOT NULL,
	`cash_discount_slab3_amount` real DEFAULT 0 NOT NULL,
	`default_tcs_pct` real DEFAULT 0.1 NOT NULL,
	`hsn_code_length` integer DEFAULT 8 NOT NULL,
	`bank_details_line1` text DEFAULT 'BANK: STATE BANK OF INDIA, A/C: 12345678901',
	`bank_details_line2` text DEFAULT 'IFSC: SBIN0000123, BRANCH: MAIN BRANCH',
	`invoice_footer_terms` text DEFAULT 'Goods once sold will not be taken back without authorization. Subject to local jurisdiction.',
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `system_controls` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`admin_password_hash` text DEFAULT 'SPM' NOT NULL,
	`manager_password_hash` text DEFAULT 'SPM' NOT NULL,
	`operator_password_hash` text DEFAULT 'SIVA' NOT NULL,
	`allow_rate_modification` integer DEFAULT false NOT NULL,
	`allow_outstanding_override` integer DEFAULT false NOT NULL,
	`allow_collection_edit` integer DEFAULT false NOT NULL,
	`allow_reports_access` integer DEFAULT true NOT NULL,
	`allow_day_end_override` integer DEFAULT false NOT NULL,
	`allow_credit_note_adjustment` integer DEFAULT true NOT NULL,
	`allow_credit_note_creation` integer DEFAULT true NOT NULL,
	`allow_invoice_cancellation` integer DEFAULT false NOT NULL,
	`allow_payment_modification` integer DEFAULT false NOT NULL,
	`enforce_credit_limit` integer DEFAULT true NOT NULL,
	`enforce_license_expiry_block` integer DEFAULT true NOT NULL,
	`enforce_negative_margin_block` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
