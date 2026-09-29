/**
 * Pure TypeScript FIFO Multi-Batch Inventory Deduction & Multi-MRP Engine (Feature F12)
 * Parity: INVPRE.PRG:1225-1226, INVPRE.PRG:575, 589-606, DIFMRP.PRG:82-84
 */

import {
  BatchStock,
  BatchAllocation,
  FIFOAllocationOptions,
  FIFOAllocationResult,
} from './types';
import { calculateDateDiffInDays } from './invariants';

/**
 * Pure function to inspect batches and detect if multiple MRPs or selling rates exist.
 */
export function analyzeBatchMrps(batches: BatchStock[]): {
  distinctMrps: number[];
  hasMultiMrp: boolean;
  mrpStockMap: Record<number, number>;
} {
  const mrpStockMap: Record<number, number> = {};
  for (const b of batches) {
    if (b.stockQty > 0) {
      const mrp = Number(b.mrp.toFixed(2));
      mrpStockMap[mrp] = (mrpStockMap[mrp] || 0) + b.stockQty;
    }
  }

  const distinctMrps = Object.keys(mrpStockMap).map(Number).sort((a, b) => a - b);
  return {
    distinctMrps,
    hasMultiMrp: distinctMrps.length > 1,
    mrpStockMap,
  };
}

/**
 * Allocates requested inventory and scheme bonus free goods using strict FIFO / FEFO (Earliest Expiry First).
 * 
 * Algorithm:
 * 1. Filters eligible batches (stock > 0, not blocked, not expired relative to systemDate).
 * 2. If targetMrp or enforceSingleMrp is specified, filters by target MRP.
 * 3. Sorts batches by expiryDate ASC (earliest expiration date first). Secondary sort by batch ID for determinism.
 * 4. Deducts total units needed (requestedQty + freeQty).
 * 5. In each batch slice:
 *    - Fulfills billed requested quantity first, then free scheme quantity.
 *    - Generates a BatchAllocation record with remaining stock and gross amount.
 * 6. Detects whether the resulting allocation spans across differing MRPs.
 * 7. Returns complete FIFOAllocationResult with full diagnostic metadata.
 */
