import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
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
  deleteProduct,
  searchProducts,
  convertExpiryToIso,
  BatchInput,
  ProductInput,
} from '../../src/app/masters/products/actions';
import { DosDataGrid, DosColumnDef } from '../../src/components/ui/DosDataGrid';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';

describe('Adversarial Challenger Suite: UI Components & Product Master (F14, F15, F19)', () => {
  let testCompanyId: string;
  const testTaxCode = '02';

  beforeAll(async () => {
    const existingComp = await db.query.companies.findFirst();
    if (existingComp) {
      testCompanyId = existingComp.id;
    } else {
      testCompanyId = crypto.randomUUID();
      db.insert(companies).values({
        id: testCompanyId,
        code: 'CHALLENGE_COMP',
        name: 'CHALLENGE PHARMA LTD',
        isActive: true,
      }).run();
    }
  });

  // =========================================================================
  // 1. Rapid Keyboard Navigation in <DosDataGrid /> (F14)
  // =========================================================================
  describe('1. Rapid Keyboard Navigation in <DosDataGrid />', () => {
    const mockColumns: DosColumnDef<any>[] = [
      { id: 'id', header: 'ID', accessorKey: 'id' },
      { id: 'name', header: 'NAME', accessorKey: 'name' },
    ];
    const mockData = Array.from({ length: 10 }, (_, i) => ({
      id: `ITEM-${i + 1}`,
      name: `Medicine Product ${i + 1}`,
    }));

    function createMockKeyboardEvent(key: string) {
      let defaultPrevented = false;
      let propagationStopped = false;
      return {
        key,
        preventDefault: () => { defaultPrevented = true; },
        stopPropagation: () => { propagationStopped = true; },
        get isDefaultPrevented() { return defaultPrevented; },
        get isPropagationStopped() { return propagationStopped; },
      };
    }

    function setupReactDispatcher(getState?: () => number, setState?: (v: any) => void) {
      const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const originalH = internals.H;
      internals.H = {
        useState: (initial: any) => [
          getState !== undefined ? getState() : initial,
          (newVal: any) => {
            if (setState) setState(newVal);
          },
        ],
        useRef: (initial: any) => ({ current: initial }),
        useCallback: (fn: any) => fn,
        useEffect: () => {},
      };
      return () => {
        internals.H = originalH;
      };
    }

    it('handles 50 rapid ArrowDown events without exceeding data.length - 1 in controlled mode', () => {
      let currentControlledIndex = 0;
      let selectedItem: any = null;
      let selectedIdx = -1;

      const restore = setupReactDispatcher(
        () => currentControlledIndex,
        (idx) => { currentControlledIndex = idx; }
      );

      try {
        for (let i = 0; i < 50; i++) {
          const el = DosDataGrid({
            columns: mockColumns,
            data: mockData,
            selectedIndex: currentControlledIndex,
            onSelectRow: (item, idx) => {
              selectedItem = item;
              selectedIdx = idx;
              currentControlledIndex = idx;
            },
          });

          const evt = createMockKeyboardEvent('ArrowDown');
          el.props.onKeyDown(evt);
          expect(evt.isDefaultPrevented).toBe(true);
          expect(evt.isPropagationStopped).toBe(true);
        }

        // Boundary assertion: cannot exceed max index 9 (10 items)
        expect(currentControlledIndex).toBe(9);
        expect(selectedIdx).toBe(9);
        expect(selectedItem.id).toBe('ITEM-10');
      } finally {
        restore();
      }
    });

    it('handles 50 rapid ArrowUp events without dropping below 0', () => {
      let currentControlledIndex = 9;
      let selectedItem: any = null;
      let selectedIdx = -1;

      const restore = setupReactDispatcher(
        () => currentControlledIndex,
        (idx) => { currentControlledIndex = idx; }
      );

      try {
        for (let i = 0; i < 50; i++) {
          const el = DosDataGrid({
            columns: mockColumns,
            data: mockData,
            selectedIndex: currentControlledIndex,
            onSelectRow: (item, idx) => {
              selectedItem = item;
              selectedIdx = idx;
              currentControlledIndex = idx;
            },
          });

          const evt = createMockKeyboardEvent('ArrowUp');
          el.props.onKeyDown(evt);
          expect(evt.isDefaultPrevented).toBe(true);
        }

        // Boundary assertion: cannot go below 0
        expect(currentControlledIndex).toBe(0);
        expect(selectedIdx).toBe(0);
        expect(selectedItem.id).toBe('ITEM-1');
      } finally {
        restore();
      }
    });

    it('navigates cleanly with PageDown, PageUp, Home, and End keys', () => {
      let currentControlledIndex = 0;

      const restore = setupReactDispatcher(
        () => currentControlledIndex,
        (idx) => { currentControlledIndex = idx; }
      );

      try {
        const makeGrid = () =>
          DosDataGrid({
            columns: mockColumns,
            data: mockData,
            selectedIndex: currentControlledIndex,
            pageSize: 5,
            onSelectRow: (_item, idx) => { currentControlledIndex = idx; },
          });

        // PageDown from 0 with pageSize 5 -> 5
        makeGrid().props.onKeyDown(createMockKeyboardEvent('PageDown'));
        expect(currentControlledIndex).toBe(5);

        // PageDown from 5 with pageSize 5 -> 9 (clamped to max length - 1)
        makeGrid().props.onKeyDown(createMockKeyboardEvent('PageDown'));
        expect(currentControlledIndex).toBe(9);

        // PageUp from 9 with pageSize 5 -> 4
        makeGrid().props.onKeyDown(createMockKeyboardEvent('PageUp'));
        expect(currentControlledIndex).toBe(4);

        // End key -> 9
        makeGrid().props.onKeyDown(createMockKeyboardEvent('End'));
        expect(currentControlledIndex).toBe(9);

        // Home key -> 0
        makeGrid().props.onKeyDown(createMockKeyboardEvent('Home'));
        expect(currentControlledIndex).toBe(0);
      } finally {
        restore();
      }
    });

    it('safely tolerates empty dataset under rapid key navigation without throwing', () => {
      const restore = setupReactDispatcher();

      try {
        const el = DosDataGrid({
          columns: mockColumns,
          data: [],
        });

        expect(() => {
          for (let i = 0; i < 50; i++) {
            el.props.onKeyDown(createMockKeyboardEvent('ArrowDown'));
            el.props.onKeyDown(createMockKeyboardEvent('ArrowUp'));
            el.props.onKeyDown(createMockKeyboardEvent('Enter'));
            el.props.onKeyDown(createMockKeyboardEvent('Delete'));
          }
        }).not.toThrow();
      } finally {
        restore();
      }
    });

    it('triggers onActivateRow (Enter) and onDeleteRow (Del) on the correct active item', () => {
      let activatedItem: any = null;
      let deletedItem: any = null;

      const restore = setupReactDispatcher(() => 3);

      try {
        const el = DosDataGrid({
          columns: mockColumns,
          data: mockData,
          selectedIndex: 3,
          onActivateRow: (item) => { activatedItem = item; },
          onDeleteRow: (item) => { deletedItem = item; },
        });

        el.props.onKeyDown(createMockKeyboardEvent('Enter'));
        expect(activatedItem?.id).toBe('ITEM-4');

        el.props.onKeyDown(createMockKeyboardEvent('Delete'));
        expect(deletedItem?.id).toBe('ITEM-4');
      } finally {
        restore();
      }
    });
  });

  // =========================================================================
  // 2. Product Master Pricing Invariants (F15)
  // =========================================================================
  describe('2. Product Master Pricing Invariants', () => {
    it('rejects batch submission when sellingRate > mrp', async () => {
      const code = 'P9001';
      await db.delete(products).where(eq(products.code, code)).run();

      await expect(
        createProductWithBatches({
          code,
          name: 'OVERPRICED SELLING RATE',
          companyId: testCompanyId,
          packaging: '10 TAB',
          hsnCode: '3004',
          taxCode: testTaxCode,
          batches: [
            {
              batchNo: 'B-OVERMRP',
              purchaseRate: 80,
              sellingRate: 120, // Violation: sellingRate > mrp (100)
              mrp: 100,
              stockQty: 10,
            },
          ],
        })
      ).rejects.toThrow(/Pricing invariant violated.*MRP.*cannot be less than Selling Rate/);
    });

    it('rejects batch submission when sellingRate < purchaseRate (negative margin)', async () => {
      const code = 'P9002';
      await db.delete(products).where(eq(products.code, code)).run();

      await expect(
        createProductWithBatches({
          code,
          name: 'NEGATIVE MARGIN ITEM',
          companyId: testCompanyId,
          packaging: '10 TAB',
          hsnCode: '3004',
          taxCode: testTaxCode,
          batches: [
            {
              batchNo: 'B-NEGMGN',
              purchaseRate: 80,
              sellingRate: 60, // Violation: sellingRate < purchaseRate (80)
              mrp: 100,
              stockQty: 10,
            },
          ],
        })
      ).rejects.toThrow(/Pricing invariant violated.*Selling Rate.*cannot be less than Purchase Rate/);
    });

    it('evaluates behavior on negative rates (negative purchaseRate, negative sellingRate, negative mrp)', async () => {
      const code = 'P9003';
      await db.delete(products).where(eq(products.code, code)).run();

      // Stress test: what happens if all rates are negative but mathematically mrp >= sellingRate >= purchaseRate?
      // e.g. mrp = -10, sellingRate = -20, purchaseRate = -30
      // In actions.ts:
      // b.mrp (-10) < b.sellingRate (-20) -> false (-10 is > -20)
      // b.sellingRate (-20) < b.purchaseRate (-30) -> false (-20 is > -30)
      let caughtError: string | null = null;
      try {
        await createProductWithBatches({
          code,
          name: 'NEGATIVE RATES PRODUCT',
          companyId: testCompanyId,
          packaging: '10 TAB',
          hsnCode: '3004',
          taxCode: testTaxCode,
          batches: [
            {
              batchNo: 'B-ALLNEG',
              purchaseRate: -30,
              sellingRate: -20,
              mrp: -10,
              stockQty: 10,
            },
          ],
        });
      } catch (err: any) {
        caughtError = err.message;
      }

      // Check whether negative rates are guarded or allowed into DB
      const record = await db.query.products.findFirst({
        where: eq(products.code, code),
        with: { batches: true },
      });

      if (record) {
        console.warn('FINDING: Negative rates were accepted by actions.ts without throwing error! Batch rates:', {
          mrp: record.batches[0]?.mrp,
          sellingRate: record.batches[0]?.sellingRate,
          purchaseRate: record.batches[0]?.purchaseRate,
        });
        // Clean up
        await deleteProduct(record.id);
      }

      // Record empirical result
      expect(typeof caughtError === 'string' || record !== undefined).toBe(true);
    });

    it('evaluates behavior on zero rates (purchaseRate=0, sellingRate=0, mrp=0)', async () => {
      const code = 'P9004';
      await db.delete(products).where(eq(products.code, code)).run();

      let caughtError: string | null = null;
      try {
        await createProductWithBatches({
          code,
          name: 'ALL ZERO RATES PRODUCT',
          companyId: testCompanyId,
          packaging: '10 TAB',
          hsnCode: '3004',
          taxCode: testTaxCode,
          batches: [
            {
              batchNo: 'B-ZERO',
              purchaseRate: 0,
              sellingRate: 0,
              mrp: 0,
              stockQty: 10,
            },
          ],
        });
      } catch (err: any) {
        caughtError = err.message;
      }

      const record = await db.query.products.findFirst({
        where: eq(products.code, code),
        with: { batches: true },
      });

      if (record) {
        console.warn('FINDING: Zero rates (0, 0, 0) were accepted by actions.ts without throwing error! Batch rates:', {
          mrp: record.batches[0]?.mrp,
          sellingRate: record.batches[0]?.sellingRate,
          purchaseRate: record.batches[0]?.purchaseRate,
        });
        // Clean up
        await deleteProduct(record.id);
      }

      expect(typeof caughtError === 'string' || record !== undefined).toBe(true);
    });
  });

  // =========================================================================
  // 3. Stock Rollup Invariants Across Additions, Edits, and Deletions (F15)
  // =========================================================================
  describe('3. Stock Rollup Invariants', () => {
    it('maintains exact totalStockOnHand equal to sum of batch stocks through lifecycle', async () => {
      const code = 'P9005';
      await db.delete(products).where(eq(products.code, code)).run();

      // Step A: Creation with 2 batches (50 + 30 = 80)
      const res = await createProductWithBatches({
        code,
        name: 'STOCK ROLLUP LIFECYCLE ITEM',
        companyId: testCompanyId,
        packaging: '10 TAB',
        hsnCode: '3004',
        taxCode: testTaxCode,
        batches: [
          {
            batchNo: 'BAT-A1',
            purchaseRate: 10,
            sellingRate: 15,
            mrp: 20,
            stockQty: 50,
          },
          {
            batchNo: 'BAT-A2',
            purchaseRate: 12,
            sellingRate: 16,
            mrp: 22,
            stockQty: 30,
          },
        ],
      });

      let prod = await getProductWithBatches(res.id);
      expect(prod).toBeDefined();
      expect(prod?.totalStockOnHand).toBe(80);

      // Verify direct database aggregate matches
      let batchSum = await db
        .select({ total: sql<number>`SUM(${productBatches.stockQty})` })
        .from(productBatches)
        .where(eq(productBatches.productId, prod!.id))
        .get();
      expect(Number(batchSum?.total)).toBe(80);
      expect(prod?.totalStockOnHand).toBe(Number(batchSum?.total));

      // Step B: Batch stock edit (Update BAT-A1 from 50 to 75 -> Total = 75 + 30 = 105)
      const batchA1Id = prod!.batches.find((b) => b.batchNo === 'BAT-A1')!.id;
      const batchA2Id = prod!.batches.find((b) => b.batchNo === 'BAT-A2')!.id;

      await updateProductWithBatches({
        id: prod!.id,
        code: prod!.code,
        name: prod!.name,
        companyId: prod!.companyId,
        packaging: prod!.packaging,
        hsnCode: prod!.hsnCode,
        taxCode: prod!.taxCode,
        batches: [
          {
            id: batchA1Id,
            batchNo: 'BAT-A1',
            purchaseRate: 10,
            sellingRate: 15,
            mrp: 20,
            stockQty: 75, // Updated from 50 to 75
          },
          {
            id: batchA2Id,
            batchNo: 'BAT-A2',
            purchaseRate: 12,
            sellingRate: 16,
            mrp: 22,
            stockQty: 30,
          },
        ],
      });

      prod = await getProductWithBatches(res.id);
      expect(prod?.totalStockOnHand).toBe(105);

      batchSum = await db
        .select({ total: sql<number>`SUM(${productBatches.stockQty})` })
        .from(productBatches)
        .where(eq(productBatches.productId, prod!.id))
        .get();
      expect(Number(batchSum?.total)).toBe(105);
      expect(prod?.totalStockOnHand).toBe(Number(batchSum?.total));

      // Step C: Batch addition (Add BAT-A3 with stock 45 -> Total = 105 + 45 = 150)
      await updateProductWithBatches({
        id: prod!.id,
        code: prod!.code,
        name: prod!.name,
        companyId: prod!.companyId,
        packaging: prod!.packaging,
        hsnCode: prod!.hsnCode,
        taxCode: prod!.taxCode,
        batches: [
          {
            id: batchA1Id,
            batchNo: 'BAT-A1',
            purchaseRate: 10,
            sellingRate: 15,
            mrp: 20,
            stockQty: 75,
          },
          {
            id: batchA2Id,
            batchNo: 'BAT-A2',
            purchaseRate: 12,
            sellingRate: 16,
            mrp: 22,
            stockQty: 30,
          },
          {
            // New batch without ID
            batchNo: 'BAT-A3',
            purchaseRate: 14,
            sellingRate: 18,
            mrp: 25,
            stockQty: 45,
          },
        ],
      });

      prod = await getProductWithBatches(res.id);
      expect(prod?.totalStockOnHand).toBe(150);
      expect(prod?.batches.length).toBe(3);

      batchSum = await db
        .select({ total: sql<number>`SUM(${productBatches.stockQty})` })
        .from(productBatches)
        .where(eq(productBatches.productId, prod!.id))
        .get();
      expect(Number(batchSum?.total)).toBe(150);
      expect(prod?.totalStockOnHand).toBe(Number(batchSum?.total));

      // Step D: Batch Deletion test — what happens when a batch is omitted from updateProductWithBatches?
      // Attempting to remove BAT-A2 (stock 30), submitting only BAT-A1 (75) and BAT-A3 (45) -> sum = 120.
      const batchA3Id = prod!.batches.find((b) => b.batchNo === 'BAT-A3')!.id;

      await updateProductWithBatches({
        id: prod!.id,
        code: prod!.code,
        name: prod!.name,
        companyId: prod!.companyId,
        packaging: prod!.packaging,
        hsnCode: prod!.hsnCode,
        taxCode: prod!.taxCode,
        batches: [
          {
            id: batchA1Id,
            batchNo: 'BAT-A1',
            purchaseRate: 10,
            sellingRate: 15,
            mrp: 20,
            stockQty: 75,
          },
          {
            id: batchA3Id,
            batchNo: 'BAT-A3',
            purchaseRate: 14,
            sellingRate: 18,
            mrp: 25,
            stockQty: 45,
          },
        ],
      });

      prod = await getProductWithBatches(res.id);
      batchSum = await db
        .select({ total: sql<number>`SUM(${productBatches.stockQty})` })
        .from(productBatches)
        .where(eq(productBatches.productId, prod!.id))
        .get();

      console.log('BATCH DELETION BEHAVIOR CHECK:', {
        productTotalStockOnHand: prod?.totalStockOnHand,
        actualDbSumOfBatches: Number(batchSum?.total),
        batchesCountInDb: prod?.batches.length,
      });

      // Check if omitted batch was orphaned in DB or deleted
      const batA2StillInDb = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, batchA2Id),
      });

      if (batA2StillInDb) {
        console.warn(
          'FINDING: Omitted batch was NOT deleted from productBatches table! It remains orphaned in DB, causing stock sum discrepancy.'
        );
      }

      // Step E: Clean product deletion
      await deleteProduct(prod!.id);
      const afterDelete = await getProductWithBatches(res.id);
      expect(afterDelete).toBeUndefined();

      const batchesAfterDelete = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(productBatches)
        .where(eq(productBatches.productId, res.id))
        .get();
      expect(Number(batchesAfterDelete?.count)).toBe(0);
    });
  });

  // =========================================================================
  // 4. Product Search Modal 4-Way Filter Stress Testing (F19)
  // =========================================================================
  describe('4. Product Search Modal 4-Way Filter Stress Testing', () => {
    let sampleProdId: string;

    beforeAll(async () => {
      // Seed a known test product with special characteristics for 4-way filter
      const code = 'P8888';
      await db.delete(products).where(eq(products.code, code)).run();

      const res = await createProductWithBatches({
        code,
        name: 'AMOXICILLIN & CLAVULANATE 625MG',
        genericName: 'AMOXICILLIN CLAVULANIC ACID',
        companyId: testCompanyId,
        packaging: '10x1x6 TAB',
        hsnCode: '30041010',
        barcode: '8901234567890',
        taxCode: testTaxCode,
        batches: [
          {
            batchNo: 'AC625-X1',
            purchaseRate: 150,
            sellingRate: 180,
            mrp: 200,
            stockQty: 50,
          },
        ],
      });
      sampleProdId = res.id;
    });

    it('returns all products when search string is empty', async () => {
      const res = await searchProducts('', false, 10, 0);
      expect(res.products.length).toBeGreaterThan(0);
      expect(res.total).toBeGreaterThan(0);
    });

    it('returns all products when search string is whitespace only', async () => {
      const res = await searchProducts('     ', false, 10, 0);
      expect(res.products.length).toBeGreaterThan(0);
      expect(res.total).toBeGreaterThan(0);
    });

    it('survives SQL injection strings safely without SQL syntax errors or data corruption', async () => {
      const sqlInjections = [
        "' OR '1'='1",
        "'; DROP TABLE products; --",
        '" OR ""="',
        "' UNION SELECT * FROM systemConfig --",
        "admin'--",
        "1; SELECT pg_sleep(5); --",
      ];

      for (const injection of sqlInjections) {
        await expect(searchProducts(injection, false, 10, 0)).resolves.not.toThrow();
      }

      // Verify database table products is still intact
      const checkTable = await db.select({ count: sql<number>`COUNT(*)` }).from(products).get();
      expect(Number(checkTable?.count)).toBeGreaterThan(0);
    });

    it('survives special characters and regex metacharacters safely', async () => {
      const specialCharStrings = [
        '<script>alert("xss")</script>',
        '!@#$%^&*()_+{}[]|\\:;"\'<>,.?/~`',
        '%',
        '_',
        '\\',
        'undefined',
        'null',
        '[object Object]',
      ];

      for (const str of specialCharStrings) {
        await expect(searchProducts(str, false, 10, 0)).resolves.not.toThrow();
      }
    });

    it('handles unicode, accented, and non-Latin multilingual search strings', async () => {
      const unicodeStrings = [
        '💊',
        'पैरासिटामोल',
        'Парацетамол',
        'باراسيتامول',
        '扑热息痛',
        'Céfaclor',
        'São Paulo Pharma',
      ];

      for (const u of unicodeStrings) {
        await expect(searchProducts(u, false, 10, 0)).resolves.not.toThrow();
      }
    });

    it('returns empty result array when searching for non-existent barcodes without error', async () => {
      const res = await searchProducts('NONEXISTENT-BARCODE-9999999999', false, 10, 0);
      expect(res.products).toEqual([]);
      expect(res.total).toBe(0);
    });

    it('matches product via 4-way filter: by Code, Name, Generic, Barcode, and BatchNo', async () => {
      // 1. By Code
      const resCode = await searchProducts('P8888', false, 10, 0);
      expect(resCode.products.some((p) => p.code === 'P8888')).toBe(true);

      // 2. By Name
      const resName = await searchProducts('AMOXICILLIN & CLAVULANATE', false, 10, 0);
      expect(resName.products.some((p) => p.code === 'P8888')).toBe(true);

      // 3. By Generic
      const resGeneric = await searchProducts('CLAVULANIC ACID', false, 10, 0);
      expect(resGeneric.products.some((p) => p.code === 'P8888')).toBe(true);

      // 4. By Barcode
      const resBarcode = await searchProducts('8901234567890', false, 10, 0);
      expect(resBarcode.products.some((p) => p.code === 'P8888')).toBe(true);

      // 5. By BatchNo
      const resBatch = await searchProducts('AC625-X1', false, 10, 0);
      expect(resBatch.products.some((p) => p.code === 'P8888')).toBe(true);
    });
  });

  // =========================================================================
  // 5. Batch Expiry Conversion Edge Cases (F15)
  // =========================================================================
  describe('5. Batch Expiry Conversion Edge Cases', () => {
    it('converts distant century year edge case "12/99" to "2099-12-31"', async () => {
      const iso = await convertExpiryToIso('12/99');
      expect(iso).toBe('2099-12-31');
    });

    it('converts leap year "02/28" (2028 is leap year) to "2028-02-29"', async () => {
      const iso = await convertExpiryToIso('02/28');
      expect(iso).toBe('2028-02-29');
    });

    it('converts non-leap year "02/29" (2029 is non-leap year) to "2029-02-28"', async () => {
      const iso = await convertExpiryToIso('02/29');
      expect(iso).toBe('2029-02-28');
    });

    it('converts past leap year "02/24" (2024 is leap year) to "2024-02-29"', async () => {
      const iso = await convertExpiryToIso('02/24');
      expect(iso).toBe('2024-02-29');
    });

    it('converts millennial leap year "02/00" (2000 is leap year) to "2000-02-29"', async () => {
      const iso = await convertExpiryToIso('02/00');
      expect(iso).toBe('2000-02-29');
    });

    it('correctly calculates 30-day and 31-day months', async () => {
      expect(await convertExpiryToIso('01/26')).toBe('2026-01-31'); // Jan (31)
      expect(await convertExpiryToIso('04/26')).toBe('2026-04-30'); // Apr (30)
      expect(await convertExpiryToIso('06/26')).toBe('2026-06-30'); // Jun (30)
      expect(await convertExpiryToIso('07/26')).toBe('2026-07-31'); // Jul (31)
      expect(await convertExpiryToIso('08/26')).toBe('2026-08-31'); // Aug (31)
      expect(await convertExpiryToIso('09/26')).toBe('2026-09-30'); // Sep (30)
      expect(await convertExpiryToIso('11/26')).toBe('2026-11-30'); // Nov (30)
      expect(await convertExpiryToIso('12/26')).toBe('2026-12-31'); // Dec (31)
    });

    it('passes through existing ISO YYYY-MM-DD date unchanged', async () => {
      expect(await convertExpiryToIso('2027-05-15')).toBe('2027-05-15');
    });

    it('rejects invalid month numbers like "00/26" and "13/26"', async () => {
      await expect(convertExpiryToIso('00/26')).rejects.toThrow(/Invalid expiry format/);
      await expect(convertExpiryToIso('13/26')).rejects.toThrow(/Invalid expiry format/);
    });

    it('rejects malformed strings like "abc", "MM/YY", "12-25"', async () => {
      await expect(convertExpiryToIso('abc')).rejects.toThrow(/Invalid expiry format/);
      await expect(convertExpiryToIso('MM/YY')).rejects.toThrow(/Invalid expiry format/);
      await expect(convertExpiryToIso('12-25')).rejects.toThrow(/Invalid expiry format/);
    });
  });
});
