import { describe, it, expect, beforeAll } from 'vitest';
import { db, sqlite } from '../../src/lib/db';
import {
  customers,
  areas,
  salesmen,
} from '../../src/lib/db/schema/masters';
import { invoices } from '../../src/lib/db/schema/transactions';
import {
  createCustomer,
  updateCustomer,
  getCustomerById,
  getCustomersList,
  getNextCustomerCode,
  deleteCustomer,
  toggleCustomerBlocked,
  validateGstin,
  extractPanFromGstin,
  sanitizePhone,
} from '../../src/app/masters/customers/actions';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';

describe('Feature F16: Customer Master Maintenance & Statutory Validation', () => {
  let testAreaId: string;
  let testSalesmanId: string;

  beforeAll(async () => {
    // Ensure test salesman exists
    const sm = await db.query.salesmen.findFirst();
    if (sm) {
      testSalesmanId = sm.id;
    } else {
      testSalesmanId = crypto.randomUUID();
      db.insert(salesmen).values({
        id: testSalesmanId,
        code: 'SM99',
        name: 'TEST SALESMAN',
        localCommissionPct: 3.5,
        isActive: true,
      }).run();
    }

    // Ensure test area exists
    const ar = await db.query.areas.findFirst();
    if (ar) {
      testAreaId = ar.id;
    } else {
      testAreaId = crypto.randomUUID();
      db.insert(areas).values({
        id: testAreaId,
        code: 'A99',
        name: 'NORTH DISTRICT',
        district: 'NORTH',
        salesmanId: testSalesmanId,
        isActive: true,
      }).run();
    }
  });

  describe('1. Customer Creation & Form Validations (T1-F16-01, T2-F16-01, T2-F16-02)', () => {
    it('creates customer with full regulatory details (T1-F16-01)', async () => {
      const code = 'C901';
      const existing = await db.query.customers.findFirst({ where: eq(customers.code, code) });
      if (existing) {
        sqlite.prepare('DELETE FROM customer_receipt_allocations WHERE outstanding_id IN (SELECT id FROM customer_outstandings WHERE customer_id = ?)').run(existing.id);
        sqlite.prepare('DELETE FROM customer_outstandings WHERE customer_id = ?').run(existing.id);
        sqlite.prepare('DELETE FROM invoices WHERE customer_id = ?').run(existing.id);
        sqlite.prepare('DELETE FROM customer_receipts WHERE customer_id = ?').run(existing.id);
        sqlite.prepare('DELETE FROM customers WHERE id = ?').run(existing.id);
      }

      const res = await createCustomer({
        code,
        name: 'APOLLO CLINIC & PHARMACY',
        areaId: testAreaId,
        salesmanId: testSalesmanId,
        gstin: '33AAAAA0000A1Z5',
        dlNo20b: 'TN/CHE/20B/1234',
        dlNo21b: 'TN/CHE/21B/5678',
        creditLimit: 50000,
        creditDays: 21,
      });

      expect(res.success).toBe(true);
      const created = await getCustomerById(res.id);
      expect(created).toBeDefined();
      expect(created?.code).toBe('C901');
      expect(created?.gstin).toBe('33AAAAA0000A1Z5');
      // Auto-extracted PAN
      expect(created?.pan).toBe('AAAAA0000A');
    });

    it('trims leading and trailing whitespace on party name (T2-F16-01)', async () => {
      const code = 'C902';
      await db.delete(customers).where(eq(customers.code, code)).run();

      const res = await createCustomer({
        code,
        name: '   Apollo Chemist   ',
        areaId: testAreaId,
      });

      const fetched = await getCustomerById(res.id);
      expect(fetched?.name).toBe('Apollo Chemist');
    });

    it('sanitizes non-standard phone numbers cleanly (T2-F16-02)', async () => {
      expect(await sanitizePhone('+91-98765-43210')).toBe('919876543210');
      expect(await sanitizePhone('044 - 2819 1234')).toBe('04428191234');
      expect(await sanitizePhone('')).toBe('');
    });

    it('rejects invalid GSTIN format with statutory error (T1-F16-03)', async () => {
      const code = 'C903';
      await expect(
        createCustomer({
          code,
          name: 'BAD GSTIN PHARMACY',
          areaId: testAreaId,
          gstin: 'INVALID123', // Not 15 characters matching regex
        })
      ).rejects.toThrow(/GSTIN must be 15 characters/);
    });

    it('allows null / empty drug license numbers for non-pharma retailers (T2-F16-04)', async () => {
      const code = 'C904';
      await db.delete(customers).where(eq(customers.code, code)).run();

      const res = await createCustomer({
        code,
        name: 'NON-PHARMA GROCERY STORE',
        areaId: testAreaId,
        dlNo20b: '',
        dlNo21b: '',
      });

      const fetched = await getCustomerById(res.id);
      expect(fetched?.dlNo20b).toBeNull();
      expect(fetched?.dlNo21b).toBeNull();
    });

    it('strictly forces paymentTerms to Cash when creditDays === 0 (T2-F16-03)', async () => {
      const code = 'C905';
      await db.delete(customers).where(eq(customers.code, code)).run();

      const res = await createCustomer({
        code,
        name: 'ZERO CREDIT DAYS STORE',
        areaId: testAreaId,
        creditDays: 0,
        paymentTerms: 'R', // Attempting credit terms
      });

      const fetched = await getCustomerById(res.id);
      // Must be forced to 'C' (Cash)
      expect(fetched?.creditDays).toBe(0);
      expect(fetched?.paymentTerms).toBe('C');
    });
  });

  describe('2. Customer Updates & Invariants (T1-F16-02, T1-F16-04)', () => {
    it('updates credit limit and credit days (T1-F16-02)', async () => {
      const cust = await db.query.customers.findFirst({
        where: eq(customers.code, 'C901'),
      });
      expect(cust).toBeDefined();

      await updateCustomer({
        id: cust!.id,
        code: cust!.code,
        name: cust!.name,
        areaId: cust!.areaId,
        creditLimit: 75000,
        creditDays: 30,
      });

      const updated = await getCustomerById(cust!.id);
      expect(updated?.creditLimit).toBe(75000);
      expect(updated?.creditDays).toBe(30);
    });

    it('toggles tax-exempt status (NOTAX flag) in database (T1-F16-04)', async () => {
      const cust = await db.query.customers.findFirst({
        where: eq(customers.code, 'C901'),
      });

      await updateCustomer({
        id: cust!.id,
        code: cust!.code,
        name: cust!.name,
        areaId: cust!.areaId,
        isTaxExempt: true,
      });

      let updated = await getCustomerById(cust!.id);
      expect(updated?.isTaxExempt).toBe(true);

      // Revert back
      await updateCustomer({
        id: cust!.id,
        code: cust!.code,
        name: cust!.name,
        areaId: cust!.areaId,
        isTaxExempt: false,
      });
      updated = await getCustomerById(cust!.id);
      expect(updated?.isTaxExempt).toBe(false);
    });

    it('toggles customer blocked status cleanly', async () => {
      const cust = await db.query.customers.findFirst({
        where: eq(customers.code, 'C901'),
      });

      await toggleCustomerBlocked(cust!.id, true);
      let c = await getCustomerById(cust!.id);
      expect(c?.isBlocked).toBe(true);

      await toggleCustomerBlocked(cust!.id, false);
      c = await getCustomerById(cust!.id);
      expect(c?.isBlocked).toBe(false);
    });
  });

  describe('3. Customer Filtering & Search (T1-F16-05)', () => {
    it('filters customer directory by area input (T1-F16-05)', async () => {
      const area = await db.query.areas.findFirst({ where: eq(areas.id, testAreaId) });
      expect(area).toBeDefined();

      const list = await getCustomersList('', area!.name);
      expect(list.length).toBeGreaterThanOrEqual(1);
      const allMatchingArea = list.every((c) =>
        c.area?.name?.toUpperCase().includes(area!.name.toUpperCase()) ||
        c.area?.code?.toUpperCase().includes(area!.code.toUpperCase())
      );
      expect(allMatchingArea).toBe(true);
    });

    it('filters customer directory by customer name or code', async () => {
      const list = await getCustomersList('APOLLO', '');
      expect(list.length).toBeGreaterThanOrEqual(1);
      const matched = list.some((c) => c.name.includes('APOLLO') || c.code.includes('APOLLO'));
      expect(matched).toBe(true);
    });
  });

  describe('4. Referential Integrity Deletion Guard (CAED.PRG:140)', () => {
    it('deletes customer cleanly when no transaction history exists', async () => {
      const code = 'C999';
      await db.delete(customers).where(eq(customers.code, code)).run();

      const created = await createCustomer({
        code,
        name: 'TEMPORARY UNUSED CUSTOMER',
        areaId: testAreaId,
      });

      const res = await deleteCustomer(created.id);
      expect(res.success).toBe(true);

      const check = await getCustomerById(created.id);
      expect(check).toBeUndefined();
    });

    it('rejects deletion when customer has invoices (CAED.PRG:140)', async () => {
      const cust = await db.query.customers.findFirst({
        where: eq(customers.code, 'C901'),
      });
      expect(cust).toBeDefined();

      const fakeInvId = crypto.randomUUID();
      db.insert(invoices).values({
        id: fakeInvId,
        invoiceNo: 'TEST-CUST-INV-001',
        invoiceSeries: 1,
        invoiceDate: '2026-09-28',
        invoiceTime: '12:00:00',
        customerId: cust!.id,
        dueDate: '2026-10-15',
        paymentTerms: 'CREDIT',
      }).run();

      // Deletion must be rejected
      await expect(deleteCustomer(cust!.id)).rejects.toThrow(
        /Cannot delete customer with active transactions/
      );

      // Clean up test invoice
      db.delete(invoices).where(eq(invoices.id, fakeInvId)).run();
    });
  });
});
