import type { Product, ProductBatch, InvoiceLineItem, Invoice } from './types';

export class BillingEngine {
  /**
   * Allocate stock using FIFO across the 9 batch columns (originally BAT1..9)
   * Deducts quantity from the product batches and returns the allocated items.
   */
  static allocateStockFIFO(
    product: Product,
    requiredQty: number,
    lineDiscountPercentage: number = 0
  ): InvoiceLineItem[] {
    const allocatedLines: InvoiceLineItem[] = [];
    let remainingQty = requiredQty;

    for (let i = 0; i < product.batches.length; i++) {
      if (remainingQty <= 0) break;

      const batch = product.batches[i];
      if (batch.qty > 0) {
        const allocQty = Math.min(batch.qty, remainingQty);
        
        batch.qty -= allocQty;
        remainingQty -= allocQty;

        const lineItem = this.calculateLineItem(
          product,
          batch,
          allocQty,
          lineDiscountPercentage
        );
        allocatedLines.push(lineItem);
      }
    }

    if (remainingQty > 0) {
      throw new Error(`Insufficient stock for product ${product.code}. Missing ${remainingQty} units.`);
    }

    return allocatedLines;
  }

  /**
   * Calculate line item totals (amounts, discounts, tax)
   */
  static calculateLineItem(
    product: Product,
    batch: ProductBatch,
    quantity: number,
    lineDiscountPercentage: number
  ): InvoiceLineItem {
    const grossAmount = quantity * batch.srate;
    // Discount is calculated on gross amount before tax
    const discountAmount = Number(((grossAmount * lineDiscountPercentage) / 100).toFixed(2));
    const taxableAmount = grossAmount - discountAmount;

    // We leave tax calculation to the invoice level to handle interstate logic,
    // but we can initialize the placeholders here.
    return {
      productId: product.id,
      productName: product.name,
      batchCode: batch.bat,
      hsnCode: product.hsnCode,
      quantity,
      mrp: batch.mrp,
      srate: batch.srate,
      taxPercentage: batch.tax,
      lineDiscountPercentage,
      grossAmount,
      discountAmount,
      taxableAmount,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      totalAmount: 0
    };
  }

  /**
   * Calculate invoice totals, applying cash discounts, GST slabs, and roundoffs
   */
  static generateInvoice(
    lineItems: InvoiceLineItem[],
    cashDiscountPercentage: number,
    isInterState: boolean
  ): Invoice {
    let subTotalGross = 0;
    let totalLineDiscount = 0;
    
    // Sum basic totals
    lineItems.forEach(item => {
      subTotalGross += item.grossAmount;
      totalLineDiscount += item.discountAmount;
    });

    // Subtotal after line item discounts
    const subTotalNet = subTotalGross - totalLineDiscount;

    // Apply overall cash discount (distributed proportionally or just taken off the bottom line)
    // ERP systems usually take cash discount off the taxable value of each item.
    let totalTaxableValue = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    lineItems.forEach(item => {
      // Cash discount applied to the line's taxable amount proportionally
      const itemCashDiscount = Number(((item.taxableAmount * cashDiscountPercentage) / 100).toFixed(2));
      const finalTaxableAmount = item.taxableAmount - itemCashDiscount;
      
      let cgst = 0, sgst = 0, igst = 0;
      const taxAmt = Number(((finalTaxableAmount * item.taxPercentage) / 100).toFixed(2));

      if (isInterState) {
        igst = taxAmt;
      } else {
        cgst = Number((taxAmt / 2).toFixed(2));
        sgst = Number((taxAmt / 2).toFixed(2));
      }

      item.cgstAmount = cgst;
      item.sgstAmount = sgst;
      item.igstAmount = igst;
      item.totalAmount = finalTaxableAmount + cgst + sgst + igst;

      totalTaxableValue += finalTaxableAmount;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;
    });

    const cashDiscountAmount = Number(((subTotalNet * cashDiscountPercentage) / 100).toFixed(2));
    const totalTaxAmount = totalCgst + totalSgst + totalIgst;
    
    const unroundedTotal = totalTaxableValue + totalTaxAmount;
    const grandTotal = Math.round(unroundedTotal);
    const roundOff = Number((grandTotal - unroundedTotal).toFixed(2));

    return {
      isInterState,
      lineItems,
      cashDiscountPercentage,
      subTotalGross: Number(subTotalGross.toFixed(2)),
      totalLineDiscount: Number(totalLineDiscount.toFixed(2)),
      cashDiscountAmount,
      taxableValue: Number(totalTaxableValue.toFixed(2)),
      totalCgst: Number(totalCgst.toFixed(2)),
      totalSgst: Number(totalSgst.toFixed(2)),
      totalIgst: Number(totalIgst.toFixed(2)),
      totalTaxAmount: Number(totalTaxAmount.toFixed(2)),
      roundOff,
      grandTotal
    };
  }
}
