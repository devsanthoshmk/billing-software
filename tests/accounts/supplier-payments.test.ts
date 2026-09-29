import { describe, it, expect, beforeAll } from 'vitest';
import { db, sqlite } from '../../src/lib/db';
import { suppliers } from '../../src/lib/db/schema/masters';
import { purchases } from '../../src/lib/db/schema/transactions';
import {
  supplierPayments,
  supplierPaymentAllocations,
  chequeRegister,
} from '../../src/lib/db/schema/ledgers';
import {
  recordSupplierPayment,
  deleteSupplierPayment,
  getSupplierOutstandings,
  getSuppliersLookup,
} from '../../src/app/accounts/payments/actions';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

describe('Milestone 5 — Feature F27: Supplier Payments & Purchase Allocation', () => {
  let testSupplierId: string;
  let blockedSupplierId: string;
  let testPurchase1Id: string;
  let testPurchase2Id: string;
  let runSuffix: string; // shared so assertions match setup

  beforeAll(async () => {
    // 1. Create active supplier
    testSupplierId = crypto.randomUUID();
    const supCode = 'SUP_' + crypto.randomBytes(3).toString('hex').toUpperCase();
    db.insert(suppliers).values({
      id: testSupplierId,
      code: supCode,
      name: 'SUN PHARMA DISTRIBUTORS',
      gstin: '33AABCS1429B1Z2',
      currentBalance: 12000,
      creditDays: 30,
      isActive: true,
      isBlocked: false,
    }).run();

    // 2. Create blocked supplier
    blockedSupplierId = crypto.randomUUID();
    db.insert(suppliers).values({
      id: blockedSupplierId,
      code: 'SUP_BLK_' + crypto.randomBytes(3).toString('hex').toUpperCase(),
      name: 'BLOCKED DISTRIBUTORS',
      gstin: '33AABCB9999Z1Z5',
      currentBalance: 5000,
      creditDays: 0,
      isActive: true,
      isBlocked: true,
    }).run();

    // 3. Create 2 open purchases for testSupplierId
    runSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    testPurchase1Id = crypto.randomUUID();
    db.insert(purchases).values({
      id: testPurchase1Id,
      inwardNo: `GRN-${runSuffix}-01`,
      supplierId: testSupplierId,
      supplierBillNo: `BILL-${runSuffix}-101`,
      supplierBillDate: '2026-04-01',
      inwardDate: '2026-04-02',
      dueDate: '2026-05-02',
      netAmount: 7000,
      paidAmount: 0,
      balanceAmount: 7000,
      paymentStatus: 'UNPAID',
    }).run();

    testPurchase2Id = crypto.randomUUID();
    db.insert(purchases).values({
      id: testPurchase2Id,
      inwardNo: `GRN-${runSuffix}-02`,
      supplierId: testSupplierId,
      supplierBillNo: `BILL-${runSuffix}-102`,
      supplierBillDate: '2026-04-05',
      inwardDate: '2026-04-06',
      dueDate: '2026-05-06',
      netAmount: 5000,
      paidAmount: 0,
      balanceAmount: 5000,
      paymentStatus: 'UNPAID',
    }).run();
  });

  it('retrieves active suppliers lookup and open inward bills in FIFO order', async () => {
    const lookup = await getSuppliersLookup();
    expect(lookup.length).toBeGreaterThan(0);
    const found = lookup.find(s => s.id === testSupplierId);
    expect(found).toBeDefined();
    expect(found?.name).toBe('SUN PHARMA DISTRIBUTORS');

    const outstandings = await getSupplierOutstandings(testSupplierId);
    expect(outstandings.length).toBe(2);
    expect(outstandings[0].inwardNo).toBe(`GRN-${runSuffix}-01`);
    expect(outstandings[0].balanceAmount).toBe(7000);
    expect(outstandings[1].inwardNo).toBe(`GRN-${runSuffix}-02`);
    expect(outstandings[1].balanceAmount).toBe(5000);
  });

  it('blocks payment to a blocked supplier', async () => {
    const res = await recordSupplierPayment({
      supplierId: blockedSupplierId,
      paymentDate: '2026-04-15',
      paymentMode: 'NEFT_RTGS',
      totalAmount: 1000,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Supplier.*blocked/i);
  });

  it('validates non-positive amounts and cheque details', async () => {
    const zeroRes = await recordSupplierPayment({
      supplierId: testSupplierId,
      paymentDate: '2026-04-15',
      paymentMode: 'CASH',
      totalAmount: 0,
    });
    expect(zeroRes.success).toBe(false);

    const chequeNoRes = await recordSupplierPayment({
      supplierId: testSupplierId,
      paymentDate: '2026-04-15',
      paymentMode: 'CHEQUE',
      totalAmount: 5000,
      // missing referenceNo, bankName
    });
    expect(chequeNoRes.success).toBe(false);
    expect(chequeNoRes.error).toMatch(/Cheque number is mandatory/i);
  });

  it('executes FIFO allocation settling first inward bill in full and second partially', async () => {
    const supPre = sqlite.prepare('SELECT current_balance FROM suppliers WHERE id = ?').get(testSupplierId) as any;
    const initialBal = Number(supPre.current_balance); // 12000

    // Pay 9000: settles 7000 on Bill 1, 2000 on Bill 2 (leaving 3000 balance)
    const res = await recordSupplierPayment({
      supplierId: testSupplierId,
      paymentDate: '2026-04-15',
      paymentMode: 'NEFT_RTGS',
      totalAmount: 9000,
      referenceNo: 'NEFT-20260415-01',
      referenceDate: '2026-04-15',
      bankName: 'STATE BANK OF INDIA',
      narration: 'FIFO Payment Test',
    });

    expect(res.success).toBe(true);
    expect(res.paymentId).toBeDefined();
    expect(res.paymentNo).toMatch(/^PMT-\d+/);
    expect(res.unallocatedAmount).toBe(0);

    // Verify Bill 1 is PAID
    const p1 = sqlite.prepare('SELECT * FROM purchases WHERE id = ?').get(testPurchase1Id) as any;
    expect(p1.payment_status).toBe('PAID');
    expect(p1.paid_amount).toBe(7000);
    expect(p1.balance_amount).toBe(0);

    // Verify Bill 2 is PARTIAL
    const p2 = sqlite.prepare('SELECT * FROM purchases WHERE id = ?').get(testPurchase2Id) as any;
    expect(p2.payment_status).toBe('PARTIAL');
    expect(p2.paid_amount).toBe(2000);
    expect(p2.balance_amount).toBe(3000);

    // Verify supplier currentBalance reduced by 9000
    const supPost = sqlite.prepare('SELECT current_balance FROM suppliers WHERE id = ?').get(testSupplierId) as any;
    expect(Number(supPost.current_balance)).toBe(Number((initialBal - 9000).toFixed(2)));

    // Verify allocations table
    const allocs = sqlite.prepare('SELECT * FROM supplier_payment_allocations WHERE payment_id = ?').all(res.paymentId) as any[];
    expect(allocs.length).toBe(2);
  });

  it('records outgoing cheque and tracks it in cheque register', async () => {
    // Current balance on Bill 2 is 3000
    // Issue cheque for 4000: settles 3000 on Bill 2, 1000 unallocated advance
    const res = await recordSupplierPayment({
      supplierId: testSupplierId,
      paymentDate: '2026-04-16',
      paymentMode: 'CHEQUE',
      totalAmount: 4000,
      referenceNo: 'OUT-CHQ-9911',
      referenceDate: '2026-04-16',
      bankName: 'AXIS BANK',
      bankAccountNo: 'CA-91823719',
      narration: 'Vendor Settlement Cheque',
    });

    expect(res.success).toBe(true);
    expect(res.unallocatedAmount).toBe(1000);

    // Bill 2 is now fully PAID
    const p2 = sqlite.prepare('SELECT * FROM purchases WHERE id = ?').get(testPurchase2Id) as any;
    expect(p2.payment_status).toBe('PAID');
    expect(p2.balance_amount).toBe(0);
    expect(p2.paid_amount).toBe(5000);

    // Cheque register entry created with OUTGOING
    const chq = sqlite.prepare('SELECT * FROM cheque_register WHERE payment_id = ?').get(res.paymentId) as any;
    expect(chq).toBeDefined();
    expect(chq.cheque_type).toBe('OUTGOING');
    expect(chq.cheque_no).toBe('OUT-CHQ-9911');
    expect(chq.amount).toBe(4000);
    expect(chq.status).toBe('ISSUED');
    expect(chq.party_type).toBe('SUPPLIER');
    expect(chq.party_name).toBe('SUN PHARMA DISTRIBUTORS');
  });

  it('correctly reverts allocations and restores supplier balances upon payment deletion', async () => {
    // Create new purchase inward (unique per run)
    const revSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const pId = crypto.randomUUID();
    db.insert(purchases).values({
      id: pId,
      inwardNo: `GRN-REV-${revSuffix}`,
      supplierId: testSupplierId,
      supplierBillNo: `BILL-REV-${revSuffix}`,
      supplierBillDate: '2026-04-17',
      inwardDate: '2026-04-17',
      dueDate: '2026-05-17',
      netAmount: 2500,
      paidAmount: 0,
      balanceAmount: 2500,
      paymentStatus: 'UNPAID',
    }).run();

    // Adjust supplier balance + 2500
    const supPre = sqlite.prepare('SELECT current_balance FROM suppliers WHERE id = ?').get(testSupplierId) as any;
    db.update(suppliers).set({ currentBalance: supPre.current_balance + 2500 }).where(eq(suppliers.id, testSupplierId)).run();

    // Pay 2500
    const pmt = await recordSupplierPayment({
      supplierId: testSupplierId,
      paymentDate: '2026-04-18',
      paymentMode: 'CASH',
      totalAmount: 2500,
    });
    expect(pmt.success).toBe(true);

    const pPaid = sqlite.prepare('SELECT * FROM purchases WHERE id = ?').get(pId) as any;
    expect(pPaid.payment_status).toBe('PAID');
    expect(pPaid.balance_amount).toBe(0);

    // Delete / revert payment
    const delRes = await deleteSupplierPayment(pmt.paymentId!);
    expect(delRes.success).toBe(true);

    // Verify purchase is restored to UNPAID with 2500 balance
    const pRestored = sqlite.prepare('SELECT * FROM purchases WHERE id = ?').get(pId) as any;
    expect(pRestored.payment_status).toBe('UNPAID');
    expect(pRestored.balance_amount).toBe(2500);
    expect(pRestored.paid_amount).toBe(0);
  });

  it('prevents deletion of a supplier payment that has been day-end locked', async () => {
    // Record a payment
    const p = await recordSupplierPayment({
      supplierId: testSupplierId,
      paymentDate: '2026-04-19',
      paymentMode: 'CASH',
      totalAmount: 200,
    });
    expect(p.success).toBe(true);

    // Lock payment
    db.update(supplierPayments).set({ dayEndLocked: true }).where(eq(supplierPayments.id, p.paymentId!)).run();

    // Attempt deletion
    const del = await deleteSupplierPayment(p.paymentId!);
    expect(del.success).toBe(false);
    expect(del.error).toMatch(/locked by day-end closing/i);

    // Clean up
    db.update(supplierPayments).set({ dayEndLocked: false }).where(eq(supplierPayments.id, p.paymentId!)).run();
    await deleteSupplierPayment(p.paymentId!);
  });
});
