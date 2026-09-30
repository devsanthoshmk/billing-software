import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';
import { getStockTransferInitialData, recordStockTransfer } from '@/app/stock/transfers/actions';
import { searchBatchesForRackManagement, updateBatchRackAndRates } from '@/app/stock/rack-management/actions';
import { getMultiMrpProducts } from '@/app/stock/multi-mrp/actions';
import { getClaimsInitialData, submitBreakageExpiryClaim } from '@/app/stock/claims/actions';
import { getProductsForHsnMapping, updateProductHsnAndTax } from '@/app/stock/hsn-mapping/actions';
import { products, productBatches } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

describe('Stock Hub Extensions (3.3, 3.4, 3.7, 3.8, 3.9 Parity)', () => {
  it('1. performs inter-depot stock transfer safely', async () => {
    const initData = await getStockTransferInitialData();
    expect(initData.success).toBe(true);

    const prodWithStock = initData.products.find((p) => p.batches?.some((b: any) => b.stockQty >= 5));
    if (prodWithStock) {
      const batch = prodWithStock.batches.find((b: any) => b.stockQty >= 5)!;
      const res = await recordStockTransfer({
        transferDate: '2026-09-28',
        sourceDepot: 'MAIN_DEPOT',
        destinationDepot: 'RETAIL_COUNTER',
        operator: 'ADMIN',
        transfers: [
          {
            productId: prodWithStock.id,
            batchId: batch.id,
            batchNo: batch.batchNo,
            quantity: 2,
            destinationRack: 'FRONT-01',
          },
        ],
      });
      expect(res.success).toBe(true);
      expect(res.transferRef).toBeDefined();
    }
  });

  it('2. updates batch rack locations and wholesale rates', async () => {
    const searchRes = await searchBatchesForRackManagement();
    expect(searchRes.success).toBe(true);

    if (searchRes.batches.length > 0) {
      const target = searchRes.batches[0];
      const updateRes = await updateBatchRackAndRates({
        batchId: target.batchId,
        productId: target.productId,
        rackLocation: 'RACK-B9',
        sellingRate: target.sellingRate,
        secondaryRate: target.secondaryRate,
        mrp: target.mrp,
        operator: 'ADMIN',
      });
      expect(updateRes.success).toBe(true);
    }
  });

  it('3. scans multi-MRP product conflicts', async () => {
    const multiMrp = await getMultiMrpProducts();
    expect(multiMrp.success).toBe(true);
    expect(Array.isArray(multiMrp.multiMrpProducts)).toBe(true);
  });

  it('4. settles customer breakage & expiry returns via credit note', async () => {
    const claimsInit = await getClaimsInitialData();
    expect(claimsInit.success).toBe(true);

    if (claimsInit.customers.length > 0 && claimsInit.products.length > 0) {
      const cust = claimsInit.customers[0];
      const prod = claimsInit.products[0];
      const batch = prod.batches?.[0];

      if (batch) {
        const claimRes = await submitBreakageExpiryClaim({
          claimType: 'CUSTOMER_CLAIM',
          partyId: cust.id,
          claimDate: '2026-09-28',
          claimReason: 'EXPIRY',
          operator: 'ADMIN',
          items: [
            {
              productId: prod.id,
              batchId: batch.id,
              batchNo: batch.batchNo,
              expiryDate: batch.expiryDate,
              quantity: 1,
              rate: batch.sellingRate,
            },
          ],
        });
        expect(claimRes.success).toBe(true);
        expect(claimRes.claimNo).toMatch(/^CLM-/);
      }
    }
  });

  it('5. maps HSN code and GST tax slabs', async () => {
    const hsnInit = await getProductsForHsnMapping();
    expect(hsnInit.success).toBe(true);

    if (hsnInit.products.length > 0) {
      const targetProd = hsnInit.products[0];
      const updateRes = await updateProductHsnAndTax({
        productId: targetProd.id,
        hsnCode: '30049099',
        taxCode: '03',
        operator: 'ADMIN',
      });
      expect(updateRes.success).toBe(true);
    }
  });
});
