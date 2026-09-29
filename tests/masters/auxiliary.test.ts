import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../src/lib/db';
import {
  doctors,
  salesmen,
  areas,
  taxSlabs,
  companies,
  customers,
  products,
} from '../../src/lib/db/schema/masters';
import {
  getDoctors,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  getSalesmen,
  createSalesman,
  updateSalesman,
  deleteSalesman,
  getAreas,
  createArea,
  updateArea,
  deleteArea,
  getTaxSlabs,
  createTaxSlab,
  updateTaxSlab,
  deleteTaxSlab,
  getCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  getCompanyProducts,
} from '../../src/app/masters/auxiliary/actions';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

describe('Feature F18: Auxiliary Masters Maintenance', () => {
  describe('1. Doctors Master (T1-F18-01, T2-F18-01)', () => {
    it('creates doctor with registration number and specialization (T1-F18-01)', async () => {
      const code = 'DR91';
      await db.delete(doctors).where(eq(doctors.code, code)).run();

      const res = await createDoctor({
        code,
        name: 'DR. S. RAO',
        registrationNo: '45892',
        qualification: 'MBBS, MD',
        specialization: 'CARDIOLOGY',
      });

      expect(res.success).toBe(true);
      const docs = await getDoctors();
      const created = docs.find((d) => d.code === code);
      expect(created).toBeDefined();
      expect(created?.name).toBe('DR. S. RAO');
      expect(created?.registrationNo).toBe('45892');
    });

    it('supports registration numbers with special prefixes (T2-F18-01)', async () => {
      const code = 'DR92';
      await db.delete(doctors).where(eq(doctors.code, code)).run();

      const res = await createDoctor({
        code,
        name: 'DR. PRIYA SHARMA',
        registrationNo: 'MCI/2018/00912',
        qualification: 'MBBS, DNB',
        specialization: 'PEDIATRICS',
      });

      const docs = await getDoctors();
      const created = docs.find((d) => d.code === code);
      expect(created?.registrationNo).toBe('MCI/2018/00912');
    });

    it('updates doctor qualifications cleanly', async () => {
      const docs = await getDoctors();
      const doc = docs.find((d) => d.code === 'DR91');
      expect(doc).toBeDefined();

      await updateDoctor({
        id: doc!.id,
        code: doc!.code,
        name: 'DR. S. RAO (CHIEF PHYSICIAN)',
        qualification: 'MBBS, MD, DM',
        specialization: doc!.specialization || undefined,
      });

      const refreshed = await getDoctors();
      const updated = refreshed.find((d) => d.code === 'DR91');
      expect(updated?.qualification).toBe('MBBS, MD, DM');
    });

    it('deletes doctor cleanly when requested', async () => {
      const code = 'DR99';
      await db.delete(doctors).where(eq(doctors.code, code)).run();

      const res = await createDoctor({
        code,
        name: 'DR. TEMPORARY DELETABLE',
        registrationNo: 'TEMP/99',
      });

      await deleteDoctor(res.id);
      const docs = await getDoctors();
      expect(docs.find((d) => d.code === code)).toBeUndefined();
    });
  });

  describe('2. Salesmen Master (T1-F18-02, T2-F18-02)', () => {
    it('creates salesman with commission % (T1-F18-02)', async () => {
      const code = 'SM81';
      await db.delete(salesmen).where(eq(salesmen.code, code)).run();

      const res = await createSalesman({
        code,
        name: 'ANIL VERMA',
        phone: '9840112233',
        localCommissionPct: 3.0,
      });

      expect(res.success).toBe(true);
      const list = await getSalesmen();
      const created = list.find((s) => s.code === code);
      expect(created).toBeDefined();
      expect(created?.localCommissionPct).toBe(3.0);
    });

    it('enforces commission percentage boundary 0.00% to 50.00% (T2-F18-02)', async () => {
      const code0 = 'SM82';
      const code50 = 'SM83';
      await db.delete(salesmen).where(eq(salesmen.code, code0)).run();
      await db.delete(salesmen).where(eq(salesmen.code, code50)).run();

      // 0% is valid
      const res0 = await createSalesman({
        code: code0,
        name: 'ZERO COMMISSION REP',
        localCommissionPct: 0.0,
      });
      expect(res0.success).toBe(true);

      // 50% is valid
      const res50 = await createSalesman({
        code: code50,
        name: 'MAX COMMISSION REP',
        localCommissionPct: 50.0,
      });
      expect(res50.success).toBe(true);

      // > 50% must be rejected
      await expect(
        createSalesman({
          code: 'SM84',
          name: 'EXCESS COMMISSION REP',
          localCommissionPct: 50.5,
        })
      ).rejects.toThrow(/between 0.00% and 50.00%/);

      // Negative must be rejected
      await expect(
        createSalesman({
          code: 'SM85',
          name: 'NEGATIVE COMMISSION REP',
          localCommissionPct: -1.0,
        })
      ).rejects.toThrow(/between 0.00% and 50.00%/);
    });
  });

  describe('3. Areas Master & Deletion Guard (T1-F18-03, T2-F18-03)', () => {
    it('creates area with assigned district (T1-F18-03)', async () => {
      const code = 'A81';
      await db.delete(areas).where(eq(areas.code, code)).run();

      const res = await createArea({
        code,
        name: 'SOUTH EXTENSION',
        district: 'SOUTH',
      });

      expect(res.success).toBe(true);
      const list = await getAreas();
      const created = list.find((a) => a.code === code);
      expect(created).toBeDefined();
      expect(created?.name).toBe('SOUTH EXTENSION');
    });

    it('deletes area cleanly when no active customers exist', async () => {
      const code = 'A82';
      await db.delete(areas).where(eq(areas.code, code)).run();

      const res = await createArea({
        code,
        name: 'EMPTY AREA FOR DELETION',
        district: 'TEST',
      });

      await deleteArea(res.id);
      const list = await getAreas();
      expect(list.find((a) => a.code === code)).toBeUndefined();
    });

    it('rejects deletion of area with active linked customers (T2-F18-03, AAED.PRG:91)', async () => {
      // Find an area that has customers
      const cust = await db.query.customers.findFirst();
      expect(cust).toBeDefined();

      // Attempt deleting that area
      await expect(deleteArea(cust!.areaId)).rejects.toThrow(
        /Cannot delete area containing active customer accounts/
      );
    });
  });

  describe('4. Tax Slabs Master & Immutable Protection (T1-F18-04, T2-F18-04)', () => {
    it('inspects statutory tax slab 03 (18% GST) rates (T1-F18-04)', async () => {
      const slabs = await getTaxSlabs();
      const slab03 = slabs.find((s) => s.code === '03');
      expect(slab03).toBeDefined();
      expect(slab03?.cgstRate).toBe(9.0);
      expect(slab03?.sgstRate).toBe(9.0);
      expect(slab03?.igstRate).toBe(18.0);
    });

    it('warns that modifying tax slab rates affects future billing only (T2-F18-04)', async () => {
      const res = await updateTaxSlab({
        code: '02',
        description: '12% GST (STANDARD)',
        cgstRate: 6.0,
        sgstRate: 6.0,
        igstRate: 12.0,
      });

      expect(res.success).toBe(true);
      expect(res.warning).toContain('affects future billing only');
    });

    it('protects exempted tax code 01 against modification (TAXAED.PRG:66)', async () => {
      await expect(
        updateTaxSlab({
          code: '01',
          description: 'ATTEMPT ALTER 01',
          cgstRate: 1.0,
          sgstRate: 1.0,
          igstRate: 2.0,
        })
      ).rejects.toThrow(/Exempted Tax Code \(01\) is protected/);
    });

    it('protects exempted tax code 01 against deletion (TAXAED.PRG:66)', async () => {
      await expect(deleteTaxSlab('01')).rejects.toThrow(
        /Exempted Tax Code \(01\) is protected/
      );
    });
  });

  describe('5. Company Master & High-Density Product Loading (T1-F18-05, T2-F18-05)', () => {
    it('creates company and allows tagging products (T1-F18-05)', async () => {
      const code = 'GP05';
      await db.delete(companies).where(eq(companies.code, code)).run();

      const res = await createCompany({
        code,
        name: 'SUN PHARMA LTD',
        shortName: 'SUN',
        defaultDiscountPct: 7.5,
        freeValueScheme: 'Y',
      });

      expect(res.success).toBe(true);
      const list = await getCompanies();
      const created = list.find((c) => c.code === code);
      expect(created).toBeDefined();
      expect(created?.name).toBe('SUN PHARMA LTD');
      expect(created?.defaultDiscountPct).toBe(7.5);
    });

    it('loads company products sub-list with pagination in < 150ms (T2-F18-05)', async () => {
      const comp = await db.query.companies.findFirst();
      expect(comp).toBeDefined();

      const startTime = performance.now();
      const paged = await getCompanyProducts(comp!.id, 20, 0);
      const elapsed = performance.now() - startTime;

      expect(paged.items).toBeDefined();
      expect(elapsed).toBeLessThan(150); // Sub-150ms query requirement fulfilled
    });
  });
});
