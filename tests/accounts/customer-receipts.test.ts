import { describe, it, expect, beforeAll } from 'vitest';
import { db, sqlite } from '../../src/lib/db';
import { customers, areas } from '../../src/lib/db/schema/masters';
import { invoices } from '../../src/lib/db/schema/transactions';
import {
  customerReceipts,
  customerReceiptAllocations,
  customerOutstandings,
  chequeRegister,
} from '../../src/lib/db/schema/ledgers';
import {
  recordCustomerReceipt,
  deleteCustomerReceipt,
  getCustomerOutstandings,
  getCustomersLookup,
} from '../../src/app/accounts/receipts/actions';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

describe('Milestone 5 — Feature F26: Customer Collection Receipts & FIFO Settlement', () => {
  let testAreaId: string;
  let testCustomerId: string;
  let blockedCustomerId: string;
  let openBill1Id: string;
  let openBill2Id: string;
  let inv1No: string;
  let inv2No: string;

  beforeAll(async () => {
    // 1. Ensure test area
    const area = await db.query.areas.findFirst();
    if (area) {
      testAreaId = area.id;
    } else {
      testAreaId = crypto.randomUUID();
      db.insert(areas).values({
        id: testAreaId,
        code: 'A_RCT_TEST',
        name: 'RECEIPTS TEST AREA',
        isActive: true,
      }).run();
    }

    // 2. Active Customer with opening balance
    testCustomerId = crypto.randomUUID();
    const uniqueCustCode = 'CR_' + crypto.randomBytes(3).toString('hex').toUpperCase();
    db.insert(customers).values({
      id: testCustomerId,
      code: uniqueCustCode,
      name: 'APOLLO MEDICAL STORES',
      areaId: testAreaId,
      billingType: 'L',
      paymentTerms: 'R',
      creditLimit: 100000,
      closingBalance: 7500, // 5000 + 2500
      creditDays: 30,
      isActive: true,
      isBlocked: false,
    }).run();

    // 3. Blocked Customer
    blockedCustomerId = crypto.randomUUID();
    db.insert(customers).values({
      id: blockedCustomerId,
      code: 'CR_BLK_' + crypto.randomBytes(3).toString('hex').toUpperCase(),
      name: 'BLOCKED PHARMACY PHARMA',
      areaId: testAreaId,
      billingType: 'L',
      paymentTerms: 'R',
      creditLimit: 0,
      closingBalance: 2000,
      creditDays: 0,
      isActive: true,
      isBlocked: true,
    }).run();

    // 4. Create invoice headers before inserting outstandings (unique per run)
    const invSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
    const inv1Id = `INV-RCT-${invSuffix}-1`;
    const inv2Id = `INV-RCT-${invSuffix}-2`;
    inv1No = `R${invSuffix}1`;
    inv2No = `R${invSuffix}2`;
    db.insert(invoices).values([
      {
        id: inv1Id,
        invoiceNo: inv1No,
        invoiceDate: '2026-04-01',
        invoiceTime: '10:00:00',
        customerId: testCustomerId,
        dueDate: '2026-04-21',
        netAmount: 5000,
      },
      {
        id: inv2Id,
        invoiceNo: inv2No,
        invoiceDate: '2026-04-10',
        invoiceTime: '11:00:00',
        customerId: testCustomerId,
        dueDate: '2026-04-30',
        netAmount: 2500,
      },
    ]).run();

    // 5. Create 2 open outstandings for testCustomerId
    openBill1Id = crypto.randomUUID();
    db.insert(customerOutstandings).values({
      id: openBill1Id,
      customerId: testCustomerId,
      invoiceId: inv1Id,
      invoiceNo: inv1No,
      invoiceDate: '2026-04-01',
      dueDate: '2026-04-21',
      originalAmount: 5000,
      paidAmount: 0,
      balanceAmount: 5000,
      status: 'OPEN',
      cashDiscountEligible: 100,
    }).run();

    openBill2Id = crypto.randomUUID();
    db.insert(customerOutstandings).values({
      id: openBill2Id,
      customerId: testCustomerId,
      invoiceId: inv2Id,
      invoiceNo: inv2No,
      invoiceDate: '2026-04-10',
      dueDate: '2026-04-30',
      originalAmount: 2500,
      paidAmount: 0,
      balanceAmount: 2500,
      status: 'OPEN',
      cashDiscountEligible: 50,
    }).run();
  });

  it('retrieves active customer lookup and open outstandings in FIFO order', async () => {
    const lookup = await getCustomersLookup();
    expect(lookup.length).toBeGreaterThan(0);
    const found = lookup.find(c => c.id === testCustomerId);
    expect(found).toBeDefined();
    expect(found?.name).toBe('APOLLO MEDICAL STORES');

    const outstandings = await getCustomerOutstandings(testCustomerId);
    expect(outstandings.length).toBe(2);
    expect(outstandings[0].invoiceNo).toBe(inv1No);
    expect(outstandings[0].balanceAmount).toBe(5000);
    expect(outstandings[1].invoiceNo).toBe(inv2No);
    expect(outstandings[1].balanceAmount).toBe(2500);
  });

  it('rejects recording receipt for a blocked customer', async () => {
    const res = await recordCustomerReceipt({
      customerId: blockedCustomerId,
      receiptDate: '2026-04-15',
      paymentMode: 'CASH',
      totalAmount: 1000,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Customer is blocked/i);
  });

  it('rejects non-positive collection amounts', async () => {
    const resZero = await recordCustomerReceipt({
      customerId: testCustomerId,
      receiptDate: '2026-04-15',
      paymentMode: 'CASH',
      totalAmount: 0,
    });
    expect(resZero.success).toBe(false);

    const resNegative = await recordCustomerReceipt({
      customerId: testCustomerId,
      receiptDate: '2026-04-15',
      paymentMode: 'CASH',
      totalAmount: -500,
    });
    expect(resNegative.success).toBe(false);
  });

  it('validates mandatory cheque fields when paymentMode is CHEQUE', async () => {
    const resMissingCheque = await recordCustomerReceipt({
      customerId: testCustomerId,
      receiptDate: '2026-04-15',
      paymentMode: 'CHEQUE',
      totalAmount: 3000,
      // missing referenceNo, referenceDate, bankName
    });
    expect(resMissingCheque.success).toBe(false);
    expect(resMissingCheque.error).toMatch(/Cheque number is mandatory/i);
  });

  it('records a FIFO cash collection settling the first bill fully and second bill partially', async () => {
    const initialCust = sqlite.prepare('SELECT closing_balance FROM customers WHERE id = ?').get(testCustomerId) as any;
    const initialBal = Number(initialCust.closing_balance); // 7500

    // Pay 6000: covers 5000 of Bill 1001 (full), leaves 1000 for Bill 1002 (partial, bal 1500)
    const res = await recordCustomerReceipt({
      customerId: testCustomerId,
      receiptDate: '2026-04-15',
      paymentMode: 'CASH',
      totalAmount: 6000,
      narration: 'FIFO Collection Test',
    });

    expect(res.success).toBe(true);
    expect(res.receiptId).toBeDefined();
    expect(res.receiptNo).toMatch(/^RCT-\d+/);
    expect(res.unallocatedAmount).toBe(0);

    // Verify Bill 1 is PAID
    const b1 = sqlite.prepare('SELECT * FROM customer_outstandings WHERE id = ?').get(openBill1Id) as any;
    expect(b1.status).toBe('PAID');
    expect(b1.paid_amount).toBe(5000);
    expect(b1.balance_amount).toBe(0);

    // Verify Bill 2 is PARTIALLY_PAID
    const b2 = sqlite.prepare('SELECT * FROM customer_outstandings WHERE id = ?').get(openBill2Id) as any;
    expect(b2.status).toBe('PARTIALLY_PAID');
    expect(b2.paid_amount).toBe(1000);
    expect(b2.balance_amount).toBe(1500);

    // Verify customer closing balance reduced by 6000
    const updatedCust = sqlite.prepare('SELECT closing_balance FROM customers WHERE id = ?').get(testCustomerId) as any;
    expect(Number(updatedCust.closing_balance)).toBe(Number((initialBal - 6000).toFixed(2)));

    // Verify allocations created in customer_receipt_allocations
    const allocs = sqlite.prepare('SELECT * FROM customer_receipt_allocations WHERE receipt_id = ?').all(res.receiptId) as any[];
    expect(allocs.length).toBe(2);
  });

  it('handles surplus payment generating unallocated advance credit (EXAMT)', async () => {
    // Current outstanding balance on testCustomerId: Bill 2 has 1500 remaining
    // Pay 2000: settles 1500 on Bill 2, 500 unallocated advance
    const res = await recordCustomerReceipt({
      customerId: testCustomerId,
      receiptDate: '2026-04-16',
      paymentMode: 'CHEQUE',
      totalAmount: 2000,
      referenceNo: 'CHQ-778899',
      referenceDate: '2026-04-16',
      bankName: 'HDFC BANK',
      branchName: 'T NAGAR',
      narration: 'Cheque with excess payment',
    });

    expect(res.success).toBe(true);
    expect(res.unallocatedAmount).toBe(500);

    // Bill 2 is now fully PAID
    const b2 = sqlite.prepare('SELECT * FROM customer_outstandings WHERE id = ?').get(openBill2Id) as any;
    expect(b2.status).toBe('PAID');
    expect(b2.balance_amount).toBe(0);
    expect(b2.paid_amount).toBe(2500);

    // Cheque register entry created
    const chq = sqlite.prepare('SELECT * FROM cheque_register WHERE receipt_id = ?').get(res.receiptId) as any;
    expect(chq).toBeDefined();
    expect(chq.cheque_no).toBe('CHQ-778899');
    expect(chq.bank_name).toBe('HDFC BANK');
    expect(chq.amount).toBe(2000);
    expect(chq.status).toBe('RECEIVED');
    expect(chq.party_type).toBe('CUSTOMER');
  });

  it('correctly reverts allocations and restores balances upon receipt deletion', async () => {
    // Create a new fresh open bill (unique per run)
    const revSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
    const revInvId = `INV-RCT-REV-${revSuffix}`;
    const revInvNo = `REV${revSuffix}`;
    db.insert(invoices).values({
      id: revInvId,
      invoiceNo: revInvNo,
      invoiceDate: '2026-04-17',
      invoiceTime: '12:00:00',
      customerId: testCustomerId,
      dueDate: '2026-05-07',
      netAmount: 1200,
    }).run();

    const billId = crypto.randomUUID();
    db.insert(customerOutstandings).values({
      id: billId,
      customerId: testCustomerId,
      invoiceId: revInvId,
      invoiceNo: revInvNo,
      invoiceDate: '2026-04-17',
      dueDate: '2026-05-07',
      originalAmount: 1200,
      paidAmount: 0,
      balanceAmount: 1200,
      status: 'OPEN',
    }).run();

    // Customer balance + 1200
    const custPre = sqlite.prepare('SELECT closing_balance FROM customers WHERE id = ?').get(testCustomerId) as any;
    db.update(customers).set({ closingBalance: custPre.closing_balance + 1200 }).where(eq(customers.id, testCustomerId)).run();

    // Pay 1200
    const receiptRes = await recordCustomerReceipt({
      customerId: testCustomerId,
      receiptDate: '2026-04-18',
      paymentMode: 'CHEQUE',
      totalAmount: 1200,
      referenceNo: 'REV-CHQ-12',
      referenceDate: '2026-04-18',
      bankName: 'SBI',
    });
    expect(receiptRes.success).toBe(true);

    const bPaid = sqlite.prepare('SELECT * FROM customer_outstandings WHERE id = ?').get(billId) as any;
    expect(bPaid.status).toBe('PAID');
    expect(bPaid.balance_amount).toBe(0);

    // Now delete/revert receipt
    const delRes = await deleteCustomerReceipt(receiptRes.receiptId!);
    expect(delRes.success).toBe(true);

    // Verify bill is restored to OPEN with 1200 balance
    const bRestored = sqlite.prepare('SELECT * FROM customer_outstandings WHERE id = ?').get(billId) as any;
    expect(bRestored.status).toBe('OPEN');
    expect(bRestored.balance_amount).toBe(1200);
    expect(bRestored.paid_amount).toBe(0);

    // Cheque in register deleted
    const chqCheck = sqlite.prepare('SELECT * FROM cheque_register WHERE receipt_id = ?').get(receiptRes.receiptId!) as any;
    expect(chqCheck).toBeUndefined();
  });

  it('prevents deletion of a receipt that has been day-end locked', async () => {
    // Record a receipt
    const r = await recordCustomerReceipt({
      customerId: testCustomerId,
      receiptDate: '2026-04-19',
      paymentMode: 'CASH',
      totalAmount: 100,
    });
    expect(r.success).toBe(true);

    // Lock the receipt
    db.update(customerReceipts).set({ dayEndLocked: true }).where(eq(customerReceipts.id, r.receiptId!)).run();

    // Attempt deletion
    const delRes = await deleteCustomerReceipt(r.receiptId!);
    expect(delRes.success).toBe(false);
    expect(delRes.error).toMatch(/locked by day-end closing/i);

    // Clean up
    db.update(customerReceipts).set({ dayEndLocked: false }).where(eq(customerReceipts.id, r.receiptId!)).run();
    await deleteCustomerReceipt(r.receiptId!);
  });
});
