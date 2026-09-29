/**
 * ESC/POS & ESC/P Printer Control Codes (Feature F33)
 */

export const ESC = '\x1B';
export const GS = '\x1D';
export const FS = '\x1C';

export const ESC_COMMANDS = {
  INIT: `${ESC}@`,                          // Reset printer
  BOLD_ON: `${ESC}E\x01`,                   // Bold ON
  BOLD_OFF: `${ESC}E\x00`,                  // Bold OFF
  UNDERLINE_ON: `${ESC}-\x01`,              // Underline ON
  UNDERLINE_OFF: `${ESC}-\x00`,             // Underline OFF
  CONDENSED_ON: '\x0F',                     // SI (17.14 CPI - condensed mode)
  CONDENSED_OFF: '\x12',                    // DC2 (10 CPI - standard mode)
  DOUBLE_WIDTH_ON: `${ESC}W\x01`,           // Double width ON
  DOUBLE_WIDTH_OFF: `${ESC}W\x00`,          // Double width OFF
  ALIGN_LEFT: `${ESC}a\x00`,                // Left align
  ALIGN_CENTER: `${ESC}a\x01`,              // Center align
  ALIGN_RIGHT: `${ESC}a\x02`,               // Right align
  LINE_SPACING_6LPI: `${ESC}2`,             // 6 lines per inch (default)
  LINE_SPACING_8LPI: `${ESC}0`,             // 8 lines per inch (compact)
  FORM_FEED: '\x0C',                        // Page eject / Form feed
  CUT_PAPER_PARTIAL: `${GS}V\x01`,          // Thermal paper cut
  DRAWER_KICK: `${ESC}p\x00\x19\xFA`,       // Cash drawer pulse
};

/**
 * Strips all printer control byte sequences to yield clean, printable ASCII.
 */
export function stripEscCodes(str: string): string {
  if (!str) return '';
  return str
    .replace(/\x1B[@E\-\Wa-z0-9\x00\x01\x02\x19\xFA]+/g, '')
    .replace(/\x1D[A-Za-z0-9\x00\x01\x02]+/g, '')
    .replace(/[\x0F\x12\x0C]/g, '');
}
