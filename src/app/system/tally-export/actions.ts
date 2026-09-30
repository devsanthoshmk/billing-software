'use server';

import { db } from '@/lib/db';
import { invoices, purchases, customerReceipts, supplierPayments, customers, suppliers } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';

export async function generateTallyXmlExport(startDate: string, endDate: string) {
  try {
    const invs = await db.query.invoices.findMany({
      where: and(
        eq(invoices.isCancelled, false),
        gte(invoices.invoiceDate, startDate),
        lte(invoices.invoiceDate, endDate)
      ),
      with: { customer: true, items: true },
      orderBy: [invoices.invoiceDate],
    });

    const receipts = await db.query.customerReceipts.findMany({
      where: and(
        gte(customerReceipts.receiptDate, startDate),
        lte(customerReceipts.receiptDate, endDate)
      ),
      with: { customer: true },
      orderBy: [customerReceipts.receiptDate],
    });

    // Construct valid Tally Prime XML structure
    let xml = '<?xml version="1.0" encoding="utf-8"?>\n<ENVELOPE>\n  <HEADER>\n    <TALLYREQUEST>Import Data</TALLYREQUEST>\n  </HEADER>\n  <BODY>\n    <IMPORTDATA>\n      <REQUESTDESC>\n        <REPORTNAME>Vouchers</REPORTNAME>\n      </REQUESTDESC>\n      <REQUESTDATA>\n';

    for (const inv of invs) {
      const formattedDate = inv.invoiceDate.replace(/-/g, '');
      xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n          <VOUCHER VCHTYPE="Sales" ACTION="Create">\n            <DATE>${formattedDate}</DATE>\n            <VOUCHERNUMBER>${inv.invoiceNo}</VOUCHERNUMBER>\n            <PARTYLEDGERNAME>${inv.customer?.name || 'Cash'}</PARTYLEDGERNAME>\n            <EFFECTIVEDATE>${formattedDate}</EFFECTIVEDATE>\n            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>${inv.customer?.name || 'Cash'}</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n              <AMOUNT>-${inv.netAmount.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>Sales Account</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n              <AMOUNT>${inv.taxableAmount.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;

      if (inv.cgstAmount > 0) {
        xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>Output CGST</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n              <AMOUNT>${inv.cgstAmount.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
      }
      if (inv.sgstAmount > 0) {
        xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>Output SGST</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n              <AMOUNT>${inv.sgstAmount.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
      }
      if (inv.igstAmount > 0) {
        xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>Output IGST</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n              <AMOUNT>${inv.igstAmount.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
      }
      xml += '          </VOUCHER>\n        </TALLYMESSAGE>\n';
    }

    for (const r of receipts) {
      const formattedDate = r.receiptDate.replace(/-/g, '');
      xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n          <VOUCHER VCHTYPE="Receipt" ACTION="Create">\n            <DATE>${formattedDate}</DATE>\n            <VOUCHERNUMBER>${r.receiptNo}</VOUCHERNUMBER>\n            <PARTYLEDGERNAME>${r.customer?.name || 'Customer'}</PARTYLEDGERNAME>\n            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>${r.paymentMode === 'CASH' ? 'Cash' : 'Bank'}</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n              <AMOUNT>-${r.totalAmount.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>${r.customer?.name || 'Customer'}</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n              <AMOUNT>${r.totalAmount.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n          </VOUCHER>\n        </TALLYMESSAGE>\n`;
    }

    xml += '      </REQUESTDATA>\n    </IMPORTDATA>\n  </BODY>\n</ENVELOPE>';

    return {
      success: true,
      invoicesCount: invs.length,
      receiptsCount: receipts.length,
      xmlContent: xml,
    };
  } catch (err: any) {
    console.error('generateTallyXmlExport error:', err);
    return { success: false, error: err.message };
  }
}
