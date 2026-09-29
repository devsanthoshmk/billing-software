import { relations } from 'drizzle-orm';

// Export all table definitions and their TypeScript types
export * from './masters';
export * from './transactions';
export * from './ledgers';
export * from './system';

// Import table instances for relational definitions
import {
  taxSlabs,
  companies,
  salesmen,
  areas,
  doctors,
  suppliers,
  customers,
  products,
  productBatches,
} from './masters';

import {
  invoices,
  invoiceItems,
  purchases,
  purchaseItems,
  salesReturns,
  salesReturnItems,
  purchaseReturns,
  purchaseReturnItems,
} from './transactions';

import {
  customerOutstandings,
  customerReceipts,
  customerReceiptAllocations,
  supplierPayments,
  supplierPaymentAllocations,
  chequeRegister,
} from './ledgers';

// --- Relational Declarations for Drizzle ORM Relational Queries (db.query.*) ---

export const taxSlabsRelations = relations(taxSlabs, ({ many }) => ({
  products: many(products),
  productBatches: many(productBatches),
  invoiceItems: many(invoiceItems),
  purchaseItems: many(purchaseItems),
}));

export const companiesRelations = relations(companies, ({ many }) => ({
  products: many(products),
}));

export const salesmenRelations = relations(salesmen, ({ many }) => ({
  areas: many(areas),
  customers: many(customers),
  invoices: many(invoices),
}));

export const areasRelations = relations(areas, ({ one, many }) => ({
  salesman: one(salesmen, {
    fields: [areas.salesmanId],
    references: [salesmen.id],
  }),
  customers: many(customers),
  invoices: many(invoices),
}));

export const doctorsRelations = relations(doctors, ({ many }) => ({
  invoices: many(invoices),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  products: many(products),
  purchases: many(purchases),
  payments: many(supplierPayments),
  returns: many(purchaseReturns),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  area: one(areas, {
    fields: [customers.areaId],
    references: [areas.id],
  }),
  salesman: one(salesmen, {
    fields: [customers.salesmanId],
    references: [salesmen.id],
  }),
  invoices: many(invoices),
  outstandings: many(customerOutstandings),
  receipts: many(customerReceipts),
  returns: many(salesReturns),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  company: one(companies, {
    fields: [products.companyId],
    references: [companies.id],
  }),
  supplier: one(suppliers, {
    fields: [products.supplierId],
    references: [suppliers.id],
  }),
  taxSlab: one(taxSlabs, {
    fields: [products.taxCode],
    references: [taxSlabs.code],
  }),
  batches: many(productBatches),
  invoiceItems: many(invoiceItems),
  purchaseItems: many(purchaseItems),
}));

export const productBatchesRelations = relations(productBatches, ({ one, many }) => ({
  product: one(products, {
    fields: [productBatches.productId],
    references: [products.id],
  }),
  taxSlab: one(taxSlabs, {
    fields: [productBatches.taxCode],
    references: [taxSlabs.code],
  }),
  invoiceItems: many(invoiceItems),
  purchaseItems: many(purchaseItems),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  customer: one(customers, {
    fields: [invoices.customerId],
    references: [customers.id],
  }),
  area: one(areas, {
    fields: [invoices.areaId],
    references: [areas.id],
  }),
  salesman: one(salesmen, {
    fields: [invoices.salesmanId],
    references: [salesmen.id],
  }),
  doctor: one(doctors, {
    fields: [invoices.doctorId],
    references: [doctors.id],
  }),
  items: many(invoiceItems),
  outstanding: one(customerOutstandings, {
    fields: [invoices.id],
    references: [customerOutstandings.invoiceId],
  }),
  returns: many(salesReturns),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
  product: one(products, {
    fields: [invoiceItems.productId],
    references: [products.id],
  }),
  batch: one(productBatches, {
    fields: [invoiceItems.batchId],
    references: [productBatches.id],
  }),
  taxSlab: one(taxSlabs, {
    fields: [invoiceItems.taxCode],
    references: [taxSlabs.code],
  }),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [purchases.supplierId],
    references: [suppliers.id],
  }),
  items: many(purchaseItems),
  paymentAllocations: many(supplierPaymentAllocations),
  returns: many(purchaseReturns),
}));

