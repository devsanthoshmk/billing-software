import { describe, it, expect } from 'vitest';
import {
  allocateStockFIFO,
  analyzeBatchMrps,
  BatchStock,
} from '../../src/lib/business-engine';

describe('FIFO / FEFO Multi-Batch Inventory Allocation Engine (Feature F12)', () => {
  const sampleBatches: BatchStock[] = [
    {
      id: 'bat-03',
      batchNo: 'B3',
      expiryDate: '2027-06-30',
      stockQty: 50,
      mrp: 60.00,
      sellingRate: 50.00,
      purchaseRate: 40.00,
    },
    {
      id: 'bat-01',
      batchNo: 'B1',
      expiryDate: '2026-10-31', // Earliest active
      stockQty: 30,
      mrp: 50.00,
      sellingRate: 40.00,
      purchaseRate: 32.00,
    },
    {
      id: 'bat-02',
      batchNo: 'B2',
      expiryDate: '2026-12-31', // Second earliest
      stockQty: 40,
      mrp: 50.00,
      sellingRate: 40.00,
      purchaseRate: 32.00,
    },
  ];

  it('handles 0 requested and free quantity gracefully', () => {
    const result = allocateStockFIFO(sampleBatches, 0, 0);
    expect(result.success).toBe(true);
    expect(result.totalAllocatedQty).toBe(0);
    expect(result.allocations).toEqual([]);
  });

  it('rejects negative quantity inputs', () => {
    expect(() => allocateStockFIFO(sampleBatches, -5, 0)).toThrow('must be non-negative');
    expect(() => allocateStockFIFO(sampleBatches, 10, -2)).toThrow('must be non-negative');
  });

  it('allocates strictly in FEFO order (earliest expiry first)', () => {
    const result = allocateStockFIFO(sampleBatches, 20, 0, {
      systemDate: '2026-09-28',
    });
    expect(result.success).toBe(true);
    expect(result.allocations.length).toBe(1);
    expect(result.allocations[0].batchNo).toBe('B1'); // Earliest expiry
    expect(result.allocations[0].allocatedBilledQty).toBe(20);
    expect(result.allocations[0].remainingBatchStock).toBe(10);
    expect(result.allocations[0].grossAmount).toBe(800.00); // 20 * 40.00
  });

  it('cascades across multiple batches when first batch stock is insufficient', () => {
    // Request: 50 billed + 5 free = 55 total
    // B1 has 30, B2 has 40
    // Allocation: B1 takes 30 (30 billed, 0 free); B2 takes 25 (20 billed, 5 free)
    const result = allocateStockFIFO(sampleBatches, 50, 5, {
      systemDate: '2026-09-28',
    });
    expect(result.success).toBe(true);
    expect(result.totalAllocatedBilledQty).toBe(50);
    expect(result.totalAllocatedFreeQty).toBe(5);
    expect(result.totalAllocatedQty).toBe(55);
    expect(result.unallocatedQty).toBe(0);

    expect(result.allocations.length).toBe(2);
    expect(result.allocations[0]).toMatchObject({
      batchNo: 'B1',
      allocatedBilledQty: 30,
      allocatedFreeQty: 0,
      totalAllocatedQty: 30,
      remainingBatchStock: 0,
    });
    expect(result.allocations[1]).toMatchObject({
      batchNo: 'B2',
      allocatedBilledQty: 20,
      allocatedFreeQty: 5,
      totalAllocatedQty: 25,
      remainingBatchStock: 15,
    });
  });

  it('excludes expired batches by default based on systemDate', () => {
    const batchesWithExpired: BatchStock[] = [
      {
        id: 'bat-exp',
        batchNo: 'B-EXP',
        expiryDate: '2026-08-31', // Expired relative to 2026-09-28
        stockQty: 100,
        mrp: 50.00,
        sellingRate: 40.00,
        purchaseRate: 30.00,
      },
      {
        id: 'bat-act',
        batchNo: 'B-ACT',
        expiryDate: '2026-12-31',
        stockQty: 50,
        mrp: 50.00,
        sellingRate: 40.00,
        purchaseRate: 30.00,
      },
    ];

    const result = allocateStockFIFO(batchesWithExpired, 20, 0, {
      systemDate: '2026-09-28',
    });
    expect(result.success).toBe(true);
    expect(result.allocations.length).toBe(1);
    expect(result.allocations[0].batchNo).toBe('B-ACT');
  });

  it('excludes blocked batches', () => {
    const batchesWithBlocked: BatchStock[] = [
      {
        id: 'bat-blk',
        batchNo: 'B-BLK',
        expiryDate: '2026-10-31',
        stockQty: 100,
        mrp: 50.00,
        sellingRate: 40.00,
        purchaseRate: 30.00,
        isBlocked: true,
      },
      {
        id: 'bat-ok',
        batchNo: 'B-OK',
        expiryDate: '2026-11-30',
        stockQty: 50,
        mrp: 50.00,
        sellingRate: 40.00,
        purchaseRate: 30.00,
      },
    ];

    const result = allocateStockFIFO(batchesWithBlocked, 10, 0, {
      systemDate: '2026-09-28',
    });
    expect(result.allocations[0].batchNo).toBe('B-OK');
  });

  it('tags near-expiry batches with warning flag', () => {
    const batches: BatchStock[] = [
      {
        id: 'bat-near',
        batchNo: 'B-NEAR',
        expiryDate: '2026-10-20', // ~22 days away
        stockQty: 50,
        mrp: 50,
        sellingRate: 40,
        purchaseRate: 30,
      },
    ];

    const result = allocateStockFIFO(batches, 10, 0, {
      systemDate: '2026-09-28',
      warnNearExpiryDays: 90,
    });
    expect(result.allocations[0].isNearExpiry).toBe(true);
  });

  it('handles partial allocation when stock is insufficient and partial is allowed', () => {
    const smallStockBatches: BatchStock[] = [
      {
        id: 'b1',
        batchNo: 'B1',
        expiryDate: '2026-12-31',
        stockQty: 15,
        mrp: 50,
        sellingRate: 40,
        purchaseRate: 30,
      },
    ];

    const result = allocateStockFIFO(smallStockBatches, 20, 5, {
      systemDate: '2026-09-28',
      allowPartialAllocation: true,
    });
    expect(result.success).toBe(false);
    expect(result.isPartiallyAllocated).toBe(true);
    expect(result.totalAllocatedQty).toBe(15);
    expect(result.totalAllocatedBilledQty).toBe(15);
    expect(result.totalAllocatedFreeQty).toBe(0);
    expect(result.unallocatedQty).toBe(10);
    expect(result.unallocatedBilledQty).toBe(5);
    expect(result.unallocatedFreeQty).toBe(5);
  });

  it('rejects allocation when stock is insufficient and partial is disabled', () => {
    const smallStockBatches: BatchStock[] = [
      {
        id: 'b1',
        batchNo: 'B1',
        expiryDate: '2026-12-31',
        stockQty: 15,
        mrp: 50,
        sellingRate: 40,
        purchaseRate: 30,
      },
    ];

    const result = allocateStockFIFO(smallStockBatches, 20, 5, {
      systemDate: '2026-09-28',
      allowPartialAllocation: false,
    });
    expect(result.success).toBe(false);
    expect(result.isUnallocated).toBe(true);
    expect(result.allocations).toEqual([]);
    expect(result.error).toContain('Insufficient stock');
  });

  it('detects multi-MRP and supports target MRP filtering and single MRP enforcement', () => {
    const multiMrpBatches: BatchStock[] = [
      {
        id: 'b-50',
        batchNo: 'B-MRP50',
        expiryDate: '2026-10-31',
        stockQty: 20,
        mrp: 50.00,
        sellingRate: 40.00,
        purchaseRate: 30.00,
      },
      {
        id: 'b-60',
        batchNo: 'B-MRP60',
        expiryDate: '2026-11-30',
        stockQty: 30,
        mrp: 60.00,
        sellingRate: 48.00,
        purchaseRate: 38.00,
      },
    ];

    // 1. Analyze MRPs
    const analysis = analyzeBatchMrps(multiMrpBatches);
    expect(analysis.hasMultiMrp).toBe(true);
    expect(analysis.distinctMrps).toEqual([50.00, 60.00]);
    expect(analysis.mrpStockMap[50.00]).toBe(20);
    expect(analysis.mrpStockMap[60.00]).toBe(30);

    // 2. Target MRP filtering
    const targetResult = allocateStockFIFO(multiMrpBatches, 25, 0, {
      systemDate: '2026-09-28',
      targetMrp: 60.00,
    });
    expect(targetResult.success).toBe(true);
    expect(targetResult.allocations.length).toBe(1);
    expect(targetResult.allocations[0].batchNo).toBe('B-MRP60');
    expect(targetResult.hasMultiMrp).toBe(false);

    // 3. Single MRP enforcement (picks earliest batch MRP 50.00 and ignores 60.00)
    const singleResult = allocateStockFIFO(multiMrpBatches, 30, 0, {
      systemDate: '2026-09-28',
      enforceSingleMrp: true,
      allowPartialAllocation: true,
    });
    expect(singleResult.isPartiallyAllocated).toBe(true);
    expect(singleResult.totalAllocatedQty).toBe(20); // Only 20 available under MRP 50.00
    expect(singleResult.allocations.every((a) => a.mrp === 50.00)).toBe(true);
  });
});
