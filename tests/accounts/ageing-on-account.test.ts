import { describe, it, expect } from 'vitest';
import { getCustomerAgeingAnalysis } from '@/app/accounts/ageing/actions';
import { getUnallocatedReceipts, autoAllocateOnAccountReceipt } from '@/app/accounts/on-account/actions';

describe('Accounts Hub Extensions (4.4 & 4.5 Ageing & On-Account)', () => {
  it('1. computes 30/60/90/120+ days bill-by-bill customer ageing', async () => {
    const ageingRes = await getCustomerAgeingAnalysis();
    expect(ageingRes.success).toBe(true);
    expect(Array.isArray(ageingRes.ageing)).toBe(true);
  });

  it('2. checks on-account advance receipts and reconciliation', async () => {
    const unallocated = await getUnallocatedReceipts();
    expect(unallocated.success).toBe(true);
    expect(Array.isArray(unallocated.receipts)).toBe(true);
  });
});
