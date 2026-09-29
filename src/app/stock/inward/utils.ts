/**
 * Utility functions for Purchase Inward.
 * Pure helpers without Server Action constraints.
 */

/**
 * Parses 'MM/YY' to month-end ISO 'YYYY-MM-DD'.
 * Examples: '08/27' -> '2027-08-31', '02/24' -> '2024-02-29'
 */
export function parseExpiryMonthYearToIso(expiry: string): string {
  if (!expiry || !expiry.trim()) {
    throw new Error('Expiry date MM/YY is required');
  }
  const clean = expiry.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  const parts = clean.split('/');
  if (parts.length === 2) {
    const month = parseInt(parts[0], 10);
    let year = parseInt(parts[1], 10);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12) {
      const lastDay = new Date(year, month, 0).getDate();
      const mm = month.toString().padStart(2, '0');
      const dd = lastDay.toString().padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
  }
  throw new Error(`Invalid expiry format: "${expiry}". Expected MM/YY (e.g. 08/27).`);
}