export function allocateStockFIFO(
  batches: BatchStock[],
  requestedQty: number,
  freeQty: number = 0,
  options: FIFOAllocationOptions = {}
): FIFOAllocationResult {
  // Input Validation & Normalization
  if (requestedQty < 0 || freeQty < 0) {
    throw new Error(`Requested quantity (${requestedQty}) and free quantity (${freeQty}) must be non-negative.`);
  }

  const systemDate = options.systemDate ?? new Date().toISOString().split('T')[0];
  const excludeExpired = options.excludeExpired ?? true;
  const allowPartial = options.allowPartialAllocation ?? true;
  const warnNearExpiryDays = options.warnNearExpiryDays ?? 90;

  const totalRequiredQty = requestedQty + freeQty;

  // Handle trivial 0-quantity case
  if (totalRequiredQty === 0) {
    return {
      success: true,
      isPartiallyAllocated: false,
      isUnallocated: false,
      requestedQty: 0,
      freeQty: 0,
      totalRequiredQty: 0,
      totalAllocatedBilledQty: 0,
      totalAllocatedFreeQty: 0,
      totalAllocatedQty: 0,
      unallocatedQty: 0,
      unallocatedBilledQty: 0,
      unallocatedFreeQty: 0,
      hasMultiMrp: false,
      distinctMrps: [],
      requiresMrpSelectionPrompt: false,
      availableMrps: [],
      allocations: [],
    };
  }

  // 1. Filter eligible active batches
  let eligibleBatches = batches.filter((batch) => {
    if (batch.stockQty <= 0) return false;
    if (batch.isBlocked) return false;
    if (excludeExpired && batch.expiryDate) {
      const daysToExpiry = calculateDateDiffInDays(batch.expiryDate, systemDate);
      if (daysToExpiry <= 0) return false; // Expired stock cannot be allocated
    }
    return true;
  });

  // Calculate distinct available MRPs among all eligible stock
  const mrpAnalysis = analyzeBatchMrps(eligibleBatches);
  const availableMrps = mrpAnalysis.distinctMrps;
  const requiresMrpSelectionPrompt = mrpAnalysis.hasMultiMrp;

  // 2. Handle Single MRP Enforcement or Target MRP Filter
  if (options.targetMrp !== undefined) {
    eligibleBatches = eligibleBatches.filter((b) => Math.abs(b.mrp - options.targetMrp!) < 0.001);
  } else if (options.enforceSingleMrp && eligibleBatches.length > 0) {
    // Enforce earliest batch MRP across the whole line
    eligibleBatches.sort((a, b) => {
      const cmp = a.expiryDate.localeCompare(b.expiryDate);
      if (cmp !== 0) return cmp;
      const batchCmp = a.batchNo.localeCompare(b.batchNo);
      if (batchCmp !== 0) return batchCmp;
      return a.id.localeCompare(b.id);
    });
    const primaryMrp = eligibleBatches[0].mrp;
    eligibleBatches = eligibleBatches.filter((b) => Math.abs(b.mrp - primaryMrp) < 0.001);
  }

  // 3. Strict FIFO/FEFO Sort: earliest expiryDate ASC; tie-break by batchNo / ID
  const sortedBatches = [...eligibleBatches].sort((a, b) => {
    const cmp = a.expiryDate.localeCompare(b.expiryDate);
    if (cmp !== 0) return cmp;
    const batchCmp = a.batchNo.localeCompare(b.batchNo);
    if (batchCmp !== 0) return batchCmp;
    return a.id.localeCompare(b.id);
  });

  // 4. Multi-Batch Deduction Walk
  const allocations: BatchAllocation[] = [];
  let remainingBilledToAllocate = requestedQty;
  let remainingFreeToAllocate = freeQty;
  let totalAllocated = 0;

  for (const batch of sortedBatches) {
    const totalRemainingToAllocate = remainingBilledToAllocate + remainingFreeToAllocate;
    if (totalRemainingToAllocate <= 0) break;

    const availableInBatch = batch.stockQty;
    if (availableInBatch <= 0) continue;

    // How many units can this batch fulfill in total?
    const unitsToTake = Math.min(availableInBatch, totalRemainingToAllocate);

    // Prioritize fulfilling requested billed quantity first, then free bonus
    const billedToTake = Math.min(unitsToTake, remainingBilledToAllocate);
    const freeToTake = Math.min(unitsToTake - billedToTake, remainingFreeToAllocate);

    const remainingBatchStock = availableInBatch - unitsToTake;
    const daysToExpiry = calculateDateDiffInDays(batch.expiryDate, systemDate);
    const isNearExpiry = daysToExpiry <= warnNearExpiryDays;
    const grossAmount = Number((billedToTake * batch.sellingRate).toFixed(2));

    allocations.push({
      batchId: batch.id,
      batchNo: batch.batchNo,
      expiryDate: batch.expiryDate,
      mrp: batch.mrp,
      sellingRate: batch.sellingRate,
      purchaseRate: batch.purchaseRate,
      allocatedBilledQty: billedToTake,
      allocatedFreeQty: freeToTake,
      totalAllocatedQty: unitsToTake,
      remainingBatchStock,
      grossAmount,
      isNearExpiry,
    });

    remainingBilledToAllocate -= billedToTake;
    remainingFreeToAllocate -= freeToTake;
    totalAllocated += unitsToTake;
  }

  const totalAllocatedBilledQty = requestedQty - remainingBilledToAllocate;
  const totalAllocatedFreeQty = freeQty - remainingFreeToAllocate;
  const unallocatedQty = totalRequiredQty - totalAllocated;
  const isFullySatisfied = unallocatedQty === 0;

  // If partial allocation is prohibited and we could not fulfill 100%, reject
  if (!allowPartial && !isFullySatisfied) {
    return {
      success: false,
      isPartiallyAllocated: false,
      isUnallocated: true,
      requestedQty,
      freeQty,
      totalRequiredQty,
      totalAllocatedBilledQty: 0,
      totalAllocatedFreeQty: 0,
      totalAllocatedQty: 0,
      unallocatedQty: totalRequiredQty,
      unallocatedBilledQty: requestedQty,
      unallocatedFreeQty: freeQty,
      hasMultiMrp: false,
      distinctMrps: [],
      requiresMrpSelectionPrompt,
      availableMrps,
      allocations: [],
      error: `Insufficient stock! Required: ${totalRequiredQty} (${requestedQty} billed + ${freeQty} free), Available: ${totalAllocated}. Partial allocation is disabled.`,
    };
  }

  // Detect distinct MRPs across actual allocated batch slices
  const allocatedMrpSet = new Set<number>();
  for (const a of allocations) {
    allocatedMrpSet.add(Number(a.mrp.toFixed(2)));
  }
  const distinctMrps = Array.from(allocatedMrpSet).sort((a, b) => a - b);
  const hasMultiMrp = distinctMrps.length > 1;

  return {
    success: isFullySatisfied,
    isPartiallyAllocated: totalAllocated > 0 && !isFullySatisfied,
    isUnallocated: totalAllocated === 0,
    requestedQty,
    freeQty,
    totalRequiredQty,
    totalAllocatedBilledQty,
    totalAllocatedFreeQty,
    totalAllocatedQty: totalAllocated,
    unallocatedQty,
    unallocatedBilledQty: remainingBilledToAllocate,
    unallocatedFreeQty: remainingFreeToAllocate,
    hasMultiMrp,
    distinctMrps,
    requiresMrpSelectionPrompt,
    availableMrps,
    allocations,
  };
}
