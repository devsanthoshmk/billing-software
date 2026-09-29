/**
 * Business Engine Domain Types & Interfaces
 * FoxPro 2.6 Pharmacy ERP Parity Engine
 * 
 * Target Subsystem: src/lib/business-engine/
 */

// ============================================================================
// 1. Calculations & Invoicing Types (Features F07, F08, F09, F10)
// ============================================================================

/**
 * Indian Pharmaceutical Scheme Free Goods Configuration.
 * Represents legacy MEDIMAST fields QY (buy threshold) and FQY (bonus free units).
 * Formula: FreeQty = floor(BilledQty / QY) * FQY
 */
export interface SchemeConfig {
  /** Quantity required to purchase to qualify for bonus (QY) */
  threshold: number;
  /** Free units granted per qualifying threshold (FQY) */
  freeQty: number;
}

/**
 * Input parameters for calculating a single sales invoice line item.
 */
export interface LineItemInput {
  /** Line item unique identifier or line index */
  id?: string;
  /** Product reference identifier */
  productId?: string;
  /** Batch reference identifier */
  batchId?: string;
  /** Product display name */
  productName?: string;
  /** Billed purchase quantity (QTY > 0) */
  quantity: number;
  /** Standard wholesale selling rate per unit (SRATE >= 0) */
  sellingRate: number;
  /** Product cost / acquisition rate snapshot (PRATE) for margin validation */
  purchaseRate?: number;
  /** Maximum Retail Price (MRP) snapshot */
  mrp?: number;
  /** Line-level product trade discount percentage (0 <= PDISC <= 100) */
  tradeDiscountPct?: number;
  /** Statutory GST tax code ('01', '02', '03', '04', '05') */
  taxCode?: string;
  /** Total GST tax percentage (e.g. 0, 5, 12, 18, 28) */
  taxPct: number;
  /** Inter-state outstation transaction flag (true = 100% IGST, false = 50% CGST + 50% SGST) */
  isInterstate?: boolean;
  /** Certified tax-exempt customer flag (true forces 0% tax) */
  isTaxExemptCustomer?: boolean;
  /** Bonus scheme goods configuration */
  scheme?: SchemeConfig | null;
  /** Replacement goods line flag (forces calculatedFreeQty to 0) */
  isReplacement?: boolean;
}

/**
 * Calculated result for a single sales invoice line item.
 */
export interface LineItemCalculationResult {
  /** Echoed line or product id */
  id?: string;
  productId?: string;
  batchId?: string;
  productName?: string;

  // Quantities
  /** Billed quantity charged to party */
  quantity: number;
  /** Bonus free goods quantity granted at zero charge (INVPRE.PRG:589) */
  calculatedFreeQty: number;
  /** Total physical units to decrement from inventory (quantity + calculatedFreeQty) */
  totalUnits: number;
  /** Whether line is a replacement item */
  isReplacement: boolean;

  // Pricing & Gross
  /** Selling rate applied */
  sellingRate: number;
  /** Maximum retail price */
  mrp?: number;
  /** Purchase rate snapshot */
  purchaseRate?: number;
  /** Line gross value before trade discount: round(quantity * sellingRate, 2) */
  grossAmount: number;

  // Discounts & Taxable Base
  /** Trade discount percentage applied */
  tradeDiscountPct: number;
  /** Trade discount value deducted: round(grossAmount * (tradeDiscountPct / 100), 2) */
  discountAmount: number;
  /** Base turnover subject to GST: grossAmount - discountAmount */
  taxableAmount: number;

  // Statutory Taxes
  /** Tax code applied */
  taxCode: string;
  /** Total GST rate applied */
  taxPct: number;
  /** Central GST rate (taxPct / 2 for intra-state, 0 for inter-state) */
  cgstRate: number;
  /** Central GST amount: round(taxableAmount * (cgstRate / 100), 2) */
  cgstAmount: number;
  /** State GST rate (taxPct / 2 for intra-state, 0 for inter-state) */
  sgstRate: number;
  /** State GST amount: round(taxableAmount * (sgstRate / 100), 2) */
  sgstAmount: number;
  /** Integrated GST rate (taxPct for inter-state, 0 for intra-state) */
  igstRate: number;
  /** Integrated GST amount: round(taxableAmount * (igstRate / 100), 2) */
  igstAmount: number;
  /** Total tax on line item: cgstAmount + sgstAmount + igstAmount */
  totalTaxAmount: number;

