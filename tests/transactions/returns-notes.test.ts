import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../src/lib/db';
import {
  products,
  productBatches,
  customers,
  suppliers,
  companies,
  taxSlabs,
  areas,
} from '../../src/lib/db/schema/masters';
import {
  salesReturns,
  salesReturnItems,
  purchaseReturns,
  creditNotes,
  debitNotes,
  invoices,
} from '../../src/lib/db/schema/transactions';
import { customerOutstandings } from '../../src/lib/db/schema/ledgers';
import { createSalesReturn } from '../../src/app/billing/returns/actions';
import { createPurchaseReturn } from '../../src/app/stock/returns/actions';
import { createCreditOrDebitNote } from '../../src/app/billing/notes/actions';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

describe('Milestone 4 — Features F23 & F24: Sales & Purchase Returns, Credit & Debit Notes', () => {
  let testCompanyId: string;
  let testAreaId: string;
  let testCustomerId: string;
  let testSupplierId: string;
  let testProductId: string;
  let testBatchId: string;

  beforeAll(async () => {
    // 1. Ensure test company
    const comp = await db.query.companies.findFirst();
    if (comp) {
      testCompanyId = comp.id;
    } else {
      testCompanyId = crypto.randomUUID();
      db.insert(companies).values({
        id: testCompanyId,
        code: 'COMP_RET',
        name: 'RETURNS TEST PHARMA',
        isActive: true,
      }).run();
    }

    // 2. Ensure test area
    const area = await db.query.areas.findFirst();
    if (area) {
      testAreaId = area.id;
    } else {
      testAreaId = crypto.randomUUID();
      db.insert(areas).values({
        id: testAreaId,
        code: 'A_RET',
        name: 'RETURNS AREA',
        isActive: true,
      }).run();
    }

    // 3. Create test customer
    testCustomerId = crypto.randomUUID();
    const uniqueCustCode = 'CR_' + crypto.randomBytes(3).toString('hex');
    db.insert(customers).values({
      id: testCustomerId,
      code: uniqueCustCode,
      name: 'APOLLO HEALTHCARE CHEMISTS',
      areaId: testAreaId,
      billingType: 'L',
      closingBalance: 10000,
      isActive: true,
    }).run();

    // 4. Create test supplier
    testSupplierId = crypto.randomUUID();
    const uniqueSupCode = 'SR_' + crypto.randomBytes(3).toString('hex');
    db.insert(suppliers).values({
      id: testSupplierId,
      code: uniqueSupCode,
      name: 'SUN PHARMA AGENCY',
      currentBalance: 25000,
      isActive: true,
    }).run();

    // 5. Create test product & batch
    testProductId = crypto.randomUUID();
    const uniqueProdCode = 'MR_' + crypto.randomBytes(3).toString('hex');
    db.insert(products).values({
      id: testProductId,
      code: uniqueProdCode,
      name: 'AZITHROMYCIN 500MG',
      companyId: testCompanyId,
      supplierId: testSupplierId,
      taxCode: '02',
      packaging: '1x3 TAB',
      hsnCode: '30049099',
      totalStockOnHand: 100,
      isActive: true,
    }).run();

    testBatchId = crypto.randomUUID();
    db.insert(productBatches).values({
      id: testBatchId,
      productId: testProductId,
      batchNo: 'RET-BAT-01',
      expiryDate: '2028-09-30',
      purchaseRate: 60.0,
      sellingRate: 85.0,
      mrp: 120.0,
      stockQty: 100,
      quarantineQty: 0,
      taxCode: '02',
      isActive: true,
    }).run();
  });

  describe('1. Sales Return Preparation (Feature F24 - SRETPRE.PRG)', () => {
    it('restock saleable returns increment active stockQty and totalStockOnHand', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatchId),
      });
      const initialProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      const initialCustomer = await db.query.customers.findFirst({
        where: eq(customers.id, testCustomerId),
      });

      const returnQty = 10;

      const res = await createSalesReturn({
        customerId: testCustomerId,
        returnDate: '2026-09-29',
        returnType: 'CREDIT_NOTE',
        reason: 'EXCESS_STOCK',
        items: [
          {
            productId: testProductId,
            batchId: testBatchId,
            batchNo: 'RET-BAT-01',
            expiryDate: '2028-09-30',
            quantity: returnQty,
            freeQuantity: 0,
            rate: 85.0,
            purchaseRate: 60.0,
            taxCode: '02',
            restockInventory: true, // Restock active stock
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.returnNo).toMatch(/^SR-\d{6}$/);

      // Verify active stock incremented
      const updatedBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatchId),
      });
      expect(updatedBatch?.stockQty).toBe((initialBatch?.stockQty || 100) + returnQty);
      expect(updatedBatch?.quarantineQty).toBe(initialBatch?.quarantineQty);

      // Verify product totalStockOnHand incremented
      const updatedProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      expect(updatedProduct?.totalStockOnHand).toBe(
        (initialProduct?.totalStockOnHand || 100) + returnQty
      );

      // Verify customer receivable reduced
      const updatedCustomer = await db.query.customers.findFirst({
        where: eq(customers.id, testCustomerId),
      });
      expect(updatedCustomer?.closingBalance).toBeCloseTo(
        (initialCustomer?.closingBalance || 10000) - (res.grandTotal || 0),
        1
      );
    });

    it('damaged or expired returns route to quarantineQty and leave saleable stock untouched', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatchId),
      });
      const initialProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });

      const returnQty = 5;

      const res = await createSalesReturn({
        customerId: testCustomerId,
        returnDate: '2026-09-29',
        returnType: 'CREDIT_NOTE',
        reason: 'EXPIRED',
        items: [
          {
            productId: testProductId,
            batchId: testBatchId,
            batchNo: 'RET-BAT-01',
            expiryDate: '2028-09-30',
            quantity: returnQty,
            freeQuantity: 0,
            rate: 85.0,
            purchaseRate: 60.0,
            taxCode: '02',
            restockInventory: false, // Route to quarantine
          },
        ],
      });

      expect(res.success).toBe(true);

      const updatedBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatchId),
      });
      // Active saleable stock unchanged!
      expect(updatedBatch?.stockQty).toBe(initialBatch?.stockQty);
      // Quarantine quantity incremented!
      expect(updatedBatch?.quarantineQty).toBe(
        (initialBatch?.quarantineQty || 0) + returnQty
      );

      // Product saleable totalStockOnHand unchanged
      const updatedProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      expect(updatedProduct?.totalStockOnHand).toBe(initialProduct?.totalStockOnHand);
    });
  });

  describe('2. Purchase Returns (Feature F24 - PRETPRE.PRG)', () => {
    it('deducts batch stock, decrements master stock on hand, and debits supplier payable', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatchId),
      });
      const initialProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      const initialSupplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });

      const returnQty = 15;

      const res = await createPurchaseReturn({
        supplierId: testSupplierId,
        returnDate: '2026-09-29',
        rateBasis: 'P',
        lineItems: [
          {
            productId: testProductId,
            batchId: testBatchId,
            batchNo: 'RET-BAT-01',
            expiryDate: '2028-09-30',
            quantity: returnQty,
            freeQuantity: 0,
            purchaseRate: 60.0,
            mrp: 120.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.returnNo).toMatch(/^PR-\d{6}$/);

      // Verify batch stock decremented
      const updatedBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatchId),
      });
      expect(updatedBatch?.stockQty).toBe((initialBatch?.stockQty || 0) - returnQty);

      // Verify product totalStockOnHand decremented
      const updatedProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      expect(updatedProduct?.totalStockOnHand).toBe(
        (initialProduct?.totalStockOnHand || 0) - returnQty
      );

      // Verify supplier balance debited
      const updatedSupplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });
      expect(updatedSupplier?.currentBalance).toBeCloseTo(
        (initialSupplier?.currentBalance || 25000) - (res.netAmount || 0),
        1
      );

      // Verify debit note created
      const dNote = await db.query.debitNotes.findFirst({
        where: eq(debitNotes.partyId, testSupplierId),
      });
      expect(dNote).toBeDefined();
    });

    it('rejects purchase return with zero or negative quantity', async () => {
      const res = await createPurchaseReturn({
        supplierId: testSupplierId,
        returnDate: '2026-09-29',
        rateBasis: 'P',
        lineItems: [
          {
            productId: testProductId,
            batchId: testBatchId,
            batchNo: 'RET-BAT-01',
            expiryDate: '2028-09-30',
            quantity: 0,
            purchaseRate: 60.0,
            mrp: 120.0,
            taxCode: '02',
          },
        ],
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Quantity must be greater than zero');
    });

    it('rejects purchase return with zero or negative purchase rate', async () => {
      const res = await createPurchaseReturn({
        supplierId: testSupplierId,
        returnDate: '2026-09-29',
        rateBasis: 'P',
        lineItems: [
          {
            productId: testProductId,
            batchId: testBatchId,
            batchNo: 'RET-BAT-01',
            expiryDate: '2028-09-30',
            quantity: 5,
            purchaseRate: -10.0,
            mrp: 120.0,
            taxCode: '02',
          },
        ],
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Purchase rate must be greater than zero');
    });
  });

  describe('3. Credit & Debit Notes Processing (Feature F23)', () => {
    it('Expiry / Broken credit note routes goods to quarantine and credits customer', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatchId),
      });
      const initialCustomer = await db.query.customers.findFirst({
        where: eq(customers.id, testCustomerId),
      });

      const brokenQty = 4;

      const res = await createCreditOrDebitNote({
        isDebitNote: false, // Credit Note
        partyType: 'CUSTOMER',
        partyId: testCustomerId,
        date: '2026-09-29',
        noteType: 'EXPIRY_BROKEN',
        items: [
          {
            productId: testProductId,
            batchId: testBatchId,
            batchNo: 'RET-BAT-01',
            expiryDate: '2028-09-30',
            quantity: brokenQty,
            rate: 85.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.noteNo).toMatch(/^CN-\d{6}$/);

      // Verify quarantineQty incremented
      const updatedBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatchId),
      });
      expect(updatedBatch?.quarantineQty).toBe(
        (initialBatch?.quarantineQty || 0) + brokenQty
      );

      // Verify customer credited
      const updatedCustomer = await db.query.customers.findFirst({
        where: eq(customers.id, testCustomerId),
      });
      expect(updatedCustomer?.closingBalance).toBeCloseTo(
        (initialCustomer?.closingBalance || 0) - (res.totalAmount || 0),
        1
      );
    });

    it('Rate Difference Credit Note calculates price drop with zero inventory movement', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatchId),
      });

      const oldRate = 85.0;
      const newRate = 75.0;
      const qty = 20;
      const expectedDiff = oldRate - newRate; // 10.0

      const res = await createCreditOrDebitNote({
        isDebitNote: false,
        partyType: 'CUSTOMER',
        partyId: testCustomerId,
        date: '2026-09-29',
        noteType: 'RATE_DIFFERENCE',
        items: [
          {
            productId: testProductId,
            batchId: testBatchId,
            batchNo: 'RET-BAT-01',
            expiryDate: '2028-09-30',
            quantity: qty,
            rate: expectedDiff,
            oldRate,
            newRate,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.totalAmount).toBeGreaterThan(0);

      // Verify ZERO inventory movement
      const updatedBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatchId),
      });
      expect(updatedBatch?.stockQty).toBe(initialBatch?.stockQty);
      expect(updatedBatch?.quarantineQty).toBe(initialBatch?.quarantineQty);
    });

    it('Shortage / Damage Debit Note debits supplier payable', async () => {
      const initialSupplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });

      const res = await createCreditOrDebitNote({
        isDebitNote: true, // Debit Note
        partyType: 'SUPPLIER',
        partyId: testSupplierId,
        date: '2026-09-29',
        noteType: 'SHORTAGE_DAMAGE',
        items: [
          {
            productId: testProductId,
            batchNo: 'RET-BAT-01',
            expiryDate: '2028-09-30',
            quantity: 2,
            rate: 60.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.noteNo).toMatch(/^DN-\d{6}$/);

      const updatedSupplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });
      expect(updatedSupplier?.currentBalance).toBeCloseTo(
        (initialSupplier?.currentBalance || 0) - (res.totalAmount || 0),
        1
      );
    });

    it('rejects Debit Note when supplier party does not exist or mismatched', async () => {
      const nonExistentSupplierId = crypto.randomUUID();
      const res = await createCreditOrDebitNote({
        isDebitNote: true,
        partyType: 'SUPPLIER',
        partyId: nonExistentSupplierId,
        date: '2026-09-29',
        noteType: 'SHORTAGE_DAMAGE',
        items: [
          {
            productId: testProductId,
            batchNo: 'RET-BAT-01',
            expiryDate: '2028-09-30',
            quantity: 1,
            rate: 50.0,
            taxCode: '02',
          },
        ],
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Supplier not found');
    });
  });
});
