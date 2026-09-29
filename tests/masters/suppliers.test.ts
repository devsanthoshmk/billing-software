import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../src/lib/db';
import { suppliers } from '../../src/lib/db/schema/masters';
import { purchases } from '../../src/lib/db/schema/transactions';
import {
  createSupplier,
  updateSupplier,
  getSupplierById,
  getSuppliersList,
  verifySupervisorPassword,
  getSupplierPayablesSummary,
  deleteSupplier,
} from '../../src/app/masters/suppliers/actions';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

describe('Feature F17: Supplier Master Maintenance & Supervisor Gate', () => {
  describe('1. Supervisor Password Security Gate (T1-F17-02, T2-F17-03)', () => {
    it('unlocks form when exact case password SPM is entered (T1-F17-02)', async () => {
      const result = await verifySupervisorPassword('SPM');
      expect(result).toBe(true);
    });

    it('rejects lowercase or mixed-case passwords spm and Spm (T2-F17-03)', async () => {
      expect(await verifySupervisorPassword('spm')).toBe(false);
      expect(await verifySupervisorPassword('Spm')).toBe(false);
      expect(await verifySupervisorPassword('ADMIN')).toBe(false);
      expect(await verifySupervisorPassword('')).toBe(false);
    });
  });

  describe('2. Supplier Creation & Boundary Validations (T1-F17-01, T2-F17-01, T2-F17-02, T2-F17-05)', () => {
    it('creates supplier with full contact and commercial profile (T1-F17-01)', async () => {
      const code = 'S901';
      await db.delete(suppliers).where(eq(suppliers.code, code)).run();

      const res = await createSupplier({
        code,
        name: 'CIPLA PHARMACEUTICAL DISTRIBUTORS',
        contactPerson: 'K. RAMANATHAN',
        phone: '044-24567890',
        defaultDiscountPct: 3.0,
        bankName: 'HDFC BANK',
        bankAccountNo: '50200012345678',
        bankIfsc: 'HDFC0000123',
      });

      expect(res.success).toBe(true);
      const created = await getSupplierById(res.id);
      expect(created).toBeDefined();
      expect(created?.code).toBe('S901');
      expect(created?.defaultDiscountPct).toBe(3.0);
      expect(created?.bankIfsc).toBe('HDFC0000123');
    });

    it('enforces supplier code length boundary 3-10 chars (T2-F17-01)', async () => {
      // Too short (< 3 chars)
      await expect(
        createSupplier({
          code: 'S1',
          name: 'SHORT CODE VENDOR',
        })
      ).rejects.toThrow(/between 3 and 10 characters/);

      // Too long (> 10 chars)
      await expect(
        createSupplier({
          code: 'SUPPLIER99999',
          name: 'LONG CODE VENDOR',
        })
      ).rejects.toThrow(/between 3 and 10 characters/);
    });

    it('handles default discount at 99.99% extreme without overflow (T2-F17-02)', async () => {
      const code = 'S902';
      await db.delete(suppliers).where(eq(suppliers.code, code)).run();

      const res = await createSupplier({
        code,
        name: 'MAX DISCOUNT VENDOR',
        defaultDiscountPct: 99.99,
      });

      const fetched = await getSupplierById(res.id);
      expect(fetched?.defaultDiscountPct).toBe(99.99);

      // Value > 99.99% must be rejected
      await expect(
        createSupplier({
          code: 'S903',
          name: 'OVERFLOW DISCOUNT',
          defaultDiscountPct: 100.5,
        })
      ).rejects.toThrow(/between 0.00% and 99.99%/);
    });

    it('handles blank supplier address fields cleanly without null pointer exceptions (T2-F17-05)', async () => {
      const code = 'S904';
      await db.delete(suppliers).where(eq(suppliers.code, code)).run();

      const res = await createSupplier({
        code,
        name: 'MINIMAL ADDRESS VENDOR',
        // address fields omitted
      });

      const fetched = await getSupplierById(res.id);
      expect(fetched?.addressLine1).toBe('');
      expect(fetched?.addressLine2).toBe('');
    });
  });

  describe('3. Supplier Update & Payables Ledger Overview (T1-F17-03, T1-F17-04)', () => {
    it('updates default trade discount from 3.00% to 5.00% (T1-F17-03)', async () => {
      const supp = await db.query.suppliers.findFirst({
        where: eq(suppliers.code, 'S901'),
      });
      expect(supp).toBeDefined();

      await updateSupplier(
        {
          id: supp!.id,
          code: supp!.code,
          name: supp!.name,
          defaultDiscountPct: 5.0,
        },
        'SPM'
      );

      const updated = await getSupplierById(supp!.id);
      expect(updated?.defaultDiscountPct).toBe(5.0);
    });

    it('rejects update when incorrect supervisor password is provided', async () => {
      const supp = await db.query.suppliers.findFirst({
        where: eq(suppliers.code, 'S901'),
      });

      await expect(
        updateSupplier(
          {
            id: supp!.id,
            code: supp!.code,
            name: supp!.name,
            defaultDiscountPct: 7.0,
          },
          'WRONG'
        )
      ).rejects.toThrow(/Incorrect supervisor password/);
    });

    it('displays supplier payables & ledger summary overview (T1-F17-04)', async () => {
      const supp = await db.query.suppliers.findFirst({
        where: eq(suppliers.code, 'S901'),
      });
      expect(supp).toBeDefined();

      const summary = await getSupplierPayablesSummary(supp!.id);
      expect(summary).toBeDefined();
      expect(summary.supplierCode).toBe('S901');
      expect(summary.totalPurchases).toBeGreaterThanOrEqual(0);
      expect(summary.totalPayments).toBeGreaterThanOrEqual(0);
      expect(summary.outstandingPayable).toBeDefined();
    });
  });

  describe('4. Incremental Search & Directory Browsing (T1-F17-05)', () => {
    it('performs incremental search narrowing to Cipla supplier (T1-F17-05)', async () => {
      const list = await getSuppliersList('CIP');
      expect(list.length).toBeGreaterThanOrEqual(1);
      const matched = list.some((s) => s.name.toUpperCase().includes('CIPLA'));
      expect(matched).toBe(true);
    });
  });

  describe('5. Referential Integrity Deletion Guard (T2-F17-04)', () => {
    it('deletes supplier cleanly when balance is 0 and no purchase bills exist', async () => {
      const code = 'S999';
      await db.delete(suppliers).where(eq(suppliers.code, code)).run();

      const created = await createSupplier({
        code,
        name: 'UNUSED SUPPLIER TO DELETE',
        currentBalance: 0,
      });

      const res = await deleteSupplier(created.id);
      expect(res.success).toBe(true);

      const check = await getSupplierById(created.id);
      expect(check).toBeUndefined();
    });

    it('rejects deletion when supplier has open payables balance (T2-F17-04)', async () => {
      const code = 'S988';
      await db.delete(suppliers).where(eq(suppliers.code, code)).run();

      const created = await createSupplier({
        code,
        name: 'VENDOR WITH OPEN BALANCE',
        currentBalance: 15000.0,
      });

      await expect(deleteSupplier(created.id)).rejects.toThrow(
        /Cannot delete supplier with open payable balance/
      );

      // Clean up test supplier
      await db.delete(suppliers).where(eq(suppliers.id, created.id)).run();
    });
  });
});