  // Net Value
  /** Net line payable: taxableAmount + totalTaxAmount */
  netAmount: number;
}

/**
 * Configured cash discount tier from systemConfig / HFILE.DAT.
 */
export interface CashDiscountSlabConfig {
  /** Qualifying turnover threshold (SLAP1, SLAP2) */
  thresholdAmount: number;
  /** Cash discount percentage granted (DISC1, DISC2) */
  discountPct: number;
}

/**
 * Statutory tax breakdown per tax slab for invoice footer printing.
 */
export interface TaxSlabBreakdown {
  taxCode: string;
  taxPct: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTaxAmount: number;
}

/**
 * Input parameters for calculating complete invoice header totals.
 */
export interface InvoiceTotalsInput {
  /** Calculated line items */
  lineItems: LineItemCalculationResult[];
  /** Explicit bill-level cash discount percentage (optional) */
  cashDiscountPct?: number;
  /** Configured tiered cash discount slabs (optional) */
  cashDiscountSlabs?: CashDiscountSlabConfig[];
  /** Freight and forwarding charges (FC) */
  freightCharges?: number;
  /** Box packaging charges (BC) */
  boxCharges?: number;
  /** Supplementary service charges (SERCHG) */
  serviceCharges?: number;
  /** Tax Collected at Source percentage (e.g. 0.075 or 0.100) */
  tcsPct?: number;
  /** Whether TCS applies to this customer / transaction */
  isTcsApplicable?: boolean;
}

/**
 * Calculated result for complete invoice totals, taxes, TCS, and round-off.
 */
export interface InvoiceTotalsResult {
  // Aggregate Turnovers
  /** Sum of all line item gross amounts (TOT_AMT) */
  totalGross: number;
  /** Sum of all line item product trade discounts (PDISC_AMT) */
  totalLineDiscount: number;
  /** Subtotal net of line discounts (totalGross - totalLineDiscount) */
  subtotalTaxable: number;

  // Bill-Level Cash Discount
  /** Effective cash discount percentage applied */
  cashDiscountPct: number;
  /** Cash discount amount deducted from taxable turnover (FDISC_AMT) */
  cashDiscountAmount: number;
  /** Net taxable base after cash discount */
  netTaxableAmount: number;

  // Statutory GST Breakdown
  /** Total Central GST collected */
  totalCgst: number;
  /** Total State GST collected */
  totalSgst: number;
  /** Total Integrated GST collected */
  totalIgst: number;
  /** Total GST tax amount (totalCgst + totalSgst + totalIgst) */
  totalTax: number;
  /** Breakdown by individual tax slab */
  taxBreakdown: TaxSlabBreakdown[];
  /** Turnover legally exempted from GST */
  exemptedTurnover: number;

  // Logistics & Supplementary Charges
  freightCharges: number;
  boxCharges: number;
  serviceCharges: number;
  totalCharges: number;

  // Tax Collected at Source (TCS)
  tcsPct: number;
  tcsAmount: number;

  // Final Payable & Rupee Round-Off
  /** Exact unrounded payable amount before integer round-off */
  unroundedTotal: number;
  /** Whole rupee payable amount: roundToRupee(unroundedTotal) */
  grandTotal: number;
  /** Round-off adjustment in paise: roundToPaise(grandTotal - unroundedTotal) */
  roundOffAmount: number;

  // Document Metadata Counters
  /** Total number of line item rows */
  totalItemsCount: number;
  /** Total billed units */
  totalBilledQuantity: number;
  /** Total bonus free units */
  totalFreeQuantity: number;
  /** Total physical package units (totalBilledQuantity + totalFreeQuantity) */
  totalUnits: number;
}


// ============================================================================
// 2. Domain Invariant Guard Types (Feature F11)
// ============================================================================

/**
 * Invariant Violation Severity
 */
export type InvariantSeverity = 'ERROR' | 'WARNING' | 'INFO';

/**
 * Standard Invariant Violation Codes (F11)
 */
