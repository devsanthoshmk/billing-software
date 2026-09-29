import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../src/lib/db';
import {
  products,
  productBatches,
  companies,
  taxSlabs,
} from '../../src/lib/db/schema/masters';
import { auditLogs } from '../../src/lib/db/schema/system';
import {
  reconcileStockCount,
  modifyBatchRates,
} from '../../src/app/stock/adjustments/actions';
import { eq, desc } from 'drizzle-orm';
import crypto from 'crypto';

describe('Milestone 4 — Feature F25: Stock Adjustments & Rate Modification (RATEADD.PRG / ADJDTL.PRG)', () => {
  let testCompanyId: string;
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
        code: 'COMP_ADJ',
        name: 'ADJUSTMENTS TEST PHARMA',
        isActive: true,
      }).run();
    }

    // 2. Create test product & batches
    testProductId = crypto.randomUUID();
    const uniqueProdCode = 'MA_' + crypto.randomBytes(3).toString('hex');
    db.insert(products).values({
      id: testProductId,
      code: uniqueProdCode,
      name: 'CETIRIZINE 10MG TAB',
      companyId: testCompanyId,
      taxCode: '02',
      packaging: '10x10 TAB',
      hsnCode: '30049099',
      totalStockOnHand: 100,
      isActive: true,
    }).run();

    testBatch1Id = crypto.randomUUID();
    db.insert(productBatches).values({
      id: testBatch1Id,
      productId: testProductId,
      batchNo: 'ADJ-BAT-01',
      expiryDate: '2028-06-30',
      purchaseRate: 15.0,
      sellingRate: 20.0,
      secondaryRate: 18.0,
      mrp: 30.0,
      stockQty: 50,
      quarantineQty: 0,
      taxCode: '02',
      isActive: true,
    }).run();

    testBatch2Id = crypto.randomUUID();
    db.insert(productBatches).values({
      id: testBatch2Id,
      productId: testProductId,
      batchNo: 'ADJ-BAT-02',
      expiryDate: '2028-12-31',
      purchaseRate: 16.0,
      sellingRate: 22.0,
      secondaryRate: 19.0,
      mrp: 32.0,
      stockQty: 50,
      quarantineQty: 0,
      taxCode: '02',
      isActive: true,
    }).run();
  });

  describe('1. Physical Count Reconciliation (ADJDTL.PRG)', () => {
    it('Found / Excess count increments active batch stock and product total stock', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch1Id),
      });
      const initialProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });

      const physicalCount = 55; // +5 excess
      const variance = physicalCount - (initialBatch?.stockQty || 50);

      const res = await reconcileStockCount({
        adjustmentDate: '2026-09-29',
        operatorId: 'AUDITOR',
        adjustments: [
          {
            productId: testProductId,
            batchId: testBatch1Id,
            systemQty: initialBatch?.stockQty || 50,
            physicalCountQty: physicalCount,
            reason: 'FOUND',
            remarks: 'Physical audit excess found on shelf',
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.adjustedCount).toBe(1);

      // Verify batch stock increased
      const updatedBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch1Id),
      });
      expect(updatedBatch?.stockQty).toBe(physicalCount);

      // Verify product totalStockOnHand increased
      const updatedProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      expect(updatedProduct?.totalStockOnHand).toBe(
        (initialProduct?.totalStockOnHand || 100) + variance
      );

      // Verify audit log entry
      const log = await db.query.auditLogs.findFirst({
        where: eq(auditLogs.entityId, testBatch1Id),
        orderBy: [desc(auditLogs.timestamp)],
      });
      expect(log).toBeDefined();
      expect(log?.action).toBe('STOCK_ADJUSTMENT');
    });

    it('Damage / Expired shortage decrements active stock and moves deficit to quarantine', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch2Id),
      });
      const initialProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });

      const physicalCount = 45; // -5 deficit
      const deficit = (initialBatch?.stockQty || 50) - physicalCount;

      const res = await reconcileStockCount({
        adjustmentDate: '2026-09-29',
        operatorId: 'AUDITOR',
        adjustments: [
          {
            productId: testProductId,
            batchId: testBatch2Id,
            systemQty: initialBatch?.stockQty || 50,
            physicalCountQty: physicalCount,
            reason: 'DAMAGE',
            remarks: 'Broken ampoules removed from shelf',
          },
        ],
      });

      expect(res.success).toBe(true);

      const updatedBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch2Id),
      });
      // Active stock decremented
      expect(updatedBatch?.stockQty).toBe(physicalCount);
      // Quarantine quantity incremented by deficit
      expect(updatedBatch?.quarantineQty).toBe(
        (initialBatch?.quarantineQty || 0) + deficit
      );

      // Product saleable totalStockOnHand decremented
      const updatedProduct = await db.query.products.findFirst({
        where: eq(products.id, testProductId),
      });
      expect(updatedProduct?.totalStockOnHand).toBe(
        (initialProduct?.totalStockOnHand || 0) - deficit
      );
    });

    it('Theft / Shrinkage deficit writes off stock directly without quarantine', async () => {
      const initialBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch2Id),
      });

      const physicalCount = 42; // -3 deficit
      const deficit = (initialBatch?.stockQty || 45) - physicalCount;

      const res = await reconcileStockCount({
        adjustmentDate: '2026-09-29',
        operatorId: 'AUDITOR',
        adjustments: [
          {
            productId: testProductId,
            batchId: testBatch2Id,
            systemQty: initialBatch?.stockQty || 45,
            physicalCountQty: physicalCount,
            reason: 'THEFT_SHRINK',
            remarks: 'Pilferage write-off',
          },
        ],
      });

      expect(res.success).toBe(true);

      const updatedBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch2Id),
      });
      // Active stock decremented
      expect(updatedBatch?.stockQty).toBe(physicalCount);
      // Quarantine quantity remains unchanged!
      expect(updatedBatch?.quarantineQty).toBe(initialBatch?.quarantineQty);
    });
  });

  describe('2. Batch Rate Modification (RATEADD.PRG)', () => {
    it('modifies batch rates within bounds and logs audit trail', async () => {
      const newPurchaseRate = 18.0;
      const newSellingRate = 24.0;
      const newSecondaryRate = 22.0;
      const newMrp = 36.0;

      const res = await modifyBatchRates({
        batchId: testBatch1Id,
        purchaseRate: newPurchaseRate,
        sellingRate: newSellingRate,
        secondaryRate: newSecondaryRate,
        mrp: newMrp,
        reason: 'Price revision by manufacturer',
        operatorId: 'ADMIN',
      });

      expect(res.success).toBe(true);

      // Verify in DB
      const updatedBatch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatch1Id),
      });
      expect(updatedBatch?.purchaseRate).toBe(newPurchaseRate);
      expect(updatedBatch?.sellingRate).toBe(newSellingRate);
      expect(updatedBatch?.secondaryRate).toBe(newSecondaryRate);
      expect(updatedBatch?.mrp).toBe(newMrp);

      // Verify audit log
      const log = await db.query.auditLogs.findFirst({
        where: eq(auditLogs.entityId, testBatch1Id),
        orderBy: [desc(auditLogs.timestamp)],
      });
      expect(log).toBeDefined();
      expect(log?.action).toBe('RATE_MODIFICATION');
      expect(log?.newValues).toContain('"sellingRate":24');
    });

    it('rejects selling rate exceeding MRP under DPCO price ceiling', async () => {
      const res = await modifyBatchRates({
        batchId: testBatch1Id,
        purchaseRate: 20.0,
        sellingRate: 50.0, // Selling rate exceeds MRP of 40!
        mrp: 40.0,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/cannot exceed MRP/i);
    });

    it('rejects negative margin (selling rate < purchase rate) without supervisor override', async () => {
      const res = await modifyBatchRates({
        batchId: testBatch1Id,
        purchaseRate: 25.0,
        sellingRate: 20.0, // Selling rate less than cost!
        mrp: 40.0,
        supervisorBypass: false,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Negative margin prohibited|less than Purchase Rate/i);
    });

    it('allows negative margin if supervisor override is explicitly provided', async () => {
      const res = await modifyBatchRates({
        batchId: testBatch1Id,
        purchaseRate: 25.0,
        sellingRate: 22.0,
        mrp: 40.0,
        supervisorBypass: true, // Supervisor override
      });

      expect(res.success).toBe(true);
    });

    it('rejects zero or negative rates', async () => {
      const res = await modifyBatchRates({
        batchId: testBatch1Id,
        purchaseRate: 0,
        sellingRate: 20.0,
        mrp: 30.0,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Purchase Rate is Zero/i);
    });
  });
});
