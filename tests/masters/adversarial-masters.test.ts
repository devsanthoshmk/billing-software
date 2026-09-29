import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/lib/db';
import {
  customers,
  areas,
  salesmen,
  suppliers,
  taxSlabs,
  products,
} from '../../src/lib/db/schema/masters';
import { invoices, purchases } from '../../src/lib/db/schema/transactions';
import { customerOutstandings, supplierPayments } from '../../src/lib/db/schema/ledgers';
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerById,
  validateGstin,
  sanitizePhone,
  extractPanFromGstin,
} from '../../src/app/masters/customers/actions';
import {
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getSupplierById,
  verifySupervisorPassword,
  getSupplierPayablesSummary,
} from '../../src/app/masters/suppliers/actions';
import {
  createArea,
  deleteArea,
  getAreas,
  updateTaxSlab,
  deleteTaxSlab,
  getTaxSlabs,
} from '../../src/app/masters/auxiliary/actions';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';

describe('Adversarial Stress Suite: Masters Maintenance (Features F16, F17, F18)', () => {
  let sharedAreaId: string;
  let sharedSalesmanId: string;

  beforeAll(async () => {
    // 1. Ensure a shared test salesman exists
    const sm = await db.query.salesmen.findFirst();
    if (sm) {
      sharedSalesmanId = sm.id;
    } else {
      sharedSalesmanId = crypto.randomUUID();
      db.insert(salesmen).values({
        id: sharedSalesmanId,
        code: 'SM_ADV',
        name: 'ADVERSARIAL TEST SALESMAN',
        localCommissionPct: 2.5,
        isActive: true,
      }).run();
    }

    // 2. Ensure a shared test area exists
    const ar = await db.query.areas.findFirst();
    if (ar) {
      sharedAreaId = ar.id;
    } else {
      sharedAreaId = crypto.randomUUID();
      db.insert(areas).values({
        id: sharedAreaId,
        code: 'A_ADV',
        name: 'ADVERSARIAL TEST AREA',
        district: 'CENTRAL',
        salesmanId: sharedSalesmanId,
        isActive: true,
      }).run();
    }
  });

  // =========================================================================
  // 1. CUSTOMER MASTER VALIDATIONS & REFERENTIAL DELETION (FEATURE F16)
  // =========================================================================
  describe('1. Feature F16: Customer Master Validations & Referential Deletion', () => {

    describe('1.1 GSTIN Validation Stress: Invalid Formats, Lengths & Characters', () => {
      // 14-character GSTINs (too short)
      const fourteenCharGstins = [
        '33AAAAA0000A1Z',
        '07ABCDE1234F1Z',
        '29AAAAA0000A1 ',
        '33123456789012',
      ];

      fourteenCharGstins.forEach((gstin) => {
        it(`rejects 14-char GSTIN '${gstin}' via validateGstin and createCustomer`, async () => {
          expect(await validateGstin(gstin)).toBe(false);

          await expect(
            createCustomer({
              code: 'C_BAD_14',
              name: 'INVALID GSTIN PHARMA',
              areaId: sharedAreaId,
              gstin,
            })
          ).rejects.toThrow(/GSTIN must be 15 characters matching statutory format/);
        });
      });

      // 16-character GSTINs (too long)
      const sixteenCharGstins = [
        '33AAAAA0000A1Z55',
        '33AAAAA0000A1Z5X',
        '07ABCDE1234F1Z99',
        '29AAAAA0000A1Z5A',
      ];

      sixteenCharGstins.forEach((gstin) => {
        it(`rejects 16-char GSTIN '${gstin}' via validateGstin and createCustomer`, async () => {
          expect(await validateGstin(gstin)).toBe(false);

          await expect(
            createCustomer({
              code: 'C_BAD_16',
              name: 'OVERFLOW GSTIN PHARMA',
              areaId: sharedAreaId,
              gstin,
            })
          ).rejects.toThrow(/GSTIN must be 15 characters matching statutory format/);
        });
      });

      // Illegal symbols / punctuation inside 15-character string
      const symbolGstins = [
        '33AAAAA0000A1Z@', // Symbol at checksum position
        '33AAAAA0000A1Z#', // Hash at checksum position
        '33AAAAA0000A1Z$', // Dollar at checksum position
        '33@AAAA0000A1Z5', // Symbol in PAN letters
        '!3AAAAA0000A1Z5', // Exclamation in state code
        '33AAAAA00#0A1Z5', // Symbol in PAN numeric part
        '33-AAAA0000A1Z5', // Hyphen inside
        '33 AAAAA0000A1Z', // Space inside (15 chars)
        '<SCRIPT>33AAAAA', // HTML tag injection
      ];

      symbolGstins.forEach((gstin) => {
        it(`rejects symbol-polluted GSTIN '${gstin}'`, async () => {
          expect(await validateGstin(gstin)).toBe(false);

          await expect(
            createCustomer({
              code: 'C_BAD_SYM',
              name: 'SYMBOL GSTIN PHARMA',
              areaId: sharedAreaId,
              gstin,
            })
          ).rejects.toThrow(/GSTIN must be 15 characters matching statutory format/);
        });
      });

      // Structural format violations (15 chars, but invalid statutory pattern)
      const patternViolationGstins = [
        '33AAAAA0000A1A5', // Missing constant 'Z' at position 14 (has 'A')
        '33AAAAA0000A195', // Missing constant 'Z' at position 14 (has '9')
        '3312345AAAA1Z5', // Inverted PAN: numbers before letters
        '33AAAA00000A1Z5', // 4 letters and 5 digits instead of 5 letters and 4 digits
        'AA33AAA0000A1Z5', // Letters before state code
      ];

      patternViolationGstins.forEach((gstin) => {
        it(`rejects statutory structure violation GSTIN '${gstin}'`, async () => {
          expect(await validateGstin(gstin)).toBe(false);

          await expect(
            createCustomer({
              code: 'C_BAD_PAT',
              name: 'BAD PATTERN PHARMA',
              areaId: sharedAreaId,
              gstin,
            })
          ).rejects.toThrow(/GSTIN must be 15 characters matching statutory format/);
        });
      });

      // Legitimate statutory GSTINs with auto-PAN extraction and case handling
      it('accepts valid GSTINs, normalizes lowercase, and extracts 10-char PAN', async () => {
        // Tamil Nadu standard
        expect(await validateGstin('33AAAAA0000A1Z5')).toBe(true);
        expect(await extractPanFromGstin('33AAAAA0000A1Z5')).toBe('AAAAA0000A');

        // Karnataka standard with lowercase
        expect(await validateGstin('29abcde1234f2z8')).toBe(true);
        expect(await extractPanFromGstin('29abcde1234f2z8')).toBe('ABCDE1234F');

        // Delhi standard with leading/trailing spaces
        expect(await validateGstin('  07BBBBB9999C1Z1  ')).toBe(true);
        expect(await extractPanFromGstin('  07BBBBB9999C1Z1  ')).toBe('BBBBB9999C');

        // Unregistered customer: empty or undefined GSTIN allowed
        expect(await validateGstin('')).toBe(true);
        expect(await validateGstin(undefined)).toBe(true);
        expect(await validateGstin('   ')).toBe(true);
      });

      it('rejects invalid GSTIN during customer UPDATE as well', async () => {
        const testCode = 'C_GST_UPD';
        await db.delete(customers).where(eq(customers.code, testCode)).run();

        const created = await createCustomer({
          code: testCode,
          name: 'GST UPDATE TEST PHARMA',
          areaId: sharedAreaId,
        });

        // Updating with invalid GSTIN must be blocked
        await expect(
          updateCustomer({
            id: created.id,
            code: testCode,
            name: 'GST UPDATE TEST PHARMA',
            areaId: sharedAreaId,
            gstin: '33INVALIDGSTIN!',
          })
        ).rejects.toThrow(/GSTIN must be 15 characters matching statutory format/);

        // Clean up
        await deleteCustomer(created.id);
      });
    });

    describe('1.2 Phone Number Sanitization with International Prefixes & Punctuation', () => {
      const phoneVectors = [
        { input: '+91-98765-43210', expected: '919876543210' },
        { input: '+91 98765 43210', expected: '919876543210' },
        { input: '+1-800-555-0199', expected: '18005550199' },
        { input: '+44 (0) 20 7946 0919', expected: '4402079460919' },
        { input: '(044) 2819-1234 / 5678', expected: '044281912345678' },
        { input: '044.2819.1234', expected: '04428191234' },
        { input: 'Tel: +91 (44) 2819-1234 Ext: 101', expected: '914428191234101' },
        { input: '  +91 99400 12345  ', expected: '919940012345' },
        { input: '', expected: '' },
        { input: '   ', expected: '' },
        { input: 'NO PHONE', expected: '' },
      ];

      phoneVectors.forEach(({ input, expected }) => {
        it(`sanitizes phone '${input}' -> '${expected}'`, async () => {
          const sanitized = await sanitizePhone(input);
          expect(sanitized).toBe(expected);
        });
      });

      it('persists sanitized phone numbers into database on create and update', async () => {
        const testCode = 'C_PHN_DB';
        await db.delete(customers).where(eq(customers.code, testCode)).run();

        const created = await createCustomer({
          code: testCode,
          name: 'PHONE PERSISTENCE CHEMIST',
          areaId: sharedAreaId,
          phone: '+91 (044) 2819-1234 / 5678',
        });

        let cust = await getCustomerById(created.id);
        expect(cust?.phone).toBe('91044281912345678');

        // Update with international prefix
        await updateCustomer({
          id: created.id,
          code: testCode,
          name: 'PHONE PERSISTENCE CHEMIST',
          areaId: sharedAreaId,
          phone: '+1-800-555-0199',
        });

        cust = await getCustomerById(created.id);
        expect(cust?.phone).toBe('18005550199');

        // Clean up
        await deleteCustomer(created.id);
      });
    });

    describe('1.3 Credit Days = 0 Strictly Enforcing Cash Payment Terms', () => {
      it('forces paymentTerms to C when creditDays is 0 on create', async () => {
        const testCode = 'C_ZERO_CR';
        await db.delete(customers).where(eq(customers.code, testCode)).run();

        // Attempting to specify CREDIT terms 'R' with creditDays = 0
        const created = await createCustomer({
          code: testCode,
          name: 'ZERO CREDIT FORCED CASH PHARMA',
          areaId: sharedAreaId,
          creditDays: 0,
          paymentTerms: 'R',
        });

        const cust = await getCustomerById(created.id);
        expect(cust?.creditDays).toBe(0);
        expect(cust?.paymentTerms).toBe('C');

        await deleteCustomer(created.id);
      });

      it('forces paymentTerms to C even when creditDays is passed as string 0', async () => {
        const testCode = 'C_STR_0';
        await db.delete(customers).where(eq(customers.code, testCode)).run();

        const created = await createCustomer({
          code: testCode,
          name: 'STRING ZERO CREDIT DAYS',
          areaId: sharedAreaId,
          creditDays: '0' as unknown as number,
          paymentTerms: 'H',
        });

        const cust = await getCustomerById(created.id);
        expect(cust?.creditDays).toBe(0);
        expect(cust?.paymentTerms).toBe('C');

        await deleteCustomer(created.id);
      });

      it('preserves non-cash paymentTerms when creditDays > 0', async () => {
        const testCode = 'C_POS_CR';
        await db.delete(customers).where(eq(customers.code, testCode)).run();

        const created = await createCustomer({
          code: testCode,
          name: 'POSITIVE CREDIT DAYS PHARMA',
          areaId: sharedAreaId,
          creditDays: 30,
          paymentTerms: 'R',
        });

        const cust = await getCustomerById(created.id);
        expect(cust?.creditDays).toBe(30);
        expect(cust?.paymentTerms).toBe('R');

        await deleteCustomer(created.id);
      });

      it('forces paymentTerms to C when updating creditDays from positive to 0', async () => {
        const testCode = 'C_UPD_0';
        await db.delete(customers).where(eq(customers.code, testCode)).run();

        const created = await createCustomer({
          code: testCode,
          name: 'UPDATE TO ZERO CREDIT',
          areaId: sharedAreaId,
          creditDays: 21,
          paymentTerms: 'R',
        });

        let cust = await getCustomerById(created.id);
        expect(cust?.creditDays).toBe(21);
        expect(cust?.paymentTerms).toBe('R');

        // Update creditDays to 0 while specifying paymentTerms 'R'
        await updateCustomer({
          id: created.id,
          code: testCode,
          name: 'UPDATE TO ZERO CREDIT',
          areaId: sharedAreaId,
          creditDays: 0,
          paymentTerms: 'R',
        });

        cust = await getCustomerById(created.id);
        expect(cust?.creditDays).toBe(0);
        expect(cust?.paymentTerms).toBe('C');

        await deleteCustomer(created.id);
      });
    });

    describe('1.4 Customer Referential Deletion Protection (CAED.PRG:140)', () => {
      it('blocks deletion of customer when sales invoices exist and leaves data intact', async () => {
        const testCode = 'C_INV_DEL';
        await db.delete(customers).where(eq(customers.code, testCode)).run();

        const created = await createCustomer({
          code: testCode,
          name: 'CUSTOMER WITH INVOICES TO PROTECT',
          areaId: sharedAreaId,
        });

        // Insert historical sales invoice linked to this customer
        const testInvoiceId = crypto.randomUUID();
        const testInvoiceNo = 'INV-ADV-TEST-001';
        await db.delete(invoices).where(eq(invoices.invoiceNo, testInvoiceNo)).run();

        db.insert(invoices).values({
          id: testInvoiceId,
          invoiceNo: testInvoiceNo,
          invoiceSeries: 1,
          invoiceDate: '2026-09-28',
          invoiceTime: '14:30:00',
          customerId: created.id,
          dueDate: '2026-10-15',
          paymentTerms: 'CREDIT',
          netAmount: 8500.0,
        }).run();

        // Attempt deletion: MUST throw referential guard exception
        await expect(deleteCustomer(created.id)).rejects.toThrow(
          /Cannot delete customer with active transactions/
        );

        // Verification: Customer MUST still exist
        const customerAfter = await getCustomerById(created.id);
        expect(customerAfter).toBeDefined();
        expect(customerAfter?.id).toBe(created.id);

        // Verification: Invoice MUST still exist (not cascaded away)
        const invoiceAfter = await db.query.invoices.findFirst({
          where: eq(invoices.id, testInvoiceId),
        });
        expect(invoiceAfter).toBeDefined();
        expect(invoiceAfter?.customerId).toBe(created.id);

        // Clean up test invoice and then delete customer
        db.delete(invoices).where(eq(invoices.id, testInvoiceId)).run();
        const deleteRes = await deleteCustomer(created.id);
        expect(deleteRes.success).toBe(true);

        const checkDeleted = await getCustomerById(created.id);
        expect(checkDeleted).toBeUndefined();
      });

      it('blocks deletion of customer when customerOutstandings record exists', async () => {
        const testCode = 'C_OUT_DEL';
        await db.delete(customers).where(eq(customers.code, testCode)).run();

        const created = await createCustomer({
          code: testCode,
          name: 'CUSTOMER WITH OUTSTANDINGS TO PROTECT',
          areaId: sharedAreaId,
        });

        // Insert fake dummy invoice and outstanding
        const testInvId = crypto.randomUUID();
        const testOutId = crypto.randomUUID();

        db.insert(invoices).values({
          id: testInvId,
          invoiceNo: 'INV-ADV-OUT-001',
          invoiceSeries: 1,
          invoiceDate: '2026-09-28',
          invoiceTime: '15:00:00',
          customerId: created.id,
          dueDate: '2026-10-15',
          paymentTerms: 'CREDIT',
          netAmount: 12000.0,
        }).run();

        db.insert(customerOutstandings).values({
          id: testOutId,
          customerId: created.id,
          invoiceId: testInvId,
          invoiceNo: 'INV-ADV-OUT-001',
          invoiceDate: '2026-09-28',
          dueDate: '2026-10-15',
          originalAmount: 12000.0,
          paidAmount: 0,
          balanceAmount: 12000.0,
          status: 'OPEN',
        }).run();

        // Deletion must be rejected
        await expect(deleteCustomer(created.id)).rejects.toThrow(
          /Cannot delete customer with active transactions/
        );

        // Clean up outstandings, invoices, then customer
        db.delete(customerOutstandings).where(eq(customerOutstandings.id, testOutId)).run();
        db.delete(invoices).where(eq(invoices.id, testInvId)).run();
        await deleteCustomer(created.id);
      });
    });
  });

  // =========================================================================
  // 2. SUPPLIER MASTER SUPERVISOR GATE & DELETION GUARD (FEATURE F17)
  // =========================================================================
  describe('2. Feature F17: Supplier Master Supervisor Gate & Deletion Guard', () => {

    describe('2.1 Supervisor Password Gate: Case-Sensitivity & Unauthorized Rejection', () => {
      it('strictly accepts uppercase SPM and rejects all case variants and common bypasses', async () => {
        // Legitimate supervisor password
        expect(await verifySupervisorPassword('SPM')).toBe(true);

        // Case variations: MUST FAIL
        expect(await verifySupervisorPassword('spm')).toBe(false);
        expect(await verifySupervisorPassword('Spm')).toBe(false);
        expect(await verifySupervisorPassword('sPm')).toBe(false);
        expect(await verifySupervisorPassword('spM')).toBe(false);

        // Whitespace padding: MUST FAIL
        expect(await verifySupervisorPassword(' SPM')).toBe(false);
        expect(await verifySupervisorPassword('SPM ')).toBe(false);
        expect(await verifySupervisorPassword('  SPM  ')).toBe(false);

        // Common defaults / empty / injection attempts: MUST FAIL
        expect(await verifySupervisorPassword('')).toBe(false);
        expect(await verifySupervisorPassword('admin')).toBe(false);
        expect(await verifySupervisorPassword('ADMIN')).toBe(false);
        expect(await verifySupervisorPassword('password')).toBe(false);
        expect(await verifySupervisorPassword('1234')).toBe(false);
        expect(await verifySupervisorPassword('SUPERVISOR')).toBe(false);
      });

      it('blocks unauthorized edits when invalid supervisor password is provided to updateSupplier', async () => {
        const testCode = 'S_GATE_01';
        await db.delete(suppliers).where(eq(suppliers.code, testCode)).run();

        const created = await createSupplier({
          code: testCode,
          name: 'ORIGINAL SUPPLIER NAME',
          contactPerson: 'ORIGINAL CONTACT',
          defaultDiscountPct: 3.5,
        });

        // 1. Attempt update with lowercase 'spm'
        await expect(
          updateSupplier(
            {
              id: created.id,
              code: testCode,
              name: 'ATTEMPTED UNAUTHORIZED RENAME',
              defaultDiscountPct: 10.0,
            },
            'spm'
          )
        ).rejects.toThrow(/Incorrect supervisor password. Edit rejected./);

        // 2. Attempt update with mixed case 'Spm'
        await expect(
          updateSupplier(
            {
              id: created.id,
              code: testCode,
              name: 'ATTEMPTED UNAUTHORIZED RENAME',
              defaultDiscountPct: 10.0,
            },
            'Spm'
          )
        ).rejects.toThrow(/Incorrect supervisor password. Edit rejected./);

        // 3. Attempt update with 'admin'
        await expect(
          updateSupplier(
            {
              id: created.id,
              code: testCode,
              name: 'ATTEMPTED UNAUTHORIZED RENAME',
              defaultDiscountPct: 10.0,
            },
            'admin'
          )
        ).rejects.toThrow(/Incorrect supervisor password. Edit rejected./);

        // 4. Attempt update with empty string ''
        await expect(
          updateSupplier(
            {
              id: created.id,
              code: testCode,
              name: 'ATTEMPTED UNAUTHORIZED RENAME',
              defaultDiscountPct: 10.0,
            },
            ''
          )
        ).rejects.toThrow(/Incorrect supervisor password. Edit rejected./);

        // Verify record in database remains unmodified
        const suppAfterFailedEdits = await getSupplierById(created.id);
        expect(suppAfterFailedEdits?.name).toBe('ORIGINAL SUPPLIER NAME');
        expect(suppAfterFailedEdits?.defaultDiscountPct).toBe(3.5);

        // 5. Authorized update with exact 'SPM' succeeds
        const authRes = await updateSupplier(
          {
            id: created.id,
            code: testCode,
            name: 'AUTHORIZED UPDATED SUPPLIER',
            defaultDiscountPct: 5.0,
          },
          'SPM'
        );
        expect(authRes.success).toBe(true);

        const suppAfterAuth = await getSupplierById(created.id);
        expect(suppAfterAuth?.name).toBe('AUTHORIZED UPDATED SUPPLIER');
        expect(suppAfterAuth?.defaultDiscountPct).toBe(5.0);

        // Clean up
        await deleteSupplier(created.id);
      });
    });

    describe('2.2 Supplier Payables Calculation (F4)', () => {
      it('calculates total purchases, total payments, and outstanding payables with precision', async () => {
        const testCode = 'S_PAY_01';
        await db.delete(suppliers).where(eq(suppliers.code, testCode)).run();

        const created = await createSupplier({
          code: testCode,
          name: 'PAYABLES CALCULATION TEST SUPPLIER',
          openingBalance: 10000.0,
          currentBalance: 32500.0,
        });

        // Insert 2 purchase bills for this supplier
        const purId1 = crypto.randomUUID();
        const purId2 = crypto.randomUUID();
        const pmtId1 = crypto.randomUUID();

        db.insert(purchases).values({
          id: purId1,
          inwardNo: 'GRN-ADV-001',
          supplierId: created.id,
          supplierBillNo: 'BILL-1001',
          supplierBillDate: '2026-09-01',
          inwardDate: '2026-09-02',
          dueDate: '2026-10-02',
          netAmount: 25000.0,
        }).run();

        db.insert(purchases).values({
          id: purId2,
          inwardNo: 'GRN-ADV-002',
          supplierId: created.id,
          supplierBillNo: 'BILL-1002',
          supplierBillDate: '2026-09-10',
          inwardDate: '2026-09-11',
          dueDate: '2026-10-11',
          netAmount: 15000.0,
        }).run();

        // Insert 1 supplier payment disbursement
        db.insert(supplierPayments).values({
          id: pmtId1,
          paymentNo: 'PMT-ADV-001',
          paymentDate: '2026-09-15',
          supplierId: created.id,
          totalAmount: 17500.0,
        }).run();

        // Fetch Payables Summary
        const summary = await getSupplierPayablesSummary(created.id);
        expect(summary.supplierCode).toBe(testCode);
        expect(summary.openingBalance).toBe(10000.0);
        expect(summary.totalPurchases).toBe(40000.0); // 25000 + 15000
        expect(summary.purchaseCount).toBe(2);
        expect(summary.totalPayments).toBe(17500.0);
        expect(summary.paymentCount).toBe(1);
        expect(summary.outstandingPayable).toBe(32500.0); // Set on currentBalance

        // Clean up transactions
        db.delete(supplierPayments).where(eq(supplierPayments.id, pmtId1)).run();
        db.delete(purchases).where(eq(purchases.id, purId1)).run();
        db.delete(purchases).where(eq(purchases.id, purId2)).run();

        // Clean up supplier after zeroing balance
        await db.update(suppliers).set({ currentBalance: 0 }).where(eq(suppliers.id, created.id)).run();
        await deleteSupplier(created.id);
      });
    });

    describe('2.3 Supplier Referential Deletion Guard: Open Balances & Purchase Invoices', () => {
      it('blocks deletion when supplier has positive open payable balance', async () => {
        const testCode = 'S_BAL_POS';
        await db.delete(suppliers).where(eq(suppliers.code, testCode)).run();

        const created = await createSupplier({
          code: testCode,
          name: 'SUPPLIER WITH POSITIVE PAYABLE',
          currentBalance: 12500.5,
        });

        await expect(deleteSupplier(created.id)).rejects.toThrow(
          /Cannot delete supplier with open payable balance/
        );

        const check = await getSupplierById(created.id);
        expect(check).toBeDefined();

        // Clean up
        await db.update(suppliers).set({ currentBalance: 0 }).where(eq(suppliers.id, created.id)).run();
        await deleteSupplier(created.id);
      });

      it('blocks deletion when supplier has negative open balance (advance/debit balance)', async () => {
        const testCode = 'S_BAL_NEG';
        await db.delete(suppliers).where(eq(suppliers.code, testCode)).run();

        const created = await createSupplier({
          code: testCode,
          name: 'SUPPLIER WITH ADVANCE DEBIT BALANCE',
          currentBalance: -5000.0,
        });

        await expect(deleteSupplier(created.id)).rejects.toThrow(
          /Cannot delete supplier with open payable balance/
        );

        const check = await getSupplierById(created.id);
        expect(check).toBeDefined();

        // Clean up
        await db.update(suppliers).set({ currentBalance: 0 }).where(eq(suppliers.id, created.id)).run();
        await deleteSupplier(created.id);
      });

      it('blocks deletion when supplier currentBalance is 0 but purchase bills exist', async () => {
        const testCode = 'S_PUR_DEL';
        await db.delete(suppliers).where(eq(suppliers.code, testCode)).run();

        const created = await createSupplier({
          code: testCode,
          name: 'SUPPLIER WITH PURCHASE BILLS',
          currentBalance: 0, // Balance cleared, but history exists
        });

        const testPurId = crypto.randomUUID();
        db.insert(purchases).values({
          id: testPurId,
          inwardNo: 'GRN-ADV-DEL-01',
          supplierId: created.id,
          supplierBillNo: 'BILL-HIST-01',
          supplierBillDate: '2026-09-01',
          inwardDate: '2026-09-02',
          dueDate: '2026-10-02',
          netAmount: 5000.0,
        }).run();

        // Deletion must be blocked due to purchase bill history
        await expect(deleteSupplier(created.id)).rejects.toThrow(
          /Cannot delete supplier with active purchase bills/
        );

        // Supplier must still exist
        const check = await getSupplierById(created.id);
        expect(check).toBeDefined();

        // Clean up purchase and delete supplier
        db.delete(purchases).where(eq(purchases.id, testPurId)).run();
        const delRes = await deleteSupplier(created.id);
        expect(delRes.success).toBe(true);
      });
    });
  });

  // =========================================================================
  // 3. AUXILIARY MASTERS — AREA DELETION & TAX SLAB IMMUTABILITY (FEATURE F18)
  // =========================================================================
  describe('3. Feature F18: Auxiliary Masters — Area Guard & Tax Slab Immutability', () => {

    describe('3.1 Area Deletion Guard: Active Linked Customers (AAED.PRG:91)', () => {
      it('blocks deletion of area when active customer accounts are linked', async () => {
        const areaCode = 'A_LINK_01';
        await db.delete(areas).where(eq(areas.code, areaCode)).run();

        const createdArea = await createArea({
          code: areaCode,
          name: 'AREA WITH ACTIVE CUSTOMERS',
          district: 'TEST DISTRICT',
        });

        // Link customer to this area
        const custCode = 'C_LINK_A';
        await db.delete(customers).where(eq(customers.code, custCode)).run();

        const createdCust = await createCustomer({
          code: custCode,
          name: 'CUSTOMER IN PROTECTED AREA',
          areaId: createdArea.id,
        });

        // Attempt deleting area: MUST FAIL
        await expect(deleteArea(createdArea.id)).rejects.toThrow(
          /Cannot delete area containing active customer accounts/
        );

        // Area must still exist
        const areasList = await getAreas();
        const areaAfter = areasList.find((a) => a.id === createdArea.id);
        expect(areaAfter).toBeDefined();

        // Now delete linked customer, then area deletion should succeed
        await deleteCustomer(createdCust.id);
        const delAreaRes = await deleteArea(createdArea.id);
        expect(delAreaRes.success).toBe(true);

        const areasListAfter = await getAreas();
        expect(areasListAfter.find((a) => a.id === createdArea.id)).toBeUndefined();
      });
    });

    describe('3.2 Tax Slab Immutability: Slab 01 (0% Nil Exempt) (TAXAED.PRG:66)', () => {
      it('strictly forbids modifying tax slab 01 rates or description', async () => {
        // Attempting to modify tax rates of slab '01'
        await expect(
          updateTaxSlab({
            code: '01',
            description: 'ATTEMPT OVERWRITE EXEMPT SLAB',
            cgstRate: 5.0,
            sgstRate: 5.0,
            igstRate: 10.0,
          })
        ).rejects.toThrow(/Exempted Tax Code \(01\) is protected/);

        // Attempting with padded whitespace ' 01 '
        await expect(
          updateTaxSlab({
            code: ' 01 ',
            description: 'WHITESPACE PADDED ATTEMPT',
            cgstRate: 2.5,
            sgstRate: 2.5,
            igstRate: 5.0,
          })
        ).rejects.toThrow(/Exempted Tax Code \(01\) is protected/);

        // Verify in DB that Tax Slab '01' remained completely intact
        const slabs = await getTaxSlabs();
        const slab01 = slabs.find((s) => s.code === '01');
        expect(slab01).toBeDefined();
        expect(slab01?.cgstRate).toBe(0);
        expect(slab01?.sgstRate).toBe(0);
        expect(slab01?.igstRate).toBe(0);
        expect(slab01?.isExempt).toBe(true);
      });

      it('strictly forbids deleting tax slab 01', async () => {
        // Attempt deletion of '01'
        await expect(deleteTaxSlab('01')).rejects.toThrow(
          /Exempted Tax Code \(01\) is protected/
        );

        // Verify slab '01' still exists in database
        const slabs = await getTaxSlabs();
        const slab01 = slabs.find((s) => s.code === '01');
        expect(slab01).toBeDefined();
      });

      it('allows updating non-exempt tax slabs and returns the future billing warning', async () => {
        const updateRes = await updateTaxSlab({
          code: '02',
          description: '12% GST (CONFIRMED STANDARD)',
          cgstRate: 6.0,
          sgstRate: 6.0,
          igstRate: 12.0,
        });

        expect(updateRes.success).toBe(true);
        expect(updateRes.warning).toBe('Note: Modifying tax slab rates affects future billing only');

        const slabs = await getTaxSlabs();
        const slab02 = slabs.find((s) => s.code === '02');
        expect(slab02?.cgstRate).toBe(6.0);
        expect(slab02?.sgstRate).toBe(6.0);
        expect(slab02?.igstRate).toBe(12.0);
      });

      it('blocks deletion of active tax slab when catalog products are assigned to it', async () => {
        // Slab '03' (18% GST) is typically assigned to catalog products
        // Verify products table has products with taxCode '03'
        const prodCount = await db.select({ count: sql<number>`COUNT(*)` })
          .from(products)
          .where(eq(products.taxCode, '03'))
          .get();

        if (prodCount && prodCount.count > 0) {
          await expect(deleteTaxSlab('03')).rejects.toThrow(
            /Cannot delete tax slab assigned to catalog products/
          );

          const slabs = await getTaxSlabs();
          expect(slabs.find((s) => s.code === '03')).toBeDefined();
        }
      });
    });
  });
});
