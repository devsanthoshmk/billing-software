import { db } from './index';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import {
  taxSlabs,
  companies,
  areas,
  salesmen,
  doctors,
  customers,
  suppliers,
  products,
  productBatches,
  systemConfig,
  systemControls,
  invoices,
  invoiceItems,
  customerOutstandings,
  purchases,
  purchaseItems,
  customerReceipts,
  customerReceiptAllocations,
} from './schema';

export async function seed() {
  console.log('🌱 Starting Siva Pharmacy ERP Database Seeding...');

  // Ensure migrations are applied
  try {
    const migrationsFolder = path.join(process.cwd(), 'drizzle', 'migrations');
    migrate(db, { migrationsFolder });
    console.log('Verified database migrations applied successfully.');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log('Migration check note:', message);
  }

  // 1. Seed Statutory Tax Slabs (Authentic 100% match with FoxPro TFILE.DAT)
  console.log('Seeding Tax Slabs...');
  await db.insert(taxSlabs).values([
    {
      code: '01',
      description: '0% Nil / Exempted GST',
      cgstRate: 0.0,
      sgstRate: 0.0,
      igstRate: 0.0,
      glSalesAccount: '0002',
      glTaxAccount: '0003',
      glPurchaseAccount: '0004',
      glPurchTaxAccount: '0005',
      isExempt: true,
    },
    {
      code: '05',
      description: '5% GST (Intra 2.5%+2.5% / Inter 5.0%)',
      cgstRate: 2.5,
      sgstRate: 2.5,
      igstRate: 5.0,
      glSalesAccount: '0009',
      glTaxAccount: '0010',
      glPurchaseAccount: '0011',
      glPurchTaxAccount: '0012',
      isExempt: false,
    },
    {
      code: '02',
      description: '12% GST (Intra 6.0%+6.0% / Inter 12.0%)',
      cgstRate: 6.0,
      sgstRate: 6.0,
      igstRate: 12.0,
      glSalesAccount: '0014',
      glTaxAccount: '0015',
      glPurchaseAccount: '0016',
      glPurchTaxAccount: '0017',
      isExempt: false,
    },
    {
      code: '03',
      description: '18% GST (Intra 9.0%+9.0% / Inter 18.0%)',
      cgstRate: 9.0,
      sgstRate: 9.0,
      igstRate: 18.0,
      glSalesAccount: '0018',
      glTaxAccount: '0019',
      glPurchaseAccount: '0020',
      glPurchTaxAccount: '0021',
      isExempt: false,
    },
    {
      code: '04',
      description: '28% GST (Intra 14.0%+14.0% / Inter 28.0%)',
      cgstRate: 14.0,
      sgstRate: 14.0,
      igstRate: 28.0,
      glSalesAccount: '0006',
      glTaxAccount: '0007',
      glPurchaseAccount: '0008',
      glPurchTaxAccount: '0009',
      isExempt: false,
    },
  ]).onConflictDoNothing();

  // 2. Seed System Configuration & Controls (from HFILE.DAT & CTLFILE.DAT)
  console.log('Seeding System Configuration & Controls...');
  await db.insert(systemConfig).values({
    id: 'default',
    companyName: 'SIVA PHARMACEUTICAL DISTRIBUTORS',
    tradeName: 'WHOLESALE SOFTWARE',
    addressLine1: '12/4 HOSPITAL ROAD, BAZAAR BRANCH',
    addressLine2: 'OPPOSITE GOVERNMENT GENERAL HOSPITAL',
    addressLine3: 'CHENNAI, TAMIL NADU',
    pincode: '600001',
    phone: '044-28282828 / 9840012345',
    email: 'billing@sivapharma.com',
    gstin: '33AAAAA0000A1Z5',
    pan: 'AAAAA0000A',
    dlNo20b: 'TN/CHE/20B/12345',
    dlNo21b: 'TN/CHE/21B/12346',
    fssaiNo: '10019042000001',
    stateName: 'Tamil Nadu',
    stateCode: '33',
    currentWorkingDate: '2026-09-28',
    nextInvoiceNoSeries1: 1001,
    nextInvoiceNoSeries2: 30001,
    nextSalesReturnNo: 101,
    nextPurchaseReturnNo: 101,
    nextCreditNoteNo: 200001,
    nextDebitNoteNo: 100001,
    nextDeliveryChallanNo: 101,
    cashDiscountSlab1Amount: 0.0,
    cashDiscountSlab1Pct: 2.0,
    cashDiscountSlab2Amount: 200.0,
    cashDiscountSlab2Pct: 2.0,
    cashDiscountSlab3Amount: 0.0,
    defaultTcsPct: 0.100,
    hsnCodeLength: 8,
    bankDetailsLine1: 'BANK: STATE BANK OF INDIA, A/C: 12345678901',
    bankDetailsLine2: 'IFSC: SBIN0000123, BRANCH: SOWCARPET, CHENNAI',
    invoiceFooterTerms: 'Subject to Chennai Jurisdiction. Interest @ 24% will be charged on overdue bills.',
  }).onConflictDoNothing();

  await db.insert(systemControls).values({
    id: 'default',
    adminPasswordHash: 'SPM', // Legacy supervisor password
    managerPasswordHash: 'SPM',
    operatorPasswordHash: 'SIVA',
    allowRateModification: false,
    allowOutstandingOverride: false,
    allowCollectionEdit: false,
    allowReportsAccess: true,
    allowDayEndOverride: false,
    allowCreditNoteAdjustment: true,
    allowCreditNoteCreation: true,
    allowInvoiceCancellation: false,
    allowPaymentModification: false,
    enforceCreditLimit: true,
    enforceLicenseExpiryBlock: true,
    enforceNegativeMarginBlock: true,
  }).onConflictDoNothing();

  // 3. Seed Auxiliary Masters
  console.log('Seeding Companies, Areas, Salesmen, Doctors...');
  await db.insert(companies).values([
    { id: 'S', code: 'SIV', name: 'SIVA HEALTHCARE LABS' },
    { id: 'C', code: 'CIP', name: 'CIPLA PHARMACEUTICALS LTD' },
    { id: 'M', code: 'MAN', name: 'MANKIND PHARMA LTD' },
  ]).onConflictDoNothing();

  await db.insert(salesmen).values([
    { id: '01', code: '01', name: 'R. KUMAR', phone: '9841011111', localCommissionPct: 1.5, outstationCommissionPct: 2.0 },
    { id: '02', code: '02', name: 'M. SENTHIL', phone: '9841022222', localCommissionPct: 1.5, outstationCommissionPct: 2.0 },
  ]).onConflictDoNothing();

  await db.insert(areas).values([
    { id: '001', code: '001', name: 'SOWCARPET CENTRAL', district: 'CHENNAI', salesmanId: '01' },
    { id: '002', code: '002', name: 'PARRYS COMMERCIAL', district: 'CHENNAI', salesmanId: '01' },
    { id: '003', code: '003', name: 'ANNA NAGAR WEST', district: 'CHENNAI', salesmanId: '02' },
  ]).onConflictDoNothing();

  await db.insert(doctors).values([
    { id: '0001', code: '0001', name: 'DR. S. BALACHANDRAN MBBS MD', phone: '044-25252525', registrationNo: 'TNMC/45210' },
  ]).onConflictDoNothing();

  // 4. Seed Suppliers
  console.log('Seeding Suppliers...');
  await db.insert(suppliers).values([
    {
      id: '001',
      code: 'CIP',
      name: 'CIPLA DISTRIBUTION DEPOT',
      contactPerson: 'K. RANGARAJAN',
      addressLine1: 'PLOT 45, AMBATTUR INDUSTRIAL ESTATE',
      addressLine2: 'AMBATTUR',
      phone: '044-26251234',
      gstin: '33AABCC1234C1Z5',
      defaultDiscountPct: 2.0,
      openingBalance: 0.0,
      currentBalance: 0.0,
      isBlocked: false,
    },
    {
      id: '002',
      code: 'MAN',
      name: 'MANKIND PHARMA STOCKIST',
      contactPerson: 'V. VENKAT',
      addressLine1: '14 POONAMALLEE HIGH ROAD',
      addressLine2: 'KOYAMBEDU',
      phone: '044-24795678',
      gstin: '33AABCM5678M1Z8',
      defaultDiscountPct: 1.5,
      openingBalance: 0.0,
      currentBalance: 0.0,
      isBlocked: false,
    },
  ]).onConflictDoNothing();

  // 5. Seed Customers (Local B2B & Outstation)
  console.log('Seeding Customers...');
  await db.insert(customers).values([
    {
      id: '1001',
      code: '1001',
      name: 'SRI BALAJI MEDICALS',
      areaId: '001',
      salesmanId: '01',
      addressLine1: '24/1 N.S.C. BOSE ROAD',
      addressLine2: 'SOWCARPET',
      pincode: '600079',
      phone: '044-25381234',
      email: 'balajimedicals@gmail.com',
      gstin: '33AABCS1234E1Z9',
      pan: 'AABCS1234E',
      dlNo20b: 'TN/CHE/20B/9876',
      dlNo21b: 'TN/CHE/21B/9877',
      dlExpiryDate: '2028-12-31',
      creditDays: 21,
      creditLimit: 100000.0,
      billingType: 'L', // Local Intra-state
      paymentTerms: 'R', // Credit
      isBlocked: false,
      isTaxExempt: false,
      closingBalance: 2136.0,
    },
    {
      id: '1002',
      code: '1002',
      name: 'APOLLO HEALTH CLINIC PHARMACY',
      areaId: '002',
      salesmanId: '01',
      addressLine1: '88 FIRST AVENUE',
      addressLine2: 'PARRYS CORNER',
      pincode: '600001',
      phone: '044-25345678',
      email: 'apollohealth@gmail.com',
      gstin: '33AABCA9876K1Z1',
      pan: 'AABCA9876K',
      dlNo20b: 'TN/CHE/20B/5544',
      dlNo21b: 'TN/CHE/21B/5545',
      dlExpiryDate: '2027-06-30',
      creditDays: 30,
      creditLimit: 250000.0,
      billingType: 'L',
      paymentTerms: 'R',
      isBlocked: false,
      isTaxExempt: false,
      closingBalance: 0.0,
    },
    {
      id: '2001',
      code: '2001',
      name: 'KERALA CARE PHARMACY',
      areaId: '003',
      salesmanId: '02',
      addressLine1: 'MAIN ROAD, PALAKKAD',
      addressLine2: 'KERALA BORDER',
      pincode: '678001',
      phone: '0491-2521111',
      email: 'keralacare@gmail.com',
      gstin: '32AABCK4321P1Z0', // State 32 = Kerala (Inter-state IGST)
      pan: 'AABCK4321P',
      dlNo20b: 'KL/PLK/20B/1122',
      dlNo21b: 'KL/PLK/21B/1123',
      dlExpiryDate: '2029-01-31',
      creditDays: 15,
      creditLimit: 50000.0,
      billingType: 'O', // Outstation Inter-state
      paymentTerms: 'R',
      isBlocked: false,
      isTaxExempt: false,
      closingBalance: 0.0,
    },
  ]).onConflictDoNothing();

  // 6. Seed Products & Batches (with Scheme Bonus Formulas)
  console.log('Seeding Products and Normalized Batches...');
  await db.insert(products).values([
    {
      id: 'P0001',
      code: '00001',
      name: 'PARACETAMOL 650MG TAB',
      companyId: 'C',
      supplierId: '001',
      packaging: '10x10 TAB',
      hsnCode: '30049099',
      uqc: 'BOX',
      rackLocation: 'A-01',
      taxCode: '02', // 12% GST
      defaultSupplierDiscountPct: 2.0,
      minOrderQty: 5,
      reorderLevel: 20,
      isBlocked: false,
      isScheduleH: false,
      totalStockOnHand: 800,
    },
    {
      id: 'P0002',
      code: '00002',
      name: 'DOLO 650 TABLETS', // Matches legacy MEDIMAST record
      companyId: 'M',
      supplierId: '002',
      packaging: '15x10 TAB',
      hsnCode: '30049099',
      uqc: 'BOX',
      rackLocation: 'A-02',
      taxCode: '02', // 12% GST
      defaultSupplierDiscountPct: 1.5,
      minOrderQty: 10,
      reorderLevel: 50,
      isBlocked: false,
      isScheduleH: false,
      totalStockOnHand: 150,
    },
    {
      id: 'P0003',
      code: '00003',
      name: 'AZITHROMYCIN 500MG TAB',
      companyId: 'C',
      supplierId: '001',
      packaging: '3 TAB BLIST',
      hsnCode: '30042010',
      uqc: 'PAC',
      rackLocation: 'B-04',
      taxCode: '02', // 12% GST
      defaultSupplierDiscountPct: 2.5,
      minOrderQty: 10,
      reorderLevel: 30,
      isBlocked: false,
      isScheduleH: true, // Schedule H prescription
      totalStockOnHand: 80,
    },
    {
      id: 'P0004',
      code: '00004',
      name: 'ELECTRAL ORS POWDER',
      companyId: 'S',
      supplierId: '001',
      packaging: '21.8G SACH',
      hsnCode: '30049099',
      uqc: 'PAC',
      rackLocation: 'C-01',
      taxCode: '05', // 5% GST
      defaultSupplierDiscountPct: 0.0,
      minOrderQty: 25,
      reorderLevel: 100,
      isBlocked: false,
      isScheduleH: false,
      totalStockOnHand: 400,
    },
    {
      id: 'P0005',
      code: '00005',
      name: 'STERILLIUM HAND SANITIZER 500ML',
      companyId: 'S',
      supplierId: '002',
      packaging: '500ML BTL',
      hsnCode: '38089400',
      uqc: 'BTL',
      rackLocation: 'D-02',
      taxCode: '03', // 18% GST
      defaultSupplierDiscountPct: 3.0,
      minOrderQty: 6,
      reorderLevel: 12,
      isBlocked: false,
      isScheduleH: false,
      totalStockOnHand: 60,
    },
  ]).onConflictDoNothing();

  // Normalized Multi-Batch Inventory with Bonus Scheme parameters
  await db.insert(productBatches).values([
    {
      id: 'B0001',
      productId: 'P0001',
      batchNo: 'BT24018',
      expiryDate: '2027-08-31',
      expiryMonthYear: '08/27',
      purchaseRate: 22.40,
      sellingRate: 28.00,
      secondaryRate: 29.50,
      mrp: 34.50,
      stockQty: 500,
      schemeThreshold: 10, // Buy 10 (QY)
      schemeFreeQty: 1,    // Get 1 Free (FQY)
      taxCode: '02',
      lastPurchaseDate: '2026-08-01',
    },
    {
      id: 'B0002',
      productId: 'P0001',
      batchNo: 'BT24099',
      expiryDate: '2027-11-30',
      expiryMonthYear: '11/27',
      purchaseRate: 23.00,
      sellingRate: 29.00,
      secondaryRate: 30.00,
      mrp: 35.00,
      stockQty: 300,
      schemeThreshold: 0,
      schemeFreeQty: 0,
      taxCode: '02',
      lastPurchaseDate: '2026-09-10',
    },
    {
      id: 'B0003',
      productId: 'P0002',
      batchNo: 'DL8812',
      expiryDate: '2027-10-31',
      expiryMonthYear: '10/27',
      purchaseRate: 120.00,
      sellingRate: 150.00,
      secondaryRate: 155.00,
      mrp: 160.00,
      stockQty: 150,
      schemeThreshold: 10,
      schemeFreeQty: 1,
      taxCode: '02',
      lastPurchaseDate: '2026-07-03',
    },
    {
      id: 'B0004',
      productId: 'P0003',
      batchNo: 'AZ5011',
      expiryDate: '2027-05-31',
      expiryMonthYear: '05/27',
      purchaseRate: 55.00,
      sellingRate: 72.00,
      secondaryRate: 75.00,
      mrp: 95.00,
      stockQty: 80,
      schemeThreshold: 5,
      schemeFreeQty: 1,
      taxCode: '02',
      lastPurchaseDate: '2026-08-15',
    },
    {
      id: 'B0005',
      productId: 'P0004',
      batchNo: 'ORS991',
      expiryDate: '2028-02-28',
      expiryMonthYear: '02/28',
      purchaseRate: 14.50,
      sellingRate: 18.00,
      secondaryRate: 19.50,
      mrp: 22.50,
      stockQty: 400,
      schemeThreshold: 20,
      schemeFreeQty: 2,
      taxCode: '05',
      lastPurchaseDate: '2026-08-20',
    },
    {
      id: 'B0006',
      productId: 'P0005',
      batchNo: 'HS2024',
      expiryDate: '2028-06-30',
      expiryMonthYear: '06/28',
      purchaseRate: 85.00,
      sellingRate: 110.00,
      secondaryRate: 120.00,
      mrp: 150.00,
      stockQty: 60,
      schemeThreshold: 0,
      schemeFreeQty: 0,
      taxCode: '03',
      lastPurchaseDate: '2026-06-15',
    },
  ]).onConflictDoNothing();

  // 7. Seed Sample Verified Transactions for Instant UI & Calculation Parity Verification
  console.log('Seeding Sample Inward Purchase, Sales Invoice, and Ledger Balance...');
  
  // A. Sample Purchase Inward (GRN-000101)
  await db.insert(purchases).values({
    id: 'PUR-000101',
    inwardNo: 'GRN-000101',
    supplierId: '001',
    supplierBillNo: 'CIP/26/8941',
    supplierBillDate: '2026-09-20',
    inwardDate: '2026-09-22',
    dueDate: '2026-10-20',
    paymentTerms: 'CREDIT',
    isInterstate: false,
    totalGrossAmount: 11200.0,
    tradeDiscountAmount: 224.0,
    taxableAmount: 10976.0,
    cgstAmount: 658.56,
    sgstAmount: 658.56,
    igstAmount: 0.0,
    totalTaxAmount: 1317.12,
    roundOff: -0.12,
    netAmount: 12293.0,
    paidAmount: 0.0,
    balanceAmount: 12293.0,
    paymentStatus: 'UNPAID',
    isTransit: false,
    dayEndLocked: false,
    status: 'VERIFIED',
  }).onConflictDoNothing();

  await db.insert(purchaseItems).values({
    id: 'PURI-000101-1',
    purchaseId: 'PUR-000101',
    sortOrder: 1,
    productId: 'P0001',
    batchId: 'B0001',
    batchNo: 'BT24018',
    expiryDate: '2027-08-31',
    quantity: 500,
    freeQuantity: 50,
    schemeThreshold: 10,
    schemeFreeQty: 1,
    purchaseRate: 22.40,
    sellingRate: 28.00,
    secondaryRate: 29.50,
    mrp: 34.50,
    targetMarginPct: 25.0,
    tradeDiscountPct: 2.0,
    tradeDiscountAmount: 224.0,
    grossAmount: 11200.0,
    taxableAmount: 10976.0,
    taxCode: '02',
    cgstRate: 6.0,
    cgstAmount: 658.56,
    sgstRate: 6.0,
    sgstAmount: 658.56,
    igstRate: 0.0,
    igstAmount: 0.0,
    netAmount: 12293.12,
  }).onConflictDoNothing();

  // B. Sample Sales Invoice (INV-001001)
  await db.insert(invoices).values({
    id: 'INV-001001',
    invoiceNo: 'INV-001001',
    invoiceSeries: 1,
    invoiceDate: '2026-09-28',
    invoiceTime: '10:15:30',
    customerId: '1001',
    areaId: '001',
    salesmanId: '01',
    doctorId: '0001',
    isInterstate: false,
    paymentTerms: 'CREDIT',
    dueDate: '2026-10-19',
    subtotalGross: 2800.0, // 100 * 28.00
    totalLineDiscount: 0.0,
    cashDiscountPct: 0.0,
    cashDiscountAmount: 0.0,
    taxableAmount: 2800.0,
    cgstAmount: 168.0, // 6%
    sgstAmount: 168.0, // 6%
    igstAmount: 0.0,
    totalTaxAmount: 336.0,
    freightCharges: 0.0,
    boxCharges: 0.0,
    serviceCharges: 0.0,
    tcsPct: 0.0,
    tcsAmount: 0.0,
    roundOff: 0.0,
    netAmount: 3136.0,
    totalItemsCount: 1,
    totalQuantity: 110, // 100 Billed + 10 Free (Scheme 10+1)
    totalBoxes: 1,
    customerGstin: '33AABCS1234E1Z9',
    customerDl20b: 'TN/CHE/20B/9876',
    customerDl21b: 'TN/CHE/21B/9877',
    dayEndLocked: false,
    status: 'FINAL',
  }).onConflictDoNothing();

  await db.insert(invoiceItems).values({
    id: 'INVI-001001-1',
    invoiceId: 'INV-001001',
    sortOrder: 1,
    productId: 'P0001',
    batchId: 'B0001',
    productName: 'PARACETAMOL 650MG TAB',
    packaging: '10x10 TAB',
    hsnCode: '30049099',
    batchNo: 'BT24018',
    expiryDate: '2027-08-31',
    quantity: 100, // Billed Qty
    freeQuantity: 10, // Free Bonus Qty (int(100/10)*1 = 10)
    isReplacement: false,
    purchaseRate: 22.40,
    sellingRate: 28.00,
    secondaryRate: 29.50,
    mrp: 34.50,
    grossAmount: 2800.0,
    tradeDiscountPct: 0.0,
    tradeDiscountAmount: 0.0,
    taxableAmount: 2800.0,
    taxCode: '02',
    cgstRate: 6.0,
    cgstAmount: 168.0,
    sgstRate: 6.0,
    sgstAmount: 168.0,
    igstRate: 0.0,
    igstAmount: 0.0,
    netAmount: 3136.0,
  }).onConflictDoNothing();

  // C. Sample Customer Outstanding Ledger (linking to INV-001001)
  await db.insert(customerOutstandings).values({
    id: 'OUT-001001',
    customerId: '1001',
    invoiceId: 'INV-001001',
    invoiceNo: 'INV-001001',
    invoiceDate: '2026-09-28',
    dueDate: '2026-10-19',
    originalAmount: 3136.0,
    paidAmount: 1000.0, // Partial collection
    balanceAmount: 2136.0,
    cashDiscountEligible: 0.0,
    cashDiscountGiven: 0.0,
    status: 'PARTIALLY_PAID',
    lastPaymentDate: '2026-09-28',
  }).onConflictDoNothing();

  // D. Sample Customer Receipt Voucher
  await db.insert(customerReceipts).values({
    id: 'RCT-000101',
    receiptNo: 'RCT-000101',
    receiptDate: '2026-09-28',
    customerId: '1001',
    paymentMode: 'CHEQUE',
    totalAmount: 1000.0,
    discountAllowed: 0.0,
    referenceNo: 'CHQ-894120',
    referenceDate: '2026-09-28',
    bankName: 'HDFC BANK',
    branchName: 'SOWCARPET',
    chequeStatus: 'IN_HAND',
    unallocatedAmount: 0.0,
    narration: 'Part payment towards INV-001001',
    dayEndLocked: false,
  }).onConflictDoNothing();

  await db.insert(customerReceiptAllocations).values({
    id: 'RCTA-000101-1',
    receiptId: 'RCT-000101',
    outstandingId: 'OUT-001001',
    invoiceId: 'INV-001001',
    allocatedAmount: 1000.0,
    discountAmount: 0.0,
  }).onConflictDoNothing();

  console.log('✅ Siva Pharmacy ERP Database Seeding Complete!');
}

// Allow direct CLI execution: tsx src/lib/db/seed.ts
if (require.main === module || process.argv[1]?.includes('seed')) {
  seed()
    .then(() => {
      console.log('Seeder process finished successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Seeder process failed:', err);
      process.exit(1);
    });
}
