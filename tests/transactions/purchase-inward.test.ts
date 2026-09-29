import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../src/lib/db';
import {
  products,
  productBatches,
  suppliers,
  companies,
  taxSlabs,
} from '../../src/lib/db/schema/masters';
import { purchases, purchaseItems } from '../../src/lib/db/schema/transactions';
import {
  createPurchaseInward,
  createInlineSupplier,
} from '../../src/app/stock/inward/actions';
import { parseExpiryMonthYearToIso } from '../../src/app/stock/inward/utils';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

describe('Milestone 4 — Feature F22: Purchase Inward GRN (PURCHASE.PRG / PURTRA.PRG)', () => {
  let testCompanyId: string;
  let testSupplierId: string;
  let testProductId: string;
  let testExistingBatchId: string;

  beforeAll(async () => {
    // 1. Ensure test company
    const comp = await db.query.companies.findFirst();
    if (comp) {
      testCompanyId = comp.id;
    } else {
      testCompanyId = crypto.randomUUID();
      db.insert(companies).values({
        id: testCompanyId,
        code: 'COMP_PUR',
        name: 'PURCHASE TEST COMPANY',
        isActive: true,
      }).run();
    }

    // 2. Ensure test supplier
    testSupplierId = crypto.randomUUID();
    const uniqueSupCode = 'SP_' + crypto.randomBytes(3).toString('hex');
    db.insert(suppliers).values({
      id: testSupplierId,
      code: uniqueSupCode,
      name: 'MEDIPHARM DISTRIBUTORS',
      addressLine1: '45 Cross Cut Road',
      addressLine4: 'Coimbatore',
      phone: '04222345678',
      gstin: '33AABCM9988A1Z2',
      openingBalance: 0,
      currentBalance: 5000,
      creditDays: 30,
      defaultDiscountPct: 2.0,
      isActive: true,
      isBlocked: false,
    }).run();

    // 3. Create test product
    testProductId = crypto.randomUUID();
    const uniqueProdCode = 'MP_' + crypto.randomBytes(3).toString('hex');
    db.insert(products).values({
      id: testProductId,
      code: uniqueProdCode,
      name: 'PARACETAMOL 650MG TAB',
      companyId: testCompanyId,
      supplierId: testSupplierId,
      taxCode: '02',
      packaging: '10x15 TAB',
      hsnCode: '30049099',
      totalStockOnHand: 100,
      isActive: true,
    }).run();

    testExistingBatchId = crypto.randomUUID();
    db.insert(productBatches).values({
      id: testExistingBatchId,
      productId: testProductId,
      batchNo: 'PUR-BAT-01',
      expiryDate: '2028-05-31',
      expiryMonthYear: '05/28',
      purchaseRate: 20.0,
      sellingRate: 25.0,
      mrp: 35.0,
      stockQty: 100,
      quarantineQty: 0,
      taxCode: '02',
      isActive: true,
    }).run();
  });

  describe('1. Expiry Date Parsing Parity', () => {
    it('converts MM/YY to accurate month-end ISO date format', () => {
      expect(parseExpiryMonthYearToIso('08/27')).toBe('2027-08-31');
      expect(parseExpiryMonthYearToIso('02/24')).toBe('2024-02-29'); // Leap year
      expect(parseExpiryMonthYearToIso('04/26')).toBe('2026-04-30');
      expect(parseExpiryMonthYearToIso('12/29')).toBe('2029-12-31');
      expect(parseExpiryMonthYearToIso('2028-05-31')).toBe('2028-05-31'); // Already ISO
    });

    it('throws error for invalid expiry date formats', () => {
      expect(() => parseExpiryMonthYearToIso('invalid')).toThrow();
      expect(() => parseExpiryMonthYearToIso('13/27')).toThrow();
      expect(() => parseExpiryMonthYearToIso('')).toThrow();
    });
  });

  describe('2. Inward GRN Execution & Inventory Accumulation (F22)', () => {
    it('increments existing batch stock and product totalStockOnHand including free goods', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testExistingBatchId),
      });
      const initialProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      const initialSupplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });

      const billedQty = 50;
      const freeQty = 5;
      const expectedInwardUnits = billedQty + freeQty; // 55

      const res = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'BILL-1001',
        supplierBillDate: '2026-09-25',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-25',
        paymentTerms: 'CREDIT',
        isInterstate: false,
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'PUR-BAT-01',
            expiryMonthYear: '05/28',
            quantity: billedQty,
            freeQuantity: freeQty,
            purchaseRate: 20.0,
            sellingRate: 25.0,
            mrp: 35.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.inwardNo).toMatch(/^GRN-\d{6}$/);
      expect(res.totalUnits).toBe(expectedInwardUnits);
      expect(res.netAmount).toBeGreaterThan(0);

      // Verify batch stock incremented by 55
      const updatedBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testExistingBatchId),
      });
      expect(updatedBatch?.stockQty).toBe((initialBatch?.stockQty || 100) + expectedInwardUnits);

      // Verify product totalStockOnHand incremented by 55
      const updatedProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      expect(updatedProduct?.totalStockOnHand).toBe(
        (initialProduct?.totalStockOnHand || 100) + expectedInwardUnits
      );

      // Verify supplier accounts payable incremented
      const updatedSupplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });
      expect(updatedSupplier?.currentBalance).toBeCloseTo(
        (initialSupplier?.currentBalance || 5000) + (res.netAmount || 0),
        1
      );

      // Verify purchases record created with balanceAmount
      const purRecord = await db.query.purchases.findFirst({
        where: eq(purchases.id, res.purchaseId!),
      });
      expect(purRecord).toBeDefined();
      expect(purRecord?.paymentStatus).toBe('UNPAID');
      expect(purRecord?.balanceAmount).toBe(res.netAmount);
    });

    it('creates a brand new batch when batchNo does not exist for the product', async () => {
      const newBatchNo = 'PUR-NEW-BATCH-99';
      const initialProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });

      const res = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'BILL-1002',
        supplierBillDate: '2026-09-25',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-25',
        lineItems: [
          {
            productId: testProductId,
            batchNo: newBatchNo,
            expiryMonthYear: '11/29',
            quantity: 30,
            freeQuantity: 2,
            purchaseRate: 22.0,
            sellingRate: 28.0,
            mrp: 40.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(true);

      // Verify new batch exists in DB
      const createdBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.batchNo, newBatchNo),
      });
      expect(createdBatch).toBeDefined();
      expect(createdBatch?.stockQty).toBe(32); // 30 + 2
      expect(createdBatch?.sellingRate).toBe(28.0);
      expect(createdBatch?.expiryDate).toBe('2029-11-30');

      // Verify product totalStockOnHand
      const updatedProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      expect(updatedProduct?.totalStockOnHand).toBe(
        (initialProduct?.totalStockOnHand || 0) + 32
      );
    });
  });

  describe('3. Pricing Invariant & Regulatory Bounds (PURCHASE.PRG:2179-2192)', () => {
    it('rejects purchase inward if selling rate < purchase rate (negative margin)', async () => {
      const res = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'BILL-ERR-1',
        supplierBillDate: '2026-09-25',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-25',
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'ERR-BAT-1',
            expiryMonthYear: '08/28',
            quantity: 10,
            purchaseRate: 50.0,
            sellingRate: 40.0, // Selling rate less than cost!
            mrp: 70.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Negative margin prohibited|less than Purchase Rate/i);
    });

    it('rejects purchase inward if selling rate exceeds MRP (DPCO Violation)', async () => {
      const res = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'BILL-ERR-2',
        supplierBillDate: '2026-09-25',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-25',
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'ERR-BAT-2',
            expiryMonthYear: '08/28',
            quantity: 10,
            purchaseRate: 20.0,
            sellingRate: 50.0, // Selling rate exceeds MRP of 45!
            mrp: 45.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/cannot exceed MRP/i);
    });

    it('rejects purchase inward if expired product received', async () => {
      const res = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'BILL-ERR-3',
        supplierBillDate: '2026-09-25',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-25',
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'ERR-BAT-3',
            expiryMonthYear: '01/20', // Already expired
            quantity: 10,
            purchaseRate: 20.0,
            sellingRate: 25.0,
            mrp: 35.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Expired product received/i);
    });
  });

  describe('4. Inline Supplier Creation (+ Hotkey)', () => {
    it('creates supplier inline and returns complete record for immediate inward', async () => {
      const supRes = await createInlineSupplier({
        name: 'INLINE PHARMA SUPPLIER LTD',
        addressLine1: '78 Industrial Estate',
        place: 'Erode',
        phone: '9842112233',
        gstin: '33AABCS1122D1Z5',
        creditDays: 45,
        defaultDiscountPct: 3.5,
      });

      expect(supRes.success).toBe(true);
      expect(supRes.supplier).toBeDefined();
      expect(supRes.supplier!.name).toBe('INLINE PHARMA SUPPLIER LTD');
      expect(supRes.supplier!.code).toBeDefined();

      // Inward immediately against this new supplier
      const inwardRes = await createPurchaseInward({
        supplierId: supRes.supplier!.id,
        supplierBillNo: 'INL-BILL-01',
        supplierBillDate: '2026-09-28',
        inwardDate: '2026-09-29',
        dueDate: '2026-11-12',
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'INL-BAT-01',
            expiryMonthYear: '10/28',
            quantity: 20,
            purchaseRate: 20.0,
            sellingRate: 25.0,
            mrp: 35.0,
            taxCode: '02',
          },
        ],
      });

      expect(inwardRes.success).toBe(true);
      expect(inwardRes.inwardNo).toBeDefined();
    });
  });
});
