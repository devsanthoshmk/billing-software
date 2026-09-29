import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sqlite } from '../../src/lib/db';
import {
  products,
  productBatches,
  suppliers,
  companies,
  taxSlabs,
} from '../../src/lib/db/schema/masters';
import { purchases, purchaseItems } from '../../src/lib/db/schema/transactions';
import { auditLogs } from '../../src/lib/db/schema/system';
import {
  createPurchaseInward,
  createInlineSupplier,
} from '../../src/app/stock/inward/actions';
import {
  reconcileStockCount,
  modifyBatchRates,
} from '../../src/app/stock/adjustments/actions';
import { roundToPaise, roundToRupee } from '../../src/lib/business-engine/calculations';
import { eq, desc, and, sql } from 'drizzle-orm';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { Worker } from 'worker_threads';
import path from 'path';

/**
 * ============================================================================
 * Adversarial Stress & Concurrency Test Harness
 * Milestone 4: Stock Transactions, Rate Revisions, and Database Concurrency
 *
 * Covers:
 * 1. Purchase Inward GRN edge cases: free goods decoupling, margin markup precision,
 *    statutory pricing bounds (DPCO, MRP), interstate/intrastate GST.
 * 2. Physical count reconciliation: System vs Physical count variances,
 *    categorization into quarantine (Damage/Expired) vs write-off (Theft/Shrinkage),
 *    depletion boundaries, and atomic multi-item rollbacks.
 * 3. Rate revisions: pricing hierarchy bounds, DPCO enforcement, supervisor overrides,
 *    and immutable audit trails.
 * 4. Concurrency stress: SQLite WAL mode pragma validation, parallel concurrent
 *    server action executions, and lock contention handling via withDbRetry backoff.
 * ============================================================================
 */

