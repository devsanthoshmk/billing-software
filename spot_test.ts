import { calculateLineItem } from './src/lib/business-engine/calculations';

console.log("=== Edge Case Spot Tests ===");

// 2. Verify GST
const lineItem = calculateLineItem({
  quantity: 1,
  sellingRate: 100,
  taxPct: 5,
  isInterstate: false
} as any);

console.log("GST 5% Test:");
console.log("CGST:", lineItem.cgstAmount, "SGST:", lineItem.sgstAmount, "Total:", lineItem.netAmount);

if (lineItem.cgstAmount === 2.5 && lineItem.sgstAmount === 2.5 && lineItem.netAmount === 105) {
  console.log("GST Test PASS");
} else {
  console.log("GST Test FAIL");
}
