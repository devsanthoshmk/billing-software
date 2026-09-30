import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../src/lib/db';
import {
  products,
  productBatches,
  companies,
  taxSlabs,
} from '../../src/lib/db/schema/masters';
import { invoices, invoiceItems } from '../../src/lib/db/schema/transactions';
import {
  createProductWithBatches,
  updateProductWithBatches,
  getProductWithBatches,
  getNextProductCode,
  deleteProduct,
  toggleProductBlocked,
  searchProducts,
  convertExpiryToIso,
} from '../../src/app/masters/products/actions';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

describe('Feature F15 & F19: Product Master & Unified Search Browser', () => {
  let testCompanyId: string;
  const testTaxCode = '02'; // 12% GST

  beforeAll(async () => {
    // Ensure at least one test company exists
    const existingComp = await db.query.companies.findFirst();
    if (existingComp) {
      testCompanyId = existingComp.id;
    } else {
      testCompanyId = crypto.randomUUID();
      db.insert(companies).values({
        id: testCompanyId,
        code: 'TESTCOMP',
        name: 'TEST PHARMA LTD',
        isActive: true,
      }).run();
    }
  });

  describe('1. Product Creation & Pricing Invariants (T1-F15-01, T2-F15-01, T2-F15-02)', () => {
    it('creates product with batches and preserves leading zeros in code (T2-F15-01)', async () => {
      const code = '00123';
      // Clean up previous test runs if any
      const existing = await db.query.products.findFirst({ where: eq(products.code, code) });
      if (existing) {
        await db.delete(invoiceItems).where(eq(invoiceItems.productId, existing.id)).run();
        await db.delete(productBatches).where(eq(productBatches.productId, existing.id)).run();
        await db.delete(products).where(eq(products.id, existing.id)).run();
      }

      const res = await createProductWithBatches({
        code,
        name: 'DOLO 650 TABLETS',
        genericName: 'PARACETAMOL 650MG',
        companyId: testCompanyId,
        packaging: '15x10 TAB',
        hsnCode: '30049099',
        taxCode: testTaxCode,
        batches: [
          {
            batchNo: 'DL8812',
            expiryMonthYear: '10/27',
            purchaseRate: 120.0,
            sellingRate: 150.0,
            mrp: 160.0,
            stockQty: 50,
          },
          {
            batchNo: 'DL8813',
            expiryMonthYear: '11/27',
            purchaseRate: 122.0,
            sellingRate: 152.0,
            mrp: 165.0,
            stockQty: 30,
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.id).toBeDefined();

      const created = await getProductWithBatches(res.id);
      expect(created).toBeDefined();
      expect(created?.code).toBe('00123'); // Leading zeros intact
      expect(created?.batches.length).toBe(2);
      // Invariant: totalStockOnHand = sum(batches.stockQty) = 50 + 30 = 80
      expect(created?.totalStockOnHand).toBe(80);
    });

    it('preserves exact 30-character product name boundary (T2-F15-02)', async () => {
      const name30 = 'PARACETAMOL 650MG EXTRA FORTE!';
      expect(name30.length).toBe(30);

      const code = '00124';
      await db.delete(products).where(eq(products.code, code)).run();

      const res = await createProductWithBatches({
        code,
        name: name30,
        companyId: testCompanyId,
        packaging: '10x10 TAB',
        hsnCode: '30049099',
        taxCode: testTaxCode,
        batches: [],
      });

      const fetched = await getProductWithBatches(res.id);
      expect(fetched?.name).toBe(name30);
    });

    it('rejects product creation when duplicate code is submitted (T2-F15-05)', async () => {
      const code = '00123';
      await expect(
        createProductWithBatches({
          code,
          name: 'DUPLICATE PRODUCT',
          companyId: testCompanyId,
          packaging: '10x10',
          hsnCode: '3004',
          taxCode: testTaxCode,
          batches: [],
        })
      ).rejects.toThrow(/already exists in database/);
    });

    it('enforces pricing invariant MRP >= Selling Rate (PURCHASE.PRG:2186)', async () => {
      const code = '00199';
      await db.delete(products).where(eq(products.code, code)).run();

      // MRP (100) < Selling Rate (120) -> Must throw
      await expect(
        createProductWithBatches({
          code,
          name: 'INVALID PRICING MRP',
          companyId: testCompanyId,
          packaging: '10x10',
          hsnCode: '3004',
          taxCode: testTaxCode,
          batches: [
            {
              batchNo: 'BADMRP',
              expiryMonthYear: '10/28',
              purchaseRate: 80,
              sellingRate: 120,
              mrp: 100, // VIOLATION
              stockQty: 10,
            },
          ],
        })
      ).rejects.toThrow(/Pricing invariant violated/);
    });

    it('enforces negative margin guard Selling Rate >= Purchase Rate (INVPRE.PRG:1710)', async () => {
      const code = '00198';
      await db.delete(products).where(eq(products.code, code)).run();

      // Selling Rate (70) < Purchase Rate (80) -> Must throw
      await expect(
        createProductWithBatches({
          code,
          name: 'INVALID NEGATIVE MARGIN',
          companyId: testCompanyId,
          packaging: '10x10',
          hsnCode: '3004',
          taxCode: testTaxCode,
          batches: [
            {
              batchNo: 'NEGMGN',
              expiryMonthYear: '10/28',
              purchaseRate: 80,
              sellingRate: 70, // VIOLATION
              mrp: 100,
              stockQty: 10,
            },
          ],
        })
      ).rejects.toThrow(/Pricing invariant violated/);
    });
  });

  describe('2. Product Update & Batch Inventory (T1-F15-02, T1-F15-03, T1-F15-04)', () => {
    it('updates product packaging from 10x10 to 1x100 (T1-F15-02)', async () => {
      const prod = await db.query.products.findFirst({
        where: eq(products.code, '00123'),
        with: { batches: true },
      });
      expect(prod).toBeDefined();

      await updateProductWithBatches({
        id: prod!.id,
        code: prod!.code,
        name: prod!.name,
        companyId: prod!.companyId,
        packaging: '1x100 BOTTLE',
        hsnCode: prod!.hsnCode,
        taxCode: prod!.taxCode,
        batches: prod!.batches.map((b) => ({
          id: b.id,
          batchNo: b.batchNo,
          expiryMonthYear: b.expiryMonthYear || '10/27',
          purchaseRate: b.purchaseRate,
          sellingRate: b.sellingRate,
          mrp: b.mrp,
          stockQty: b.stockQty,
          taxCode: b.taxCode,
        })),
      });

      const updated = await getProductWithBatches(prod!.id);
      expect(updated?.packaging).toBe('1x100 BOTTLE');
    });

    it('toggles product block status (T1-F15-04)', async () => {
      const prod = await db.query.products.findFirst({
        where: eq(products.code, '00123'),
      });
      expect(prod).toBeDefined();

      // Block product
      await toggleProductBlocked(prod!.id, true);
      let p = await getProductWithBatches(prod!.id);
      expect(p?.isBlocked).toBe(true);

      // Unblock product
      await toggleProductBlocked(prod!.id, false);
      p = await getProductWithBatches(prod!.id);
      expect(p?.isBlocked).toBe(false);
    });

    it('sets min_order_qty=0 and reorder_level=0 cleanly (T2-F15-04)', async () => {
      const prod = await db.query.products.findFirst({
        where: eq(products.code, '00123'),
        with: { batches: true },
      });

      await updateProductWithBatches({
        id: prod!.id,
        code: prod!.code,
        name: prod!.name,
        companyId: prod!.companyId,
        packaging: prod!.packaging,
        hsnCode: prod!.hsnCode,
        taxCode: prod!.taxCode,
        reorderLevel: 0,
        minOrderQty: 0,
        batches: prod!.batches.map((b) => ({
          id: b.id,
          batchNo: b.batchNo,
          purchaseRate: b.purchaseRate,
          sellingRate: b.sellingRate,
          mrp: b.mrp,
          stockQty: b.stockQty,
          taxCode: b.taxCode,
        })),
      });

      const updated = await getProductWithBatches(prod!.id);
      expect(updated?.reorderLevel).toBe(0);
      expect(updated?.minOrderQty).toBe(0);
    });
  });

  describe('3. Referential Integrity Deletion Guards (T1-F15-05, T2-F15-03)', () => {
    it('deletes product cleanly when stock is zero and no transaction history (T1-F15-05)', async () => {
      const code = '00999';
      await db.delete(products).where(eq(products.code, code)).run();

      const created = await createProductWithBatches({
        code,
        name: 'ZERO STOCK CLEAN ITEM',
        companyId: testCompanyId,
        packaging: '10 TAB',
        hsnCode: '3004',
        taxCode: testTaxCode,
        batches: [],
      });

      const res = await deleteProduct(created.id);
      expect(res.success).toBe(true);

      const check = await getProductWithBatches(created.id);
      expect(check).toBeUndefined();
    });

    it('rejects deletion if historical invoice transactions exist (T2-F15-03)', async () => {
      const prod = await db.query.products.findFirst({
        where: eq(products.code, '00123'),
        with: { batches: true },
      });
      expect(prod).toBeDefined();

      // Simulate a historical invoice referencing this product
      const fakeInvoiceId = crypto.randomUUID();
      const fakeItemId = crypto.randomUUID();
      const testInvoiceNo = `TEST-INV-${Date.now()}`;
      const customer = await db.query.customers.findFirst();

      if (customer && prod && prod.batches.length > 0) {
        db.insert(invoices).values({
          id: fakeInvoiceId,
          invoiceNo: testInvoiceNo,
          invoiceSeries: 1,
          invoiceDate: '2026-09-28',
          invoiceTime: '12:00:00',
          customerId: customer.id,
          dueDate: '2026-10-15',
          paymentTerms: 'CASH',
        }).run();

        db.insert(invoiceItems).values({
          id: fakeItemId,
          invoiceId: fakeInvoiceId,
          sortOrder: 1,
          productId: prod.id,
          batchId: prod.batches[0].id,
          productName: prod.name,
          packaging: prod.packaging,
          hsnCode: prod.hsnCode,
          batchNo: prod.batches[0].batchNo,
          expiryDate: prod.batches[0].expiryDate,
          quantity: 1,
          purchaseRate: prod.batches[0].purchaseRate,
          sellingRate: prod.batches[0].sellingRate,
          mrp: prod.batches[0].mrp,
          grossAmount: prod.batches[0].sellingRate,
          taxableAmount: prod.batches[0].sellingRate,
          taxCode: '02',
          netAmount: prod.batches[0].sellingRate,
        }).run();

        // Attempt deletion -> Expect rejection
        await expect(deleteProduct(prod.id)).rejects.toThrow(
          /Cannot delete product with historical transactions/
        );

        // Clean up simulated transaction
        db.delete(invoiceItems).where(eq(invoiceItems.id, fakeItemId)).run();
        db.delete(invoices).where(eq(invoices.id, fakeInvoiceId)).run();
      }
    });
  });

  describe('4. Feature F19: Unified Product Search Browser (T1-F19-02..05, T2-F19-01..03)', () => {
    it('returns top products when search query is empty string (T2-F19-01)', async () => {
      const res = await searchProducts('', false, 10, 0);
      expect(res.products.length).toBeGreaterThan(0);
      expect(res.total).toBeGreaterThan(0);
    });

    it('performs incremental search by trade name (T1-F19-02)', async () => {
      const res = await searchProducts('DOLO', false, 10, 0);
      expect(res.products.length).toBeGreaterThanOrEqual(1);
      const matched = res.products.some((p) => p.name.includes('DOLO'));
      expect(matched).toBe(true);
    });

    it('searches by generic / molecule name (T1-F19-03)', async () => {
      const res = await searchProducts('PARACETAMOL', false, 10, 0);
      expect(res.products.length).toBeGreaterThanOrEqual(1);
      const matched = res.products.some((p) =>
        p.packagingDetail?.toLowerCase().includes('paracetamol') ||
        p.name.toLowerCase().includes('paracetamol')
      );
      expect(matched).toBe(true);
    });

    it('searches by batch number across child batches (F19 4-way filter)', async () => {
      const res = await searchProducts('DL8812', false, 10, 0);
      expect(res.products.length).toBeGreaterThanOrEqual(1);
      const matched = res.products.some((p) =>
        p.batches?.some((b) => b.batchNo === 'DL8812')
      );
      expect(matched).toBe(true);
    });

    it('safely escapes SQL wildcard characters % and _ in query (T2-F19-03)', async () => {
      // Searching with wildcards should not throw SQL syntax errors
      await expect(searchProducts('PAR%A_650', false, 10, 0)).resolves.not.toThrow();
    });

    it('returns empty list for non-existent keyword (T2-F19-02)', async () => {
      const res = await searchProducts('XYZ999NONEXIST', false, 10, 0);
      expect(res.products.length).toBe(0);
      expect(res.total).toBe(0);
    });

    it('converts MM/YY expiry to end of month ISO date correctly', async () => {
      expect(await convertExpiryToIso('10/27')).toBe('2027-10-31');
      expect(await convertExpiryToIso('02/28')).toBe('2028-02-29'); // Leap year
      expect(await convertExpiryToIso('2028-12-31')).toBe('2028-12-31');
    });
  });
});