describe('Adversarial Stress Suite: Stock Transactions & Concurrency (Milestone 4)', () => {
  let testCompanyId: string;
  let testSupplierId: string;
  let testInterstateSupplierId: string;
  let testProductId: string;
  let testSecondaryProductId: string;
  let testBatchId: string;
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
        code: 'COMP_ADV_STK',
        name: 'ADVERSARIAL STOCK PHARMA',
        isActive: true,
      }).run();
    }

    // 2. Intra-state supplier (Tamil Nadu - '33')
    testSupplierId = crypto.randomUUID();
    const supCode1 = 'SP_' + crypto.randomBytes(3).toString('hex').toUpperCase();
    db.insert(suppliers).values({
      id: testSupplierId,
      code: supCode1,
      name: 'LOCAL PHARMA DISTRIBUTORS',
      addressLine1: '100 Mill Road',
      addressLine4: 'Coimbatore',
      phone: '04222001122',
      gstin: '33AABCL1234D1Z1',
      openingBalance: 0,
      currentBalance: 10000,
      creditDays: 30,
      defaultDiscountPct: 0,
      isActive: true,
      isBlocked: false,
    }).run();

    // 3. Inter-state supplier (Karnataka - '29')
    testInterstateSupplierId = crypto.randomUUID();
    const supCode2 = 'SP_' + crypto.randomBytes(3).toString('hex').toUpperCase();
    db.insert(suppliers).values({
      id: testInterstateSupplierId,
      code: supCode2,
      name: 'OUTSTATION DRUG HOUSE',
      addressLine1: '55 Peenya Industrial Area',
      addressLine4: 'Bengaluru',
      phone: '08022003344',
      gstin: '29AABCO5678E1Z9',
      openingBalance: 0,
      currentBalance: 25000,
      creditDays: 45,
      defaultDiscountPct: 0,
      isActive: true,
      isBlocked: false,
    }).run();

    // 4. Primary Test Product
    testProductId = crypto.randomUUID();
    const prodCode1 = 'PD_' + crypto.randomBytes(3).toString('hex').toUpperCase();
    db.insert(products).values({
      id: testProductId,
      code: prodCode1,
      name: 'AMOXICILLIN 500MG CAP',
      companyId: testCompanyId,
      supplierId: testSupplierId,
      taxCode: '02', // 12% GST
      packaging: '10x10 CAP',
      hsnCode: '30041010',
      totalStockOnHand: 200,
      isActive: true,
    }).run();

    // 5. Secondary Test Product (for multi-product inward / reconciliation)
    testSecondaryProductId = crypto.randomUUID();
    const prodCode2 = 'PD_' + crypto.randomBytes(3).toString('hex').toUpperCase();
    db.insert(products).values({
      id: testSecondaryProductId,
      code: prodCode2,
      name: 'AZITHROMYCIN 500MG TAB',
      companyId: testCompanyId,
      supplierId: testSupplierId,
      taxCode: '03', // 18% GST
      packaging: '10x3 TAB',
      hsnCode: '30042010',
      totalStockOnHand: 150,
      isActive: true,
    }).run();

    // 6. Test Batches for primary product
    testBatchId = crypto.randomUUID();
    db.insert(productBatches).values({
      id: testBatchId,
      productId: testProductId,
      batchNo: 'ADV-BAT-01',
      expiryDate: '2028-10-31',
      expiryMonthYear: '10/28',
      purchaseRate: 40.0,
      sellingRate: 50.0,
      secondaryRate: 48.0,
      mrp: 65.0,
      stockQty: 100,
      quarantineQty: 0,
      taxCode: '02',
      isActive: true,
    }).run();

    testBatch2Id = crypto.randomUUID();
    db.insert(productBatches).values({
      id: testBatch2Id,
      productId: testProductId,
      batchNo: 'ADV-BAT-02',
      expiryDate: '2028-12-31',
      expiryMonthYear: '12/28',
      purchaseRate: 42.0,
      sellingRate: 52.0,
      secondaryRate: 50.0,
      mrp: 70.0,
      stockQty: 100,
      quarantineQty: 0,
      taxCode: '02',
      isActive: true,
    }).run();
  });

  // ==========================================================================
  // SECTION 1: PURCHASE INWARD (GRN) ADVERSARIAL TESTS (FEATURE F22)
  // ==========================================================================
  describe('1. Purchase Inward GRN — Edge Cases & Financial Precision (PURCHASE.PRG)', () => {
    it('decouples free goods from financial payable while accumulating full physical stock', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatchId),
      });
      const initialProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      const initialSupplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });

      const billedQty = 80;
      const freeQty = 20; // 25% free bonus
      const purchaseRate = 40.0;
      const sellingRate = 50.0;
      const mrp = 65.0;

      const res = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'BILL-FREE-01',
        supplierBillDate: '2026-09-25',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-25',
        paymentTerms: 'CREDIT',
        isInterstate: false,
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'ADV-BAT-01',
            expiryMonthYear: '10/28',
            quantity: billedQty,
            freeQuantity: freeQty,
            purchaseRate,
            sellingRate,
            mrp,
            taxCode: '02', // 12% GST (6% CGST + 6% SGST)
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.totalUnits).toBe(billedQty + freeQty); // 100 physical units

      // 1. Verify physical batch stock incremented by billedQty + freeQty (100 units)
      const updatedBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatchId),
      });
      expect(updatedBatch?.stockQty).toBe((initialBatch?.stockQty || 0) + billedQty + freeQty);

      // 2. Verify product totalStockOnHand incremented by billedQty + freeQty
      const updatedProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      expect(updatedProduct?.totalStockOnHand).toBe(
        (initialProduct?.totalStockOnHand || 0) + billedQty + freeQty
      );

      // 3. Verify financial payable is billed ONLY on billedQty (80 units), NOT freeQty
      // Gross = 80 * 40 = 3200. Taxable = 3200. 12% GST = 384 (CGST 192 + SGST 192). Net = 3584.
      const expectedGross = 80 * 40;
      const expectedTax = expectedGross * 0.12;
      const expectedNet = expectedGross + expectedTax; // 3584.00
      expect(res.netAmount).toBe(expectedNet);

      // 4. Verify supplier payable balance increased strictly by netAmount (3584)
      const updatedSupplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });
      expect(updatedSupplier?.currentBalance).toBeCloseTo(
        (initialSupplier?.currentBalance || 0) + expectedNet,
        2
      );

      // 5. Verify purchase record balanceAmount
      const purchaseRec = await db.query.purchases.findFirst({
        where: eq(purchases.id, res.purchaseId!),
      });
      expect(purchaseRec?.totalGrossAmount).toBe(expectedGross);
      expect(purchaseRec?.netAmount).toBe(expectedNet);
      expect(purchaseRec?.balanceAmount).toBe(expectedNet);
    });

    it('handles extreme free scheme where free quantity exceeds billed quantity (10 billed + 50 free)', async () => {
      const initialProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });

      const uniqueBatchNo = 'FREE-SCHEME-' + crypto.randomBytes(2).toString('hex').toUpperCase();

      const res = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'BILL-EXTREME-FREE',
        supplierBillDate: '2026-09-25',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-25',
        lineItems: [
          {
            productId: testProductId,
            batchNo: uniqueBatchNo,
            expiryMonthYear: '11/29',
            quantity: 10,
            freeQuantity: 50, // 500% scheme bonus!
            purchaseRate: 30.0,
            sellingRate: 40.0,
            mrp: 50.0,
            taxCode: '02', // 12% GST
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.totalUnits).toBe(60);

      // Verify created batch has 60 units
      const createdBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.batchNo, uniqueBatchNo),
      });
      expect(createdBatch?.stockQty).toBe(60);

      // Product stock incremented by 60
      const updatedProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      expect(updatedProduct?.totalStockOnHand).toBe(
        (initialProduct?.totalStockOnHand || 0) + 60
      );

      // Gross billed = 10 * 30 = 300, 12% GST = 36 -> Net = 336. NOT 60 * 30!
      expect(res.netAmount).toBe(336);
    });

    it('validates high-precision decimal margin markup, trade/cash discounts, other charges, and round-off', async () => {
      const initialSupplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });

      const batchNo = 'DECIMAL-PRC-' + crypto.randomBytes(2).toString('hex').toUpperCase();
      const quantity = 19;
      const purchaseRate = 33.37;
      const sellingRate = 42.85;
      const mrp = 58.00;
      const tradeDiscountPct = 4.5;
      const cashDiscountPct = 1.25;
      const otherChargesAdd = 15.65;
      const otherChargesLess = 8.40;

      // Tax slab '02' is 12% GST (6% CGST + 6% SGST)
      const gross = roundToPaise(quantity * purchaseRate); // 19 * 33.37 = 634.03
      const tradeDisc = roundToPaise(gross * (tradeDiscountPct / 100)); // 634.03 * 0.045 = 28.53135 -> 28.53
      const taxable = roundToPaise(gross - tradeDisc); // 634.03 - 28.53 = 605.50
      const cgst = roundToPaise(taxable * 0.06); // 605.50 * 0.06 = 36.33
      const sgst = roundToPaise(taxable * 0.06); // 36.33
      const cashDisc = roundToPaise(taxable * (cashDiscountPct / 100)); // 605.50 * 0.0125 = 7.57
      const totalTax = roundToPaise(cgst + sgst); // 72.66
      const unroundedNet = taxable + totalTax - cashDisc + otherChargesAdd - otherChargesLess;
      // 605.50 + 72.66 - 7.57 + 15.65 - 8.40 = 677.84
      const expectedNet = roundToRupee(unroundedNet); // 678.00
      const expectedRoundOff = roundToPaise(expectedNet - unroundedNet); // 678.00 - 677.84 = +0.16

      const res = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'BILL-PRECISION-01',
        supplierBillDate: '2026-09-26',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-26',
        paymentTerms: 'CREDIT',
        isInterstate: false,
        cashDiscountPct,
        otherChargesAdd,
        otherChargesLess,
        lineItems: [
          {
            productId: testProductId,
            batchNo,
            expiryMonthYear: '10/28',
            quantity,
            purchaseRate,
            sellingRate,
            mrp,
            tradeDiscountPct,
            taxCode: '02',
          },
        ],
      });

      expect(res.success, `Purchase inward failed with: ${res.error}`).toBe(true);
      expect(res.netAmount).toBe(expectedNet);

      // Verify purchases record fields
      const pRecord = await db.query.purchases.findFirst({
        where: eq(purchases.id, res.purchaseId!),
      });
      expect(pRecord?.totalGrossAmount).toBe(gross);
      expect(pRecord?.tradeDiscountAmount).toBe(tradeDisc);
      expect(pRecord?.taxableAmount).toBe(taxable);
      expect(pRecord?.cgstAmount).toBe(cgst);
      expect(pRecord?.sgstAmount).toBe(sgst);
      expect(pRecord?.igstAmount).toBe(0);
      expect(pRecord?.cashDiscountAmount).toBe(cashDisc);
      expect(pRecord?.roundOff).toBe(expectedRoundOff);
      expect(pRecord?.netAmount).toBe(expectedNet);

      // Verify supplier balance increased by exact rounded netAmount
      const updatedSup = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });
      expect(updatedSup?.currentBalance).toBeCloseTo(
        (initialSupplier?.currentBalance || 0) + expectedNet,
        2
      );
    });

    it('correctly calculates IGST and sets CGST/SGST to zero for inter-state supplier', async () => {
      const batchNo = 'INTERSTATE-BAT-' + crypto.randomBytes(2).toString('hex').toUpperCase();

      const res = await createPurchaseInward({
        supplierId: testInterstateSupplierId, // Karnataka supplier ('29')
        supplierBillNo: 'BILL-INTER-01',
        supplierBillDate: '2026-09-27',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-27',
        isInterstate: true,
        lineItems: [
          {
            productId: testProductId,
            batchNo,
            expiryMonthYear: '08/29',
            quantity: 50,
            purchaseRate: 20.0,
            sellingRate: 25.0,
            mrp: 35.0,
            taxCode: '02', // 12% IGST
          },
        ],
      });

      expect(res.success).toBe(true);

      const pRecord = await db.query.purchases.findFirst({
        where: eq(purchases.id, res.purchaseId!),
      });
      expect(pRecord?.isInterstate).toBe(true);
      expect(pRecord?.cgstAmount).toBe(0);
      expect(pRecord?.sgstAmount).toBe(0);
      expect(pRecord?.igstAmount).toBe(120); // 50 * 20 = 1000 * 12% = 120
      expect(pRecord?.totalTaxAmount).toBe(120);
      expect(pRecord?.netAmount).toBe(1120);
    });

    it('permits exact boundary rates: purchaseRate === sellingRate === mrp (Zero margin)', async () => {
      const boundaryBatch = 'BNDRY-BAT-' + crypto.randomBytes(2).toString('hex').toUpperCase();

      const res = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'BILL-BNDRY-01',
        supplierBillDate: '2026-09-28',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-28',
        lineItems: [
          {
            productId: testProductId,
            batchNo: boundaryBatch,
            expiryMonthYear: '12/28',
            quantity: 10,
            purchaseRate: 50.0,
            sellingRate: 50.0, // Equals cost
            mrp: 50.0,         // Equals selling rate and cost
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.inwardNo).toBeDefined();

      const batch = await db.query.productBatches.findFirst({
        where: eq(productBatches.batchNo, boundaryBatch),
      });
      expect(batch?.purchaseRate).toBe(50.0);
      expect(batch?.sellingRate).toBe(50.0);
      expect(batch?.mrp).toBe(50.0);
    });

    it('rejects DPCO price ceiling violation when sellingRate exceeds MRP by even 0.01', async () => {
      const res = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'BILL-ERR-DPCO',
        supplierBillDate: '2026-09-28',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-28',
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'ERR-DPCO-BAT',
            expiryMonthYear: '12/28',
            quantity: 10,
            purchaseRate: 50.0,
            sellingRate: 70.01, // 0.01 over MRP
            mrp: 70.00,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/cannot exceed MRP/i);
    });

    it('rejects negative margin where sellingRate is less than purchaseRate', async () => {
      const res = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'BILL-ERR-NEG',
        supplierBillDate: '2026-09-28',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-28',
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'ERR-NEG-BAT',
            expiryMonthYear: '12/28',
            quantity: 10,
            purchaseRate: 60.0,
            sellingRate: 59.99, // Selling at loss
            mrp: 80.00,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Negative margin prohibited|less than Purchase Rate/i);
    });

    it('rejects purchaseRate exceeding MRP', async () => {
      const res = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'BILL-ERR-PRATE',
        supplierBillDate: '2026-09-28',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-28',
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'ERR-PRATE-BAT',
            expiryMonthYear: '12/28',
            quantity: 10,
            purchaseRate: 85.0,
            sellingRate: 80.0, // Selling rate equals MRP (valid DPCO), but purchaseRate exceeds MRP
            mrp: 80.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Purchase Rate .* cannot exceed MRP/i);
    });

    it('rejects purchase inward with zero or negative quantities', async () => {
      const resZero = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'BILL-ERR-ZERO-QTY',
        supplierBillDate: '2026-09-28',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-28',
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'ZERO-QTY-BAT',
            expiryMonthYear: '12/28',
            quantity: 0,
            purchaseRate: 20.0,
            sellingRate: 25.0,
            mrp: 30.0,
            taxCode: '02',
          },
        ],
      });
      expect(resZero.success).toBe(false);
      expect(resZero.error).toMatch(/Quantity must be greater than zero/i);

      const resNeg = await createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'BILL-ERR-NEG-QTY',
        supplierBillDate: '2026-09-28',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-28',
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'NEG-QTY-BAT',
            expiryMonthYear: '12/28',
            quantity: -5,
            purchaseRate: 20.0,
            sellingRate: 25.0,
            mrp: 30.0,
            taxCode: '02',
          },
        ],
      });
      expect(resNeg.success).toBe(false);
      expect(resNeg.error).toMatch(/Quantity must be greater than zero/i);
    });

    it('rejects purchase inward from a blocked supplier', async () => {
      const blockedSupId = crypto.randomUUID();
      const code = 'BLK_' + crypto.randomBytes(2).toString('hex').toUpperCase();
      db.insert(suppliers).values({
        id: blockedSupId,
        code,
        name: 'BLOCKED PHARMA LABS',
        openingBalance: 0,
        currentBalance: 0,
        creditDays: 30,
        defaultDiscountPct: 0,
        isActive: true,
        isBlocked: true, // Supplier is blocked!
      }).run();

      const res = await createPurchaseInward({
        supplierId: blockedSupId,
        supplierBillNo: 'BILL-BLOCKED',
        supplierBillDate: '2026-09-28',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-28',
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'BLK-BAT',
            expiryMonthYear: '12/28',
            quantity: 10,
            purchaseRate: 20.0,
            sellingRate: 25.0,
            mrp: 30.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/is blocked for purchases/i);
    });
  });

  // ==========================================================================
  // SECTION 2: PHYSICAL COUNT RECONCILIATION ADVERSARIAL TESTS (FEATURE F25)
  // ==========================================================================
  describe('2. Physical Count Reconciliation — Variance & Categorization (ADJDTL.PRG)', () => {
    let reconBatchId: string;

    beforeAll(() => {
      reconBatchId = crypto.randomUUID();
      db.insert(productBatches).values({
        id: reconBatchId,
        productId: testSecondaryProductId,
        batchNo: 'RECON-BAT-01',
        expiryDate: '2028-09-30',
        purchaseRate: 50.0,
        sellingRate: 65.0,
        secondaryRate: 60.0,
        mrp: 80.0,
        stockQty: 100,
        quarantineQty: 0,
        taxCode: '03',
        isActive: true,
      }).run();
    });

    it('handles zero variance as a clean no-op without altering stock or creating dummy adjustments', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, reconBatchId),
      });

      const res = await reconcileStockCount({
        adjustmentDate: '2026-09-29',
        operatorId: 'AUDITOR_ADV',
        adjustments: [
          {
            productId: testSecondaryProductId,
            batchId: reconBatchId,
            systemQty: 100,
            physicalCountQty: 100, // Zero variance
            reason: 'DATA_FIX',
            remarks: 'Reconciliation verified: exact match',
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.adjustedCount).toBe(0);

      const batchAfter = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, reconBatchId),
      });
      expect(batchAfter?.stockQty).toBe(initialBatch?.stockQty);
    });

    it('Excess / Stock Found increases saleable batch stock and product totalStockOnHand', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, reconBatchId),
      });
      const initialProduct = await db.query.products.findFirst({
        where: eq(products.id, testSecondaryProductId),
      });

      const systemQty = initialBatch?.stockQty || 100;
      const physicalCount = systemQty + 25; // +25 excess
      const variance = 25;

      const res = await reconcileStockCount({
        adjustmentDate: '2026-09-29',
        operatorId: 'AUDITOR_ADV',
        adjustments: [
          {
            productId: testSecondaryProductId,
            batchId: reconBatchId,
            systemQty,
            physicalCountQty: physicalCount,
            reason: 'FOUND',
            remarks: 'Unrecorded pack found during physical stock check',
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.adjustedCount).toBe(1);

      // Verify batch stock increased to 125
      const updatedBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, reconBatchId),
      });
      expect(updatedBatch?.stockQty).toBe(physicalCount);
      expect(updatedBatch?.quarantineQty).toBe(0); // Quarantine unchanged

      // Verify product totalStockOnHand increased by 25
      const updatedProduct = await db.query.products.findFirst({
        where: eq(products.id, testSecondaryProductId),
      });
      expect(updatedProduct?.totalStockOnHand).toBe(
        (initialProduct?.totalStockOnHand || 0) + variance
      );

      // Verify audit log
      const log = await db.query.auditLogs.findFirst({
        where: eq(auditLogs.entityId, reconBatchId),
        orderBy: [desc(auditLogs.timestamp)],
      });
      expect(log?.action).toBe('STOCK_ADJUSTMENT');
      expect(log?.remarks).toContain('FOUND (+25 units)');
    });

    it('Damage shortage decrements active stock, increments quarantineQty, and decrements totalStockOnHand', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, reconBatchId),
      });
      const initialProduct = await db.query.products.findFirst({
        where: eq(products.id, testSecondaryProductId),
      });

      const currentStock = initialBatch?.stockQty || 125;
      const damageDeficit = 15;
      const physicalCount = currentStock - damageDeficit; // 110

      const res = await reconcileStockCount({
        adjustmentDate: '2026-09-29',
        operatorId: 'AUDITOR_ADV',
        adjustments: [
          {
            productId: testSecondaryProductId,
            batchId: reconBatchId,
            systemQty: currentStock,
            physicalCountQty: physicalCount,
            reason: 'DAMAGE',
            remarks: 'Broken bottles pulled from dispensary rack',
          },
        ],
      });

      expect(res.success).toBe(true);

      const updatedBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, reconBatchId),
      });
      // Saleable stock reduced to 110
      expect(updatedBatch?.stockQty).toBe(physicalCount);
      // Quarantine quantity increased by 15
      expect(updatedBatch?.quarantineQty).toBe((initialBatch?.quarantineQty || 0) + damageDeficit);

      // Product saleable totalStockOnHand decremented by 15
      const updatedProduct = await db.query.products.findFirst({
        where: eq(products.id, testSecondaryProductId),
      });
      expect(updatedProduct?.totalStockOnHand).toBe(
        (initialProduct?.totalStockOnHand || 0) - damageDeficit
      );
    });

    it('Expired shortage also moves stock to quarantineQty and reduces saleable totalStockOnHand', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, reconBatchId),
      });
      const initialProduct = await db.query.products.findFirst({
        where: eq(products.id, testSecondaryProductId),
      });

      const currentStock = initialBatch?.stockQty || 110;
      const expiredDeficit = 10;
      const physicalCount = currentStock - expiredDeficit; // 100

      const res = await reconcileStockCount({
        adjustmentDate: '2026-09-29',
        operatorId: 'AUDITOR_ADV',
        adjustments: [
          {
            productId: testSecondaryProductId,
            batchId: reconBatchId,
            systemQty: currentStock,
            physicalCountQty: physicalCount,
            reason: 'EXPIRED',
            remarks: 'Near expiry pulled for supplier return',
          },
        ],
      });

      expect(res.success).toBe(true);

      const updatedBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, reconBatchId),
      });
      expect(updatedBatch?.stockQty).toBe(physicalCount);
      // Quarantine now accumulates: 15 (damage) + 10 (expired) = 25
      expect(updatedBatch?.quarantineQty).toBe(25);

      const updatedProduct = await db.query.products.findFirst({
        where: eq(products.id, testSecondaryProductId),
      });
      expect(updatedProduct?.totalStockOnHand).toBe(
        (initialProduct?.totalStockOnHand || 0) - expiredDeficit
      );
    });

    it('Theft / Shrinkage directly writes off stock without placing items into quarantine', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, reconBatchId),
      });
      const initialProduct = await db.query.products.findFirst({
        where: eq(products.id, testSecondaryProductId),
      });

      const currentStock = initialBatch?.stockQty || 100;
      const theftDeficit = 8;
      const physicalCount = currentStock - theftDeficit; // 92

      const res = await reconcileStockCount({
        adjustmentDate: '2026-09-29',
        operatorId: 'AUDITOR_ADV',
        adjustments: [
          {
            productId: testSecondaryProductId,
            batchId: reconBatchId,
            systemQty: currentStock,
            physicalCountQty: physicalCount,
            reason: 'THEFT_SHRINK',
            remarks: 'Pilferage loss written off permanently',
          },
        ],
      });

      expect(res.success).toBe(true);

      const updatedBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, reconBatchId),
      });
      expect(updatedBatch?.stockQty).toBe(physicalCount);
      // Quarantine must NOT increase for theft/shrinkage! Remains 25
      expect(updatedBatch?.quarantineQty).toBe(25);

      const updatedProduct = await db.query.products.findFirst({
        where: eq(products.id, testSecondaryProductId),
      });
      expect(updatedProduct?.totalStockOnHand).toBe(
        (initialProduct?.totalStockOnHand || 0) - theftDeficit
      );
    });

    it('permits full depletion of batch stock to 0 via physical count write-off', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, reconBatchId),
      });
      const currentStock = initialBatch?.stockQty || 92;

      const res = await reconcileStockCount({
        adjustmentDate: '2026-09-29',
        operatorId: 'AUDITOR_ADV',
        adjustments: [
          {
            productId: testSecondaryProductId,
            batchId: reconBatchId,
            systemQty: currentStock,
            physicalCountQty: 0, // Complete depletion
            reason: 'DATA_FIX',
            remarks: 'Batch zeroed out',
          },
        ],
      });

      expect(res.success).toBe(true);

      const updatedBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, reconBatchId),
      });
      expect(updatedBatch?.stockQty).toBe(0);
    });

    it('rejects deficit exceeding available batch stock', async () => {
      // Stock is currently 0
      const res = await reconcileStockCount({
        adjustmentDate: '2026-09-29',
        operatorId: 'AUDITOR_ADV',
        adjustments: [
          {
            productId: testSecondaryProductId,
            batchId: reconBatchId,
            systemQty: 0,
            physicalCountQty: -5, // Deficit = 5, but stock is 0
            reason: 'THEFT_SHRINK',
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Cannot adjust shortage exceeding available batch stock/i);
    });

    it('rolls back atomic multi-line reconciliation if any line fails', async () => {
      // Create two fresh batches
      const batchA = crypto.randomUUID();
      const batchB = crypto.randomUUID();
      db.insert(productBatches).values([
        {
          id: batchA,
          productId: testSecondaryProductId,
          batchNo: 'ROLL-BAT-A',
          expiryDate: '2028-10-31',
          purchaseRate: 10,
          sellingRate: 15,
          mrp: 20,
          stockQty: 50,
          quarantineQty: 0,
          taxCode: '02',
          isActive: true,
        },
        {
          id: batchB,
          productId: testSecondaryProductId,
          batchNo: 'ROLL-BAT-B',
          expiryDate: '2028-10-31',
          purchaseRate: 10,
          sellingRate: 15,
          mrp: 20,
          stockQty: 20,
          quarantineQty: 0,
          taxCode: '02',
          isActive: true,
        },
      ]).run();

      // Line 1 is valid (+10 excess on Batch A)
      // Line 2 is INVALID (-999 deficit on Batch B)
      const res = await reconcileStockCount({
        adjustmentDate: '2026-09-29',
        operatorId: 'AUDITOR_ADV',
        adjustments: [
          {
            productId: testSecondaryProductId,
            batchId: batchA,
            systemQty: 50,
            physicalCountQty: 60, // Valid +10
            reason: 'FOUND',
          },
          {
            productId: testSecondaryProductId,
            batchId: batchB,
            systemQty: 20,
            physicalCountQty: -900, // Invalid deficit 920 > 20
            reason: 'DAMAGE',
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Cannot adjust shortage exceeding available batch stock/i);

      // Verify Batch A was NOT updated due to atomic transaction rollback
      const batchACheck = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, batchA),
      });
      expect(batchACheck?.stockQty).toBe(50); // Unchanged!
    });
  });

  // ==========================================================================
  // SECTION 3: BATCH RATE REVISION ADVERSARIAL TESTS (FEATURE F25)
  // ==========================================================================
  describe('3. Batch Rate Modification — Bounds & Audit Trail (RATEADD.PRG)', () => {
    let rateBatchId: string;

    beforeAll(() => {
      rateBatchId = crypto.randomUUID();
      db.insert(productBatches).values({
        id: rateBatchId,
        productId: testProductId,
        batchNo: 'RATE-MOD-BAT',
        expiryDate: '2029-06-30',
        purchaseRate: 50.0,
        sellingRate: 65.0,
        secondaryRate: 62.0,
        mrp: 85.0,
        stockQty: 50,
        quarantineQty: 0,
        taxCode: '02',
        isActive: true,
      }).run();
    });

    it('updates rates within valid bounds and creates audit log with before/after state', async () => {
      const res = await modifyBatchRates({
        batchId: rateBatchId,
        purchaseRate: 55.0,
        sellingRate: 72.0,
        secondaryRate: 68.0,
        mrp: 90.0,
        reason: 'Statutory GST revision and manufacturer price update',
        operatorId: 'SUPERVISOR_1',
      });

      expect(res.success).toBe(true);

      const batch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, rateBatchId),
      });
      expect(batch?.purchaseRate).toBe(55.0);
      expect(batch?.sellingRate).toBe(72.0);
      expect(batch?.secondaryRate).toBe(68.0);
      expect(batch?.mrp).toBe(90.0);

      // Verify audit log entry
      const log = await db.query.auditLogs.findFirst({
        where: and(
          eq(auditLogs.entityId, rateBatchId),
          eq(auditLogs.action, 'RATE_MODIFICATION')
        ),
        orderBy: [desc(auditLogs.timestamp)],
      });
      expect(log).toBeDefined();
      expect(log?.userId).toBe('SUPERVISOR_1');

      const oldVals = JSON.parse(log?.oldValues || '{}');
      expect(oldVals.purchaseRate).toBe(50.0);
      expect(oldVals.sellingRate).toBe(65.0);

      const newVals = JSON.parse(log?.newValues || '{}');
      expect(newVals.purchaseRate).toBe(55.0);
      expect(newVals.sellingRate).toBe(72.0);
    });

    it('rejects DPCO price ceiling violation: sellingRate > MRP', async () => {
      const res = await modifyBatchRates({
        batchId: rateBatchId,
        purchaseRate: 55.0,
        sellingRate: 95.0, // Exceeds MRP of 90
        mrp: 90.0,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/cannot exceed MRP.*under DPCO regulations/i);
    });

    it('rejects purchaseRate > MRP', async () => {
      const res = await modifyBatchRates({
        batchId: rateBatchId,
        purchaseRate: 95.0, // Exceeds MRP of 90
        sellingRate: 90.0,
        mrp: 90.0,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Purchase Rate .* cannot exceed MRP/i);
    });

    it('rejects sellingRate < purchaseRate without supervisor bypass', async () => {
      const res = await modifyBatchRates({
        batchId: rateBatchId,
        purchaseRate: 60.0,
        sellingRate: 50.0, // Negative margin
        mrp: 90.0,
        supervisorBypass: false,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Negative margin prohibited without supervisor override/i);
    });

    it('allows negative margin when supervisorBypass is explicitly true', async () => {
      const res = await modifyBatchRates({
        batchId: rateBatchId,
        purchaseRate: 60.0,
        sellingRate: 50.0,
        mrp: 90.0,
        supervisorBypass: true, // Explicit supervisor override
        reason: 'Clearance sale authorized by manager',
        operatorId: 'MANAGER_AUTH',
      });

      expect(res.success).toBe(true);

      const batch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, rateBatchId),
      });
      expect(batch?.purchaseRate).toBe(60.0);
      expect(batch?.sellingRate).toBe(50.0);
    });

    it('rejects zero and negative rates', async () => {
      const resZeroPR = await modifyBatchRates({
        batchId: rateBatchId,
        purchaseRate: 0,
        sellingRate: 50.0,
        mrp: 90.0,
      });
      expect(resZeroPR.success).toBe(false);
      expect(resZeroPR.error).toMatch(/Purchase Rate is Zero or negative/i);

      const resZeroSR = await modifyBatchRates({
        batchId: rateBatchId,
        purchaseRate: 30.0,
        sellingRate: 0,
        mrp: 90.0,
      });
      expect(resZeroSR.success).toBe(false);
      expect(resZeroSR.error).toMatch(/Selling Rate is Zero/i);

      const resZeroMrp = await modifyBatchRates({
        batchId: rateBatchId,
        purchaseRate: 30.0,
        sellingRate: 40.0,
        mrp: 0,
      });
      expect(resZeroMrp.success).toBe(false);
      expect(resZeroMrp.error).toMatch(/MRP is Zero/i);
    });

    it('rejects modification for non-existent batch ID', async () => {
      const res = await modifyBatchRates({
        batchId: 'non-existent-uuid',
        purchaseRate: 20.0,
        sellingRate: 30.0,
        mrp: 40.0,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Batch not found/i);
    });
  });

  // ==========================================================================
  // SECTION 4: DATABASE CONCURRENCY & SQLITE WAL STRESS
  // ==========================================================================
  describe('4. Database Concurrency & SQLite WAL Mode Stress', () => {
    it('verifies SQLite PRAGMAs: journal_mode = WAL, busy_timeout >= 5000, foreign_keys = ON', () => {
      const journalMode = sqlite.pragma('journal_mode', { simple: true });
      expect(String(journalMode).toLowerCase()).toBe('wal');

      const busyTimeout = sqlite.pragma('busy_timeout', { simple: true });
      expect(Number(busyTimeout)).toBeGreaterThanOrEqual(5000);

      const foreignKeys = sqlite.pragma('foreign_keys', { simple: true });
      expect(Number(foreignKeys)).toBe(1);
    });

    it('executes 10 parallel concurrent reconcileStockCount operations across distinct batches without lock crashes', async () => {
      // Setup 10 distinct batches
      const concurrentBatches: { id: string; batchNo: string; initialQty: number }[] = [];
      for (let i = 0; i < 10; i++) {
        const id = crypto.randomUUID();
        const batchNo = `CONC-REC-${i}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        db.insert(productBatches).values({
          id,
          productId: testProductId,
          batchNo,
          expiryDate: '2028-11-30',
          purchaseRate: 25.0,
          sellingRate: 35.0,
          mrp: 45.0,
          stockQty: 50,
          quarantineQty: 0,
          taxCode: '02',
          isActive: true,
        }).run();
        concurrentBatches.push({ id, batchNo, initialQty: 50 });
      }

      // Execute 10 parallel reconcile calls via Promise.all
      const promises = concurrentBatches.map((b, idx) => {
        const excess = (idx + 1) * 2;
        return reconcileStockCount({
          adjustmentDate: '2026-09-29',
          operatorId: `CONC_WORKER_${idx}`,
          adjustments: [
            {
              productId: testProductId,
              batchId: b.id,
              systemQty: b.initialQty,
              physicalCountQty: b.initialQty + excess,
              reason: 'FOUND',
              remarks: `Parallel reconciliation test worker ${idx}`,
            },
          ],
        });
      });

      const results = await Promise.all(promises);

      // Verify every single operation succeeded without SQLITE_BUSY failure
      results.forEach((res, idx) => {
        expect(res.success, `Worker ${idx} failed: ${res.error}`).toBe(true);
      });

      // Verify data integrity for each batch
      for (let i = 0; i < concurrentBatches.length; i++) {
        const b = concurrentBatches[i];
        const expectedFinalQty = b.initialQty + (i + 1) * 2;
        const updated = await db.query.productBatches.findFirst({
          where: eq(productBatches.id, b.id),
        });
        expect(updated?.stockQty).toBe(expectedFinalQty);
      }
    });

    it('executes 10 parallel concurrent modifyBatchRates calls without database lock failure', async () => {
      // Setup 10 distinct batches for rate modification
      const rateBatches: string[] = [];
      for (let i = 0; i < 10; i++) {
        const id = crypto.randomUUID();
        db.insert(productBatches).values({
          id,
          productId: testProductId,
          batchNo: `CONC-RATE-${i}`,
          expiryDate: '2028-11-30',
          purchaseRate: 20.0,
          sellingRate: 25.0,
          mrp: 35.0,
          stockQty: 10,
          quarantineQty: 0,
          taxCode: '02',
          isActive: true,
        }).run();
        rateBatches.push(id);
      }

      const ratePromises = rateBatches.map((id, idx) => {
        return modifyBatchRates({
          batchId: id,
          purchaseRate: 22.0 + idx,
          sellingRate: 30.0 + idx,
          mrp: 45.0 + idx,
          reason: `Concurrent rate revision ${idx}`,
          operatorId: `RATE_OP_${idx}`,
        });
      });

      const rateResults = await Promise.all(ratePromises);

      rateResults.forEach((res, idx) => {
        expect(res.success, `Rate revision ${idx} failed: ${res.error}`).toBe(true);
      });

      // Verify each batch updated accurately
      for (let i = 0; i < rateBatches.length; i++) {
        const updated = await db.query.productBatches.findFirst({
          where: eq(productBatches.id, rateBatches[i]),
        });
        expect(updated?.purchaseRate).toBe(22.0 + i);
        expect(updated?.sellingRate).toBe(30.0 + i);
        expect(updated?.mrp).toBe(45.0 + i);
      }
    });

    it('handles mixed concurrent transactions: Inward GRNs, Stock Adjustments, and Rate Modifications simultaneously', async () => {
      // Task 1: Purchase Inward
      const inwardPromise = createPurchaseInward({
        supplierId: testSupplierId,
        supplierBillNo: 'CONC-MIX-BILL-01',
        supplierBillDate: '2026-09-29',
        inwardDate: '2026-09-29',
        dueDate: '2026-10-29',
        lineItems: [
          {
            productId: testProductId,
            batchNo: 'MIX-INW-01',
            expiryMonthYear: '10/28',
            quantity: 20,
            freeQuantity: 2,
            purchaseRate: 25.0,
            sellingRate: 32.0,
            mrp: 45.0,
            taxCode: '02',
          },
        ],
      });

      // Task 2: Physical Count Reconciliation
      const reconPromise = reconcileStockCount({
        adjustmentDate: '2026-09-29',
        operatorId: 'MIX_RECON_OP',
        adjustments: [
          {
            productId: testProductId,
            batchId: testBatch2Id,
            systemQty: 100,
            physicalCountQty: 95, // -5 Damage
            reason: 'DAMAGE',
            remarks: 'Concurrent mixed damage adjustment',
          },
        ],
      });

      // Task 3: Rate Revision
      const ratePromise = modifyBatchRates({
        batchId: testBatchId,
        purchaseRate: 41.0,
        sellingRate: 51.0,
        mrp: 68.0,
        reason: 'Concurrent mixed rate modification',
        operatorId: 'MIX_RATE_OP',
      });

      const [inwardRes, reconRes, rateRes] = await Promise.all([
        inwardPromise,
        reconPromise,
        ratePromise,
      ]);

      expect(inwardRes.success, `Inward failed: ${inwardRes.error}`).toBe(true);
      expect(reconRes.success, `Reconciliation failed: ${reconRes.error}`).toBe(true);
      expect(rateRes.success, `Rate mod failed: ${rateRes.error}`).toBe(true);

      // Verify all 3 changes committed properly
      const createdInwBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.batchNo, 'MIX-INW-01'),
      });
      expect(createdInwBatch?.stockQty).toBe(22);

      const updatedBatch2 = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch2Id),
      });
      expect(updatedBatch2?.stockQty).toBe(95);
      expect(updatedBatch2?.quarantineQty).toBe(5);

      const updatedBatch1 = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatchId),
      });
      expect(updatedBatch1?.purchaseRate).toBe(41.0);
    });

    it('empirically verifies withDbRetry and WAL mode concurrency with parallel conflicting writes on the same batch', async () => {
      const targetBatchId = crypto.randomUUID();
      db.insert(productBatches).values({
        id: targetBatchId,
        productId: testProductId,
        batchNo: 'CONC-SAME-BAT',
        expiryDate: '2028-11-30',
        purchaseRate: 30.0,
        sellingRate: 40.0,
        mrp: 50.0,
        stockQty: 50,
        quarantineQty: 0,
        taxCode: '02',
        isActive: true,
      }).run();

      // 5 concurrent operations modifying the same batch
      const promises = [1, 2, 3, 4, 5].map((i) => {
        return reconcileStockCount({
          adjustmentDate: '2026-09-29',
          operatorId: `WORKER_${i}`,
          adjustments: [
            {
              productId: testProductId,
              batchId: targetBatchId,
              systemQty: 50,
              physicalCountQty: 50 + i * 2,
              reason: 'FOUND',
            },
          ],
        });
      });

      const results = await Promise.all(promises);
      results.forEach((res, idx) => {
        expect(res.success, `Worker ${idx + 1} failed: ${res.error}`).toBe(true);
      });

      // Verify that after all 5 workers finish, batch stock is updated
      const updated = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, targetBatchId),
      });
      expect(updated?.stockQty).toBeGreaterThan(50);
    });
  });
});