export const purchaseItemsRelations = relations(purchaseItems, ({ one }) => ({
  purchase: one(purchases, {
    fields: [purchaseItems.purchaseId],
    references: [purchases.id],
  }),
  product: one(products, {
    fields: [purchaseItems.productId],
    references: [products.id],
  }),
  batch: one(productBatches, {
    fields: [purchaseItems.batchId],
    references: [productBatches.id],
  }),
  taxSlab: one(taxSlabs, {
    fields: [purchaseItems.taxCode],
    references: [taxSlabs.code],
  }),
}));

export const salesReturnsRelations = relations(salesReturns, ({ one, many }) => ({
  customer: one(customers, {
    fields: [salesReturns.customerId],
    references: [customers.id],
  }),
  originalInvoice: one(invoices, {
    fields: [salesReturns.originalInvoiceId],
    references: [invoices.id],
  }),
  items: many(salesReturnItems),
}));

export const salesReturnItemsRelations = relations(salesReturnItems, ({ one }) => ({
  salesReturn: one(salesReturns, {
    fields: [salesReturnItems.salesReturnId],
    references: [salesReturns.id],
  }),
  product: one(products, {
    fields: [salesReturnItems.productId],
    references: [products.id],
  }),
  batch: one(productBatches, {
    fields: [salesReturnItems.batchId],
    references: [productBatches.id],
  }),
  taxSlab: one(taxSlabs, {
    fields: [salesReturnItems.taxCode],
    references: [taxSlabs.code],
  }),
}));

export const purchaseReturnsRelations = relations(purchaseReturns, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [purchaseReturns.supplierId],
    references: [suppliers.id],
  }),
  purchase: one(purchases, {
    fields: [purchaseReturns.purchaseId],
    references: [purchases.id],
  }),
  items: many(purchaseReturnItems),
}));

export const purchaseReturnItemsRelations = relations(purchaseReturnItems, ({ one }) => ({
  purchaseReturn: one(purchaseReturns, {
    fields: [purchaseReturnItems.purchaseReturnId],
    references: [purchaseReturns.id],
  }),
  product: one(products, {
    fields: [purchaseReturnItems.productId],
    references: [products.id],
  }),
  batch: one(productBatches, {
    fields: [purchaseReturnItems.batchId],
    references: [productBatches.id],
  }),
  taxSlab: one(taxSlabs, {
    fields: [purchaseReturnItems.taxCode],
    references: [taxSlabs.code],
  }),
}));

export const customerOutstandingsRelations = relations(customerOutstandings, ({ one, many }) => ({
  customer: one(customers, {
    fields: [customerOutstandings.customerId],
    references: [customers.id],
  }),
  invoice: one(invoices, {
    fields: [customerOutstandings.invoiceId],
    references: [invoices.id],
  }),
  allocations: many(customerReceiptAllocations),
}));

export const customerReceiptsRelations = relations(customerReceipts, ({ one, many }) => ({
  customer: one(customers, {
    fields: [customerReceipts.customerId],
    references: [customers.id],
  }),
  allocations: many(customerReceiptAllocations),
  cheques: many(chequeRegister),
}));

export const customerReceiptAllocationsRelations = relations(customerReceiptAllocations, ({ one }) => ({
  receipt: one(customerReceipts, {
    fields: [customerReceiptAllocations.receiptId],
    references: [customerReceipts.id],
  }),
  outstanding: one(customerOutstandings, {
    fields: [customerReceiptAllocations.outstandingId],
    references: [customerOutstandings.id],
  }),
  invoice: one(invoices, {
    fields: [customerReceiptAllocations.invoiceId],
    references: [invoices.id],
  }),
}));

export const supplierPaymentsRelations = relations(supplierPayments, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [supplierPayments.supplierId],
    references: [suppliers.id],
  }),
  allocations: many(supplierPaymentAllocations),
  cheques: many(chequeRegister),
}));

export const supplierPaymentAllocationsRelations = relations(supplierPaymentAllocations, ({ one }) => ({
  payment: one(supplierPayments, {
    fields: [supplierPaymentAllocations.paymentId],
    references: [supplierPayments.id],
  }),
  purchase: one(purchases, {
    fields: [supplierPaymentAllocations.purchaseId],
    references: [purchases.id],
  }),
}));

export const chequeRegisterRelations = relations(chequeRegister, ({ one }) => ({
  receipt: one(customerReceipts, {
    fields: [chequeRegister.receiptId],
    references: [customerReceipts.id],
  }),
  payment: one(supplierPayments, {
    fields: [chequeRegister.paymentId],
    references: [supplierPayments.id],
  }),
}));
