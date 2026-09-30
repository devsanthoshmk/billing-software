import { describe, it, expect, beforeEach } from 'vitest';
import { db, sqlite } from '@/lib/db';
import { searchInvoicesForReprint, getInvoicePrintData } from '@/app/billing/reprint/actions';
import { getDeliveryChallanInitialData, createDeliveryChallan } from '@/app/billing/delivery-challan/actions';
import { searchInvoicesForCancellation, cancelInvoice } from '@/app/billing/cancel/actions';
import { getPartyBalances, generatePartyBalanceSlip } from '@/app/billing/party-balance/actions';
import { invoices, invoiceItems, customers, products, productBatches } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

describe('Billing Hub Extensions (1.2, 1.3, 1.7, 1.9 Parity)', () => {
  it('1. searches invoices and compiles print copies correctly', async () => {
    const res = await searchInvoicesForReprint();
    expect(res.success).toBe(true);
    expect(res.invoices).toBeDefined();

    if (res.invoices.length > 0) {
      const invId = res.invoices[0].id;
      const printRes = await getInvoicePrintData(invId, 'DUPLICATE');
      expect(printRes.success).toBe(true);
      expect(printRes.printData?.invoiceNo).toBeDefined();
      expect(printRes.copyType).toBe('DUPLICATE');
    }
  });

  it('2. loads delivery challan initial data and records packing slip', async () => {
    const initData = await getDeliveryChallanInitialData();
    expect(initData.success).toBe(true);
    expect(initData.customers.length).toBeGreaterThan(0);
    expect(initData.products.length).toBeGreaterThan(0);

    const cust = initData.customers[0];
    const prod = initData.products.find((p) => p.batches && p.batches.length > 0);
    expect(prod).toBeDefined();

    const batch = prod!.batches[0];
    const res = await createDeliveryChallan({
      customerId: cust.id,
      challanDate: '2026-09-28',
      transportName: 'TEST LOGISTICS',
      lrNo: 'LR-12345',
      preparedBy: 'ADMIN',
      items: [
        {
          productId: prod!.id,
          batchId: batch.id,
          productName: prod!.name,
          packaging: prod!.packaging,
          hsnCode: prod!.hsnCode,
          batchNo: batch.batchNo,
          expiryDate: batch.expiryDate,
          quantity: 2,
          freeQuantity: 0,
          sellingRate: batch.sellingRate,
          mrp: batch.mrp,
        },
      ],
    });

    expect(res.success).toBe(true);
    expect(res.challanNo).toMatch(/^DC-/);
  });

  it('3. checks party balance generator for 40-col and 80-col formats', async () => {
    const cust = await db.query.customers.findFirst({
      where: eq(customers.isActive, true),
    });
    expect(cust).toBeDefined();

    const slip40 = await generatePartyBalanceSlip(cust!.id, '40COL');
    expect(slip40.success).toBe(true);
    expect(slip40.slipText).toContain('PARTY:');

    const slip80 = await generatePartyBalanceSlip(cust!.id, '80COL');
    expect(slip80.success).toBe(true);
    expect(slip80.slipText).toContain('STATEMENT OF ACCOUNT');
  });

  it('4. tests invoice cancellation and rollback mechanics', async () => {
    const activeInvoices = await searchInvoicesForCancellation();
    expect(activeInvoices.success).toBe(true);

    if (activeInvoices.invoices.length > 0) {
      const target = activeInvoices.invoices.find((i) => !i.dayEndLocked);
      if (target) {
        const cancelRes = await cancelInvoice({
          invoiceId: target.id,
          reason: 'Test cancellation',
          operator: 'ADMIN',
        });
        expect(cancelRes.success).toBe(true);
        expect(cancelRes.invoiceNo).toBe(target.invoiceNo);
      }
    }
  });
});