export type InvariantCode =
  | 'NEGATIVE_MARGIN'           // Selling Rate < Purchase Rate (INVPRE.PRG:1710)
  | 'ZERO_SELLING_RATE'         // Selling Rate <= 0 (INVPRE.PRG:1726)
  | 'ZERO_PURCHASE_RATE'        // Purchase Rate <= 0 (PURCHASE.PRG:2179)
  | 'ZERO_OR_NEGATIVE_MRP'      // MRP <= 0 (PURCHASE.PRG:2186)
  | 'SELLING_RATE_EXCEEDS_MRP'  // Selling Rate > MRP (PURCHASE.PRG:2190)
  | 'PURCHASE_RATE_EXCEEDS_MRP' // Purchase Rate > MRP
  | 'DRUG_LICENSE_EXPIRED'      // Customer DL Expiry Date < System Date (INVPRE.PRG:378)
  | 'DRUG_LICENSE_NEAR_EXPIRY'  // Customer DL Expiry Date within threshold (INVPRE.PRG:374)
  | 'DRUG_LICENSE_MISSING'      // Schedule drug sale to customer without DL number
  | 'CREDIT_LIMIT_EXCEEDED'     // Customer Balance + Invoice Total > Credit Limit
  | 'CREDIT_DAYS_OVERDUE'       // Customer has open bills exceeding payment credit days
  | 'BATCH_EXPIRED'             // Batch expiryDate <= System Date (INVPRE.PRG:1361)
  | 'BATCH_NEAR_EXPIRY'         // Batch expiryDate within near-expiry window (EXPBRO.PRG)
  | 'INSUFFICIENT_STOCK'        // Requested + Free quantity exceeds available stock
  | 'CUSTOMER_BLOCKED'          // Customer flagged as blocked
  | 'PRODUCT_BLOCKED'           // Product flagged as blocked
  | 'BATCH_BLOCKED';            // Batch flagged as blocked

/**
 * Individual Violation Descriptor
 */
export interface InvariantViolation {
  code: InvariantCode;
  severity: InvariantSeverity;
  message: string;
  field?: string;
  canBypass: boolean;           // True if supervisor override or bypass flag can proceed
  isBypassed: boolean;          // True if bypass flag was supplied in the context
  details?: Record<string, unknown>;
}

/**
 * Validation Result Object
 */
export interface ValidationResult {
  isValid: boolean;             // True if no unbypassed ERROR violations exist
  hasErrors: boolean;           // True if there is at least one active unbypassed ERROR
  hasWarnings: boolean;         // True if there is at least one active WARNING
  violations: InvariantViolation[];
}

/**
 * Line-Item Pricing Context for Invariant Checks
 */
export interface LineItemPricingContext {
  sellingRate: number;
  purchaseRate: number;
  mrp: number;
  isReplacement?: boolean;
}

/**
 * Customer Profile Context for Credit and License Checks
 */
export interface CustomerValidationContext {
  id?: string;
  code?: string;
  name?: string;
  dlNo20b?: string | null;
  dlNo21b?: string | null;
  dlExpiryDate?: string | null;     // ISO format 'YYYY-MM-DD'
  creditLimit: number;              // 0 = unlimited / no limit enforced
  closingBalance: number;           // Current outstanding balance
  creditDays?: number;              // Max allowed payment credit days
  oldestOverdueDays?: number;       // Age in days of oldest unpaid bill
  bypassCreditLimit?: boolean;      // Customer master override flag
  isBlocked?: boolean;              // Customer master block flag
}

/**
 * Full Business Validation Context for Invariant Engine
 */
export interface BusinessValidationContext {
  systemDate: string;               // Working system date 'YYYY-MM-DD'
  lineItem?: LineItemPricingContext;
  customer?: CustomerValidationContext;
  transaction?: {
    paymentTerms: 'C' | 'R' | 'H';  // 'C'=Cash, 'R'=Credit, 'H'=Cheque
    newInvoiceTotal: number;        // Total gross or grand total of new invoice
    isScheduleHProduct?: boolean;   // True if any line is Schedule H/H1
  };
  batch?: {
    batchNo: string;
    expiryDate: string;             // ISO 'YYYY-MM-DD'
    isBlocked?: boolean;
    availableStock?: number;
    requestedQty?: number;
    freeQty?: number;
  };
  product?: {
    isBlocked?: boolean;
  };
  overrides?: {
    bypassNegativeMargin?: boolean; // Supervisor override for negative margin
    bypassDlExpiry?: boolean;       // Supervisor override for DL expiry
    bypassCreditLimit?: boolean;    // Supervisor override for credit ceiling
    dlNearExpiryDaysThreshold?: number; // Default: 30 days
    batchNearExpiryDaysThreshold?: number; // Default: 90 days
  };
}


