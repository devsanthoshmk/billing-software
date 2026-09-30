'use server';

import { db } from '@/lib/db';
import { invoices, invoiceItems, customers, systemConfig } from '@/lib/db/schema';
import { eq, desc, like, or, and } from 'drizzle-orm';
import { PrintInvoiceData } from '@/lib/print';

export async function searchInvoicesForReprint(query?: string) {
  try {
    let whereClause = undefined;
    if (query && query.trim()) {
      const q = `%${query.trim()}%`;
      whereClause = or(
        like(invoices.invoiceNo, q),
        like(customers.name, q),
        like(customers.code, q)
      );
    }

    const rows = await db
      .select({
        id: invoices.id,
        invoiceNo: invoices.invoiceNo,
        invoiceDate: invoices.invoiceDate,
        invoiceTime: invoices.invoiceTime,
        paymentTerms: invoices.paymentTerms,
        isInterstate: invoices.isInterstate,
        subtotalGross: invoices.subtotalGross,
        totalLineDiscount: invoices.totalLineDiscount,
        cashDiscountAmount: invoices.cashDiscountAmount,
        taxableAmount: invoices.taxableAmount,
        cgstAmount: invoices.cgstAmount,
        sgstAmount: invoices.sgstAmount,
        igstAmount: invoices.igstAmount,
        totalTaxAmount: invoices.totalTaxAmount,
        roundOff: invoices.roundOff,
        netAmount: invoices.netAmount,
        totalQuantity: invoices.totalQuantity,
        totalItemsCount: invoices.totalItemsCount,
        status: invoices.status,
        isCancelled: invoices.isCancelled,
        customerCode: customers.code,
        customerName: customers.name,
        customerAddress: customers.addressLine1,
        customerGstin: customers.gstin,
        customerDl20b: customers.dlNo20b,
        customerDl21b: customers.dlNo21b,
        closingBalance: customers.closingBalance,
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(whereClause)
      .orderBy(desc(invoices.invoiceDate), desc(invoices.invoiceNo))
      .limit(50);

    return { success: true, invoices: rows };
  } catch (err: any) {
    console.error('searchInvoicesForReprint error:', err);
    return { success: false, error: err.message, invoices: [] };
  }
}

export async function getInvoicePrintData(invoiceId: string, copyType: 'ORIGINAL' | 'DUPLICATE' | 'TRIPLICATE' | 'TRANSPORT' = 'DUPLICATE') {
  try {
    const inv = await db.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId),
      with: {
        customer: true,
        items: true,
      },
    });

    if (!inv) {
      return { success: false, error: 'Invoice not found' };
    }

    const config = await db.query.systemConfig.findFirst() || {
      companyName: 'SIVA PHARMACEUTICAL DISTRIBUTORS',
      tradeName: 'WHOLESALE SOFTWARE',
      addressLine1: 'WHOLESALE ADDRESS, PLACE.',
      phone: '044-28282828',
      gstin: '33AAAAA0000A1Z5',
      dlNo20b: 'TN/CHE/20B/12345',
      dlNo21b: 'TN/CHE/21B/12346',
      stateName: 'Tamil Nadu',
      stateCode: '33',
      bankDetailsLine1: 'BANK: STATE BANK OF INDIA, A/C: 12345678901',
      bankDetailsLine2: 'IFSC: SBIN0000123, BRANCH: MAIN BRANCH',
    };

    const printData: PrintInvoiceData = {
      invoiceNo: inv.invoiceNo,
      invoiceDate: inv.invoiceDate,
      invoiceTime: inv.invoiceTime,
      paymentTerms: inv.paymentTerms,
      isInterstate: inv.isInterstate,
      company: {
        companyName: config.companyName,
        tradeName: config.tradeName,
        addressLine1: config.addressLine1,
        phone: config.phone || '',
        gstin: config.gstin,
        dlNo20b: config.dlNo20b,
        dlNo21b: config.dlNo21b,
        stateName: config.stateName,
        stateCode: config.stateCode,
        bankDetailsLine1: config.bankDetailsLine1 || '',
        bankDetailsLine2: config.bankDetailsLine2 || '',
      },
      customer: {
        code: inv.customer?.code || 'WALKIN',
        name: inv.customer?.name || 'CASH CUSTOMER',
        address: inv.customer?.addressLine1 || 'LOCAL',
        gstin: inv.customer?.gstin || '',
        dlNo20b: inv.customer?.dlNo20b || '',
        dlNo21b: inv.customer?.dlNo21b || '',
        closingBalance: inv.customer?.closingBalance || 0,
      },
      items: inv.items.map((item, idx) => ({
        slNo: idx + 1,
        productName: item.productName,
        packaging: item.packaging,
        hsnCode: item.hsnCode,
        batchNo: item.batchNo,
        expiryDate: item.expiryDate,
        mrp: item.mrp,
        quantity: item.quantity,
        freeQuantity: item.freeQuantity,
        rate: item.sellingRate,
        discountPct: item.tradeDiscountPct,
        discountAmount: item.tradeDiscountAmount,
        taxableAmount: item.taxableAmount,
        taxPct: item.cgstRate + item.sgstRate + item.igstRate,
        netAmount: item.netAmount,
      })),
      subtotalGross: inv.subtotalGross,
      totalLineDiscount: inv.totalLineDiscount,
      cashDiscountAmount: inv.cashDiscountAmount,
      taxableAmount: inv.taxableAmount,
      cgstAmount: inv.cgstAmount,
      sgstAmount: inv.sgstAmount,
      igstAmount: inv.igstAmount,
      totalTaxAmount: inv.totalTaxAmount,
      roundOff: inv.roundOff,
      netAmount: inv.netAmount,
      totalQuantity: inv.totalQuantity,
      totalItemsCount: inv.totalItemsCount,
      preparedBy: 'OPERATOR',
    };

    return { success: true, printData, copyType };
  } catch (err: any) {
    console.error('getInvoicePrintData error:', err);
    return { success: false, error: err.message };
  }
}
