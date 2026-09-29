import { describe, it, expect } from 'vitest';
import { db, sqlite } from '../index';
import {
  taxSlabs,
  companies,
  salesmen,
  productBatches,
  invoices,
  purchases,
  customerReceipts,
  systemConfig,
  systemControls,
} from '../schema';
import { eq } from 'drizzle-orm';

describe('Siva Pharmacy ERP - SQLite Database & Drizzle Schema Verification', () => {
  describe('1. SQLite Engine & Integrity PRAGMAs', () => {
    it('should have foreign keys enabled (PRAGMA foreign_keys = ON)', () => {
      const fkResult = sqlite.pragma('foreign_keys', { simple: true });
      expect(fkResult).toBe(1);
    });

    it('should have Write-Ahead Logging active (PRAGMA journal_mode = WAL)', () => {
      const journalMode = sqlite.pragma('journal_mode', { simple: true });
      expect(journalMode).toBe('wal');
    });

    it('should have busy timeout configured (PRAGMA busy_timeout = 5000)', () => {
      const timeout = sqlite.pragma('busy_timeout', { simple: true });
      expect(timeout).toBe(5000);
    });

    it('should enforce foreign key constraint failure on invalid reference', () => {
      // Trying to insert a product batch pointing to a non-existent product should fail
      expect(() => {
        db.insert(productBatches).values({
          id: 'TEST-BATCH-FAIL',
          productId: 'NON-EXISTENT-PROD',
          batchNo: 'TESTFAIL',
          expiryDate: '2028-12-31',
          purchaseRate: 10,
          sellingRate: 15,
          mrp: 20,
          taxCode: '02',
        }).run();
      }).toThrow();
    });
  });

  describe('2. Master Entities Schema & Seeding (F02 & F03)', () => {
    it('should query all seeded GST tax slabs', async () => {
      const slabs = await db.select().from(taxSlabs);
      expect(slabs.length).toBeGreaterThanOrEqual(5);

      const slab12 = slabs.find((s) => s.code === '02');
      expect(slab12).toBeDefined();
      expect(slab12?.cgstRate).toBe(6.0);
      expect(slab12?.sgstRate).toBe(6.0);
      expect(slab12?.igstRate).toBe(12.0);
    });

    it('should query companies and salesmen', async () => {
      const companyRows = await db.select().from(companies);
      expect(companyRows.length).toBeGreaterThanOrEqual(3);
      expect(companyRows.some((c) => c.code === 'CIP')).toBe(true);

      const salesmanRows = await db.select().from(salesmen);
      expect(salesmanRows.length).toBeGreaterThanOrEqual(2);
    });

    it('should query customers with proper area associations', async () => {
      const customerRows = await db.query.customers.findMany({
        with: {
          area: true,
          salesman: true,
        },
      });
      expect(customerRows.length).toBeGreaterThanOrEqual(3);

      const balaji = customerRows.find((c) => c.code === '1001');
      expect(balaji).toBeDefined();
      expect(balaji?.area?.name).toBe('SOWCARPET CENTRAL');
      expect(balaji?.salesman?.name).toBe('R. KUMAR');
    });

    it('should query normalized products and their 1-to-many batches (F02)', async () => {
      const prods = await db.query.products.findMany({
        with: {
          batches: true,
          company: true,
          taxSlab: true,
        },
      });

      expect(prods.length).toBeGreaterThanOrEqual(5);

      const para = prods.find((p) => p.code === '00001');
      expect(para).toBeDefined();
      expect(para?.batches.length).toBe(2); // BT24018 and BT24099

      const batch1 = para?.batches.find((b) => b.batchNo === 'BT24018');
      expect(batch1).toBeDefined();
      expect(batch1?.mrp).toBe(34.50);
      expect(batch1?.schemeThreshold).toBe(10);
      expect(batch1?.schemeFreeQty).toBe(1);
    });
  });

  describe('3. Transactions & Ledgers Schema (F04 & F05)', () => {
    it('should query sample purchase inward with line items', async () => {
      const samplePurchase = await db.query.purchases.findFirst({
        where: eq(purchases.inwardNo, 'GRN-000101'),
        with: {
          supplier: true,
          items: true,
        },
      });

      expect(samplePurchase).toBeDefined();
      expect(samplePurchase?.supplierBillNo).toBe('CIP/26/8941');
      expect(samplePurchase?.netAmount).toBe(12293.0);
      expect(samplePurchase?.items.length).toBe(1);
      expect(samplePurchase?.items[0].batchNo).toBe('BT24018');
    });

    it('should query sample sales invoice with line items', async () => {
      const sampleInvoice = await db.query.invoices.findFirst({
        where: eq(invoices.invoiceNo, 'INV-001001'),
        with: {
          customer: true,
          items: true,
          outstanding: true,
        },
      });

      expect(sampleInvoice).toBeDefined();
      expect(sampleInvoice?.netAmount).toBe(3136.0);
      expect(sampleInvoice?.items.length).toBe(1);
      expect(sampleInvoice?.items[0].quantity).toBe(100);
      expect(sampleInvoice?.items[0].freeQuantity).toBe(10);
      expect(sampleInvoice?.outstanding?.balanceAmount).toBe(2136.0);
    });

    it('should query customer receipts and allocations', async () => {
      const sampleReceipt = await db.query.customerReceipts.findFirst({
        where: eq(customerReceipts.receiptNo, 'RCT-000101'),
        with: {
          customer: true,
          allocations: true,
        },
      });

      expect(sampleReceipt).toBeDefined();
      expect(sampleReceipt?.totalAmount).toBe(1000.0);
      expect(sampleReceipt?.allocations.length).toBe(1);
      expect(sampleReceipt?.allocations[0].allocatedAmount).toBe(1000.0);
    });
  });

  describe('4. System Configuration & Controls (F06)', () => {
    it('should query singleton system configuration', async () => {
      const config = await db.query.systemConfig.findFirst({
        where: eq(systemConfig.id, 'default'),
      });

      expect(config).toBeDefined();
      expect(config?.companyName).toBe('SIVA PHARMACEUTICAL DISTRIBUTORS');
      expect(config?.gstin).toBe('33AAAAA0000A1Z5');
      // currentWorkingDate is a runtime-mutable field updated by day-end closing; verify it's a valid ISO date
      expect(config?.currentWorkingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should query singleton system controls and security toggles', async () => {
      const controls = await db.query.systemControls.findFirst({
        where: eq(systemControls.id, 'default'),
      });

      expect(controls).toBeDefined();
      expect(controls?.adminPasswordHash).toBe('SPM');
      expect(controls?.operatorPasswordHash).toBe('SIVA');
      expect(controls?.enforceCreditLimit).toBe(true);
      expect(controls?.enforceNegativeMarginBlock).toBe(true);
    });
  });
});