// ============================================================================
// 3. FIFO Multi-Batch Inventory Deduction Types (Feature F12)
// ============================================================================

/**
 * Batch Stock Record for FIFO Allocation (F12)
 */
export interface BatchStock {
  id: string;                       // Batch unique ID
  batchNo: string;                  // e.g. "BT24018"
  expiryDate: string;               // ISO 'YYYY-MM-DD'
  purchaseRate: number;             // Cost rate
  sellingRate: number;              // Wholesale selling rate
  mrp: number;                      // Maximum Retail Price
  stockQty: number;                 // Current physical stock on hand
  schemeThreshold?: number;         // Buy Qty (QY)
  schemeFreeQty?: number;           // Free Qty (FQY)
  isBlocked?: boolean;              // If batch is blocked
}

/**
 * Options for FIFO Stock Allocation
 */
export interface FIFOAllocationOptions {
  systemDate?: string;              // ISO 'YYYY-MM-DD' (defaults to current date)
  excludeExpired?: boolean;         // Default true: exclude expired batches
  allowPartialAllocation?: boolean; // Default true: allocate as much as possible if stock < needed
  enforceSingleMrp?: boolean;       // Default false: restrict allocation to a single uniform MRP
  targetMrp?: number;               // Optional target MRP filter
  warnNearExpiryDays?: number;      // Default 90 days: tag near-expiry allocations
}

/**
 * Individual Allocated Batch Slice
 */
export interface BatchAllocation {
  batchId: string;
  batchNo: string;
  expiryDate: string;
  mrp: number;
  sellingRate: number;
  purchaseRate: number;
  allocatedBilledQty: number;       // Billed portion taken from this batch
  allocatedFreeQty: number;         // Free bonus portion taken from this batch
  totalAllocatedQty: number;        // Sum: allocatedBilledQty + allocatedFreeQty
  remainingBatchStock: number;      // Batch stock left after deduction
  grossAmount: number;              // allocatedBilledQty * sellingRate
  isNearExpiry: boolean;            // True if expiry is within warning threshold
}

/**
 * Complete FIFO Allocation Result
 */
export interface FIFOAllocationResult {
  success: boolean;                 // True if total required quantity was fully satisfied
  isPartiallyAllocated: boolean;    // True if 0 < totalAllocated < totalRequired
  isUnallocated: boolean;           // True if totalAllocated === 0
  requestedQty: number;             // Billed quantity requested
  freeQty: number;                  // Bonus free quantity requested
  totalRequiredQty: number;         // requestedQty + freeQty
  totalAllocatedBilledQty: number;  // Total billed quantity allocated across all batches
  totalAllocatedFreeQty: number;    // Total free quantity allocated across all batches
  totalAllocatedQty: number;        // Sum of all allocations
  unallocatedQty: number;           // totalRequiredQty - totalAllocatedQty
  unallocatedBilledQty: number;     // requestedQty - totalAllocatedBilledQty
  unallocatedFreeQty: number;       // freeQty - totalAllocatedFreeQty

  // Multi-MRP Intelligence
  hasMultiMrp: boolean;             // True if allocated slices have differing MRPs
  distinctMrps: number[];           // Array of unique MRP values in allocated batches
  requiresMrpSelectionPrompt: boolean; // True if available eligible stock contains multiple MRPs
  availableMrps: number[];          // All unique MRPs among eligible batches

  allocations: BatchAllocation[];   // Ordered batch allocation slices
  error?: string;                   // Error explanation if allocation failed
}


// ============================================================================
// 4. Bill-by-Bill Customer Ledger Payment Allocation Types (Feature F13)
// ============================================================================

/**
 * Settlement Status for an individual open invoice bill.
 */
export type BillSettlementStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID';

/**
 * Representation of an open customer bill eligible for payment settlement.
 * Corresponds to records in CUSOUT.DAT / customerOutstandings.
 */
