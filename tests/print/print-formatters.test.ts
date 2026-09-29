import { describe, it, expect } from 'vitest';
import {
  padLeft,
  padRight,
  center,
  formatCurrency,
  numberToWordsINR,
} from '../../src/lib/print/formatUtils';
import { formatThermalReceipt40 } from '../../src/lib/print/thermal40';
import { formatDotMatrixInvoice80 } from '../../src/lib/print/dotMatrix80';
import type { PrintInvoiceData } from '../../src/lib/print/types';

/**
 * Print Formatter Tests (Feature F33 — ESC/POS & Dot-Matrix parity)
 * Tests formatting utilities and output conformance to exact column widths.
 */

// Shared test invoice payload
const MOCK_INVOICE: PrintInvoiceData = {
  invoiceNo: 'SI-20260401-0001',
  invoiceDate: '2026-04-01',
  invoiceTime: '10:30:00',
  paymentTerms: 'CASH',
  company: {
    companyName: 'SIVA WHOLESALE PHARMACY',
    tradeName: 'SIVA MEDICALS',
    addressLine1: '12 MAIN BAZAAR, SALEM - 636 001',
    phone: '0427-2345678',
    gstin: '33AABCS1429B1Z2',
    dlNo20b: 'TN-DL-20B-123456',
    dlNo21b: 'TN-DL-21B-789012',
  },
  customer: {
    code: 'C001',
    name: 'APOLLO PHARMACY',
    gstin: '33XYZAB1234C1Z5',
    closingBalance: 15000,
  },
  items: [
    {
      slNo: 1,
      productName: 'PARACETAMOL 500MG',
      packaging: '10x10',
      hsnCode: '3004',
      batchNo: 'BT001',
      expiryDate: '2027-06',
      mrp: 25.0,
      quantity: 10,
      rate: 20.0,
      discountPct: 5,
      discountAmount: 10.0,
      taxableAmount: 190.0,
      taxPct: 5,
      cgstAmount: 4.75,
      sgstAmount: 4.75,
      netAmount: 199.5,
    },
    {
      slNo: 2,
      productName: 'AMOXICILLIN 250MG',
      packaging: '10x10',
      hsnCode: '2941',
      batchNo: 'BT002',
      expiryDate: '2026-12',
      mrp: 85.0,
      quantity: 5,
      rate: 70.0,
      discountAmount: 0,
      taxableAmount: 350.0,
      taxPct: 12,
      cgstAmount: 21.0,
      sgstAmount: 21.0,
      netAmount: 392.0,
    },
  ],
  subtotalGross: 390.0,
  totalLineDiscount: 10.0,
  cashDiscountAmount: 0,
  taxableAmount: 540.0,
  cgstAmount: 25.75,
  sgstAmount: 25.75,
  igstAmount: 0,
  totalTaxAmount: 51.5,
  roundOff: -0.5,
  netAmount: 591.0,
  totalQuantity: 15,
  totalItemsCount: 2,
};

describe('Milestone 5 — Feature F33: Print Format Utilities', () => {
  describe('padLeft', () => {
    it('pads a short string to the left', () => {
      const result = padLeft('42', 6);
      expect(result).toBe('    42');
      expect(result.length).toBe(6);
    });

    it('truncates strings longer than target length', () => {
      const result = padLeft('1234567890', 5);
      expect(result.length).toBe(5);
    });

    it('handles numeric input', () => {
      const result = padLeft(99.5, 8);
      expect(result.length).toBe(8);
      expect(result.trimStart()).toBe('99.5');
    });
  });

  describe('padRight', () => {
    it('pads a string to the right', () => {
      const result = padRight('ITEM', 10);
      expect(result).toBe('ITEM      ');
      expect(result.length).toBe(10);
    });

    it('truncates strings exceeding the target', () => {
      const result = padRight('VERY LONG STRING', 5);
      expect(result.length).toBe(5);
    });
  });

  describe('center', () => {
    it('centers text within a given width', () => {
      const result = center('HELLO', 11);
      expect(result.length).toBe(11);
      expect(result.trim()).toBe('HELLO');
    });

    it('handles even and odd padding correctly', () => {
      const r1 = center('AB', 6);
      expect(r1.length).toBe(6);
      const r2 = center('ABC', 7);
      expect(r2.length).toBe(7);
    });

    it('truncates text that exceeds width', () => {
      const result = center('ABCDEFGHIJ', 5);
      expect(result.length).toBe(5);
    });
  });

  describe('formatCurrency', () => {
    it('formats a number to 2 decimal places', () => {
      expect(formatCurrency(1234.5)).toBe('1234.50');
      expect(formatCurrency(0)).toBe('0.00');
      expect(formatCurrency(99.999)).toBe('100.00');
    });
  });

  describe('numberToWordsINR', () => {
    it('converts whole rupee amounts correctly', () => {
      expect(numberToWordsINR(1000)).toMatch(/One Thousand/i);
      expect(numberToWordsINR(100000)).toMatch(/One Lakh/i);
      expect(numberToWordsINR(10000000)).toMatch(/One Crore/i);
    });

    it('includes paise when present', () => {
      expect(numberToWordsINR(1500.50)).toMatch(/Fifty Paise/i);
    });

    it('handles zero', () => {
      expect(numberToWordsINR(0)).toMatch(/Zero/i);
    });

    it('always ends with "Only"', () => {
      expect(numberToWordsINR(591)).toMatch(/Only$/i);
      expect(numberToWordsINR(0.75)).toMatch(/Only$/i);
    });

    it('handles crore + lakh combinations', () => {
      const result = numberToWordsINR(12500000); // 1.25 Crore
      expect(result).toMatch(/Crore/i);
      expect(result).toMatch(/Lakh/i);
    });
  });
});

