export interface ProductBatch {
  bat: string;
  exp: string;
  qty: number;
  mrp: number;
  prate: number;
  srate: number;
  tax: number; // Tax percentage
}

export interface Product {
  id: string;
  code: string;
  name: string;
  hsnCode: string;
  batches: ProductBatch[]; // Originally BAT1..9, etc.
}

export interface InvoiceLineItem {
  productId: string;
  productName: string;
  batchCode: string;
  hsnCode: string;
  quantity: number;
  mrp: number;
  srate: number;
  taxPercentage: number;
  lineDiscountPercentage: number;
  
  // Calculated fields
  grossAmount: number;
  discountAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
}

export interface Invoice {
  isInterState: boolean; // Determines IGST vs CGST/SGST
  lineItems: InvoiceLineItem[];
  cashDiscountPercentage: number;
  
  // Calculated totals
  subTotalGross: number;
  totalLineDiscount: number;
  cashDiscountAmount: number;
  taxableValue: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalTaxAmount: number;
  roundOff: number;
  grandTotal: number;
}