export interface OpenBill {
  /** Unique outstanding record identifier (UUID) */
  id: string;
  /** Foreign key to parent sales invoice */
  invoiceId: string;
  /** Human-readable invoice number (e.g. "INV-1001" or "1001") */
  invoiceNo: string;
  /** Date of invoice in ISO-8601 format (YYYY-MM-DD) */
  invoiceDate: string;
  /** Payment due date in ISO-8601 format (YYYY-MM-DD) */
  dueDate: string;
  /** Original billed gross/net amount (INVAMT) */
  originalAmount: number;
  /** Total payments received prior to this transaction (RDAMT) */
  paidAmount: number;
  /** Current outstanding balance prior to allocation (RAMT = originalAmount - paidAmount) */
  balanceAmount: number;
  /** Eligible cash discount amount if settled promptly (DISC_AMT) */
  cashDiscountEligible?: number;
  /** Cash discount percentage (DISC_PER) */
  cashDiscountPct?: number;
}

/**
 * Allocation result for a single bill after applying collection funds.
 */
export interface AllocatedBillResult {
  /** Reference to original bill */
  billId: string;
  /** Invoice reference */
  invoiceId: string;
  /** Invoice number */
  invoiceNo: string;
  /** Invoice date */
  invoiceDate: string;
  /** Original billed total amount */
  originalAmount: number;
  /** Amount already paid before this payment */
  previousPaidAmount: number;
  /** Current balance before this payment */
  previousBalanceAmount: number;
  /** Amount newly allocated from this payment */
  allocatedAmount: number;
  /** Cash discount granted in this transaction */
  discountGranted: number;
  /** Updated cumulative paid amount (previousPaidAmount + allocatedAmount + discountGranted) */
  newPaidAmount: number;
  /** Remaining unpaid balance after allocation (previousBalanceAmount - allocatedAmount - discountGranted) */
  newBalanceAmount: number;
  /** New settlement status ('OPEN', 'PARTIALLY_PAID', 'PAID') */
  status: BillSettlementStatus;
  /** Flag indicating whether bill is 100% cleared */
  isFullySettled: boolean;
}

/**
 * Comprehensive result of customer payment allocation routine.
 */
export interface PaymentAllocationResult {
  /** Total incoming collection funds received */
  totalPaymentAmount: number;
  /** Total amount successfully applied across open bills */
  totalAllocatedAmount: number;
  /** Total cash discount incentives deducted across bills */
  totalDiscountGranted: number;
  /** Surplus funds not absorbed by open bills (retained as advance customer credit EXAMT) */
  unallocatedAmount: number;
  /** Number of bills completely paid off */
  settledBillCount: number;
  /** Number of bills partially paid */
  partiallySettledBillCount: number;
  /** Number of bills left completely unpaid */
  unsettledBillCount: number;
  /** Detailed line-by-line allocation breakdown in FIFO order */
  allocatedBills: AllocatedBillResult[];
}

/**
 * Execution options for payment allocation.
 */
export interface PaymentAllocationOptions {
  /** If true, evaluates and applies cash discounts for eligible prompt bills */
  applyCashDiscount?: boolean;
  /** Date of payment receipt in ISO-8601 format (YYYY-MM-DD), used to evaluate discount eligibility against due date */
  receiptDate?: string;
  /** Custom sort function override (defaults to FIFO: invoiceDate ASC, invoiceNo ASC) */
  sortStrategy?: 'FIFO' | 'LIFO' | 'NONE';
}

// ============================================================================
// 5. Bill-by-Bill Supplier Payment Allocation Types (Feature F27)
// ============================================================================

export interface OpenPurchaseBill {
  id: string;
  inwardNo: string;
  supplierBillNo?: string | null;
  inwardDate: string;
  dueDate?: string | null;
  netAmount: number;
  paidAmount: number;
  balanceAmount: number;
  discountEligible?: number;
}

export interface AllocatedPurchaseBillResult {
  purchaseId: string;
  inwardNo: string;
  supplierBillNo?: string | null;
  inwardDate: string;
  originalAmount: number;
  previousPaidAmount: number;
  previousBalanceAmount: number;
  allocatedAmount: number;
  discountGranted: number;
  newPaidAmount: number;
  newBalanceAmount: number;
  status: 'UNPAID' | 'PARTIAL' | 'PAID';
  isFullySettled: boolean;
}

export interface SupplierPaymentAllocationResult {
  totalPaymentAmount: number;
  totalAllocatedAmount: number;
  totalDiscountEarned: number;
  unallocatedAmount: number; // Advance paid to vendor
  settledBillCount: number;
  partiallySettledBillCount: number;
  unsettledBillCount: number;
  allocatedBills: AllocatedPurchaseBillResult[];
}

