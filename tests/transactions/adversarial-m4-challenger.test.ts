import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../src/lib/db';
import {
  products,
  productBatches,
  customers,
  suppliers,
  companies,
  taxSlabs,
  areas,
  salesmen,
} from '../../src/lib/db/schema/masters';
import {
  salesReturns,
  salesReturnItems,
  creditNotes,
  debitNotes,
  invoices,
  invoiceItems,
} from '../../src/lib/db/schema/transactions';
import { customerOutstandings } from '../../src/lib/db/schema/ledgers';
import {
  createSalesInvoice,
  createInlineCustomer,
  getBatchesForProduct,
} from '../../src/app/billing/actions';
import { createCreditOrDebitNote } from '../../src/app/billing/notes/actions';
import { createSalesReturn } from '../../src/app/billing/returns/actions';
import {
  shortcutRegistry,
  RegisteredEntry,
} from '../../src/lib/keyboard/useKeyboardShortcuts';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';

describe('Adversarial Challenger Suite: Milestone 4 Transaction Workflows', () => {
  let testCompanyId: string;
  let testAreaId: string;
  let testSalesmanId: string;
  let testCustomerId: string;
  let testSupplierId: string;
  let testProductId: string;
  let testBatchId: string;

  beforeAll(async () => {
    // 1. Setup company
    const comp = await db.query.companies.findFirst();
    if (comp) {
      testCompanyId = comp.id;
    } else {
      testCompanyId = crypto.randomUUID();
      db.insert(companies).values({
        id: testCompanyId,
        code: 'CMP_CHALL',
        name: 'CHALLENGER PHARMA LABS',
        isActive: true,
      }).run();
    }

    // 2. Setup area
    const area = await db.query.areas.findFirst();
    if (area) {
      testAreaId = area.id;
    } else {
      testAreaId = crypto.randomUUID();
      db.insert(areas).values({
        id: testAreaId,
        code: 'AR_CHALL',
        name: 'CHALLENGER STRESS ZONE',
        isActive: true,
      }).run();
    }

    // 3. Setup salesman
    const sm = await db.query.salesmen.findFirst();
    if (sm) {
      testSalesmanId = sm.id;
    } else {
      testSalesmanId = crypto.randomUUID();
      db.insert(salesmen).values({
        id: testSalesmanId,
        code: 'SM_CHALL',
        name: 'CHALLENGER SALES REP',
        isActive: true,
      }).run();
    }

    // 4. Create isolated test customer
    testCustomerId = crypto.randomUUID();
    const custCode = 'CC_' + crypto.randomBytes(3).toString('hex').toUpperCase();
    db.insert(customers).values({
      id: testCustomerId,
      code: custCode,
      name: 'CHALLENGER MEDICO PHARMACY',
      areaId: testAreaId,
      salesmanId: testSalesmanId,
      billingType: 'L',
      closingBalance: 50000,
      dlExpiryDate: '2030-12-31',
      isActive: true,
    }).run();

    // 5. Create isolated test supplier with substantial payable
    testSupplierId = crypto.randomUUID();
    const supCode = 'CS_' + crypto.randomBytes(3).toString('hex').toUpperCase();
    db.insert(suppliers).values({
      id: testSupplierId,
      code: supCode,
      name: 'CHALLENGER BULK DRUG SUPPLIER',
      currentBalance: 75000,
      isActive: true,
    }).run();

    // 6. Create product & batch
    testProductId = crypto.randomUUID();
    const prodCode = 'CP_' + crypto.randomBytes(3).toString('hex').toUpperCase();
    db.insert(products).values({
      id: testProductId,
      code: prodCode,
      name: 'CEFIXIME 200MG DISPERSIBLE',
      companyId: testCompanyId,
      supplierId: testSupplierId,
      taxCode: '02',
      packaging: '10x10',
      hsnCode: '30049099',
      totalStockOnHand: 200,
      isActive: true,
    }).run();

    testBatchId = crypto.randomUUID();
    db.insert(productBatches).values({
      id: testBatchId,
      productId: testProductId,
      batchNo: 'CHALL-B01',
      expiryDate: '2028-12-31',
      purchaseRate: 80.0,
      sellingRate: 110.0,
      mrp: 145.0,
      stockQty: 200,
      quarantineQty: 0,
      taxCode: '02',
      isActive: true,
    }).run();
  });

  // ==========================================================================
  // Section 1: Debit Note Supplier Balances & Party Selection Stress Tests
  // ==========================================================================
  describe('1. Debit Note Supplier Balances & Party Selection', () => {
    it('successfully creates Debit Note with partyType=SUPPLIER and accurately decrements supplier payable', async () => {
      const initialSupplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });
      const initialBalance = initialSupplier?.currentBalance || 75000;

      const res = await createCreditOrDebitNote({
        isDebitNote: true,
        partyType: 'SUPPLIER',
        partyId: testSupplierId,
        date: '2026-09-29',
        noteType: 'SHORTAGE_DAMAGE',
        remarks: 'Adversarial debit note verification',
        items: [
          {
            productId: testProductId,
            batchNo: 'CHALL-B01',
            expiryDate: '2028-12-31',
            quantity: 5,
            rate: 80.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.noteNo).toMatch(/^DN-\d{6}$/);
      expect(res.totalAmount).toBeGreaterThan(0);

      const updatedSupplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });
      expect(updatedSupplier?.currentBalance).toBeCloseTo(
        initialBalance - res.totalAmount!,
        2
      );

      // Verify debit note record persisted in DB
      const dnRecord = await db.query.debitNotes.findFirst({
        where: eq(debitNotes.id, res.noteId!),
      });
      expect(dnRecord).toBeDefined();
      expect(dnRecord?.partyType).toBe('SUPPLIER');
      expect(dnRecord?.partyId).toBe(testSupplierId);
      expect(dnRecord?.totalAmount).toBe(res.totalAmount);
    });

    it('rejects cross-party injection: submitting customer ID with partyType=SUPPLIER throws "Supplier not found"', async () => {
      const res = await createCreditOrDebitNote({
        isDebitNote: true,
        partyType: 'SUPPLIER',
        partyId: testCustomerId, // Injected customer ID where supplier expected
        date: '2026-09-29',
        noteType: 'SHORTAGE_DAMAGE',
        items: [
          {
            productId: testProductId,
            batchNo: 'CHALL-B01',
            expiryDate: '2028-12-31',
            quantity: 2,
            rate: 80.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Supplier not found');
    });

    it('rejects Debit Note with nonexistent UUID partyId', async () => {
      const nonExistentUuid = crypto.randomUUID();
      const res = await createCreditOrDebitNote({
        isDebitNote: true,
        partyType: 'SUPPLIER',
        partyId: nonExistentUuid,
        date: '2026-09-29',
        noteType: 'SHORTAGE_DAMAGE',
        items: [
          {
            productId: testProductId,
            batchNo: 'CHALL-B01',
            expiryDate: '2028-12-31',
            quantity: 1,
            rate: 80.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Supplier not found');
    });

    it('rejects note creation when partyId is empty', async () => {
      const res = await createCreditOrDebitNote({
        isDebitNote: true,
        partyType: 'SUPPLIER',
        partyId: '',
        date: '2026-09-29',
        noteType: 'SHORTAGE_DAMAGE',
        items: [
          {
            productId: testProductId,
            batchNo: 'CHALL-B01',
            expiryDate: '2028-12-31',
            quantity: 1,
            rate: 80.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Party is required');
    });

    it('enforces sequential cumulative deductions on supplier balance across multiple debit notes', async () => {
      const supStart = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });
      const startBalance = supStart?.currentBalance || 0;

      // Note 1: 3 units @ 50
      const note1 = await createCreditOrDebitNote({
        isDebitNote: true,
        partyType: 'SUPPLIER',
        partyId: testSupplierId,
        date: '2026-09-29',
        noteType: 'SHORTAGE_DAMAGE',
        items: [{ productId: testProductId, batchNo: 'CHALL-B01', expiryDate: '2028-12-31', quantity: 3, rate: 50.0, taxCode: '02' }],
      });
      expect(note1.success).toBe(true);

      // Note 2: 5 units @ 40
      const note2 = await createCreditOrDebitNote({
        isDebitNote: true,
        partyType: 'SUPPLIER',
        partyId: testSupplierId,
        date: '2026-09-29',
        noteType: 'SHORTAGE_DAMAGE',
        items: [{ productId: testProductId, batchNo: 'CHALL-B01', expiryDate: '2028-12-31', quantity: 5, rate: 40.0, taxCode: '02' }],
      });
      expect(note2.success).toBe(true);

      const supEnd = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });

      const totalDeducted = (note1.totalAmount || 0) + (note2.totalAmount || 0);
      expect(supEnd?.currentBalance).toBeCloseTo(startBalance - totalDeducted, 2);
    });

    it('rejects Rate Difference Debit Note when Old Rate <= New Rate', async () => {
      const res = await createCreditOrDebitNote({
        isDebitNote: true,
        partyType: 'SUPPLIER',
        partyId: testSupplierId,
        date: '2026-09-29',
        noteType: 'RATE_DIFFERENCE',
        items: [
          {
            productId: testProductId,
            batchNo: 'CHALL-B01',
            expiryDate: '2028-12-31',
            quantity: 10,
            rate: 0,
            oldRate: 80.0,
            newRate: 90.0, // Invalid: oldRate is lower than newRate
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Rate Difference requires Old Rate (80) > New Rate (90)');
    });

    it('rejects Debit Note with zero or negative quantity and zero or negative rate', async () => {
      // Zero quantity
      const resZeroQty = await createCreditOrDebitNote({
        isDebitNote: true,
        partyType: 'SUPPLIER',
        partyId: testSupplierId,
        date: '2026-09-29',
        noteType: 'SHORTAGE_DAMAGE',
        items: [{ productId: testProductId, batchNo: 'CHALL-B01', expiryDate: '2028-12-31', quantity: 0, rate: 50.0, taxCode: '02' }],
      });
      expect(resZeroQty.success).toBe(false);
      expect(resZeroQty.error).toContain('Quantity must be greater than zero');

      // Negative quantity
      const resNegQty = await createCreditOrDebitNote({
        isDebitNote: true,
        partyType: 'SUPPLIER',
        partyId: testSupplierId,
        date: '2026-09-29',
        noteType: 'SHORTAGE_DAMAGE',
        items: [{ productId: testProductId, batchNo: 'CHALL-B01', expiryDate: '2028-12-31', quantity: -5, rate: 50.0, taxCode: '02' }],
      });
      expect(resNegQty.success).toBe(false);
      expect(resNegQty.error).toContain('Quantity must be greater than zero');

      // Zero rate
      const resZeroRate = await createCreditOrDebitNote({
        isDebitNote: true,
        partyType: 'SUPPLIER',
        partyId: testSupplierId,
        date: '2026-09-29',
        noteType: 'SHORTAGE_DAMAGE',
        items: [{ productId: testProductId, batchNo: 'CHALL-B01', expiryDate: '2028-12-31', quantity: 5, rate: 0, taxCode: '02' }],
      });
      expect(resZeroRate.success).toBe(false);
      expect(resZeroRate.error).toContain('Rate must be greater than zero');

      // Negative rate
      const resNegRate = await createCreditOrDebitNote({
        isDebitNote: true,
        partyType: 'SUPPLIER',
        partyId: testSupplierId,
        date: '2026-09-29',
        noteType: 'SHORTAGE_DAMAGE',
        items: [{ productId: testProductId, batchNo: 'CHALL-B01', expiryDate: '2028-12-31', quantity: 5, rate: -20, taxCode: '02' }],
      });
      expect(resNegRate.success).toBe(false);
      expect(resNegRate.error).toContain('Rate must be greater than zero');
    });

    it('verifies Credit Note decrements customer balance and leaves supplier balance intact', async () => {
      const custBefore = await db.query.customers.findFirst({
        where: eq(customers.id, testCustomerId),
      });
      const supBefore = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });

      const res = await createCreditOrDebitNote({
        isDebitNote: false, // CREDIT NOTE
        partyType: 'CUSTOMER',
        partyId: testCustomerId,
        date: '2026-09-29',
        noteType: 'EXPIRY_BROKEN',
        items: [
          {
            productId: testProductId,
            batchId: testBatchId,
            batchNo: 'CHALL-B01',
            expiryDate: '2028-12-31',
            quantity: 2,
            rate: 110.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.noteNo).toMatch(/^CN-\d{6}$/);

      const custAfter = await db.query.customers.findFirst({
        where: eq(customers.id, testCustomerId),
      });
      const supAfter = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });

      // Customer closingBalance decremented
      expect(custAfter?.closingBalance).toBeCloseTo(
        (custBefore?.closingBalance || 0) - res.totalAmount!,
        2
      );
      // Supplier currentBalance UNTOUCHED
      expect(supAfter?.currentBalance).toBe(supBefore?.currentBalance);
    });
  });

  // ==========================================================================
  // Section 2: POS Billing DPCO Violations, Zero-Rate Checks, Inline Party & Shortcuts
  // ==========================================================================
  describe('2. POS Billing DPCO Violations, Zero-Rate Checks & Inline Customer', () => {
    it('strictly throws DPCO Violation error when sellingRate exceeds MRP', async () => {
      const res = await createSalesInvoice({
        customerId: testCustomerId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CREDIT',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_CHALLENGER',
        items: [
          {
            productId: testProductId,
            batchId: testBatchId,
            productName: 'CEFIXIME 200MG DISPERSIBLE',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'CHALL-B01',
            expiryDate: '2028-12-31',
            quantity: 5,
            freeQuantity: 0,
            sellingRate: 150.0, // MRP is 145.0 -> VIOLATION!
            purchaseRate: 80.0,
            mrp: 145.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('DPCO Violation!');
      expect(res.error).toContain('Selling Rate (Rs. 150.00) cannot exceed MRP (Rs. 145.00)');
    });

    it('allows sellingRate equal to MRP at the exact boundary', async () => {
      const res = await createSalesInvoice({
        customerId: testCustomerId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_CHALLENGER',
        items: [
          {
            productId: testProductId,
            batchId: testBatchId,
            productName: 'CEFIXIME 200MG DISPERSIBLE',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'CHALL-B01',
            expiryDate: '2028-12-31',
            quantity: 1,
            freeQuantity: 0,
            sellingRate: 145.0, // Exact MRP
            purchaseRate: 80.0,
            mrp: 145.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.invoiceNo).toBeDefined();
    });

    it('rejects zero selling rate when isReplacement is false', async () => {
      const res = await createSalesInvoice({
        customerId: testCustomerId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_CHALLENGER',
        items: [
          {
            productId: testProductId,
            batchId: testBatchId,
            productName: 'CEFIXIME 200MG DISPERSIBLE',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'CHALL-B01',
            expiryDate: '2028-12-31',
            quantity: 2,
            freeQuantity: 0,
            sellingRate: 0, // Zero rate
            purchaseRate: 80.0,
            mrp: 145.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
            isReplacement: false,
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Selling Rate cannot be zero!');
    });

    it('permits zero selling rate when isReplacement is true (statutory scheme replacement)', async () => {
      const res = await createSalesInvoice({
        customerId: testCustomerId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_CHALLENGER',
        items: [
          {
            productId: testProductId,
            batchId: testBatchId,
            productName: 'CEFIXIME 200MG DISPERSIBLE',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'CHALL-B01',
            expiryDate: '2028-12-31',
            quantity: 1,
            freeQuantity: 0,
            sellingRate: 0, // 0-rate replacement
            purchaseRate: 80.0,
            mrp: 145.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
            isReplacement: true,
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.invoiceNo).toBeDefined();
    });

    it('rejects negative selling rate and zero or negative MRP', async () => {
      // Negative rate
      const resNegRate = await createSalesInvoice({
        customerId: testCustomerId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_CHALLENGER',
        items: [
          {
            productId: testProductId,
            batchId: testBatchId,
            productName: 'CEFIXIME 200MG DISPERSIBLE',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'CHALL-B01',
            expiryDate: '2028-12-31',
            quantity: 1,
            freeQuantity: 0,
            sellingRate: -10,
            purchaseRate: 80.0,
            mrp: 145.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });
      expect(resNegRate.success).toBe(false);
      expect(resNegRate.error).toContain('Selling Rate cannot be zero!');

      // Zero MRP
      const resZeroMrp = await createSalesInvoice({
        customerId: testCustomerId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_CHALLENGER',
        items: [
          {
            productId: testProductId,
            batchId: testBatchId,
            productName: 'CEFIXIME 200MG DISPERSIBLE',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'CHALL-B01',
            expiryDate: '2028-12-31',
            quantity: 1,
            freeQuantity: 0,
            sellingRate: 100.0,
            purchaseRate: 80.0,
            mrp: 0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });
      expect(resZeroMrp.success).toBe(false);
      expect(resZeroMrp.error).toContain('MRP cannot be zero!');
    });

    it('creates inline customer with auto-code, PAN extraction, and phone sanitization', async () => {
      const inlineName = 'INLINE STRESS PHARMA ' + crypto.randomBytes(2).toString('hex').toUpperCase();
      const res = await createInlineCustomer({
        name: inlineName,
        areaId: testAreaId,
        salesmanId: testSalesmanId,
        addressLine1: 'Shop 14, Apollo Bazaar',
        phone: '+91 (987) 654-3210',
        gstin: '33AABCT1332L1Z8',
        dlNo20b: 'TN-DL-20B-9988',
        dlNo21b: 'TN-DL-21B-9988',
        billingType: 'L',
        paymentTerms: 'R',
        creditDays: 30,
        creditLimit: 50000,
      });

      expect(res.success).toBe(true);
      expect(res.customer).toBeDefined();
      expect(res.customer?.name).toBe(inlineName);
      expect(res.customer?.code).toMatch(/^\d{4}$/); // 4-digit zero-padded code
      expect(res.customer?.phone).toBe('919876543210'); // Sanitized digits only
      expect(res.customer?.pan).toBe('AABCT1332L'); // Extracted 10-char PAN from GSTIN
      expect(res.customer?.closingBalance).toBe(0);
      expect(res.customer?.isActive).toBe(true);
    });

    it('rejects inline customer creation when required fields are missing', async () => {
      // Missing name
      const resNoName = await createInlineCustomer({
        name: '   ',
        areaId: testAreaId,
      });
      expect(resNoName.success).toBe(false);
      expect(resNoName.error).toContain('Customer Name is required');

      // Missing area
      const resNoArea = await createInlineCustomer({
        name: 'VALID NAME',
        areaId: '',
      });
      expect(resNoArea.success).toBe(false);
      expect(resNoArea.error).toContain('Area is required');
    });

    it('verifies keyboard shortcut registry prioritization and input-allowance flags', () => {
      let f5Triggered = false;
      let modalF5Triggered = false;

      // Simulate registration of DosWindow action (priority 5)
      const windowEntry: RegisteredEntry = {
        id: 'dos-window-billing-0-F5',
        priority: 5,
        handler: {
          key: 'F5',
          description: 'Save Invoice',
          action: () => { f5Triggered = true; },
          allowInInputs: true,
        },
      };

      // Simulate registration of Modal action (priority 20)
      const modalEntry: RegisteredEntry = {
        id: 'modal-confirm-0-F5',
        priority: 20,
        handler: {
          key: 'F5',
          description: 'Confirm Dialog',
          action: () => { modalF5Triggered = true; },
          allowInInputs: true,
        },
      };

      shortcutRegistry.push(windowEntry);
      shortcutRegistry.push(modalEntry);
      shortcutRegistry.sort((a, b) => b.priority - a.priority);

      // Verify higher priority modal entry comes first
      const topMatch = shortcutRegistry.find((e) => e.handler.key === 'F5');
      expect(topMatch).toBeDefined();
      expect(topMatch?.priority).toBe(20);
      expect(topMatch?.id).toContain('modal-confirm');

      topMatch?.handler.action({ key: 'F5', preventDefault: () => {} } as unknown as KeyboardEvent);
      expect(modalF5Triggered).toBe(true);
      expect(f5Triggered).toBe(false); // Window action did not run due to higher priority modal

      // Cleanup test entries
      const idx1 = shortcutRegistry.indexOf(windowEntry);
      if (idx1 !== -1) shortcutRegistry.splice(idx1, 1);
      const idx2 = shortcutRegistry.indexOf(modalEntry);
      if (idx2 !== -1) shortcutRegistry.splice(idx2, 1);
    });
  });

  // ==========================================================================
  // Section 3: Sales Returns Against Invoices & Restock vs Quarantine Movements
  // ==========================================================================
  describe('3. Sales Returns against Invoices, Restock vs Quarantine Inventory Movements', () => {
    let returnTestBatchId: string;
    let returnTestProdId: string;
    let originalInvoiceId: string;
    let originalInvoiceGrandTotal: number;

    beforeAll(async () => {
      // Create isolated product and batch for invoice return flow
      returnTestProdId = crypto.randomUUID();
      db.insert(products).values({
        id: returnTestProdId,
        code: 'SR_P_' + crypto.randomBytes(3).toString('hex').toUpperCase(),
        name: 'AMOXICILLIN 500MG CAPS',
        companyId: testCompanyId,
        taxCode: '02',
        packaging: '10x10',
        hsnCode: '30049099',
        totalStockOnHand: 100,
        isActive: true,
      }).run();

      returnTestBatchId = crypto.randomUUID();
      db.insert(productBatches).values({
        id: returnTestBatchId,
        productId: returnTestProdId,
        batchNo: 'AMOX-SR-01',
        expiryDate: '2028-10-31',
        purchaseRate: 50.0,
        sellingRate: 75.0,
        mrp: 95.0,
        stockQty: 100,
        quarantineQty: 0,
        taxCode: '02',
        isActive: true,
      }).run();

      // Create an original credit invoice for 20 units
      const invRes = await createSalesInvoice({
        customerId: testCustomerId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CREDIT',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_CHALLENGER',
        items: [
          {
            productId: returnTestProdId,
            batchId: returnTestBatchId,
            productName: 'AMOXICILLIN 500MG CAPS',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'AMOX-SR-01',
            expiryDate: '2028-10-31',
            quantity: 20,
            freeQuantity: 0,
            sellingRate: 75.0,
            purchaseRate: 50.0,
            mrp: 95.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(invRes.success).toBe(true);
      originalInvoiceId = invRes.invoiceId!;
      originalInvoiceGrandTotal = invRes.grandTotal!;

      // Confirm stock was deducted
      const batchAfterInv = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, returnTestBatchId),
      });
      expect(batchAfterInv?.stockQty).toBe(80); // 100 - 20
    });

    it('Sales Return with restockInventory=true restores active stockQty & totalStockOnHand and reduces outstanding balance', async () => {
      const batchBefore = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, returnTestBatchId),
      });
      const prodBefore = await db.query.products.findFirst({
        where: eq(products.id, returnTestProdId),
      });
      const outBefore = await db.query.customerOutstandings.findFirst({
        where: eq(customerOutstandings.invoiceId, originalInvoiceId),
      });

      const restockUnits = 8;
      const res = await createSalesReturn({
        customerId: testCustomerId,
        originalInvoiceId,
        returnDate: '2026-09-29',
        returnType: 'CREDIT_NOTE',
        reason: 'EXCESS_STOCK',
        items: [
          {
            productId: returnTestProdId,
            batchId: returnTestBatchId,
            batchNo: 'AMOX-SR-01',
            expiryDate: '2028-10-31',
            quantity: restockUnits,
            freeQuantity: 0,
            rate: 75.0,
            purchaseRate: 50.0,
            taxCode: '02',
            restockInventory: true, // Restock to saleable
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.returnNo).toMatch(/^SR-\d{6}$/);

      const batchAfter = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, returnTestBatchId),
      });
      const prodAfter = await db.query.products.findFirst({
        where: eq(products.id, returnTestProdId),
      });
      const outAfter = await db.query.customerOutstandings.findFirst({
        where: eq(customerOutstandings.invoiceId, originalInvoiceId),
      });

      // Active stockQty restored
      expect(batchAfter?.stockQty).toBe((batchBefore?.stockQty || 0) + restockUnits);
      // Total stock on hand restored
      expect(prodAfter?.totalStockOnHand).toBe((prodBefore?.totalStockOnHand || 0) + restockUnits);
      // Quarantine untouched
      expect(batchAfter?.quarantineQty).toBe(0);

      // Customer outstanding auto-offset
      expect(outAfter?.paidAmount).toBeCloseTo((outBefore?.paidAmount || 0) + res.grandTotal!, 2);
      expect(outAfter?.balanceAmount).toBeCloseTo((outBefore?.balanceAmount || 0) - res.grandTotal!, 2);
      expect(outAfter?.status).toBe('PARTIALLY_PAID');
    });

    it('Sales Return with restockInventory=false routes strictly to quarantineQty leaving stockQty untouched', async () => {
      const batchBefore = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, returnTestBatchId),
      });
      const prodBefore = await db.query.products.findFirst({
        where: eq(products.id, returnTestProdId),
      });

      const quarantineUnits = 5;
      const res = await createSalesReturn({
        customerId: testCustomerId,
        originalInvoiceId,
        returnDate: '2026-09-29',
        returnType: 'CREDIT_NOTE',
        reason: 'EXPIRED',
        items: [
          {
            productId: returnTestProdId,
            batchId: returnTestBatchId,
            batchNo: 'AMOX-SR-01',
            expiryDate: '2028-10-31',
            quantity: quarantineUnits,
            freeQuantity: 0,
            rate: 75.0,
            purchaseRate: 50.0,
            taxCode: '02',
            restockInventory: false, // Route to quarantine!
          },
        ],
      });

      expect(res.success).toBe(true);

      const batchAfter = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, returnTestBatchId),
      });
      const prodAfter = await db.query.products.findFirst({
        where: eq(products.id, returnTestProdId),
      });

      // Saleable stock must remain UNCHANGED
      expect(batchAfter?.stockQty).toBe(batchBefore?.stockQty);
      expect(prodAfter?.totalStockOnHand).toBe(prodBefore?.totalStockOnHand);

      // Quarantine stock MUST be incremented
      expect(batchAfter?.quarantineQty).toBe((batchBefore?.quarantineQty || 0) + quarantineUnits);
    });

    it('full return offsets invoice outstanding to exactly 0 and marks status PAID', async () => {
      const outBefore = await db.query.customerOutstandings.findFirst({
        where: eq(customerOutstandings.invoiceId, originalInvoiceId),
      });
      const remainingBalance = outBefore?.balanceAmount || 0;
      expect(remainingBalance).toBeGreaterThan(0);

      // Return remaining 7 units
      const res = await createSalesReturn({
        customerId: testCustomerId,
        originalInvoiceId,
        returnDate: '2026-09-29',
        returnType: 'CREDIT_NOTE',
        reason: 'DAMAGED',
        items: [
          {
            productId: returnTestProdId,
            batchId: returnTestBatchId,
            batchNo: 'AMOX-SR-01',
            expiryDate: '2028-10-31',
            quantity: 7,
            freeQuantity: 0,
            rate: 75.0,
            purchaseRate: 50.0,
            taxCode: '02',
            restockInventory: false,
          },
        ],
      });

      expect(res.success).toBe(true);

      const outAfter = await db.query.customerOutstandings.findFirst({
        where: eq(customerOutstandings.invoiceId, originalInvoiceId),
      });

      // Balance is now 0 and invoice is PAID
      expect(outAfter?.balanceAmount).toBeCloseTo(0, 1);
      expect(outAfter?.status).toBe('PAID');
    });

    it('includes freeQuantity in return inventory adjustments for both restock and quarantine', async () => {
      const batchBefore = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, returnTestBatchId),
      });

      // Return 2 billed + 1 free = 3 total units restocked
      const res = await createSalesReturn({
        customerId: testCustomerId,
        returnDate: '2026-09-29',
        returnType: 'CREDIT_NOTE',
        reason: 'EXCESS_STOCK',
        items: [
          {
            productId: returnTestProdId,
            batchId: returnTestBatchId,
            batchNo: 'AMOX-SR-01',
            expiryDate: '2028-10-31',
            quantity: 2,
            freeQuantity: 1, // 1 free goods returned
            rate: 75.0,
            purchaseRate: 50.0,
            taxCode: '02',
            restockInventory: true,
          },
        ],
      });

      expect(res.success).toBe(true);

      const batchAfter = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, returnTestBatchId),
      });

      // Stock should increment by 3 (2 billed + 1 free)
      expect(batchAfter?.stockQty).toBe((batchBefore?.stockQty || 0) + 3);
    });

    it('rejects invalid sales return with negative quantity or negative rate', async () => {
      // Negative quantity
      const resNegQty = await createSalesReturn({
        customerId: testCustomerId,
        returnDate: '2026-09-29',
        returnType: 'CREDIT_NOTE',
        reason: 'DAMAGED',
        items: [
          {
            productId: returnTestProdId,
            batchNo: 'AMOX-SR-01',
            expiryDate: '2028-10-31',
            quantity: -3,
            rate: 75.0,
            purchaseRate: 50.0,
            taxCode: '02',
            restockInventory: false,
          },
        ],
      });
      expect(resNegQty.success).toBe(false);
      expect(resNegQty.error).toContain('Returned quantity must be greater than zero');

      // Negative rate
      const resNegRate = await createSalesReturn({
        customerId: testCustomerId,
        returnDate: '2026-09-29',
        returnType: 'CREDIT_NOTE',
        reason: 'DAMAGED',
        items: [
          {
            productId: returnTestProdId,
            batchNo: 'AMOX-SR-01',
            expiryDate: '2028-10-31',
            quantity: 2,
            rate: -10.0,
            purchaseRate: 50.0,
            taxCode: '02',
            restockInventory: false,
          },
        ],
      });
      expect(resNegRate.success).toBe(false);
      expect(resNegRate.error).toContain('Return rate cannot be negative');

      // Empty items array
      const resEmpty = await createSalesReturn({
        customerId: testCustomerId,
        returnDate: '2026-09-29',
        returnType: 'CREDIT_NOTE',
        reason: 'DAMAGED',
        items: [],
      });
      expect(resEmpty.success).toBe(false);
      expect(resEmpty.error).toContain('Sales return must contain at least 1 line item');

      // Nonexistent customer
      const resBadCust = await createSalesReturn({
        customerId: crypto.randomUUID(),
        returnDate: '2026-09-29',
        returnType: 'CREDIT_NOTE',
        reason: 'DAMAGED',
        items: [
          {
            productId: returnTestProdId,
            batchNo: 'AMOX-SR-01',
            expiryDate: '2028-10-31',
            quantity: 1,
            rate: 75.0,
            purchaseRate: 50.0,
            taxCode: '02',
            restockInventory: false,
          },
        ],
      });
      expect(resBadCust.success).toBe(false);
      expect(resBadCust.error).toContain('Customer not found');
    });

    it('enforces atomic rollback: DPCO violation on item 2 prevents any stock deduction on item 1', async () => {
      const batchBefore = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, returnTestBatchId),
      });
      const stockBefore = batchBefore?.stockQty || 0;

      const res = await createSalesInvoice({
        customerId: testCustomerId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_CHALLENGER',
        items: [
          {
            productId: returnTestProdId,
            batchId: returnTestBatchId,
            productName: 'AMOXICILLIN 500MG CAPS',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'AMOX-SR-01',
            expiryDate: '2028-10-31',
            quantity: 5, // Valid line 1
            freeQuantity: 0,
            sellingRate: 75.0,
            purchaseRate: 50.0,
            mrp: 95.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
          {
            productId: testProductId,
            batchId: testBatchId,
            productName: 'CEFIXIME 200MG DISPERSIBLE',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'CHALL-B01',
            expiryDate: '2028-12-31',
            quantity: 2,
            freeQuantity: 0,
            sellingRate: 199.0, // VIOLATION: MRP is 145.0
            purchaseRate: 80.0,
            mrp: 145.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('DPCO Violation!');

      // Verify line 1 batch stock was NOT decremented (zero side effects)
      const batchAfter = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, returnTestBatchId),
      });
      expect(batchAfter?.stockQty).toBe(stockBefore);
    });

    it('enforces atomic rollback: insufficient stock on item 2 leaves item 1 stock completely untouched', async () => {
      const batchBefore1 = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, returnTestBatchId),
      });
      const stockBefore1 = batchBefore1?.stockQty || 0;

      const res = await createSalesInvoice({
        customerId: testCustomerId,
        invoiceDate: '2026-09-29',
        paymentTerms: 'CASH',
        isInterstate: false,
        preparedBy: 'ADVERSARIAL_CHALLENGER',
        items: [
          {
            productId: returnTestProdId,
            batchId: returnTestBatchId,
            productName: 'AMOXICILLIN 500MG CAPS',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'AMOX-SR-01',
            expiryDate: '2028-10-31',
            quantity: 5,
            freeQuantity: 0,
            sellingRate: 75.0,
            purchaseRate: 50.0,
            mrp: 95.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
          {
            productId: testProductId,
            batchId: testBatchId,
            productName: 'CEFIXIME 200MG DISPERSIBLE',
            packaging: '10x10',
            hsnCode: '30049099',
            batchNo: 'CHALL-B01',
            expiryDate: '2028-12-31',
            quantity: 99999, // Insufficient stock!
            freeQuantity: 0,
            sellingRate: 110.0,
            purchaseRate: 80.0,
            mrp: 145.0,
            tradeDiscountPct: 0,
            taxCode: '02',
            taxPct: 12,
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Insufficient stock');

      // Verify line 1 stock was NOT decremented
      const batchAfter1 = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, returnTestBatchId),
      });
      expect(batchAfter1?.stockQty).toBe(stockBefore1);
    });

    it('handles hybrid sales return: item 1 restocked, item 2 quarantined in a single transaction voucher', async () => {
      const batchBefore1 = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, returnTestBatchId),
      });
      const batchBefore2 = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatchId),
      });
      const custBefore = await db.query.customers.findFirst({
        where: eq(customers.id, testCustomerId),
      });

      const res = await createSalesReturn({
        customerId: testCustomerId,
        returnDate: '2026-09-29',
        returnType: 'CREDIT_NOTE',
        reason: 'DAMAGED',
        items: [
          {
            productId: returnTestProdId,
            batchId: returnTestBatchId,
            batchNo: 'AMOX-SR-01',
            expiryDate: '2028-10-31',
            quantity: 3,
            freeQuantity: 0,
            rate: 75.0,
            purchaseRate: 50.0,
            taxCode: '02',
            restockInventory: true, // Restock
          },
          {
            productId: testProductId,
            batchId: testBatchId,
            batchNo: 'CHALL-B01',
            expiryDate: '2028-12-31',
            quantity: 2,
            freeQuantity: 0,
            rate: 110.0,
            purchaseRate: 80.0,
            taxCode: '02',
            restockInventory: false, // Quarantine
          },
        ],
      });

      expect(res.success).toBe(true);

      const batchAfter1 = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, returnTestBatchId),
      });
      const batchAfter2 = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, testBatchId),
      });
      const custAfter = await db.query.customers.findFirst({
        where: eq(customers.id, testCustomerId),
      });

      // Item 1 (Restock): stockQty increased by 3, quarantineQty unchanged
      expect(batchAfter1?.stockQty).toBe((batchBefore1?.stockQty || 0) + 3);
      expect(batchAfter1?.quarantineQty).toBe(batchBefore1?.quarantineQty || 0);

      // Item 2 (Quarantine): quarantineQty increased by 2, stockQty unchanged
      expect(batchAfter2?.quarantineQty).toBe((batchBefore2?.quarantineQty || 0) + 2);
      expect(batchAfter2?.stockQty).toBe(batchBefore2?.stockQty);

      // Customer closingBalance credited by total return amount
      expect(custAfter?.closingBalance).toBeCloseTo(
        (custBefore?.closingBalance || 0) - res.grandTotal!,
        2
      );
    });

    it('FEFO ordering: getBatchesForProduct returns active batches strictly ordered by expiryDate ascending', async () => {
      // Add earlier expiry batch
      const earlyBatchId = crypto.randomUUID();
      db.insert(productBatches).values({
        id: earlyBatchId,
        productId: testProductId,
        batchNo: 'CHALL-B-EARLY',
        expiryDate: '2027-01-01', // Earlier than 2028-12-31
        purchaseRate: 80.0,
        sellingRate: 110.0,
        mrp: 145.0,
        stockQty: 50,
        quarantineQty: 0,
        taxCode: '02',
        isActive: true,
      }).run();

      const batches = await getBatchesForProduct(testProductId);
      expect(batches.length).toBeGreaterThanOrEqual(2);

      // Verify strict chronological order
      for (let i = 0; i < batches.length - 1; i++) {
        expect(batches[i].expiryDate <= batches[i + 1].expiryDate).toBe(true);
      }
      expect(batches[0].batchNo).toBe('CHALL-B-EARLY');
    });

    it('handles multi-item debit note with exact combined payable reduction on supplier', async () => {
      const supBefore = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });

      const res = await createCreditOrDebitNote({
        isDebitNote: true,
        partyType: 'SUPPLIER',
        partyId: testSupplierId,
        date: '2026-09-29',
        noteType: 'SHORTAGE_DAMAGE',
        items: [
          {
            productId: returnTestProdId,
            batchNo: 'AMOX-SR-01',
            expiryDate: '2028-10-31',
            quantity: 4,
            rate: 50.0,
            taxCode: '02',
          },
          {
            productId: testProductId,
            batchNo: 'CHALL-B01',
            expiryDate: '2028-12-31',
            quantity: 3,
            rate: 80.0,
            taxCode: '02',
          },
        ],
      });

      expect(res.success).toBe(true);

      const supAfter = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, testSupplierId),
      });

      expect(supAfter?.currentBalance).toBeCloseTo(
        (supBefore?.currentBalance || 0) - res.totalAmount!,
        2
      );
    });
  });
});

