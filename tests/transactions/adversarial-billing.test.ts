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
import {
  invoices,
  invoiceItems,
  salesReturns,
  salesReturnItems,
} from '../../src/lib/db/schema/transactions';
import { customerOutstandings } from '../../src/lib/db/schema/ledgers';
import {
  createSalesInvoice,
  getBatchesForProduct,
} from '../../src/app/billing/actions';
import {
  createSalesReturn,
  getCustomerInvoicesForReturn,
} from '../../src/app/billing/returns/actions';
import {
  calculateSchemeFreeQty,
  calculateLineItem,
  calculateInvoiceTotals,
  roundToPaise,
  roundToRupee,
} from '../../src/lib/business-engine/calculations';
import {
  allocateStockFIFO,
  analyzeBatchMrps,
} from '../../src/lib/business-engine/fifoAllocation';
import {
  validateBusinessInvariants,
  validateLineItemPricing,
  validateCustomerDrugLicense,
  validateCustomerCreditLimit,
} from '../../src/lib/business-engine/invariants';
import { BatchStock } from '../../src/lib/business-engine/types';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';

describe('Milestone 4 — Adversarial Billing & Transaction Stress Suite', () => {
  let testCompanyId: string;
  let testAreaId: string;
  let testTaxSlab02: string;

  beforeAll(async () => {
    // 1. Ensure test company
    const comp = await db.query.companies.findFirst();
    if (comp) {
      testCompanyId = comp.id;
    } else {
      testCompanyId = crypto.randomUUID();
      db.insert(companies).values({
        id: testCompanyId,
        code: 'COMP_ADV',
        name: 'ADVERSARIAL PHARMA LTD',
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
        code: 'A_ADV',
        name: 'ADVERSARIAL AREA',
        isActive: true,
      }).run();
    }

    testTaxSlab02 = '02';
  });

  // ==========================================================================
  // 1. Free Scheme Boundary Calculations
  // ==========================================================================
  describe('1. Free Scheme Boundary Calculations (F08 / INVPRE.PRG:589)', () => {
    it('returns exactly 0 free goods when quantity is strictly below threshold', () => {
      // 10 + 1 scheme: 0 to 9 must return 0
      expect(calculateSchemeFreeQty(0, 10, 1)).toBe(0);
      expect(calculateSchemeFreeQty(1, 10, 1)).toBe(0);
      expect(calculateSchemeFreeQty(5, 10, 1)).toBe(0);
      expect(calculateSchemeFreeQty(9, 10, 1)).toBe(0);

      // 100 + 10 scheme: 99 must return 0
      expect(calculateSchemeFreeQty(99, 100, 10)).toBe(0);

      // 5 + 2 scheme: 4 must return 0
      expect(calculateSchemeFreeQty(4, 5, 2)).toBe(0);
    });

    it('returns exact multiples on exact threshold boundaries', () => {
      // Exactly at first threshold
      expect(calculateSchemeFreeQty(10, 10, 1)).toBe(1);
      expect(calculateSchemeFreeQty(100, 100, 10)).toBe(10);
      expect(calculateSchemeFreeQty(5, 5, 2)).toBe(2);

      // Just below second threshold
      expect(calculateSchemeFreeQty(19, 10, 1)).toBe(1);
      expect(calculateSchemeFreeQty(199, 100, 10)).toBe(10);
      expect(calculateSchemeFreeQty(9, 5, 2)).toBe(2);

      // Exactly at second threshold
      expect(calculateSchemeFreeQty(20, 10, 1)).toBe(2);
      expect(calculateSchemeFreeQty(200, 100, 10)).toBe(20);
      expect(calculateSchemeFreeQty(10, 5, 2)).toBe(4);

      // Multiple tiers (e.g. 50 on 10+1 => 5)
      expect(calculateSchemeFreeQty(50, 10, 1)).toBe(5);
      expect(calculateSchemeFreeQty(59, 10, 1)).toBe(5);
    });

    it('handles zero-ratio and invalid negative parameters safely without NaN or Infinity', () => {
      // Zero threshold must yield 0, not Infinity or division by zero
      expect(calculateSchemeFreeQty(100, 0, 1)).toBe(0);
      expect(calculateSchemeFreeQty(100, 0, 0)).toBe(0);

      // Zero free qty must yield 0
      expect(calculateSchemeFreeQty(100, 10, 0)).toBe(0);

      // Negative values
      expect(calculateSchemeFreeQty(-10, 10, 1)).toBe(0);
      expect(calculateSchemeFreeQty(10, -10, 1)).toBe(0);
      expect(calculateSchemeFreeQty(10, 10, -1)).toBe(0);
    });

    it('handles massive quantities safely under high-volume stress', () => {
      // 10 million units at 10 + 1 scheme
      expect(calculateSchemeFreeQty(10_000_000, 10, 1)).toBe(1_000_000);
      // Non-multiple: 10,000,009 at 10 + 1 scheme => 1,000,000
      expect(calculateSchemeFreeQty(10_000_009, 10, 1)).toBe(1_000_000);
      // 50 million units at 25 + 3 scheme
      expect(calculateSchemeFreeQty(50_000_000, 25, 3)).toBe(6_000_000);
    });

    it('strictly forces 0 free goods when item is flagged as replacement', () => {
      // Replacement goods never grant free bonus units regardless of quantity
      expect(calculateSchemeFreeQty(100, 10, 1, true)).toBe(0);
      expect(calculateSchemeFreeQty(50_000, 10, 5, true)).toBe(0);
    });

    it('empirically verifies POS billing auto-scheme computation and inventory deduction in database', async () => {
      // Setup customer
      const custId = crypto.randomUUID();
      db.insert(customers).values({
        id: custId,
        code: 'CSCH_' + crypto.randomBytes(3).toString('hex'),
        name: 'SCHEME TEST PHARMACY',
        areaId: testAreaId,
        billingType: 'L',
        closingBalance: 0,
        dlExpiryDate: '2030-01-01',
        isActive: true,
      }).run();

      // Setup product & batch with 10 + 1 scheme
      const prodId = crypto.randomUUID();
      db.insert(products).values({
        id: prodId,
        code: 'PSCH_' + crypto.randomBytes(3).toString('hex'),
        name: 'CEFIXIME 200MG TAB',
        companyId: testCompanyId,
        taxCode: '02',
        hsnCode: '30049099',
        packaging: '10x10',
        totalStockOnHand: 100,
        isActive: true,
      }).run();

      const batchId = crypto.randomUUID();
      db.insert(productBatches).values({
        id: batchId,
        productId: prodId,
        batchNo: 'SCH-BAT-01',
        expiryDate: '2028-12-31',
        purchaseRate: 50.0,
        sellingRate: 70.0,
        mrp: 100.0,
        stockQty: 100,
        quarantineQty: 0,
        schemeThreshold: 10,
        schemeFreeQty: 1,
        taxCode: '02',
        isActive: true,
      }).run();

      // Test 1: Billed Qty = 9 (under threshold: freeQuantity should be 0, total deducted = 9)
      const resUnder = await createSalesInvoice({
        customerId: custId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_TEST',
        items: [
          {
            productId: prodId,
            batchId,
            productName: 'CEFIXIME 200MG TAB',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'SCH-BAT-01',
            expiryDate: '2028-12-31',
            quantity: 9,
            freeQuantity: 0,
            sellingRate: 70.0,
            purchaseRate: 50.0,
            mrp: 100.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
            schemeThreshold: 10,
            schemeFreeQty: 1,
          },
        ],
      });

      if (!resUnder.success) {
        console.error('DEBUG resUnder.error:', resUnder.error);
      }
      expect(resUnder.success).toBe(true);
      let batchState = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, batchId),
      });
      expect(batchState?.stockQty).toBe(100 - 9); // Exactly 91 remaining

      // Test 2: Billed Qty = 10 (at threshold: auto calculated free = 1, total deducted = 11)
      const resExact = await createSalesInvoice({
        customerId: custId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_TEST',
        items: [
          {
            productId: prodId,
            batchId,
            productName: 'CEFIXIME 200MG TAB',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'SCH-BAT-01',
            expiryDate: '2028-12-31',
            quantity: 10,
            freeQuantity: 1, // 10 / 10 * 1 = 1
            sellingRate: 70.0,
            purchaseRate: 50.0,
            mrp: 100.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
            schemeThreshold: 10,
            schemeFreeQty: 1,
          },
        ],
      });

      expect(resExact.success).toBe(true);
      batchState = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, batchId),
      });
      expect(batchState?.stockQty).toBe(91 - 11); // Exactly 80 remaining
    });
  });

  // ==========================================================================
  // 2. FEFO Batch Splitting Across Multiple Batches
  // ==========================================================================
  describe('2. FEFO Batch Splitting Across Multiple Batches (F12 / INVPRE.PRG:1225)', () => {
    it('splits requested quantity across consecutive batches according to earliest expiry date', () => {
      const mockBatches: BatchStock[] = [
        {
          id: 'batch-3',
          batchNo: 'BAT-2028',
          expiryDate: '2028-12-31', // Latest expiry
          stockQty: 50,
          purchaseRate: 40,
          sellingRate: 55,
          mrp: 80,
        },
        {
          id: 'batch-1',
          batchNo: 'BAT-2027-FEB',
          expiryDate: '2027-02-28', // Earliest expiry
          stockQty: 15,
          purchaseRate: 38,
          sellingRate: 50,
          mrp: 75,
        },
        {
          id: 'batch-2',
          batchNo: 'BAT-2027-OCT',
          expiryDate: '2027-10-31', // Middle expiry
          stockQty: 25,
          purchaseRate: 39,
          sellingRate: 52,
          mrp: 78,
        },
      ];

      // Request 35 units total (exceeds batch 1's 15 units, requires batch 2's 20 units)
      const result = allocateStockFIFO(mockBatches, 35, 0, {
        systemDate: '2026-09-29',
      });

      expect(result.success).toBe(true);
      expect(result.totalAllocatedQty).toBe(35);
      expect(result.allocations.length).toBe(2);

      // Slice 1: Must be batch-1 (earliest: 2027-02-28), fully consumed (15 units)
      expect(result.allocations[0].batchId).toBe('batch-1');
      expect(result.allocations[0].allocatedBilledQty).toBe(15);
      expect(result.allocations[0].remainingBatchStock).toBe(0);

      // Slice 2: Must be batch-2 (next: 2027-10-31), partially consumed (20 units of 25)
      expect(result.allocations[1].batchId).toBe('batch-2');
      expect(result.allocations[1].allocatedBilledQty).toBe(20);
      expect(result.allocations[1].remainingBatchStock).toBe(5);

      // Multi-MRP detection: Batch 1 MRP 75, Batch 2 MRP 78
      expect(result.hasMultiMrp).toBe(true);
      expect(result.distinctMrps).toEqual([75, 78]);
    });

    it('strictly excludes already-expired batches from FEFO allocation', () => {
      const mockBatches: BatchStock[] = [
        {
          id: 'batch-expired',
          batchNo: 'BAT-EXPIRED',
          expiryDate: '2025-01-01', // Expired relative to 2026-09-29
          stockQty: 100,
          purchaseRate: 30,
          sellingRate: 45,
          mrp: 60,
        },
        {
          id: 'batch-valid',
          batchNo: 'BAT-VALID',
          expiryDate: '2027-06-30', // Valid active stock
          stockQty: 20,
          purchaseRate: 30,
          sellingRate: 45,
          mrp: 60,
        },
      ];

      // Request 25 units: only 20 valid units exist, expired batch must NOT be touched
      const result = allocateStockFIFO(mockBatches, 25, 0, {
        systemDate: '2026-09-29',
        excludeExpired: true,
      });

      expect(result.totalAllocatedQty).toBe(20);
      expect(result.unallocatedQty).toBe(5);
      expect(result.isPartiallyAllocated).toBe(true);
      expect(result.allocations.some((a) => a.batchId === 'batch-expired')).toBe(false);
    });

    it('rejects allocation when allowPartialAllocation is false and inventory is insufficient', () => {
      const mockBatches: BatchStock[] = [
        {
          id: 'b1',
          batchNo: 'B1',
          expiryDate: '2027-01-01',
          stockQty: 10,
          purchaseRate: 20,
          sellingRate: 30,
          mrp: 40,
        },
      ];

      const result = allocateStockFIFO(mockBatches, 20, 0, {
        allowPartialAllocation: false,
      });

      expect(result.success).toBe(false);
      expect(result.isUnallocated).toBe(true);
      expect(result.allocations.length).toBe(0);
      expect(result.error).toMatch(/Insufficient stock/i);
    });

    it('empirically executes multi-batch billing with database transaction rollback safety', async () => {
      // Create product with 2 distinct batches
      const prodId = crypto.randomUUID();
      db.insert(products).values({
        id: prodId,
        code: 'PMB_' + crypto.randomBytes(3).toString('hex'),
        name: 'PARACETAMOL 650MG TAB',
        companyId: testCompanyId,
        taxCode: '02',
        hsnCode: '30049099',
        packaging: '10x15',
        totalStockOnHand: 30,
        isActive: true,
      }).run();

      const batch1Id = crypto.randomUUID();
      db.insert(productBatches).values({
        id: batch1Id,
        productId: prodId,
        batchNo: 'PCM-BAT-01',
        expiryDate: '2027-03-31',
        purchaseRate: 15.0,
        sellingRate: 25.0,
        mrp: 35.0,
        stockQty: 10, // Only 10 available
        quarantineQty: 0,
        taxCode: '02',
        isActive: true,
      }).run();

      const batch2Id = crypto.randomUUID();
      db.insert(productBatches).values({
        id: batch2Id,
        productId: prodId,
        batchNo: 'PCM-BAT-02',
        expiryDate: '2027-09-30',
        purchaseRate: 16.0,
        sellingRate: 26.0,
        mrp: 36.0,
        stockQty: 20, // 20 available
        quarantineQty: 0,
        taxCode: '02',
        isActive: true,
      }).run();

      const custId = crypto.randomUUID();
      db.insert(customers).values({
        id: custId,
        code: 'CPMB_' + crypto.randomBytes(3).toString('hex'),
        name: 'MULTI BATCH CHEMISTS',
        areaId: testAreaId,
        billingType: 'L',
        closingBalance: 0,
        dlExpiryDate: '2030-01-01',
        isActive: true,
      }).run();

      // Case A: Successful multi-batch split (10 from Batch 1, 15 from Batch 2)
      const resSuccess = await createSalesInvoice({
        customerId: custId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_TEST',
        items: [
          {
            productId: prodId,
            batchId: batch1Id,
            productName: 'PARACETAMOL 650MG TAB',
            packaging: '10x15',
            hsnCode: '30049099',
            batchNo: 'PCM-BAT-01',
            expiryDate: '2027-03-31',
            quantity: 10, // Takes all 10
            freeQuantity: 0,
            sellingRate: 25.0,
            purchaseRate: 15.0,
            mrp: 35.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
          {
            productId: prodId,
            batchId: batch2Id,
            productName: 'PARACETAMOL 650MG TAB',
            packaging: '10x15',
            hsnCode: '30049099',
            batchNo: 'PCM-BAT-02',
            expiryDate: '2027-09-30',
            quantity: 15, // Takes 15 of 20
            freeQuantity: 0,
            sellingRate: 26.0,
            purchaseRate: 16.0,
            mrp: 36.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(resSuccess.success).toBe(true);

      const b1After = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, batch1Id),
      });
      const b2After = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, batch2Id),
      });
      const prodAfter = await db.query.products.findFirst({
        where: eq(products.id, prodId),
      });

      expect(b1After?.stockQty).toBe(0); // 10 - 10 = 0
      expect(b2After?.stockQty).toBe(5); // 20 - 15 = 5
      expect(prodAfter?.totalStockOnHand).toBe(5); // 30 - 25 = 5

      // Case B: Transaction rollback test: Batch 1 has 0 stock remaining.
      // Trying to take 5 from Batch 2 (which has 5) and 1 from Batch 1 (which has 0) must rollback!
      const resRollback = await createSalesInvoice({
        customerId: custId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_TEST',
        items: [
          {
            productId: prodId,
            batchId: batch2Id,
            productName: 'PARACETAMOL 650MG TAB',
            packaging: '10x15',
            hsnCode: '30049099',
            batchNo: 'PCM-BAT-02',
            expiryDate: '2027-09-30',
            quantity: 5, // Valid on its own
            freeQuantity: 0,
            sellingRate: 26.0,
            purchaseRate: 16.0,
            mrp: 36.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
          {
            productId: prodId,
            batchId: batch1Id,
            productName: 'PARACETAMOL 650MG TAB',
            packaging: '10x15',
            hsnCode: '30049099',
            batchNo: 'PCM-BAT-01',
            expiryDate: '2027-03-31',
            quantity: 1, // Impossible: stock is 0
            freeQuantity: 0,
            sellingRate: 25.0,
            purchaseRate: 15.0,
            mrp: 35.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(resRollback.success).toBe(false);
      expect(resRollback.error).toMatch(/Insufficient stock/i);

      // Verify Batch 2 stock was untouched and did NOT decrement by 5!
      const b2Rollback = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, batch2Id),
      });
      expect(b2Rollback?.stockQty).toBe(5);
    });
  });

  // ==========================================================================
  // 3. Pricing Bounds: Zero Rate, Negative Margin & DPCO Ceilings
  // ==========================================================================
  describe('3. Pricing Bounds & Invariants (F11 / INVPRE.PRG:1710, 1726, 2190)', () => {
    it('strictly rejects zero selling rate for normal goods in invariant engine and POS action', async () => {
      // 1. Invariant engine level
      const violations = validateLineItemPricing({
        sellingRate: 0,
        purchaseRate: 50,
        mrp: 80,
        isReplacement: false,
      });
      expect(violations.some((v) => v.code === 'ZERO_SELLING_RATE' && v.severity === 'ERROR')).toBe(true);

      // 2. Replacement item exception: sellingRate = 0 is valid for replacement
      const replacementViolations = validateLineItemPricing({
        sellingRate: 0,
        purchaseRate: 50,
        mrp: 80,
        isReplacement: true,
      });
      expect(replacementViolations.some((v) => v.code === 'ZERO_SELLING_RATE')).toBe(false);
    });

    it('detects negative margin violations and supports supervisor override bypass', () => {
      // Cost = 50, Selling = 40 (negative margin)
      const violationsUnbypassed = validateLineItemPricing(
        {
          sellingRate: 40,
          purchaseRate: 50,
          mrp: 75,
        },
        false // No bypass
      );

      const negMarginError = violationsUnbypassed.find((v) => v.code === 'NEGATIVE_MARGIN');
      expect(negMarginError).toBeDefined();
      expect(negMarginError?.severity).toBe('ERROR');
      expect(negMarginError?.canBypass).toBe(true);

      // With supervisor bypass enabled: downgraded to WARNING
      const violationsBypassed = validateLineItemPricing(
        {
          sellingRate: 40,
          purchaseRate: 50,
          mrp: 75,
        },
        true // Bypassed by supervisor
      );

      const negMarginWarning = violationsBypassed.find((v) => v.code === 'NEGATIVE_MARGIN');
      expect(negMarginWarning?.severity).toBe('WARNING');
      expect(negMarginWarning?.isBypassed).toBe(true);
    });

    it('strictly prohibits DPCO statutory ceiling violations without bypass allowance', async () => {
      // DPCO rule: Selling Rate cannot exceed MRP under any circumstance
      const violations = validateLineItemPricing({
        sellingRate: 120.0,
        purchaseRate: 80.0,
        mrp: 100.0, // MRP is 100, Selling Rate is 120
      });

      const dpcoViolation = violations.find((v) => v.code === 'SELLING_RATE_EXCEEDS_MRP');
      expect(dpcoViolation).toBeDefined();
      expect(dpcoViolation?.severity).toBe('ERROR');
      expect(dpcoViolation?.canBypass).toBe(false); // Strictly non-bypassable!
    });

    it('empirically enforces Rate=0 and DPCO price ceilings inside createSalesInvoice action', async () => {
      const prodId = crypto.randomUUID();
      db.insert(products).values({
        id: prodId,
        code: 'PPRC_' + crypto.randomBytes(3).toString('hex'),
        name: 'PRICE BOUND TEST TAB',
        companyId: testCompanyId,
        taxCode: '02',
        hsnCode: '30049099',
        packaging: '10x10',
        totalStockOnHand: 50,
        isActive: true,
      }).run();

      const batchId = crypto.randomUUID();
      db.insert(productBatches).values({
        id: batchId,
        productId: prodId,
        batchNo: 'PRC-BAT-01',
        expiryDate: '2028-12-31',
        purchaseRate: 40.0,
        sellingRate: 50.0,
        mrp: 70.0,
        stockQty: 50,
        quarantineQty: 0,
        taxCode: '02',
        isActive: true,
      }).run();

      const custId = crypto.randomUUID();
      db.insert(customers).values({
        id: custId,
        code: 'CPRC_' + crypto.randomBytes(3).toString('hex'),
        name: 'PRICE BOUND CHEMISTS',
        areaId: testAreaId,
        billingType: 'L',
        closingBalance: 0,
        dlExpiryDate: '2030-01-01',
        isActive: true,
      }).run();

      // Attempt 1: Selling rate = 0 (rejected)
      const resZeroRate = await createSalesInvoice({
        customerId: custId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_TEST',
        items: [
          {
            productId: prodId,
            batchId,
            productName: 'PRICE BOUND TEST TAB',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'PRC-BAT-01',
            expiryDate: '2028-12-31',
            quantity: 1,
            freeQuantity: 0,
            sellingRate: 0, // Rate = 0
            purchaseRate: 40.0,
            mrp: 70.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
            isReplacement: false,
          },
        ],
      });

      expect(resZeroRate.success).toBe(false);
      expect(resZeroRate.error).toMatch(/Selling Rate cannot be zero/i);

      // Attempt 2: Selling rate > MRP (DPCO ceiling violation attempt: Rs 85 > MRP 70)
      const resDpcoCeiling = await createSalesInvoice({
        customerId: custId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_TEST',
        items: [
          {
            productId: prodId,
            batchId,
            productName: 'PRICE BOUND TEST TAB',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'PRC-BAT-01',
            expiryDate: '2028-12-31',
            quantity: 1,
            freeQuantity: 0,
            sellingRate: 85.0, // Exceeds MRP of 70.0
            purchaseRate: 40.0,
            mrp: 70.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(resDpcoCeiling.success).toBe(false);
      expect(resDpcoCeiling.error).toMatch(/DPCO Violation/i);
    });
  });

  // ==========================================================================
  // 4. Credit Limit Exceeded: Blocking vs Supervisor Bypass
  // ==========================================================================
  describe('4. Credit Limit Invariants & Supervisor Bypass (F11 / PERCAED.PRG:118)', () => {
    it('blocks credit sale when balance + bill exceeds credit limit without supervisor bypass', () => {
      const customer = {
        creditLimit: 10000,
        closingBalance: 9500,
        bypassCreditLimit: false,
      };

      const violations = validateCustomerCreditLimit(
        customer,
        1000, // 9500 + 1000 = 10500 > 10000
        'R',  // Credit terms
        false // Not bypassed
      );

      const creditErr = violations.find((v) => v.code === 'CREDIT_LIMIT_EXCEEDED');
      expect(creditErr).toBeDefined();
      expect(creditErr?.severity).toBe('ERROR');
      expect(creditErr?.canBypass).toBe(true);
    });

    it('permits billing when credit limit excess is explicitly bypassed by supervisor', () => {
      const customer = {
        creditLimit: 10000,
        closingBalance: 9500,
        bypassCreditLimit: false,
      };

      const violations = validateCustomerCreditLimit(
        customer,
        1000,
        'R',
        true // Supervisor bypass flag set
      );

      const creditWarn = violations.find((v) => v.code === 'CREDIT_LIMIT_EXCEEDED');
      expect(creditWarn).toBeDefined();
      expect(creditWarn?.severity).toBe('WARNING');
      expect(creditWarn?.isBypassed).toBe(true);
    });

    it('cash transactions never trigger credit limit violations even when limit is exceeded', () => {
      const customer = {
        creditLimit: 5000,
        closingBalance: 12000, // Already heavily in debt
        bypassCreditLimit: false,
      };

      const violations = validateCustomerCreditLimit(
        customer,
        50000,
        'C', // CASH terms
        false
      );

      expect(violations.length).toBe(0);
    });

    it('empirically enforces credit limit blocking vs supervisor bypass in createSalesInvoice', async () => {
      const prodId = crypto.randomUUID();
      db.insert(products).values({
        id: prodId,
        code: 'PCRD_' + crypto.randomBytes(3).toString('hex'),
        name: 'CREDIT TEST TAB',
        companyId: testCompanyId,
        taxCode: '02',
        hsnCode: '30049099',
        packaging: '10x10',
        totalStockOnHand: 50,
        isActive: true,
      }).run();

      const batchId = crypto.randomUUID();
      db.insert(productBatches).values({
        id: batchId,
        productId: prodId,
        batchNo: 'CRD-BAT-01',
        expiryDate: '2028-12-31',
        purchaseRate: 20.0,
        sellingRate: 30.0,
        mrp: 45.0,
        stockQty: 50,
        quarantineQty: 0,
        taxCode: '02',
        isActive: true,
      }).run();

      const custId = crypto.randomUUID();
      db.insert(customers).values({
        id: custId,
        code: 'CCRD_' + crypto.randomBytes(3).toString('hex'),
        name: 'STRICT LIMIT CHEMISTS',
        areaId: testAreaId,
        billingType: 'L',
        creditLimit: 500, // Limit is 500
        closingBalance: 400, // Current debt is 400 (remaining headroom = 100)
        dlExpiryDate: '2030-01-01',
        isActive: true,
      }).run();

      const item = {
        productId: prodId,
        batchId,
        productName: 'CREDIT TEST TAB',
        packaging: '10x10',
        hsnCode: '30049099',
        batchNo: 'CRD-BAT-01',
        expiryDate: '2028-12-31',
        quantity: 5,
        freeQuantity: 0,
        sellingRate: 30.0,
        purchaseRate: 20.0,
        mrp: 45.0,
        tradeDiscountPct: 0,
        taxCode: '02',
        taxPct: 12,
      };

      // Case A: Without bypass -> Fails with Credit limit exceeded
      const resBlocked = await createSalesInvoice({
        customerId: custId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CREDIT',
        isInterstate: false,
        preparedBy: 'OPERATOR',
        creditLimitBypassed: false,
        items: [item],
      });

      expect(resBlocked.success).toBe(false);
      expect(resBlocked.error).toMatch(/Credit limit exceeded/i);

      // Case B: With supervisor bypass -> Succeeds
      const resBypassed = await createSalesInvoice({
        customerId: custId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CREDIT',
        isInterstate: false,
        preparedBy: 'SUPERVISOR',
        creditLimitBypassed: true,
        items: [item],
      });

      expect(resBypassed.success).toBe(true);
      expect(resBypassed.invoiceNo).toMatch(/^INV-\d{6}$/);

      const custAfter = await db.query.customers.findFirst({
        where: eq(customers.id, custId),
      });
      expect(custAfter?.closingBalance).toBe(400 + resBypassed.grandTotal!);
    });
  });

  // ==========================================================================
  // 5. Drug License Expiry: Expired Party Blocking
  // ==========================================================================
  describe('5. Drug License Expiry & Regulatory Enforcement (F11 / INVPRE.PRG:374-378)', () => {
    it('blocks sales to customers with expired Form 20B/21B Drug License', () => {
      const customer = {
        creditLimit: 50000,
        closingBalance: 0,
        dlExpiryDate: '2024-05-15', // Expired in 2024
      };

      const violations = validateCustomerDrugLicense(
        customer,
        '2026-09-29', // Current system date
        false,
        false
      );

      const expiredViolation = violations.find((v) => v.code === 'DRUG_LICENSE_EXPIRED');
      expect(expiredViolation).toBeDefined();
      expect(expiredViolation?.severity).toBe('ERROR');
    });

    it('allows sales to customers with valid future Drug License', () => {
      const customer = {
        creditLimit: 50000,
        closingBalance: 0,
        dlExpiryDate: '2028-12-31', // Valid
      };

      const violations = validateCustomerDrugLicense(
        customer,
        '2026-09-29',
        false,
        false
      );

      const expiredViolation = violations.find((v) => v.code === 'DRUG_LICENSE_EXPIRED');
      expect(expiredViolation).toBeUndefined();
    });

    it('issues warning for near-expiry Drug License within 30-day window without blocking', () => {
      const customer = {
        creditLimit: 50000,
        closingBalance: 0,
        dlExpiryDate: '2026-10-15', // 16 days away from 2026-09-29
      };

      const violations = validateCustomerDrugLicense(
        customer,
        '2026-09-29',
        false,
        false,
        30 // 30-day threshold
      );

      const nearExpiryViolation = violations.find((v) => v.code === 'DRUG_LICENSE_NEAR_EXPIRY');
      expect(nearExpiryViolation).toBeDefined();
      expect(nearExpiryViolation?.severity).toBe('WARNING');
    });

    it('strictly requires DL number when Schedule H / H1 products are billed', () => {
      const customerWithoutDl = {
        creditLimit: 50000,
        closingBalance: 0,
        dlNo20b: null,
        dlNo21b: '',
      };

      const violations = validateCustomerDrugLicense(
        customerWithoutDl,
        '2026-09-29',
        true, // Schedule H product
        false
      );

      const missingDl = violations.find((v) => v.code === 'DRUG_LICENSE_MISSING');
      expect(missingDl).toBeDefined();
      expect(missingDl?.severity).toBe('ERROR');
      expect(missingDl?.canBypass).toBe(false);
    });

    it('empirically blocks createSalesInvoice when customer drug license has expired', async () => {
      const prodId = crypto.randomUUID();
      db.insert(products).values({
        id: prodId,
        code: 'PDLE_' + crypto.randomBytes(3).toString('hex'),
        name: 'DL EXPIRY TEST TAB',
        companyId: testCompanyId,
        taxCode: '02',
        hsnCode: '30049099',
        packaging: '10x10',
        totalStockOnHand: 50,
        isActive: true,
      }).run();

      const batchId = crypto.randomUUID();
      db.insert(productBatches).values({
        id: batchId,
        productId: prodId,
        batchNo: 'DLE-BAT-01',
        expiryDate: '2028-12-31',
        purchaseRate: 20.0,
        sellingRate: 30.0,
        mrp: 45.0,
        stockQty: 50,
        quarantineQty: 0,
        taxCode: '02',
        isActive: true,
      }).run();

      const custId = crypto.randomUUID();
      db.insert(customers).values({
        id: custId,
        code: 'CDLE_' + crypto.randomBytes(3).toString('hex'),
        name: 'EXPIRED LICENSE PHARMACY',
        areaId: testAreaId,
        billingType: 'L',
        closingBalance: 0,
        dlExpiryDate: '2024-01-01', // Expired in 2024
        isActive: true,
      }).run();

      const res = await createSalesInvoice({
        customerId: custId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_TEST',
        items: [
          {
            productId: prodId,
            batchId,
            productName: 'DL EXPIRY TEST TAB',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'DLE-BAT-01',
            expiryDate: '2028-12-31',
            quantity: 2,
            freeQuantity: 0,
            sellingRate: 30.0,
            purchaseRate: 20.0,
            mrp: 45.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Customer Drug License has expired/i);
    });
  });

  // ==========================================================================
  // 6. Rupee Integer Round-off Boundary Conditions
  // ==========================================================================
  describe('6. Rupee Integer Round-Off Boundary Conditions (F10 / PROCFILE.PRG:2356)', () => {
    it('verifies round-half-up boundaries to nearest whole rupee', () => {
      // 0.49 paise rounds DOWN to nearest rupee
      expect(roundToRupee(100.49)).toBe(100);
      expect(roundToPaise(100 - 100.49)).toBe(-0.49);

      // 0.50 paise rounds UP to nearest rupee
      expect(roundToRupee(100.50)).toBe(101);
      expect(roundToPaise(101 - 100.50)).toBe(0.50);

      // 0.51 paise rounds UP
      expect(roundToRupee(100.51)).toBe(101);
      expect(roundToPaise(101 - 100.51)).toBe(0.49);

      // Exact integer 0.00 paise
      expect(roundToRupee(100.00)).toBe(100);
      expect(roundToPaise(100 - 100.00)).toBe(0.00);

      // 0.01 paise rounds DOWN
      expect(roundToRupee(100.01)).toBe(100);
      expect(roundToPaise(100 - 100.01)).toBe(-0.01);

      // 0.99 paise rounds UP
      expect(roundToRupee(100.99)).toBe(101);
      expect(roundToPaise(101 - 100.99)).toBe(0.01);
    });

    it('maintains strict decimal precision under multi-line fractional paise tax calculations', () => {
      // Stress test: 7 lines each with small quantities resulting in fractional paise
      const lines = [
        calculateLineItem({
          quantity: 3,
          sellingRate: 11.33,
          tradeDiscountPct: 2.5,
          taxPct: 12,
        }),
        calculateLineItem({
          quantity: 7,
          sellingRate: 17.77,
          tradeDiscountPct: 3.0,
          taxPct: 18,
        }),
        calculateLineItem({
          quantity: 1,
          sellingRate: 99.99,
          tradeDiscountPct: 5.0,
          taxPct: 5,
        }),
        calculateLineItem({
          quantity: 13,
          sellingRate: 4.44,
          tradeDiscountPct: 1.5,
          taxPct: 12,
        }),
      ];

      const totals = calculateInvoiceTotals({
        lineItems: lines,
        cashDiscountPct: 1.25,
        freightCharges: 15.50,
      });

      // Verification invariants:
      // 1. grandTotal must be an integer (no decimal fractions)
      expect(Number.isInteger(totals.grandTotal)).toBe(true);

      // 2. unroundedTotal + roundOffAmount must exactly equal grandTotal
      const computedSum = roundToPaise(totals.unroundedTotal + totals.roundOffAmount);
      expect(computedSum).toBe(totals.grandTotal);

      // 3. roundOffAmount must be strictly between -0.50 and +0.50
      expect(totals.roundOffAmount).toBeGreaterThanOrEqual(-0.50);
      expect(totals.roundOffAmount).toBeLessThanOrEqual(0.50);
    });

    it('empirically records exact integer grandTotal and paise roundOff in database invoice header', async () => {
      const prodId = crypto.randomUUID();
      db.insert(products).values({
        id: prodId,
        code: 'PRND_' + crypto.randomBytes(3).toString('hex'),
        name: 'ROUND OFF TEST TAB',
        companyId: testCompanyId,
        taxCode: '02',
        hsnCode: '30049099',
        packaging: '10x10',
        totalStockOnHand: 50,
        isActive: true,
      }).run();

      const batchId = crypto.randomUUID();
      db.insert(productBatches).values({
        id: batchId,
        productId: prodId,
        batchNo: 'RND-BAT-01',
        expiryDate: '2028-12-31',
        purchaseRate: 20.0,
        sellingRate: 33.33,
        mrp: 50.0,
        stockQty: 50,
        quarantineQty: 0,
        taxCode: '02',
        isActive: true,
      }).run();

      const custId = crypto.randomUUID();
      db.insert(customers).values({
        id: custId,
        code: 'CRND_' + crypto.randomBytes(3).toString('hex'),
        name: 'ROUNDING CHEMISTS',
        areaId: testAreaId,
        billingType: 'L',
        closingBalance: 0,
        dlExpiryDate: '2030-01-01',
        isActive: true,
      }).run();

      const res = await createSalesInvoice({
        customerId: custId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_TEST',
        items: [
          {
            productId: prodId,
            batchId,
            productName: 'ROUND OFF TEST TAB',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'RND-BAT-01',
            expiryDate: '2028-12-31',
            quantity: 3,
            freeQuantity: 0,
            sellingRate: 33.33,
            purchaseRate: 20.0,
            mrp: 50.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(Number.isInteger(res.grandTotal!)).toBe(true);

      const dbInvoice = await db.query.invoices.findFirst({
        where: eq(invoices.id, res.invoiceId!),
      });
      expect(dbInvoice).toBeDefined();
      expect(Number.isInteger(dbInvoice!.netAmount)).toBe(true);
      expect(dbInvoice!.roundOff).toBeDefined();
      expect(dbInvoice!.roundOff).toBeGreaterThanOrEqual(-0.50);
      expect(dbInvoice!.roundOff).toBeLessThanOrEqual(0.50);
    });
  });

  // ==========================================================================
  // 7. Sales Returns: Restock Routing vs Quarantine Routing
  // ==========================================================================
  describe('7. Sales Returns: Restock Routing vs Quarantine Routing (F24 / SRETPRE.PRG)', () => {
    let returnCustId: string;
    let returnProdId: string;
    let returnBatchId: string;

    beforeAll(async () => {
      returnCustId = crypto.randomUUID();
      db.insert(customers).values({
        id: returnCustId,
        code: 'CRET_' + crypto.randomBytes(3).toString('hex'),
        name: 'RETURNS DUAL ROUTE CHEMISTS',
        areaId: testAreaId,
        billingType: 'L',
        closingBalance: 20000,
        dlExpiryDate: '2030-01-01',
        isActive: true,
      }).run();

      returnProdId = crypto.randomUUID();
      db.insert(products).values({
        id: returnProdId,
        code: 'PRET_' + crypto.randomBytes(3).toString('hex'),
        name: 'PANTOPRAZOLE 40MG TAB',
        companyId: testCompanyId,
        taxCode: '02',
        hsnCode: '30049099',
        packaging: '10x10',
        totalStockOnHand: 50,
        isActive: true,
      }).run();

      returnBatchId = crypto.randomUUID();
      db.insert(productBatches).values({
        id: returnBatchId,
        productId: returnProdId,
        batchNo: 'PAN-BAT-01',
        expiryDate: '2028-06-30',
        purchaseRate: 30.0,
        sellingRate: 45.0,
        mrp: 65.0,
        stockQty: 50,
        quarantineQty: 0,
        taxCode: '02',
        isActive: true,
      }).run();
    });

    it('restock saleable returns increment stockQty & totalStockOnHand, leaving quarantineQty at 0', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, returnBatchId),
      });
      const initialProduct = await db.query.products.findFirst({
        where: eq(products.id, returnProdId),
      });
      const initialCustomer = await db.query.customers.findFirst({
        where: eq(customers.id, returnCustId),
      });

      const restockQty = 12;

      const res = await createSalesReturn({
        customerId: returnCustId,
        returnDate: '2026-09-29',
        returnType: 'CREDIT_NOTE',
        reason: 'EXCESS_STOCK',
        items: [
          {
            productId: returnProdId,
            batchId: returnBatchId,
            batchNo: 'PAN-BAT-01',
            expiryDate: '2028-06-30',
            quantity: restockQty,
            freeQuantity: 0,
            rate: 45.0,
            purchaseRate: 30.0,
            taxCode: '02',
            restockInventory: true, // Restock to active saleable
          },
        ],
      });

      expect(res.success).toBe(true);

      const afterBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, returnBatchId),
      });
      const afterProduct = await db.query.products.findFirst({
        where: eq(products.id, returnProdId),
      });
      const afterCustomer = await db.query.customers.findFirst({
        where: eq(customers.id, returnCustId),
      });

      // Active saleable stock incremented
      expect(afterBatch?.stockQty).toBe((initialBatch?.stockQty || 50) + restockQty);
      expect(afterProduct?.totalStockOnHand).toBe((initialProduct?.totalStockOnHand || 50) + restockQty);

      // Quarantine untouched
      expect(afterBatch?.quarantineQty).toBe(0);

      // Customer receivable credited
      expect(afterCustomer?.closingBalance).toBeCloseTo(
        (initialCustomer?.closingBalance || 20000) - (res.grandTotal || 0),
        1
      );
    });

    it('damaged / expired returns route to quarantineQty and leave saleable stock strictly untouched', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, returnBatchId),
      });
      const initialProduct = await db.query.products.findFirst({
        where: eq(products.id, returnProdId),
      });

      const quarantineQtyToReturn = 8;

      const res = await createSalesReturn({
        customerId: returnCustId,
        returnDate: '2026-09-29',
        returnType: 'CREDIT_NOTE',
        reason: 'EXPIRED',
        items: [
          {
            productId: returnProdId,
            batchId: returnBatchId,
            batchNo: 'PAN-BAT-01',
            expiryDate: '2028-06-30',
            quantity: quarantineQtyToReturn,
            freeQuantity: 0,
            rate: 45.0,
            purchaseRate: 30.0,
            taxCode: '02',
            restockInventory: false, // Route to regulatory quarantine!
          },
        ],
      });

      expect(res.success).toBe(true);

      const afterBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, returnBatchId),
      });
      const afterProduct = await db.query.products.findFirst({
        where: eq(products.id, returnProdId),
      });

      // Saleable stock MUST NOT change!
      expect(afterBatch?.stockQty).toBe(initialBatch?.stockQty);
      expect(afterProduct?.totalStockOnHand).toBe(initialProduct?.totalStockOnHand);

      // Quarantine stock MUST be incremented!
      expect(afterBatch?.quarantineQty).toBe(
        (initialBatch?.quarantineQty || 0) + quarantineQtyToReturn
      );
    });

    it('auto-offsets original invoice outstanding balance when originalInvoiceId is provided', async () => {
      // 1. Create original credit invoice
      const invoiceRes = await createSalesInvoice({
        customerId: returnCustId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CREDIT',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_TEST',
        items: [
          {
            productId: returnProdId,
            batchId: returnBatchId,
            productName: 'PANTOPRAZOLE 40MG TAB',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'PAN-BAT-01',
            expiryDate: '2028-06-30',
            quantity: 10,
            freeQuantity: 0,
            sellingRate: 45.0,
            purchaseRate: 30.0,
            mrp: 65.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(invoiceRes.success).toBe(true);
      const invoiceId = invoiceRes.invoiceId!;
      const grandTotal = invoiceRes.grandTotal!;

      // Verify original outstanding record
      let outstanding = await db.query.customerOutstandings.findFirst({
        where: eq(customerOutstandings.invoiceId, invoiceId),
      });
      expect(outstanding).toBeDefined();
      expect(outstanding?.status).toBe('OPEN');
      expect(outstanding?.balanceAmount).toBe(grandTotal);

      // 2. Issue partial sales return linked to the original invoice (return 4 units)
      const returnRes = await createSalesReturn({
        customerId: returnCustId,
        originalInvoiceId: invoiceId,
        returnDate: '2026-09-29',
        returnType: 'CREDIT_NOTE',
        reason: 'EXCESS_STOCK',
        items: [
          {
            productId: returnProdId,
            batchId: returnBatchId,
            batchNo: 'PAN-BAT-01',
            expiryDate: '2028-06-30',
            quantity: 4,
            freeQuantity: 0,
            rate: 45.0,
            purchaseRate: 30.0,
            taxCode: '02',
            restockInventory: true,
          },
        ],
      });

      expect(returnRes.success).toBe(true);
      const returnAmount = returnRes.grandTotal!;

      // Verify outstanding was automatically offset!
      outstanding = await db.query.customerOutstandings.findFirst({
        where: eq(customerOutstandings.invoiceId, invoiceId),
      });
      expect(outstanding?.paidAmount).toBe(returnAmount);
      expect(outstanding?.balanceAmount).toBe(grandTotal - returnAmount);
      expect(outstanding?.status).toBe('PARTIALLY_PAID');
    });
  });
});
