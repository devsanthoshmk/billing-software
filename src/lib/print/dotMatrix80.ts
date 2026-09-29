import { PrintInvoiceData } from './types';
import { padLeft, padRight, center, formatCurrency, numberToWordsINR } from './formatUtils';
import { ESC_COMMANDS } from './escCodes';

const WIDTH = 80;
const DBL_BORDER = '='.repeat(WIDTH);
const SGL_BORDER = '-'.repeat(WIDTH);

export function formatDotMatrixInvoice80(
  data: PrintInvoiceData,
  options?: { rawEscP?: boolean; condensed?: boolean }
): string {
  const lines: string[] = [];

  // Header Box
  lines.push(DBL_BORDER);
  lines.push(center(`TAX INVOICE - WHOLESALE PHARMACEUTICAL SUPPLY`, WIDTH));
  lines.push(center(data.company.companyName.toUpperCase(), WIDTH));
  if (data.company.tradeName) {
    lines.push(center(data.company.tradeName, WIDTH));
  }
  lines.push(center(data.company.addressLine1, WIDTH));
  const telGst = `PHONE: ${data.company.phone || 'N/A'} | GSTIN: ${data.company.gstin} | STATE: ${data.company.stateCode || '33'}`;
  lines.push(center(telGst, WIDTH));
  const dlLine = `DRUG LICENCE NOS: Form 20B: ${data.company.dlNo20b} | Form 21B: ${data.company.dlNo21b}`;
  lines.push(center(dlLine, WIDTH));
  lines.push(DBL_BORDER);

  // Bill To (Left: 42 chars) | Invoice Info (Right: 38 chars)
  const left1 = padRight(`M/s: ${data.customer.name}`.slice(0, 41), 42);
  const right1 = padRight(`INV NO : ${data.invoiceNo}`, 38);
  lines.push(`${left1}${right1}`);

  const left2 = padRight(`Address: ${data.customer.address || 'LOCAL'}`.slice(0, 41), 42);
  const right2 = padRight(`DATE   : ${data.invoiceDate} ${data.invoiceTime || ''}`.trim(), 38);
  lines.push(`${left2}${right2}`);

  const left3 = padRight(`GSTIN  : ${data.customer.gstin || 'UNREGISTERED'}`.slice(0, 41), 42);
  const right3 = padRight(`TERMS  : ${data.paymentTerms}`, 38);
  lines.push(`${left3}${right3}`);

  const custDl = data.customer.dlNo20b ? `DL: ${data.customer.dlNo20b}` : '';
  const left4 = padRight(custDl.slice(0, 41), 42);
  const right4 = padRight(`DUE DT : ${data.dueDate || data.invoiceDate}`, 38);
  lines.push(`${left4}${right4}`);
  lines.push(SGL_BORDER);

  // Column Headers (Exact 80 chars total)
  // |Sl|PRODUCT NAME       |PACK |BATCH   |EXP  |  MRP |QTY |FR |  RATE  | NET AMT |
  //  1+ 2+1+19             +1+5  +1+8     +1+5  +1+6   +1+4 +1+3+1+8    +1+8      +1 = 80
  const colHeader = '|Sl|PRODUCT NAME       |PACK |BATCH   |EXP  |  MRP |QTY |FR |  RATE  | NET AMT |';
  lines.push(colHeader);
  lines.push(SGL_BORDER);

  let slNo = 1;
  for (const item of data.items) {
    const sl = padLeft(slNo++, 2);
    const name = padRight(item.productName.slice(0, 19), 19);
    const pack = padRight(item.packaging.slice(0, 5), 5);
    const batch = padRight(item.batchNo.slice(0, 8), 8);
    const exp = padRight(item.expiryDate ? item.expiryDate.slice(0, 5) : '', 5);
    const mrp = padLeft(item.mrp.toFixed(2).slice(0, 6), 6);
    const qty = padLeft(item.quantity, 4);
    const fr = padLeft(item.freeQuantity || 0, 3);
    const rate = padLeft(item.rate.toFixed(2).slice(0, 8), 8);
    const net = padLeft(item.netAmount.toFixed(2).slice(0, 8), 8);

    const line = `|${sl}|${name}|${pack}|${batch}|${exp}|${mrp}|${qty}|${fr}|${rate}|${net}|`;
    lines.push(line.slice(0, WIDTH));
  }

  lines.push(SGL_BORDER);

  // Tax Slabs Breakdown Summary Table
  if (data.taxSlabs && data.taxSlabs.length > 0) {
    lines.push('TAX BREAKDOWN:');
    lines.push('| SLAB | TAXABLE VALUE |   CGST   |   SGST   |   IGST   | TOTAL TAX |');
    for (const slab of data.taxSlabs) {
      if (slab.taxableAmount > 0 || slab.totalTax > 0) {
        const slabLbl = padRight(`${slab.taxRatePct}%`, 6);
        const taxable = padLeft(slab.taxableAmount.toFixed(2), 15);
        const cgst = padLeft(slab.cgstAmount.toFixed(2), 10);
        const sgst = padLeft(slab.sgstAmount.toFixed(2), 10);
        const igst = padLeft(slab.igstAmount.toFixed(2), 10);
        const total = padLeft(slab.totalTax.toFixed(2), 11);
        lines.push(`|${slabLbl}|${taxable}|${cgst}|${sgst}|${igst}|${total}|`.slice(0, WIDTH));
      }
    }
    lines.push(SGL_BORDER);
  }

  // Financial Summary Block
  const addSummaryRow = (label: string, value: string) => {
    const lbl = padRight(label, 56);
    const val = padLeft(value, 24);
    lines.push(`${lbl}${val}`);
  };

  addSummaryRow('SUBTOTAL GROSS SALES', `Rs. ${formatCurrency(data.subtotalGross)}`);
  if (data.totalLineDiscount > 0) {
    addSummaryRow('LESS: TRADE DISCOUNT', `(-) Rs. ${formatCurrency(data.totalLineDiscount)}`);
  }
  if (data.cashDiscountAmount > 0) {
    addSummaryRow('LESS: PROMPT CASH DISCOUNT', `(-) Rs. ${formatCurrency(data.cashDiscountAmount)}`);
  }
  addSummaryRow('NET TAXABLE TURNOVER', `Rs. ${formatCurrency(data.taxableAmount)}`);
  if (data.cgstAmount > 0) addSummaryRow('CGST OUTPUT TAX', `(+) Rs. ${formatCurrency(data.cgstAmount)}`);
  if (data.sgstAmount > 0) addSummaryRow('SGST OUTPUT TAX', `(+) Rs. ${formatCurrency(data.sgstAmount)}`);
  if (data.igstAmount > 0) addSummaryRow('IGST OUTPUT TAX', `(+) Rs. ${formatCurrency(data.igstAmount)}`);
  if (data.roundOff !== 0) addSummaryRow('ROUND OFF ADJUSTMENT', `${data.roundOff > 0 ? '(+) ' : ''}Rs. ${formatCurrency(data.roundOff)}`);
  lines.push(DBL_BORDER);

  addSummaryRow('NET INVOICE TOTAL (PAYABLE)', `Rs. ${formatCurrency(data.netAmount)}`);
  lines.push(DBL_BORDER);

  // Amount in words
  lines.push(`AMOUNT IN WORDS: ${numberToWordsINR(data.netAmount)}`.slice(0, WIDTH));
  lines.push(SGL_BORDER);

  // Bank & Footer Terms
  if (data.company.bankDetailsLine1) {
    lines.push(data.company.bankDetailsLine1.slice(0, WIDTH));
  }
  if (data.company.bankDetailsLine2) {
    lines.push(data.company.bankDetailsLine2.slice(0, WIDTH));
  }
  lines.push('TERMS: Goods once sold will not be accepted back without authorization.');
  lines.push('Subject to local jurisdiction. This is a computer generated invoice.');
  lines.push(DBL_BORDER);

  const textOutput = lines.join('\n');

  if (options?.rawEscP) {
    const prefix = options.condensed
      ? `${ESC_COMMANDS.INIT}${ESC_COMMANDS.CONDENSED_ON}`
      : ESC_COMMANDS.INIT;
    return `${prefix}${textOutput}\n\n${ESC_COMMANDS.FORM_FEED}`;
  }

  return textOutput;
}
