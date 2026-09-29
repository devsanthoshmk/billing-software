/**
 * String formatting and Indian currency utilities for ESC/POS & Dot-Matrix printing.
 */

export function padLeft(value: string | number, length: number, char: string = ' '): string {
  const str = String(value ?? '');
  if (str.length >= length) return str.slice(0, length);
  return char.repeat(length - str.length) + str;
}

export function padRight(value: string | number, length: number, char: string = ' '): string {
  const str = String(value ?? '');
  if (str.length >= length) return str.slice(0, length);
  return str + char.repeat(length - str.length);
}

export function center(str: string, width: number, char: string = ' '): string {
  const text = String(str ?? '').slice(0, width);
  const totalPad = width - text.length;
  if (totalPad <= 0) return text;
  const leftPad = Math.floor(totalPad / 2);
  const rightPad = totalPad - leftPad;
  return char.repeat(leftPad) + text + char.repeat(rightPad);
}

export function formatCurrency(amount: number): string {
  const num = Number(amount || 0);
  return num.toFixed(2);
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];

function convertGroup(num: number): string {
  let str = '';
  if (num >= 100) {
    str += ONES[Math.floor(num / 100)] + ' Hundred ';
    num %= 100;
  }
  if (num >= 20) {
    str += TENS[Math.floor(num / 10)] + ' ';
    num %= 10;
  }
  if (num > 0) {
    str += ONES[num] + ' ';
  }
  return str.trim();
}

/**
 * Converts a numeric amount to Indian Rupee Words (Lakhs and Crores).
 * Example: 14502.50 -> "Rupees Fourteen Thousand Five Hundred Two and Fifty Paise Only"
 */
export function numberToWordsINR(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'Rupees Zero Only';

  const isNegative = amount < 0;
  const absoluteAmount = Math.abs(amount);

  let rupees = Math.floor(absoluteAmount);
  const paise = Math.round((absoluteAmount - rupees) * 100);

  let words = '';

  const crores = Math.floor(rupees / 10000000);
  rupees %= 10000000;

  const lakhs = Math.floor(rupees / 100000);
  rupees %= 100000;

  const thousands = Math.floor(rupees / 1000);
  rupees %= 1000;

  const hundredsAndUnits = rupees;

  if (crores > 0) {
    words += convertGroup(crores) + ' Crore ';
  }
  if (lakhs > 0) {
    words += convertGroup(lakhs) + ' Lakh ';
  }
  if (thousands > 0) {
    words += convertGroup(thousands) + ' Thousand ';
  }
  if (hundredsAndUnits > 0) {
    words += convertGroup(hundredsAndUnits) + ' ';
  }

  words = words.trim();
  if (!words) words = 'Zero';

  let result = (isNegative ? 'Negative ' : '') + 'Rupees ' + words;

  if (paise > 0) {
    result += ' and ' + convertGroup(paise) + ' Paise';
  }

  return result + ' Only';
}
