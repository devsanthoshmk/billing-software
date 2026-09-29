import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../src/lib/db';
import {
  products,
  productBatches,
  customers,
  companies,
  taxSlabs,
  areas,
  salesmen,
} from '../../src/lib/db/schema/masters';
import { invoices, invoiceItems } from '../../src/lib/db/schema/transactions';
import { customerOutstandings } from '../../src/lib/db/schema/ledgers';
import {
  createSalesInvoice,
  createInlineCustomer,
  getBatchesForProduct,
} from '../../src/app/billing/actions';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';

describe('Milestone 4 — Features F20 & F21: Sales POS Invoice & Inline Party Addition', () => {
  let testCompanyId: string;
  let testAreaId: string;
  let testCustomerId: string;
  let testProductId: string;
  let testBatch1Id: string;
  let testBatch2Id: string;

  beforeAll(async () => {
    // 1. Ensure test company
    const comp = await db.query.companies.findFirst();
    if (comp) {
      testCompanyId = comp.id;
    } else {
      testCompanyId = crypto.randomUUID();
      db.insert(companies).values({
        id: testCompanyId,
        code: 'COMP_POS',
        name: 'POS TEST PHARMA LTD',
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
        code: 'A_POS',
        name: 'POS CENTRAL AREA',
        isActive: true,
      }).run();
    }

    // 3. Create clean test customer with unique code
    testCustomerId = crypto.randomUUID();
    const uniqueCustCode = 'CP_' + crypto.randomBytes(3).toString('hex');
    db.insert(customers).values({
      id: testCustomerId,
      code: uniqueCustCode,
      name: 'MEDICINE CORNER PHARMACY',
      areaId: testAreaId,
      billingType: 'L',
      paymentTerms: 'R',
      creditLimit: 50000,
      closingBalance: 1000,
      creditDays: 21,
      dlExpiryDate: '2028-12-31',
      dlNo20b: 'DL-20B-12345',
      dlNo21b: 'DL-21B-67890',
      isActive: true,
      isBlocked: false,
    }).run();

    // 4. Create clean test product with 2 batches for multi-batch tests
    testProductId = crypto.randomUUID();
    const uniqueProdCode = 'MP_' + crypto.randomBytes(3).toString('hex');
    db.insert(products).values({
      id: testProductId,
      code: uniqueProdCode,
      name: 'AMOXICILLIN 500MG CAP',
      companyId: testCompanyId,
      taxCode: '02',
      packaging: '10x10 CAP',
      hsnCode: '30049099',
      totalStockOnHand: 150,
      isActive: true,
    }).run();

    testBatch1Id = crypto.randomUUID();
    db.insert(productBatches).values({
      id: testBatch1Id,
      productId: testProductId,
      batchNo: 'BAT-POS-01',
      expiryDate: '2027-06-30',
      expiryMonthYear: '06/27',
      purchaseRate: 40.0,
      sellingRate: 50.0,
      mrp: 75.0,
      stockQty: 50,
      quarantineQty: 0,
      schemeThreshold: 10,
      schemeFreeQty: 1, // 10 + 1 free scheme
      taxCode: '02',
      isActive: true,
    }).run();

    testBatch2Id = crypto.randomUUID();
    db.insert(productBatches).values({
      id: testBatch2Id,
      productId: testProductId,
      batchNo: 'BAT-POS-02',
      expiryDate: '2027-12-31',
      expiryMonthYear: '12/27',
      purchaseRate: 42.0,
      sellingRate: 52.0,
      mrp: 80.0,
      stockQty: 100,
      quarantineQty: 0,
      schemeThreshold: 0,
      schemeFreeQty: 0,
      taxCode: '02',
      isActive: true,
    }).run();
  });

  describe('1. POS Billing Core Flow & Stock Decrement (F20)', () => {
    it('creates credit invoice, decrements batch & product stock, and logs customer ledger', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch1Id),
      });
      const initialProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      const initialCustomer = await db.query.customers.findFirst({
        where: eq(customers.id, testCustomerId),
      });

      const billedQty = 10;
      const expectedFree = 1; // 10/10 * 1 = 1
      const totalDeducted = billedQty + expectedFree;

      const res = await createSalesInvoice({
        customerId: testCustomerId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CREDIT',
        isInterstate: false,
        preparedBy: 'TEST_OP',
        items: [
          {
            productId: testProductId,
            batchId: testBatch1Id,
            productName: 'AMOXICILLIN 500MG CAP',
            packaging: '10x10 CAP',
            hsnCode: '30049099',
            batchNo: 'BAT-POS-01',
            expiryDate: '2027-06-30',
            quantity: billedQty,
            freeQuantity: expectedFree,
            sellingRate: 50.0,
            purchaseRate: 40.0,
            mrp: 75.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
            schemeThreshold: 10,
            schemeFreeQty: 1,
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.invoiceNo).toMatch(/^INV-\d{6}$/);
      expect(res.grandTotal).toBeGreaterThan(0);

      // Verify batch stock decremented by (qty + freeQty) = 11
      const updatedBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch1Id),
      });
      expect(updatedBatch?.stockQty).toBe((initialBatch?.stockQty || 50) - totalDeducted);

      // Verify product totalStockOnHand decremented
      const updatedProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      expect(updatedProduct?.totalStockOnHand).toBe((initialProduct?.totalStockOnHand || 150) - totalDeducted);

      // Verify customer ledger updated
      const updatedCustomer = await db.query.customers.findFirst({
        where: eq(customers.id, testCustomerId),
      });
      expect(updatedCustomer?.closingBalance).toBeCloseTo(
        (initialCustomer?.closingBalance || 1000) + (res.grandTotal || 0),
        1
      );

      // Verify customer outstandings record created
      const outstanding = await db.query.customerOutstandings.findFirst({
        where: eq(customerOutstandings.invoiceId, res.invoiceId!),
      });
      expect(outstanding).toBeDefined();
      expect(outstanding?.status).toBe('OPEN');
      expect(outstanding?.balanceAmount).toBe(res.grandTotal);
    });

    it('cash invoice does not create customer outstandings or increase closingBalance', async () => {
      const initialCustomer = await db.query.customers.findFirst({
        where: eq(customers.id, testCustomerId),
      });

      const res = await createSalesInvoice({
        customerId: testCustomerId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'TEST_OP',
        items: [
          {
            productId: testProductId,
            batchId: testBatch2Id,
            productName: 'AMOXICILLIN 500MG CAP',
            packaging: '10x10 CAP',
            hsnCode: '30049099',
            batchNo: 'BAT-POS-02',
            expiryDate: '2027-12-31',
            quantity: 5,
            freeQuantity: 0,
            sellingRate: 52.0,
            purchaseRate: 42.0,
            mrp: 80.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(res.success).toBe(true);

      const afterCustomer = await db.query.customers.findFirst({
        where: eq(customers.id, testCustomerId),
      });
      expect(afterCustomer?.closingBalance).toBe(initialCustomer?.closingBalance);

      const outstanding = await db.query.customerOutstandings.findFirst({
        where: eq(customerOutstandings.invoiceId, res.invoiceId!),
      });
      expect(outstanding).toBeUndefined();
    });
  });

  describe('2. Pricing & Regulatory Invariants (F20)', () => {
    it('rejects selling rate exceeding MRP under DPCO regulations', async () => {
      const res = await createSalesInvoice({
        customerId: testCustomerId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'TEST_OP',
        items: [
          {
            productId: testProductId,
            batchId: testBatch2Id,
            productName: 'AMOXICILLIN 500MG CAP',
            packaging: '10x10 CAP',
            hsnCode: '30049099',
            batchNo: 'BAT-POS-02',
            expiryDate: '2027-12-31',
            quantity: 1,
            freeQuantity: 0,
            sellingRate: 85.0, // Exceeds MRP of 80.0
            purchaseRate: 42.0,
            mrp: 80.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/DPCO Violation|cannot exceed MRP/i);
    });

    it('rejects zero selling rate for non-replacement items', async () => {
      const res = await createSalesInvoice({
        customerId: testCustomerId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'TEST_OP',
        items: [
          {
            productId: testProductId,
            batchId: testBatch2Id,
            productName: 'AMOXICILLIN 500MG CAP',
            packaging: '10x10 CAP',
            hsnCode: '30049099',
            batchNo: 'BAT-POS-02',
            expiryDate: '2027-12-31',
            quantity: 1,
            freeQuantity: 0,
            sellingRate: 0, // Zero rate prohibited
            purchaseRate: 42.0,
            mrp: 80.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
            isReplacement: false,
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Selling Rate cannot be zero/i);
    });

    it('blocks billing if customer drug license has expired', async () => {
      const expiredCustomerId = crypto.randomUUID();
      db.insert(customers).values({
        id: expiredCustomerId,
        code: 'EXP_' + crypto.randomBytes(3).toString('hex'),
        name: 'EXPIRED DL PHARMACY',
        areaId: testAreaId,
        dlExpiryDate: '2020-01-01', // Expired
        isActive: true,
      }).run();

      const res = await createSalesInvoice({
        customerId: expiredCustomerId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'TEST_OP',
        items: [
          {
            productId: testProductId,
            batchId: testBatch2Id,
            productName: 'AMOXICILLIN 500MG CAP',
            packaging: '10x10 CAP',
            hsnCode: '30049099',
            batchNo: 'BAT-POS-02',
            expiryDate: '2027-12-31',
            quantity: 1,
            freeQuantity: 0,
            sellingRate: 52.0,
            purchaseRate: 42.0,
            mrp: 80.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Drug License has expired/i);
    });

    it('blocks billing if credit limit is exceeded without bypass', async () => {
      const creditCustId = crypto.randomUUID();
      db.insert(customers).values({
        id: creditCustId,
        code: 'LIM_' + crypto.randomBytes(3).toString('hex'),
        name: 'LOW LIMIT PHARMACY',
        areaId: testAreaId,
        creditLimit: 100, // Very low limit
        closingBalance: 80,
        dlExpiryDate: '2029-01-01',
        isActive: true,
      }).run();

      const res = await createSalesInvoice({
        customerId: creditCustId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CREDIT',
        isInterstate: false,
        preparedBy: 'TEST_OP',
        items: [
          {
            productId: testProductId,
            batchId: testBatch2Id,
            productName: 'AMOXICILLIN 500MG CAP',
            packaging: '10x10 CAP',
            hsnCode: '30049099',
            batchNo: 'BAT-POS-02',
            expiryDate: '2027-12-31',
            quantity: 2,
            freeQuantity: 0,
            sellingRate: 52.0,
            purchaseRate: 42.0,
            mrp: 80.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Credit limit exceeded/i);
    });

    it('allows billing if credit limit exceeded is explicitly bypassed by supervisor', async () => {
      const creditCustId = crypto.randomUUID();
      db.insert(customers).values({
        id: creditCustId,
        code: 'BYP_' + crypto.randomBytes(3).toString('hex'),
        name: 'BYPASS PHARMACY',
        areaId: testAreaId,
        creditLimit: 100,
        closingBalance: 80,
        dlExpiryDate: '2029-01-01',
        isActive: true,
      }).run();

      const res = await createSalesInvoice({
        customerId: creditCustId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CREDIT',
        isInterstate: false,
        preparedBy: 'SUPERVISOR',
        creditLimitBypassed: true, // Supervisor bypass
        items: [
          {
            productId: testProductId,
            batchId: testBatch2Id,
            productName: 'AMOXICILLIN 500MG CAP',
            packaging: '10x10 CAP',
            hsnCode: '30049099',
            batchNo: 'BAT-POS-02',
            expiryDate: '2027-12-31',
            quantity: 1,
            freeQuantity: 0,
            sellingRate: 52.0,
            purchaseRate: 42.0,
            mrp: 80.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.invoiceNo).toBeDefined();
    });
  });

  describe('3. Transaction Atomicity & Rollback (F20)', () => {
    it('rolls back all stock and header changes if second line item exceeds batch stock', async () => {
      const batch1Before = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch1Id),
      });

      const res = await createSalesInvoice({
        customerId: testCustomerId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'TEST_OP',
        items: [
          {
            productId: testProductId,
            batchId: testBatch1Id,
            productName: 'AMOXICILLIN 500MG CAP',
            packaging: '10x10 CAP',
            hsnCode: '30049099',
            batchNo: 'BAT-POS-01',
            expiryDate: '2027-06-30',
            quantity: 5, // Valid
            freeQuantity: 0,
            sellingRate: 50.0,
            purchaseRate: 40.0,
            mrp: 75.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
          {
            productId: testProductId,
            batchId: testBatch1Id,
            productName: 'AMOXICILLIN 500MG CAP',
            packaging: '10x10 CAP',
            hsnCode: '30049099',
            batchNo: 'BAT-POS-01',
            expiryDate: '2027-06-30',
            quantity: 999999, // Impossible stock -> triggers failure
            freeQuantity: 0,
            sellingRate: 50.0,
            purchaseRate: 40.0,
            mrp: 75.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Insufficient stock/i);

      // Verify line 1 was completely rolled back and batch 1 stock did NOT change!
      const batch1After = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch1Id),
      });
      expect(batch1After?.stockQty).toBe(batch1Before?.stockQty);
    });
  });

  describe('4. Inline Party Addition (Feature F21)', () => {
    it('creates party inline via server action and allows immediate billing', async () => {
      const inlineRes = await createInlineCustomer({
        name: 'NEW INLINE PHARMACY',
        areaId: testAreaId,
        addressLine1: '123 Market Street',
        addressLine4: 'Madurai',
        phone: '9876543210',
        gstin: '33AABCS1429B1ZB',
        dlNo20b: '20B/MD/101',
        dlNo21b: '21B/MD/102',
        billingType: 'L',
        paymentTerms: 'R',
      });

      expect(inlineRes.success).toBe(true);
      expect(inlineRes.customer).toBeDefined();
      expect(inlineRes.customer!.name).toBe('NEW INLINE PHARMACY');
      expect(inlineRes.customer!.code).toBeDefined();

      // Immediately bill to the newly created customer
      const billRes = await createSalesInvoice({
        customerId: inlineRes.customer!.id,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CREDIT',
        isInterstate: false,
        preparedBy: 'TEST_OP',
        items: [
          {
            productId: testProductId,
            batchId: testBatch2Id,
            productName: 'AMOXICILLIN 500MG CAP',
            packaging: '10x10 CAP',
            hsnCode: '30049099',
            batchNo: 'BAT-POS-02',
            expiryDate: '2027-12-31',
            quantity: 2,
            freeQuantity: 0,
            sellingRate: 52.0,
            purchaseRate: 42.0,
            mrp: 80.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(billRes.success).toBe(true);
      expect(billRes.invoiceNo).toBeDefined();
    });
  });
});
