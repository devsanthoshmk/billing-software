import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/lib/db';
import {
  products,
  productBatches,
  suppliers,
  companies,
  taxSlabs,
  customers,
} from '../../src/lib/db/schema/masters';
import {
  purchases,
  purchaseItems,
  purchaseReturns,
  debitNotes,
  invoices,
} from '../../src/lib/db/schema/transactions';
import { auditLogs } from '../../src/lib/db/schema/system';
import { createPurchaseReturn } from '../../src/app/stock/returns/actions';
import {
  reconcileStockCount,
  modifyBatchRates,
} from '../../src/app/stock/adjustments/actions';
import { createPurchaseInward } from '../../src/app/stock/inward/actions';
import { allocateStockFIFO } from '../../src/lib/business-engine/fifoAllocation';
import { BatchStock } from '../../src/lib/business-engine/types';
import { eq, desc, and, sql } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * ============================================================================
 * EMPIRICAL CHALLENGER TEST SUITE: Milestone 4 Stock & Invariant Transactions
 * Archetype: Challenger / Critic / Specialist
 *
 * Verifies:
 * 1. Purchase returns: rejection of 0 or negative qty, negative rates, negative free qty,
 *    insufficient stock guards, stock decrement and supplier debit accuracy.
 * 2. Stock adjustments: physical count reconciliation (excess, deficit, quarantine, write-off),
 *    depletion boundary enforcement, audit trail creation.
 * 3. Purchase inward GRN: batch creation, stock increment, free goods decoupling from
 *    financial payable, statutory pricing boundary guards.
 * 4. Multi-batch FIFO deductions: FEFO ordering, free goods allocation, multi-MRP detection,
 *    and concurrency / retry resilience under SQLite lock contention.
 * ============================================================================
 */

