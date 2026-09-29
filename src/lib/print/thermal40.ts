import { PrintInvoiceData } from './types';
import { padLeft, padRight, center, formatCurrency } from './formatUtils';
import { ESC_COMMANDS } from './escCodes';

const WIDTH = 40;
const DBL_SEP = '='.repeat(WIDTH);
const SGL_SEP = '-'.repeat(WIDTH);

export function formatThermalReceipt40(
  data: PrintInvoiceData,
  options?: { rawEscPos?: boolean }
): string {
  const lines: string[] = [];

  // Header
  lines.push(DBL_SEP);
  lines.push(center(data.company.companyName.toUpperCase(), WIDTH));
  if (data.company.tradeName) {
    lines.push(center(data.company.tradeName, WIDTH));
  }
  lines.push(center(data.company.addressLine1, WIDTH));
  if (data.company.phone) {
    lines.push(center(`TEL: ${data.company.phone}`, WIDTH));
  }
  lines.push(center(`DL: ${data.company.dlNo20b}`, WIDTH));
  lines.push(center(`GSTIN: ${data.company.gstin}`, WIDTH));
  lines.push(SGL_SEP);

  // Voucher Details
  const invLine = `${padRight(`Inv: ${data.invoiceNo}`, 22)}${padLeft(`Date: ${data.invoiceDate}`, 18)}`;
  lines.push(invLine.slice(0, WIDTH));

  const timeStr = data.invoiceTime ? data.invoiceTime.slice(0, 8) : '';
  const termLine = `${padRight(`Time: ${timeStr}`, 22)}${padLeft(`Term: ${data.paymentTerms}`, 18)}`;
  lines.push(termLine.slice(0, WIDTH));

  const custLine = `Cust: ${data.customer.name}`.slice(0, WIDTH);
  lines.push(custLine);
  if (data.customer.gstin) {
    lines.push(`GST : ${data.customer.gstin}`.slice(0, WIDTH));
  }
  lines.push(DBL_SEP);

  // Items Table Header: 16 + 4 + 6 + 6 + 8 = 40
  // Item (16) | Qty (4) | Rate (6) | Disc (6) | Net (8)
  const itemHdr = `${padRight('ITEM', 16)}${padLeft('QTY', 4)}${padLeft('RATE', 6)}${padLeft('DISC', 6)}${padLeft('NET', 8)}`;
  lines.push(itemHdr);
  lines.push(SGL_SEP);

  for (const item of data.items) {
    const nameCol = padRight(item.productName.slice(0, 16), 16);
    const qtyCol = padLeft(item.quantity, 4);
    const rateCol = padLeft(item.rate.toFixed(2).slice(0, 6), 6);
    const discCol = padLeft((item.discountAmount || 0).toFixed(2).slice(0, 6), 6);
    const netCol = padLeft(item.netAmount.toFixed(2).slice(0, 8), 8);

    lines.push(`${nameCol}${qtyCol}${rateCol}${discCol}${netCol}`.slice(0, WIDTH));

    // Batch & Expiry detail sub-row
    const expStr = item.expiryDate ? item.expiryDate.slice(0, 7) : '';
    const subLine = ` B:${item.batchNo.slice(0, 8)} E:${expStr} MRP:${item.mrp.toFixed(2)}`;
    lines.push(subLine.slice(0, WIDTH));
  }
  lines.push(SGL_SEP);

  // Summary helper
  const addSummaryRow = (label: string, amount: number) => {
    const lbl = padRight(label, 24);
    const val = padLeft(formatCurrency(amount), 16);
    lines.push(`${lbl}${val}`.slice(0, WIDTH));
  };

  addSummaryRow('Subtotal Gross :', data.subtotalGross);
  if (data.totalLineDiscount + data.cashDiscountAmount > 0) {
    addSummaryRow('Total Discounts :', -(data.totalLineDiscount + data.cashDiscountAmount));
  }
  addSummaryRow('Taxable Value  :', data.taxableAmount);

  if (data.cgstAmount > 0) {
    addSummaryRow('CGST Output    :', data.cgstAmount);
  }
  if (data.sgstAmount > 0) {
    addSummaryRow('SGST Output    :', data.sgstAmount);
  }
  if (data.igstAmount > 0) {
    addSummaryRow('IGST Output    :', data.igstAmount);
  }
  if (data.roundOff !== 0) {
    addSummaryRow('Round Off      :', data.roundOff);
  }
  lines.push(DBL_SEP);

  // Grand Total
  const grandLbl = padRight('GRAND TOTAL    :', 22);
  const grandVal = padLeft(`Rs. ${formatCurrency(data.netAmount)}`, 18);
  lines.push(`${grandLbl}${grandVal}`.slice(0, WIDTH));
  lines.push(DBL_SEP);

  // Footer notes
  lines.push(center(`Items: ${data.totalItemsCount} | Total Qty: ${data.totalQuantity}`, WIDTH));
  lines.push(center('Thank You! Visit Again.', WIDTH));
  lines.push(center('Goods once sold cannot be returned.', WIDTH));

  const textOutput = lines.join('\n');

  if (options?.rawEscPos) {
    return `${ESC_COMMANDS.INIT}${textOutput}\n\n\n\n${ESC_COMMANDS.CUT_PAPER_PARTIAL}`;
  }

  return textOutput;
}
