'use server';

import { db } from '@/lib/db';
import { customers, areas, customerOutstandings, systemConfig } from '@/lib/db/schema';
import { eq, desc, and, gt } from 'drizzle-orm';

export async function getPartyBalances(areaId?: string) {
  try {
    const areasList = await db.query.areas.findMany({
      where: eq(areas.isActive, true),
      orderBy: [areas.name],
    });

    let whereClause = eq(customers.isActive, true);
    if (areaId && areaId.trim()) {
      whereClause = and(eq(customers.isActive, true), eq(customers.areaId, areaId)) as any;
    }

    const rows = await db
      .select({
        id: customers.id,
        code: customers.code,
        name: customers.name,
        address: customers.addressLine1,
        phone: customers.phone,
        areaId: customers.areaId,
        areaName: areas.name,
        creditLimit: customers.creditLimit,
        creditDays: customers.creditDays,
        closingBalance: customers.closingBalance,
      })
      .from(customers)
      .leftJoin(areas, eq(customers.areaId, areas.id))
      .where(whereClause)
      .orderBy(desc(customers.closingBalance))
      .limit(100);

    return { success: true, areas: areasList, customers: rows };
  } catch (err: any) {
    console.error('getPartyBalances error:', err);
    return { success: false, error: err.message, areas: [], customers: [] };
  }
}

export async function generatePartyBalanceSlip(customerId: string, format: '40COL' | '80COL' = '40COL') {
  try {
    const cust = await db.query.customers.findFirst({
      where: eq(customers.id, customerId),
      with: {
        area: true,
        outstandings: {
          where: gt(customerOutstandings.balanceAmount, 0),
          orderBy: [customerOutstandings.invoiceDate],
        },
      },
    });

    if (!cust) {
      return { success: false, error: 'Customer not found' };
    }

    const config = await db.query.systemConfig.findFirst() || {
      companyName: 'SIVA PHARMACEUTICAL DISTRIBUTORS',
      phone: '044-28282828',
      currentWorkingDate: '2026-09-28',
    };

    let slipText = '';
    if (format === '40COL') {
      const lines: string[] = [];
      lines.push('========================================');
      lines.push(config.companyName.slice(0, 40));
      lines.push(`PHONE: ${config.phone || ''}`);
      lines.push('----------------------------------------');
      lines.push(`DATE: ${new Date().toLocaleDateString('en-GB')}  TIME: ${new Date().toTimeString().slice(0, 5)}`);
      lines.push(`PARTY: ${cust.code} - ${cust.name.slice(0, 24)}`);
      lines.push(`AREA : ${cust.area?.name || 'LOCAL'}`);
      lines.push('----------------------------------------');
      lines.push('BILL NO       DATE       DAYS    BALANCE');
      lines.push('----------------------------------------');

      let totalOutstanding = 0;
      for (const bill of cust.outstandings) {
        totalOutstanding += bill.balanceAmount;
        const bNo = bill.invoiceNo.padEnd(12, ' ');
        const dt = bill.invoiceDate.slice(5).padEnd(8, ' ');
        const amt = bill.balanceAmount.toFixed(2).padStart(12, ' ');
        lines.push(`${bNo} ${dt}     ${amt}`);
      }

      lines.push('========================================');
      lines.push(`TOTAL OUTSTANDING: Rs. ${totalOutstanding.toFixed(2).padStart(15, ' ')}`);
      lines.push(`CURRENT BALANCE  : Rs. ${cust.closingBalance.toFixed(2).padStart(15, ' ')}`);
      lines.push(`CREDIT LIMIT     : Rs. ${cust.creditLimit.toFixed(2).padStart(15, ' ')}`);
      lines.push('========================================');
      lines.push('  PLEASE CLEAR OVERDUE DUES AT EARLIEST ');
      lines.push('           THANK YOU - SIVA ERP         ');
      lines.push('\n\n\n');
      slipText = lines.join('\n');
    } else {
      const lines: string[] = [];
      lines.push('='.repeat(80));
      lines.push(` ${config.companyName.padEnd(50, ' ')} STATEMENT OF ACCOUNT`);
      lines.push(` AS ON: ${new Date().toLocaleDateString('en-GB')}                                   SYS-1 ONLINE`);
      lines.push('-'.repeat(80));
      lines.push(` CUSTOMER: ${cust.code} - ${cust.name}`);
      lines.push(` ADDRESS : ${cust.addressLine1 || ''}, ${cust.area?.name || ''}`);
      lines.push('-'.repeat(80));
      lines.push(' S.NO  INVOICE NO     INVOICE DATE  DUE DATE     ORIGINAL AMT   OUTSTANDING AMT ');
      lines.push('-'.repeat(80));

      let total = 0;
      cust.outstandings.forEach((bill, idx) => {
        total += bill.balanceAmount;
        const sNo = String(idx + 1).padStart(4, ' ');
        const iNo = bill.invoiceNo.padEnd(14, ' ');
        const iDt = bill.invoiceDate.padEnd(13, ' ');
        const dDt = bill.dueDate.padEnd(13, ' ');
        const orig = bill.originalAmount.toFixed(2).padStart(14, ' ');
        const bal = bill.balanceAmount.toFixed(2).padStart(17, ' ');
        lines.push(` ${sNo}  ${iNo} ${iDt} ${dDt} ${orig} ${bal}`);
      });

      lines.push('='.repeat(80));
      lines.push(` TOTAL OUTSTANDING DUES:                            Rs. ${total.toFixed(2).padStart(18, ' ')}`);
      lines.push(` LEDGER CLOSING BALANCE:                            Rs. ${cust.closingBalance.toFixed(2).padStart(18, ' ')}`);
      lines.push('='.repeat(80));
      slipText = lines.join('\n');
    }

    return { success: true, slipText, customerName: cust.name, balance: cust.closingBalance };
  } catch (err: any) {
    console.error('generatePartyBalanceSlip error:', err);
    return { success: false, error: err.message };
  }
}