describe('Challenger M4 Verification: Stock & Invariant Transactions', () => {
  let testCompanyId: string;
  let testSupplierId: string;
  let testProductId: string;
  let testBatch1Id: string;
  let testBatch2Id: string;
  let testBatch3Id: string;

  beforeAll(async () => {
    // 1. Setup Company
    const comp = await db.query.companies.findFirst();
    if (comp) {
      testCompanyId = comp.id;
    } else {
      testCompanyId = crypto.randomUUID();
      db.insert(companies).values({
        id: testCompanyId,
        code: 'CHAL_CO',
        name: 'CHALLENGER PHARMA CORP',
        isActive: true,
      }).run();
    }

    // 2. Setup Supplier
    testSupplierId = crypto.randomUUID();
    const supCode = 'SUP_' + crypto.randomBytes(3).toString('hex').toUpperCase();
    db.insert(suppliers).values({
      id: testSupplierId,
      code: supCode,
      name: 'CHALLENGER SUPPLIER AGENCIES',
      addressLine1: '99 Challenger Way',
      addressLine4: 'Coimbatore',
      phone: '04222998877',
      gstin: '33AABCC9999Z1Z5',
      openingBalance: 0,
      currentBalance: 50000,
      creditDays: 30,
      defaultDiscountPct: 0,
      isActive: true,
      isBlocked: false,
    }).run();

    // 3. Setup Product
    testProductId = crypto.randomUUID();
    const prodCode = 'PROD_' + crypto.randomBytes(3).toString('hex').toUpperCase();
    db.insert(products).values({
      id: testProductId,
      code: prodCode,
      name: 'DOXYCYCLINE 100MG CAP',
      companyId: testCompanyId,
      supplierId: testSupplierId,
      taxCode: '02', // 12% GST
      packaging: '10x10 CAP',
      hsnCode: '30042099',
      totalStockOnHand: 300,
      isActive: true,
    }).run();

    // 4. Setup 3 Batches with distinct expiries for FIFO & reconciliation
    testBatch1Id = crypto.randomUUID();
    db.insert(productBatches).values({
      id: testBatch1Id,
      productId: testProductId,
      batchNo: 'CHAL-BAT-01',
      expiryDate: '2027-06-30',
      expiryMonthYear: '06/27',
      purchaseRate: 30.0,
      sellingRate: 45.0,
      secondaryRate: 42.0,
      mrp: 60.0,
      stockQty: 100,
      quarantineQty: 0,
      taxCode: '02',
      isActive: true,
    }).run();

    testBatch2Id = crypto.randomUUID();
    db.insert(productBatches).values({
      id: testBatch2Id,
      productId: testProductId,
      batchNo: 'CHAL-BAT-02',
      expiryDate: '2027-12-31',
      expiryMonthYear: '12/27',
      purchaseRate: 32.0,
      sellingRate: 48.0,
      secondaryRate: 45.0,
      mrp: 65.0,
      stockQty: 100,
      quarantineQty: 0,
      taxCode: '02',
      isActive: true,
    }).run();

    testBatch3Id = crypto.randomUUID();
    db.insert(productBatches).values({
      id: testBatch3Id,
      productId: testProductId,
      batchNo: 'CHAL-BAT-03',
      expiryDate: '2028-06-30',
      expiryMonthYear: '06/28',
      purchaseRate: 35.0,
      sellingRate: 50.0,
      secondaryRate: 48.0,
      mrp: 70.0,
      stockQty: 100,
      quarantineQty: 0,
      taxCode: '02',
      isActive: true,
    }).run();
  });

  // ==========================================================================
  // SECTION 1: PURCHASE RETURNS INVARIANTS & REJECTIONS (PRETPRE.PRG)
  // ==========================================================================
  describe('1. Purchase Returns — Invariant Guards & State Mutations', () => {
    it('rejects purchase return with zero quantity', async () => {
      const res = await createPurchaseReturn({
        supplierId: testSupplierId,
        returnDate: '2026-09-29',
        lineItems: [
          {
            productId: testProductId,
            batchId: testBatch1Id,
            batchNo: 'CHAL-BAT-01',
            expiryDate: '2027-06-30',
            quantity: 0,
            purchaseRate: 30.0,
            mrp: 60.0,
            taxCode: '02',
          },
        ],
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Line 1: Quantity must be greater than zero/i);
    });

    it('rejects purchase return with negative quantity', async () => {
      const res = await createPurchaseReturn({
        supplierId: testSupplierId,
        returnDate: '2026-09-29',
        lineItems: [
          {
            productId: testProductId,
            batchId: testBatch1Id,
            batchNo: 'CHAL-BAT-01',
            expiryDate: '2027-06-30',
            quantity: -10,
            purchaseRate: 30.0,
            mrp: 60.0,
            taxCode: '02',
          },
        ],
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Line 1: Quantity must be greater than zero/i);
    });

    it('rejects purchase return with zero purchase rate', async () => {
      const res = await createPurchaseReturn({
        supplierId: testSupplierId,
        returnDate: '2026-09-29',
        lineItems: [
          {
            productId: testProductId,
            batchId: testBatch1Id,
            batchNo: 'CHAL-BAT-01',
            expiryDate: '2027-06-30',
            quantity: 5,
            purchaseRate: 0,
            mrp: 60.0,
            taxCode: '02',
          },
        ],
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Line 1: Purchase rate must be greater than zero/i);
    });

    it('rejects purchase return with negative purchase rate', async () => {
      const res = await createPurchaseReturn({
        supplierId: testSupplierId,
        returnDate: '2026-09-29',
        lineItems: [
          {
            productId: testProductId,
            batchId: testBatch1Id,
            batchNo: 'CHAL-BAT-01',
            expiryDate: '2027-06-30',
            quantity: 5,
            purchaseRate: -25.5,
            mrp: 60.0,
            taxCode: '02',
          },
        ],
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Line 1: Purchase rate must be greater than zero/i);
    });

    it('rejects purchase return with negative free quantity', async () => {
      const res = await createPurchaseReturn({
        supplierId: testSupplierId,
        returnDate: '2026-09-29',
        lineItems: [
          {
            productId: testProductId,
            batchId: testBatch1Id,
            batchNo: 'CHAL-BAT-01',
            expiryDate: '2027-06-30',
            quantity: 10,
            freeQuantity: -2,
            purchaseRate: 30.0,
            mrp: 60.0,
            taxCode: '02',
          },
        ],
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Line 1: Free quantity cannot be negative/i);
    });

    it('rejects return when total requested units exceed available batch stock', async () => {
      const batch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch1Id),
      });
      const stock = batch?.stockQty || 100;

      const res = await createPurchaseReturn({
        supplierId: testSupplierId,
        returnDate: '2026-09-29',
        lineItems: [
          {
            productId: testProductId,
            batchId: testBatch1Id,
            batchNo: 'CHAL-BAT-01',
            expiryDate: '2027-06-30',
            quantity: stock + 1,
            purchaseRate: 30.0,
            mrp: 60.0,
            taxCode: '02',
          },
        ],
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Insufficient stock to return/i);
    });

    it('successfully processes valid purchase return and updates stock, balances, debit note, and audit log', async () => {
      const preBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch1Id),
      });
      const preProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      const preSupplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });

      const returnQty = 10;
      const freeReturnQty = 2; // Total 12 physical units returned
      const purchaseRate = 30.0; // Gross = 10 * 30 = 300. Tax (12%) = 36. Net = 336.

      const res = await createPurchaseReturn({
        supplierId: testSupplierId,
        returnDate: '2026-09-29',
        rateBasis: 'P',
        remarks: 'Batch return test',
        lineItems: [
          {
            productId: testProductId,
            batchId: testBatch1Id,
            batchNo: 'CHAL-BAT-01',
            expiryDate: '2027-06-30',
            quantity: returnQty,
            freeQuantity: freeReturnQty,
            purchaseRate,
            mrp: 60.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.returnNo).toMatch(/^PR-\d{6}$/);

      // 1. Batch stock reduced by 12 units
      const postBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch1Id),
      });
      expect(postBatch?.stockQty).toBe((preBatch?.stockQty || 0) - (returnQty + freeReturnQty));

      // 2. Product total stock reduced by 12 units
      const postProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      expect(postProduct?.totalStockOnHand).toBe(
        (preProduct?.totalStockOnHand || 0) - (returnQty + freeReturnQty)
      );

      // 3. Supplier payable balance reduced by net amount (336)
      const postSupplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });
      expect(postSupplier?.currentBalance).toBeCloseTo(
        (preSupplier?.currentBalance || 0) - (res.netAmount || 0),
        2
      );

      // 4. Debit Note voucher generated
      const dn = await db.query.debitNotes.findFirst({
        where: and(
          eq(debitNotes.partyId, testSupplierId),
          eq(debitNotes.noteType, 'PURCHASE_RETURN')
        ),
        orderBy: [desc(debitNotes.createdAt)],
      });
      expect(dn).toBeDefined();
      expect(dn?.totalAmount).toBe(res.netAmount);

      // 5. Audit log entry recorded
      const log = await db.query.auditLogs.findFirst({
        where: eq(auditLogs.entityId, res.returnId!),
      });
      expect(log).toBeDefined();
      expect(log?.action).toBe('PURCHASE_RETURN_CREATE');
    });
  });

  // ==========================================================================
  // SECTION 2: STOCK ADJUSTMENTS & RECONCILIATION INVARIANTS (ADJDTL.PRG)
  // ==========================================================================
  describe('2. Stock Adjustments — Physical Count Reconciliation & Quarantine Invariants', () => {
    it('excess physical count increments saleable stock on batch and master product', async () => {
      const preBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch2Id),
      });
      const preProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });

      const currentStock = preBatch?.stockQty || 100;
      const physicalCount = currentStock + 15; // +15 excess found
      const variance = 15;

      const res = await reconcileStockCount({
        adjustmentDate: '2026-09-29',
        operatorId: 'CHALLENGER',
        adjustments: [
          {
            productId: testProductId,
            batchId: testBatch2Id,
            systemQty: currentStock,
            physicalCountQty: physicalCount,
            reason: 'FOUND',
            remarks: 'Physical excess during audit',
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.adjustedCount).toBe(1);

      const postBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch2Id),
      });
      expect(postBatch?.stockQty).toBe(physicalCount);

      const postProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      expect(postProduct?.totalStockOnHand).toBe((preProduct?.totalStockOnHand || 0) + variance);
    });

    it('deficit due to DAMAGE moves units from saleable stock into quarantine', async () => {
      const preBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch2Id),
      });
      const preProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });

      const currentStock = preBatch?.stockQty || 115;
      const currentQuarantine = preBatch?.quarantineQty || 0;
      const physicalCount = currentStock - 10; // -10 damaged
      const deficit = 10;

      const res = await reconcileStockCount({
        adjustmentDate: '2026-09-29',
        operatorId: 'CHALLENGER',
        adjustments: [
          {
            productId: testProductId,
            batchId: testBatch2Id,
            systemQty: currentStock,
            physicalCountQty: physicalCount,
            reason: 'DAMAGE',
            remarks: 'Damaged bottles moved to quarantine',
          },
        ],
      });

      expect(res.success).toBe(true);

      const postBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch2Id),
      });
      // Active stock decremented
      expect(postBatch?.stockQty).toBe(physicalCount);
      // Quarantine quantity incremented by deficit
      expect(postBatch?.quarantineQty).toBe(currentQuarantine + deficit);

      // Total saleable stock on product decremented
      const postProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      expect(postProduct?.totalStockOnHand).toBe((preProduct?.totalStockOnHand || 0) - deficit);
    });

    it('deficit due to EXPIRED moves units into quarantine', async () => {
      const preBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch2Id),
      });
      const currentStock = preBatch?.stockQty || 105;
      const currentQuarantine = preBatch?.quarantineQty || 10;
      const physicalCount = currentStock - 5;
      const deficit = 5;

      const res = await reconcileStockCount({
        adjustmentDate: '2026-09-29',
        operatorId: 'CHALLENGER',
        adjustments: [
          {
            productId: testProductId,
            batchId: testBatch2Id,
            systemQty: currentStock,
            physicalCountQty: physicalCount,
            reason: 'EXPIRED',
            remarks: 'Expired units removed to quarantine',
          },
        ],
      });

      expect(res.success).toBe(true);

      const postBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch2Id),
      });
      expect(postBatch?.stockQty).toBe(physicalCount);
      expect(postBatch?.quarantineQty).toBe(currentQuarantine + deficit);
    });

    it('deficit due to THEFT_SHRINK directly deducts stock without touching quarantine', async () => {
      const preBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch2Id),
      });
      const preProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });

      const currentStock = preBatch?.stockQty || 100;
      const currentQuarantine = preBatch?.quarantineQty || 15;
      const physicalCount = currentStock - 8;
      const deficit = 8;

      const res = await reconcileStockCount({
        adjustmentDate: '2026-09-29',
        operatorId: 'CHALLENGER',
        adjustments: [
          {
            productId: testProductId,
            batchId: testBatch2Id,
            systemQty: currentStock,
            physicalCountQty: physicalCount,
            reason: 'THEFT_SHRINK',
            remarks: 'Shrinkage loss written off',
          },
        ],
      });

      expect(res.success).toBe(true);

      const postBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch2Id),
      });
      expect(postBatch?.stockQty).toBe(physicalCount);
      // Quarantine untouched!
      expect(postBatch?.quarantineQty).toBe(currentQuarantine);

      // Product total stock decremented
      const postProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      expect(postProduct?.totalStockOnHand).toBe((preProduct?.totalStockOnHand || 0) - deficit);
    });

    it('rejects deficit when shortage exceeds total available batch stock', async () => {
      const preBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch2Id),
      });
      const currentStock = preBatch?.stockQty || 92;

      // Requesting physicalCountQty = -10 (which implies deficit = currentStock + 10)
      const res = await reconcileStockCount({
        adjustmentDate: '2026-09-29',
        adjustments: [
          {
            productId: testProductId,
            batchId: testBatch2Id,
            systemQty: currentStock,
            physicalCountQty: -10,
            reason: 'THEFT_SHRINK',
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Cannot adjust shortage exceeding available batch stock/i);
    });

    it('skips no-op adjustment when physical count matches system stock exactly', async () => {
      const preBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch2Id),
      });
      const currentStock = preBatch?.stockQty || 92;

      const res = await reconcileStockCount({
        adjustmentDate: '2026-09-29',
        adjustments: [
          {
            productId: testProductId,
            batchId: testBatch2Id,
            systemQty: currentStock,
            physicalCountQty: currentStock, // variance = 0
            reason: 'DATA_FIX',
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.adjustedCount).toBe(0);
    });
  });

  // ==========================================================================
  // SECTION 3: PURCHASE INWARD GRN INVARIANTS & FREE GOODS (PURCHASE.PRG)
  // ==========================================================================
  describe('3. Purchase Inward GRN — Batch Creation, Stock Increment & Free Goods Decoupling', () => {
    it('creates a new batch record if batch does not already exist', async () => {
      const preProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });

      const uniqueBatchNo = 'NEW-BAT-' + crypto.randomBytes(2).toString('hex').toUpperCase();
      const inwardQty = 50;

      const res = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'BILL-NEW-01',
        supplierBillDate: '2026-09-20',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-20',
        paymentTerms: 'CREDIT',
        isInterstate: false,
        lineItems: [
          {
            productId: testProductId,
            batchNo: uniqueBatchNo,
            expiryMonthYear: '08/29',
            quantity: inwardQty,
            purchaseRate: 35.0,
            sellingRate: 50.0,
            mrp: 70.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.inwardNo).toMatch(/^GRN-\d{6}$/);

      // Verify batch was created in DB
      const createdBatch = await db.query.productBatches.findFirst({
        where: and(
          eq(productBatches.productId, testProductId),
          eq(productBatches.batchNo, uniqueBatchNo)
        ),
      });
      expect(createdBatch).toBeDefined();
      expect(createdBatch?.stockQty).toBe(inwardQty);
      expect(createdBatch?.purchaseRate).toBe(35.0);

      // Verify product totalStockOnHand incremented
      const postProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      expect(postProduct?.totalStockOnHand).toBe((preProduct?.totalStockOnHand || 0) + inwardQty);
    });

    it('increments existing batch stock and updates rates upon subsequent inward of same batch', async () => {
      const preBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch3Id),
      });
      const preProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });

      const additionalQty = 40;
      const updatedPurchaseRate = 36.0;
      const updatedSellingRate = 52.0;
      const updatedMrp = 72.0;

      const res = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'BILL-REPEAT-02',
        supplierBillDate: '2026-09-21',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-21',
        lineItems: [
          {
            productId: testProductId,
            batchNo: preBatch!.batchNo,
            expiryMonthYear: preBatch!.expiryMonthYear || '06/28',
            quantity: additionalQty,
            purchaseRate: updatedPurchaseRate,
            sellingRate: updatedSellingRate,
            mrp: updatedMrp,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(true);

      const postBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch3Id),
      });
      expect(postBatch?.stockQty).toBe((preBatch?.stockQty || 0) + additionalQty);
      expect(postBatch?.purchaseRate).toBe(updatedPurchaseRate);
      expect(postBatch?.sellingRate).toBe(updatedSellingRate);
      expect(postBatch?.mrp).toBe(updatedMrp);

      const postProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      expect(postProduct?.totalStockOnHand).toBe((preProduct?.totalStockOnHand || 0) + additionalQty);
    });

    it('free goods handling: accumulates full physical units into stock while charging payable ONLY on billed units', async () => {
      const preSupplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });

      const billedQty = 100;
      const freeQty = 25; // 100 + 25 = 125 physical units
      const purchaseRate = 30.0; // Gross = 100 * 30 = 3000. 12% GST = 360. Net = 3360.

      const res = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'BILL-FREE-99',
        supplierBillDate: '2026-09-22',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-22',
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'CHAL-FREE-BAT',
            expiryMonthYear: '11/28',
            quantity: billedQty,
            freeQuantity: freeQty,
            purchaseRate,
            sellingRate: 45.0,
            mrp: 60.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.totalUnits).toBe(billedQty + freeQty); // 125 physical units
      expect(res.netAmount).toBe(3360); // Billed on 100 units only!

      const postBatch = await db.query.productBatches.findFirst({
        where: and(
          eq(productBatches.productId, testProductId),
          eq(productBatches.batchNo, 'CHAL-FREE-BAT')
        ),
      });
      expect(postBatch?.stockQty).toBe(125);

      const postSupplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });
      expect(postSupplier?.currentBalance).toBeCloseTo(
        (preSupplier?.currentBalance || 0) + 3360,
        2
      );
    });

    it('enforces pricing bounds & DPCO invariants during purchase inward', async () => {
      // 1. Zero quantity
      const res1 = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'INV-BOUNDS-1',
        supplierBillDate: '2026-09-29',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-29',
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'B-FAIL-1',
            expiryMonthYear: '12/28',
            quantity: 0,
            purchaseRate: 20.0,
            sellingRate: 30.0,
            mrp: 40.0,
            taxCode: '02',
          },
        ],
      });
      expect(res1.success).toBe(false);
      expect(res1.error).toMatch(/Quantity must be greater than zero/i);

      // 2. Negative purchase rate
      const res2 = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'INV-BOUNDS-2',
        supplierBillDate: '2026-09-29',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-29',
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'B-FAIL-2',
            expiryMonthYear: '12/28',
            quantity: 10,
            purchaseRate: -5.0,
            sellingRate: 30.0,
            mrp: 40.0,
            taxCode: '02',
          },
        ],
      });
      expect(res2.success).toBe(false);
      expect(res2.error).toMatch(/Purchase Rate is Zero or negative/i);

      // 3. Selling rate exceeds MRP (DPCO violation)
      const res3 = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'INV-BOUNDS-3',
        supplierBillDate: '2026-09-29',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-29',
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'B-FAIL-3',
            expiryMonthYear: '12/28',
            quantity: 10,
            purchaseRate: 20.0,
            sellingRate: 50.0,
            mrp: 40.0, // Selling rate > MRP
            taxCode: '02',
          },
        ],
      });
      expect(res3.success).toBe(false);
      expect(res3.error).toMatch(/Selling Rate .* cannot exceed MRP/i);

      // 4. Negative margin (selling rate < purchase rate)
      const res4 = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'INV-BOUNDS-4',
        supplierBillDate: '2026-09-29',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-29',
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'B-FAIL-4',
            expiryMonthYear: '12/28',
            quantity: 10,
            purchaseRate: 35.0,
            sellingRate: 30.0, // Selling rate < Purchase rate
            mrp: 50.0,
            taxCode: '02',
          },
        ],
      });
      expect(res4.success).toBe(false);
      expect(res4.error).toMatch(/Selling Rate .* is less than Purchase Rate/i);

      // 5. Expired product received (expiry before inward date)
      const res5 = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'INV-BOUNDS-5',
        supplierBillDate: '2026-09-29',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-29',
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'B-FAIL-5',
            expiryMonthYear: '01/24', // Past expiry!
            quantity: 10,
            purchaseRate: 20.0,
            sellingRate: 30.0,
            mrp: 40.0,
            taxCode: '02',
          },
        ],
      });
      expect(res5.success).toBe(false);
      expect(res5.error).toMatch(/Expired product received/i);
    });
  });

  // ==========================================================================
  // SECTION 4: MULTI-BATCH FIFO DEDUCTIONS & CONCURRENCY RESILIENCE
  // ==========================================================================
  describe('4. Multi-Batch FIFO Deductions & Concurrency / Lock Retry Resilience', () => {
    it('allocates strictly in FEFO order across multiple batches with earliest expiry first', () => {
      const mockBatches: BatchStock[] = [
        {
          id: 'B3',
          batchNo: 'BAT-2028',
          expiryDate: '2028-12-31',
          mrp: 50.0,
          sellingRate: 40.0,
          purchaseRate: 30.0,
          stockQty: 50,
          isBlocked: false,
        },
        {
          id: 'B1',
          batchNo: 'BAT-2027A',
          expiryDate: '2027-03-31',
          mrp: 50.0,
          sellingRate: 40.0,
          purchaseRate: 30.0,
          stockQty: 30,
          isBlocked: false,
        },
        {
          id: 'B2',
          batchNo: 'BAT-2027B',
          expiryDate: '2027-09-30',
          mrp: 50.0,
          sellingRate: 40.0,
          purchaseRate: 30.0,
          stockQty: 40,
          isBlocked: false,
        },
      ];

      // Request 50 units (should consume all 30 from B1, and 20 from B2, leaving B3 untouched)
      const res = allocateStockFIFO(mockBatches, 50, 0, { systemDate: '2026-09-29' });

      expect(res.success).toBe(true);
      expect(res.totalAllocatedQty).toBe(50);
      expect(res.allocations.length).toBe(2);

      // Slice 1: B1 (Earliest expiry 2027-03-31)
      expect(res.allocations[0].batchId).toBe('B1');
      expect(res.allocations[0].totalAllocatedQty).toBe(30);
      expect(res.allocations[0].remainingBatchStock).toBe(0);

      // Slice 2: B2 (Next expiry 2027-09-30)
      expect(res.allocations[1].batchId).toBe('B2');
      expect(res.allocations[1].totalAllocatedQty).toBe(20);
      expect(res.allocations[1].remainingBatchStock).toBe(20);
    });

    it('allocates free bonus goods across batches following billed quantity in FIFO sequence', () => {
      const mockBatches: BatchStock[] = [
        {
          id: 'B1',
          batchNo: 'BAT-01',
          expiryDate: '2027-06-30',
          mrp: 100.0,
          sellingRate: 80.0,
          purchaseRate: 60.0,
          stockQty: 25,
          isBlocked: false,
        },
        {
          id: 'B2',
          batchNo: 'BAT-02',
          expiryDate: '2027-12-31',
          mrp: 100.0,
          sellingRate: 80.0,
          purchaseRate: 60.0,
          stockQty: 50,
          isBlocked: false,
        },
      ];

      // Request 20 billed + 10 free = 30 total units needed
      const res = allocateStockFIFO(mockBatches, 20, 10, { systemDate: '2026-09-29' });

      expect(res.success).toBe(true);
      expect(res.totalAllocatedBilledQty).toBe(20);
      expect(res.totalAllocatedFreeQty).toBe(10);
      expect(res.totalAllocatedQty).toBe(30);

      // B1 satisfies 20 billed and 5 free (exhausts 25 available)
      expect(res.allocations[0].batchId).toBe('B1');
      expect(res.allocations[0].allocatedBilledQty).toBe(20);
      expect(res.allocations[0].allocatedFreeQty).toBe(5);

      // B2 satisfies remaining 5 free
      expect(res.allocations[1].batchId).toBe('B2');
      expect(res.allocations[1].allocatedBilledQty).toBe(0);
      expect(res.allocations[1].allocatedFreeQty).toBe(5);
    });

    it('detects multiple MRPs across batches and flags multi-MRP condition', () => {
      const mockBatches: BatchStock[] = [
        {
          id: 'B1',
          batchNo: 'BAT-OLD-MRP',
          expiryDate: '2027-06-30',
          mrp: 85.0,
          sellingRate: 70.0,
          purchaseRate: 50.0,
          stockQty: 10,
          isBlocked: false,
        },
        {
          id: 'B2',
          batchNo: 'BAT-NEW-MRP',
          expiryDate: '2027-12-31',
          mrp: 95.0,
          sellingRate: 78.0,
          purchaseRate: 55.0,
          stockQty: 20,
          isBlocked: false,
        },
      ];

      // Request 15 units spanning across both MRPs (10 units @ MRP 85, 5 units @ MRP 95)
      const res = allocateStockFIFO(mockBatches, 15, 0, { systemDate: '2026-09-29' });

      expect(res.success).toBe(true);
      expect(res.hasMultiMrp).toBe(true);
      expect(res.distinctMrps).toEqual([85.0, 95.0]);
      expect(res.requiresMrpSelectionPrompt).toBe(true);
    });

    it('rejects allocation when allowPartialAllocation is false and available stock is insufficient', () => {
      const mockBatches: BatchStock[] = [
        {
          id: 'B1',
          batchNo: 'BAT-LOW',
          expiryDate: '2027-06-30',
          mrp: 50.0,
          sellingRate: 40.0,
          purchaseRate: 30.0,
          stockQty: 10,
          isBlocked: false,
        },
      ];

      const res = allocateStockFIFO(mockBatches, 15, 0, {
        allowPartialAllocation: false,
        systemDate: '2026-09-29',
      });

      expect(res.success).toBe(false);
      expect(res.totalAllocatedQty).toBe(0);
      expect(res.unallocatedQty).toBe(15);
      expect(res.error).toMatch(/Insufficient stock/i);
    });

    it('survives concurrent rapid transactions through atomic transactions and retry backoff', async () => {
      // Execute 8 concurrent stock reconciliations on separate batches
      const promises = Array.from({ length: 8 }).map(async (_, idx) => {
        const batch = await db.query.productBatches.findFirst({
          where: eq(productBatches.id, testBatch3Id),
        });
        const currentStock = batch?.stockQty || 140;

        return reconcileStockCount({
          adjustmentDate: '2026-09-29',
          operatorId: `CONCURRENT_WORKER_${idx}`,
          adjustments: [
            {
              productId: testProductId,
              batchId: testBatch3Id,
              systemQty: currentStock,
              physicalCountQty: currentStock + 1, // +1 increment
              reason: 'FOUND',
              remarks: `Concurrent test iteration ${idx}`,
            },
          ],
        });
      });

      const results = await Promise.all(promises);

      // Verify every transaction succeeded without lock-timeout crashing
      for (const r of results) {
        expect(r.success).toBe(true);
      }
    });
  });
});
