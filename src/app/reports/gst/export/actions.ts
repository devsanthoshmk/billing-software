'use server';

import { db } from '@/lib/db';
import { invoices, invoiceItems, customers, systemConfig } from '@/lib/db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { roundToPaise } from '@/lib/business-engine/calculations';

export async function generateGstr1Export(startDate: string, endDate: string) {
  try {
    const config = await db.query.systemConfig.findFirst() || {
      gstin: '33AAAAA0000A1Z5',
      companyName: 'SIVA PHARMACEUTICAL DISTRIBUTORS',
      stateCode: '33',
    };

    const invs = await db.query.invoices.findMany({
      where: and(
        eq(invoices.isCancelled, false),
        gte(invoices.invoiceDate, startDate),
        lte(invoices.invoiceDate, endDate)
      ),
      with: {
        customer: true,
        items: true,
      },
      orderBy: [invoices.invoiceDate, invoices.invoiceNo],
    });

    const b2bInvoices: any[] = [];
    const b2cInvoices: any[] = [];
    const hsnSummary: Record<string, { desc: string; uqc: string; totalQty: number; totalVal: number; taxableVal: number; igst: number; cgst: number; sgst: number }> = {};

    let totalB2bTaxable = 0;
    let totalB2cTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    for (const inv of invs) {
      const isB2B = Boolean(inv.customer?.gstin && inv.customer.gstin.length === 15);

      const invRecord = {
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        customerGstin: inv.customer?.gstin || 'N/A',
        customerName: inv.customer?.name || 'CASH',
        placeOfSupply: inv.isInterstate ? 'OUTSTATION' : `${config.stateCode}-Tamil Nadu`,
        taxableValue: inv.taxableAmount,
        cgst: inv.cgstAmount,
        sgst: inv.sgstAmount,
        igst: inv.igstAmount,
        invoiceValue: inv.netAmount,
      };

      if (isB2B) {
        b2bInvoices.push(invRecord);
        totalB2bTaxable += inv.taxableAmount;
      } else {
        b2cInvoices.push(invRecord);
        totalB2cTaxable += inv.taxableAmount;
      }

      totalCgst += inv.cgstAmount;
      totalSgst += inv.sgstAmount;
      totalIgst += inv.igstAmount;

      // Aggregate HSN
      for (const it of inv.items) {
        const hsn = it.hsnCode || '3004';
        if (!hsnSummary[hsn]) {
          hsnSummary[hsn] = {
            desc: it.productName,
            uqc: 'BOX',
            totalQty: 0,
            totalVal: 0,
            taxableVal: 0,
            igst: 0,
            cgst: 0,
            sgst: 0,
          };
        }
        hsnSummary[hsn].totalQty += it.quantity + it.freeQuantity;
        hsnSummary[hsn].totalVal += it.netAmount;
        hsnSummary[hsn].taxableVal += it.taxableAmount;
        hsnSummary[hsn].cgst += it.cgstAmount;
        hsnSummary[hsn].sgst += it.sgstAmount;
        hsnSummary[hsn].igst += it.igstAmount;
      }
    }

    // Official GSTR-1 JSON Schema format
    const gstr1Json = {
      gstin: config.gstin,
      fp: startDate.slice(5, 7) + startDate.slice(0, 4), // e.g. 092026
      gt: roundToPaise(totalB2bTaxable + totalB2cTaxable),
      cur_gt: roundToPaise(totalB2bTaxable + totalB2cTaxable),
      b2b: b2bInvoices,
      b2cs: b2cInvoices,
      hsn: {
        data: Object.entries(hsnSummary).map(([hsn, data]) => ({
          hsn_sc: hsn,
          desc: data.desc,
          uqc: data.uqc,
          qty: data.totalQty,
          val: roundToPaise(data.totalVal),
          txval: roundToPaise(data.taxableVal),
          iamt: roundToPaise(data.igst),
          camt: roundToPaise(data.cgst),
          samt: roundToPaise(data.sgst),
        })),
      },
    };

    return {
      success: true,
      summary: {
        totalInvoices: invs.length,
        b2bCount: b2bInvoices.length,
        b2cCount: b2cInvoices.length,
        totalB2bTaxable,
        totalB2cTaxable,
        totalCgst,
        totalSgst,
        totalIgst,
        totalTax: totalCgst + totalSgst + totalIgst,
      },
      b2bInvoices,
      b2cInvoices,
      hsnList: Object.entries(hsnSummary).map(([hsn, data]) => ({ hsn, ...data })),
      gstr1JsonString: JSON.stringify(gstr1Json, null, 2),
    };
  } catch (err: any) {
    console.error('generateGstr1Export error:', err);
    return { success: false, error: err.message };
  }
}
