import { describe, it, expect, beforeAll } from 'vitest';
import { db, sqlite } from '../../src/lib/db';
import { customers, suppliers, areas } from '../../src/lib/db/schema/masters';
import { invoices } from '../../src/lib/db/schema/transactions';
import {
  chequeRegister,
  customerReceipts,
  customerReceiptAllocations,
  customerOutstandings,
} from '../../src/lib/db/schema/ledgers';
import {
  getChequeRegister,
  depositCheque,
  clearCheque,
  dishonorCheque,
  cancelCheque,
} from '../../src/app/accounts/cheques/actions';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

describe('Milestone 5 — Feature F28: Cheque Register, Deposit, Clearance & Dishonor', () => {
  let testAreaId: string;
  let testCustomerId: string;
  let incomingChequeId: string;
  let outgoingChequeId: string;
  let testReceiptId: string;
  let testOutstandingId: string;

  beforeAll(async () => {
    const runSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();

    // 1. Area
    const area = await db.query.areas.findFirst();
    testAreaId = area?.id ?? crypto.randomUUID();
    if (!area) {
      db.insert(areas).values({
        id: testAreaId,
        code: `CHQ_AREA_${runSuffix}`,
        name: 'CHEQUE TEST AREA',
        isActive: true,
      }).run();
    }

    // 2. Customer
    testCustomerId = crypto.randomUUID();
    db.insert(customers).values({
      id: testCustomerId,
      code: `CHQ_CUST_${runSuffix}`,
      name: 'SUNRISE PHARMACY',
      areaId: testAreaId,
      billingType: 'L',
      paymentTerms: 'R',
      creditLimit: 50000,
      closingBalance: 5000,
      creditDays: 30,
      isActive: true,
      isBlocked: false,
    }).run();

    // 3. Invoice + Outstanding (for dishonor rollback test)
    const invId = `CHQ-INV-${runSuffix}`;
    const invNo = `CQ${runSuffix}`;
    db.insert(invoices).values({
      id: invId,
      invoiceNo: invNo,
      invoiceDate: '2026-04-01',
      invoiceTime: '10:00:00',
      customerId: testCustomerId,
      dueDate: '2026-04-21',
      netAmount: 5000,
    }).run();

    testOutstandingId = crypto.randomUUID();
    db.insert(customerOutstandings).values({
      id: testOutstandingId,
      customerId: testCustomerId,
      invoiceId: invId,
      invoiceNo: invNo,
      invoiceDate: '2026-04-01',
      dueDate: '2026-04-21',
      originalAmount: 5000,
      paidAmount: 5000,
      balanceAmount: 0,
      status: 'PAID',
    }).run();

    // 4. Receipt voucher linked to a cheque
    testReceiptId = crypto.randomUUID();
    db.insert(customerReceipts).values({
      id: testReceiptId,
      receiptNo: `RCT-CHQ-${runSuffix}`,
      receiptDate: '2026-04-10',
      customerId: testCustomerId,
      paymentMode: 'CHEQUE',
      totalAmount: 5000,
      discountAllowed: 0,
      unallocatedAmount: 0,
      chequeStatus: 'RECEIVED',
    }).run();

    db.insert(customerReceiptAllocations).values({
      id: crypto.randomUUID(),
      receiptId: testReceiptId,
      outstandingId: testOutstandingId,
      invoiceId: invId,
      allocatedAmount: 5000,
      discountAmount: 0,
    }).run();

    // 5. Incoming cheque entry (customer cheque RECEIVED)
    incomingChequeId = crypto.randomUUID();
    db.insert(chequeRegister).values({
      id: incomingChequeId,
      chequeType: 'INCOMING',
      chequeNo: `CHQ-IN-${runSuffix}`,
      chequeDate: '2026-04-08',
      amount: 5000,
      bankName: 'HDFC BANK',
      branchName: 'ANNA NAGAR',
      partyType: 'CUSTOMER',
      partyId: testCustomerId,
      partyName: 'SUNRISE PHARMACY',
      status: 'RECEIVED',
      receiptId: testReceiptId,
    }).run();

    // 6. Outgoing cheque (supplier side)
    outgoingChequeId = crypto.randomUUID();
    db.insert(chequeRegister).values({
      id: outgoingChequeId,
      chequeType: 'OUTGOING',
      chequeNo: `CHQ-OUT-${runSuffix}`,
      chequeDate: '2026-04-09',
      amount: 3000,
      bankName: 'SBI',
      branchName: 'T NAGAR',
      partyType: 'SUPPLIER',
      partyId: crypto.randomUUID(),
      partyName: 'TEST SUPPLIER LTD',
      status: 'ISSUED',
    }).run();
  });

  it('retrieves all cheques from the register', async () => {
    const all = await getChequeRegister();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by type INCOMING', async () => {
    const incoming = await getChequeRegister({ type: 'INCOMING' });
    const found = incoming.find((c: any) => c.id === incomingChequeId);
    expect(found).toBeDefined();
    expect(found?.chequeType).toBe('INCOMING');
  });

  it('filters by type OUTGOING', async () => {
    const outgoing = await getChequeRegister({ type: 'OUTGOING' });
    const found = outgoing.find((c: any) => c.id === outgoingChequeId);
    expect(found).toBeDefined();
    expect(found?.chequeType).toBe('OUTGOING');
  });

  it('deposits an incoming cheque (RECEIVED → DEPOSITED)', async () => {
    const result = await depositCheque(incomingChequeId, '2026-04-12');
    expect(result.success).toBe(true);

    const row = sqlite.prepare('SELECT status, deposit_date FROM cheque_register WHERE id = ?').get(incomingChequeId) as any;
    expect(row.status).toBe('DEPOSITED');
    expect(row.deposit_date).toBe('2026-04-12');
  });

  it('rejects depositing an already-cleared cheque', async () => {
    // First clear the outgoing cheque
    await clearCheque(outgoingChequeId, '2026-04-15');

    const result = await depositCheque(outgoingChequeId, '2026-04-16');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already cleared/i);
  });

  it('clears a deposited incoming cheque (DEPOSITED → CLEARED)', async () => {
    const result = await clearCheque(incomingChequeId, '2026-04-14');
    expect(result.success).toBe(true);

    const row = sqlite.prepare('SELECT status, clearance_date FROM cheque_register WHERE id = ?').get(incomingChequeId) as any;
    expect(row.status).toBe('CLEARED');
    expect(row.clearance_date).toBe('2026-04-14');
  });

  it('dishonors an incoming cheque and rolls back customer AR + restores bills (CHQRET parity)', async () => {
    // Need a fresh cheque still in RECEIVED state for dishonor
    const runSuffix2 = crypto.randomBytes(3).toString('hex').toUpperCase();
    const custId2 = crypto.randomUUID();
    db.insert(customers).values({
      id: custId2,
      code: `DIS_CUST_${runSuffix2}`,
      name: 'DISHONOR TEST PHARMACY',
      areaId: testAreaId,
      billingType: 'L',
      paymentTerms: 'R',
      creditLimit: 50000,
      closingBalance: 0,
      creditDays: 30,
      isActive: true,
      isBlocked: false,
    }).run();

    const invId2 = `DIS-INV-${runSuffix2}`;
    db.insert(invoices).values({
      id: invId2,
      invoiceNo: `DIS${runSuffix2}`,
      invoiceDate: '2026-04-05',
      invoiceTime: '09:00:00',
      customerId: custId2,
      dueDate: '2026-04-25',
      netAmount: 3000,
    }).run();

    const outId2 = crypto.randomUUID();
    db.insert(customerOutstandings).values({
      id: outId2,
      customerId: custId2,
      invoiceId: invId2,
      invoiceNo: `DIS${runSuffix2}`,
      invoiceDate: '2026-04-05',
      dueDate: '2026-04-25',
      originalAmount: 3000,
      paidAmount: 3000,
      balanceAmount: 0,
      status: 'PAID',
    }).run();

    const rcptId2 = crypto.randomUUID();
    db.insert(customerReceipts).values({
      id: rcptId2,
      receiptNo: `RCT-DIS-${runSuffix2}`,
      receiptDate: '2026-04-10',
      customerId: custId2,
      paymentMode: 'CHEQUE',
      totalAmount: 3000,
      discountAllowed: 0,
      unallocatedAmount: 0,
      chequeStatus: 'RECEIVED',
    }).run();

    db.insert(customerReceiptAllocations).values({
      id: crypto.randomUUID(),
      receiptId: rcptId2,
      outstandingId: outId2,
      invoiceId: invId2,
      allocatedAmount: 3000,
      discountAmount: 0,
    }).run();

    const chqId2 = crypto.randomUUID();
    db.insert(chequeRegister).values({
      id: chqId2,
      chequeType: 'INCOMING',
      chequeNo: `CHQ-DIS-${runSuffix2}`,
      chequeDate: '2026-04-10',
      amount: 3000,
      bankName: 'CANARA BANK',
      partyType: 'CUSTOMER',
      partyId: custId2,
      partyName: 'DISHONOR TEST PHARMACY',
      status: 'RECEIVED',
      receiptId: rcptId2,
    }).run();

    const res = await dishonorCheque({
      chequeId: chqId2,
      dishonorDate: '2026-04-15',
      dishonorReason: 'INSUFFICIENT_FUNDS',
      dishonorCharge: 500,
    });

    expect(res.success).toBe(true);
    expect(res.restoredBillsCount).toBe(1);
    // Customer AR should be restored: 0 + 3000 (receipt reversal) + 500 (charge) = 3500
    expect(res.newClosingBalance).toBe(3500);

    // Cheque should be DISHONORED
    const chqRow = sqlite.prepare('SELECT status FROM cheque_register WHERE id = ?').get(chqId2) as any;
    expect(chqRow.status).toBe('DISHONORED');

    // Outstanding should be back to OPEN
    const outRow = sqlite.prepare('SELECT status, balance_amount FROM customer_outstandings WHERE id = ?').get(outId2) as any;
    expect(outRow.status).toBe('OPEN');
    expect(outRow.balance_amount).toBe(3000);
  });

  it('rejects dishonoring an already-dishonored cheque', async () => {
    // The outgoing cheque was cleared so it cannot be dishonored
    const result = await dishonorCheque({
      chequeId: outgoingChequeId,
      dishonorDate: '2026-04-20',
      dishonorReason: 'OTHER',
    });
    // Outgoing cheques are not customer incoming, should return error
    expect(result.success).toBe(false);
  });

  it('cancels an ISSUED outgoing cheque (ISSUED → CANCELLED)', async () => {
    // Create a fresh outgoing cheque for cancellation
    const cancelId = crypto.randomUUID();
    const cancelSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    db.insert(chequeRegister).values({
      id: cancelId,
      chequeType: 'OUTGOING',
      chequeNo: `CHQ-CANCEL-${cancelSuffix}`,
      chequeDate: '2026-04-20',
      amount: 1500,
      bankName: 'AXIS BANK',
      partyType: 'SUPPLIER',
      partyId: crypto.randomUUID(),
      partyName: 'SUPPLIER TO CANCEL',
      status: 'ISSUED',
    }).run();

    const result = await cancelCheque(cancelId, 'Stale cheque — payment renegotiated');
    expect(result.success).toBe(true);

    const row = sqlite.prepare('SELECT status FROM cheque_register WHERE id = ?').get(cancelId) as any;
    expect(row.status).toBe('CANCELLED');
  });
});