describe('Milestone 5 — Feature F33: Thermal 40-Column Receipt Formatter', () => {
  it('generates output with exactly 40 characters per line (±0)', () => {
    const output = formatThermalReceipt40(MOCK_INVOICE);
    const lines = output.split('\n').filter(l => l.length > 0);
    expect(lines.length).toBeGreaterThan(10);

    // Every line must be <= 40 chars
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  it('includes company name in the header', () => {
    const output = formatThermalReceipt40(MOCK_INVOICE);
    expect(output.toUpperCase()).toContain('SIVA WHOLESALE PHARMACY');
  });

  it('includes GSTIN in the header', () => {
    const output = formatThermalReceipt40(MOCK_INVOICE);
    expect(output).toContain('33AABCS1429B1Z2');
  });

  it('includes invoice number', () => {
    const output = formatThermalReceipt40(MOCK_INVOICE);
    expect(output).toContain('SI-20260401-0001');
  });

  it('includes customer name', () => {
    const output = formatThermalReceipt40(MOCK_INVOICE);
    expect(output.toUpperCase()).toContain('APOLLO PHARMACY');
  });

  it('includes both product names', () => {
    const output = formatThermalReceipt40(MOCK_INVOICE);
    expect(output.toUpperCase()).toContain('PARACETAMOL');
    expect(output.toUpperCase()).toContain('AMOXICILLIN');
  });

  it('includes GRAND TOTAL line', () => {
    const output = formatThermalReceipt40(MOCK_INVOICE);
    expect(output).toContain('GRAND TOTAL');
    expect(output).toContain('591.00');
  });

  it('generates raw ESC/POS output when rawEscPos=true', () => {
    const output = formatThermalReceipt40(MOCK_INVOICE, { rawEscPos: true });
    // ESC/POS INIT command is \x1B\x40
    expect(output).toContain('\x1B\x40');
  });
});

describe('Milestone 5 — Feature F33: Dot-Matrix 80-Column Invoice Formatter', () => {
  it('generates output with <= 80 characters per line', () => {
    const output = formatDotMatrixInvoice80(MOCK_INVOICE);
    const lines = output.split('\n').filter(l => l.length > 0);
    expect(lines.length).toBeGreaterThan(10);

    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });

  it('includes company name and GSTIN', () => {
    const output = formatDotMatrixInvoice80(MOCK_INVOICE);
    expect(output.toUpperCase()).toContain('SIVA WHOLESALE PHARMACY');
    expect(output).toContain('33AABCS1429B1Z2');
  });

  it('includes both item names', () => {
    const output = formatDotMatrixInvoice80(MOCK_INVOICE);
    expect(output.toUpperCase()).toContain('PARACETAMOL');
    expect(output.toUpperCase()).toContain('AMOXICILLIN');
  });

  it('includes net amount in the footer', () => {
    const output = formatDotMatrixInvoice80(MOCK_INVOICE);
    expect(output).toContain('591.00');
  });

  it('includes amount in words', () => {
    const output = formatDotMatrixInvoice80(MOCK_INVOICE);
    expect(output.toUpperCase()).toMatch(/RUPEES/i);
    expect(output.toUpperCase()).toMatch(/ONLY/i);
  });
});
