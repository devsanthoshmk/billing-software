/**
 * ESC/POS & Dot-Matrix Print Types & Contracts (Feature F33)
 * Siva Wholesale & Pharmacy ERP
 */

export interface PrintCompanyData {
  companyName: string;
  tradeName?: string;
  addressLine1: string;
  addressLine2?: string;
  addressLine3?: string;
  phone?: string;
  gstin: string;
  dlNo20b: string;
  dlNo21b: string;
  fssaiNo?: string;
  stateName?: string;
  stateCode?: string;
  bankDetailsLine1?: string;
  bankDetailsLine2?: string;
}

export interface PrintCustomerData {
  code: string;
  name: string;
  address?: string;
  phone?: string;
  gstin?: string;
  dlNo20b?: string;
  dlNo21b?: string;
  closingBalance?: number;
}

export interface PrintInvoiceItem {
  slNo: number;
  productName: string;
  packaging: string;
  hsnCode: string;
  batchNo: string;
  expiryDate: string; // 'YYYY-MM-DD' or 'MM/YY'
  mrp: number;
  quantity: number;
  freeQuantity?: number;
  rate: number;
  discountPct?: number;
  discountAmount?: number;
  taxableAmount: number;
  taxPct: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  netAmount: number;
}

export interface PrintTaxSlab {
  taxCode: string;
  taxRatePct: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
}

export interface PrintInvoiceData {
  invoiceNo: string;
  invoiceDate: string;
  invoiceTime?: string;
  invoiceSeries?: number;
  paymentTerms: string; // 'CASH', 'CREDIT', 'CHEQUE'
  isInterstate?: boolean;
  dueDate?: string;
  salesmanName?: string;
  doctorName?: string;

  company: PrintCompanyData;
  customer: PrintCustomerData;
  items: PrintInvoiceItem[];
  taxSlabs?: PrintTaxSlab[];

  subtotalGross: number;
  totalLineDiscount: number;
  cashDiscountAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTaxAmount: number;
  roundOff: number;
  netAmount: number;

  totalQuantity: number;
  totalItemsCount: number;
  preparedBy?: string;
}
