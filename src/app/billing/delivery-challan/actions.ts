'use server';

import { db } from '@/lib/db';
import { invoices, invoiceItems, customers, products, productBatches, systemConfig } from '@/lib/db/schema';
import { eq, desc, like, or } from 'drizzle-orm';
import { roundToPaise } from '@/lib/business-engine/calculations';

export interface ChallanLineInput {
  productId: string;
  batchId: string;
  productName: string;
  packaging: string;
  hsnCode: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  freeQuantity: number;
  sellingRate: number;
  mrp: number;
}

export async function getDeliveryChallanInitialData() {
  try {
    const custs = await db.query.customers.findMany({
      where: eq(customers.isActive, true),
      orderBy: [customers.name],
    });

    const prods = await db.query.products.findMany({
      where: eq(products.isActive, true),
      with: {
        batches: {
          where: eq(productBatches.isActive, true),
        },
      },
      orderBy: [products.name],
    });

    return { success: true, customers: custs, products: prods };
  } catch (err: any) {
    console.error('getDeliveryChallanInitialData error:', err);
    return { success: false, error: err.message, customers: [], products: [] };
  }
}

export async function createDeliveryChallan(input: {
  customerId: string;
  challanDate: string;
  transportName?: string;
  destination?: string;
  lrNo?: string;
  preparedBy: string;
  items: ChallanLineInput[];
}) {
  try {
    if (!input.items || input.items.length === 0) {
      return { success: false, error: 'Challan must contain at least 1 item' };
    }

    // Generate DC series number
    const config = await db.query.systemConfig.findFirst();
    const dcSeq = config?.nextDeliveryChallanNo || 101;
    const dcNo = `DC-${String(dcSeq).padStart(6, '0')}`;

    // Calculate totals
    let subtotal = 0;
    let totalQty = 0;
    for (const it of input.items) {
      const lineVal = roundToPaise(it.quantity * it.sellingRate);
      subtotal += lineVal;
      totalQty += it.quantity + it.freeQuantity;
    }

    // Decrement stock for suspense dispatch
    for (const it of input.items) {
      const batch = await db.query.productBatches.findFirst({
        where: eq(productBatches.id, it.batchId),
      });
      if (batch) {
        const totalOut = it.quantity + it.freeQuantity;
        await db
          .update(productBatches)
          .set({
            stockQty: Math.max(0, batch.stockQty - totalOut),
          })
          .where(eq(productBatches.id, it.batchId));
      }
    }

    // Insert as a DRAFT / DC Invoice
    const invoiceId = crypto.randomUUID();
    await db.insert(invoices).values({
      id: invoiceId,
      invoiceNo: dcNo,
      invoiceSeries: 1,
      invoiceDate: input.challanDate,
      invoiceTime: new Date().toTimeString().slice(0, 8),
      customerId: input.customerId,
      deliveryChallanNo: dcNo,
      transportName: input.transportName || null,
      destination: input.destination || null,
      lrNo: input.lrNo || null,
      subtotalGross: subtotal,
      taxableAmount: subtotal,
      netAmount: Math.round(subtotal),
      roundOff: roundToPaise(Math.round(subtotal) - subtotal),
      totalQuantity: totalQty,
      totalItemsCount: input.items.length,
      status: 'DRAFT', // Marked DRAFT to distinguish delivery challan from tax invoice
      paymentTerms: 'CREDIT',
      dueDate: input.challanDate,
    });

    for (let i = 0; i < input.items.length; i++) {
      const it = input.items[i];
      await db.insert(invoiceItems).values({
        id: crypto.randomUUID(),
        invoiceId,
        sortOrder: i + 1,
        productId: it.productId,
        batchId: it.batchId,
        productName: it.productName,
        packaging: it.packaging,
        hsnCode: it.hsnCode,
        batchNo: it.batchNo,
        expiryDate: it.expiryDate,
        quantity: it.quantity,
        freeQuantity: it.freeQuantity,
        purchaseRate: 0,
        sellingRate: it.sellingRate,
        mrp: it.mrp,
        grossAmount: roundToPaise(it.quantity * it.sellingRate),
        taxableAmount: roundToPaise(it.quantity * it.sellingRate),
        taxCode: '01',
        cgstRate: 0,
        cgstAmount: 0,
        sgstRate: 0,
        sgstAmount: 0,
        igstRate: 0,
        igstAmount: 0,
        netAmount: roundToPaise(it.quantity * it.sellingRate),
      });
    }

    // Increment counter
    if (config) {
      await db
        .update(systemConfig)
        .set({ nextDeliveryChallanNo: dcSeq + 1 })
        .where(eq(systemConfig.id, config.id));
    }

    return { success: true, challanNo: dcNo, totalAmount: subtotal };
  } catch (err: any) {
    console.error('createDeliveryChallan error:', err);
    return { success: false, error: err.message };
  }
}
