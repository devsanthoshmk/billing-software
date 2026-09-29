'use server';

import { db } from '../../../lib/db';
import { customers, suppliers, productBatches, products, taxSlabs } from '../../../lib/db/schema/masters';
import { creditNotes, debitNotes } from '../../../lib/db/schema/transactions';
import { auditLogs } from '../../../lib/db/schema/system';
import { eq, sql, desc, asc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import { roundToPaise } from '../../../lib/business-engine/calculations';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {}
}

export type NoteType =
  | 'EXPIRY_BROKEN'    // Stock routed to quarantineQty, credits customer
  | 'RATE_DIFFERENCE'  // Pure price adjustment, 0 stock movement
  | 'SHORTAGE_DAMAGE'  // Debits supplier payable for shortage/damage
  | 'OTHER';

export interface NoteItemInput {
  productId: string;
  batchId?: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  rate: number;         // For rate diff: (oldRate - newRate). For expiry/shortage: valuation rate
  oldRate?: number;
  newRate?: number;
  discountPct?: number;
  taxCode: string;
}

export interface CreateNoteInput {
  isDebitNote: boolean; // false = Credit Note, true = Debit Note
  partyType: 'CUSTOMER' | 'SUPPLIER';
  partyId: string;
  date: string; // ISO 'YYYY-MM-DD'
  noteType: NoteType;
  referenceInvoiceNo?: string;
  salesmanId?: string;
  remarks?: string;
  operatorId?: string;
  items: NoteItemInput[];
}

export interface NoteResult {
  success: boolean;
  noteId?: string;
  noteNo?: string;
  totalAmount?: number;
  error?: string;
}

function withDbRetry<T>(fn: () => T, maxRetries = 15, baseDelayMs = 40): T {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return fn();
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (
        msg.includes('database is locked') ||
        msg.includes('SQLITE_BUSY') ||
        msg.includes('busy') ||
        msg.includes('UNIQUE constraint failed')
      ) {
        lastError = err;
        const jitter = Math.floor(Math.random() * 40);
        const start = Date.now();
        while (Date.now() - start < baseDelayMs + jitter) {
          // busy wait
        }
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Creates Credit or Debit Note atomically in Drizzle ORM.
 * Replicates EXPBRO.PRG, RATECR.PRG, RATEDB.PRG.
 */
export async function createCreditOrDebitNote(
  input: CreateNoteInput
): Promise<NoteResult> {
  try {
    if (!input.items || input.items.length === 0) {
      throw new Error('Note must contain at least 1 item');
    }
    if (!input.partyId) {
      throw new Error('Party is required');
    }

    if (input.partyType === 'SUPPLIER') {
      const supplier = db.query.suppliers.findFirst({
        where: eq(suppliers.id, input.partyId),
      }).sync();
      if (!supplier) throw new Error('Supplier not found');
    } else if (input.partyType === 'CUSTOMER') {
      const customer = db.query.customers.findFirst({
        where: eq(customers.id, input.partyId),
      }).sync();
      if (!customer) throw new Error('Customer not found');
    }

    const allTaxSlabs = db.select().from(taxSlabs).all();
    const taxMap = new Map(allTaxSlabs.map((t) => [t.code, t]));

    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const validatedItems = input.items.map((item, idx) => {
      let effectiveRate = item.rate;
      if (input.noteType === 'RATE_DIFFERENCE' && item.oldRate !== undefined && item.newRate !== undefined) {
        if (item.oldRate <= item.newRate) {
          throw new Error(
            `Line ${idx + 1}: Rate Difference requires Old Rate (${item.oldRate}) > New Rate (${item.newRate})`
          );
        }
        effectiveRate = item.oldRate - item.newRate;
      }

      if (effectiveRate <= 0) {
        throw new Error(`Line ${idx + 1}: Rate must be greater than zero`);
      }
      if (item.quantity <= 0) {
        throw new Error(`Line ${idx + 1}: Quantity must be greater than zero`);
      }

      const gross = roundToPaise(item.quantity * effectiveRate);
      const disc = roundToPaise((gross * (item.discountPct || 0)) / 100);
      const taxable = roundToPaise(gross - disc);

      const slab = taxMap.get(item.taxCode);
      const cgstRate = slab ? slab.cgstRate : 0;
      const sgstRate = slab ? slab.sgstRate : 0;
      const cgst = roundToPaise((taxable * (cgstRate / 100)));
      const sgst = roundToPaise((taxable * (sgstRate / 100)));

      totalTaxable += taxable;
      totalCgst += cgst;
      totalSgst += sgst;

      return {
        ...item,
        effectiveRate,
        gross,
        discountAmount: disc,
        taxableAmount: taxable,
        cgstAmount: cgst,
        sgstAmount: sgst,
        netAmount: taxable + cgst + sgst,
      };
    });

    const totalAmount = Math.round(totalTaxable + totalCgst + totalSgst + totalIgst);
    const noteId = crypto.randomUUID();

    if (!input.isDebitNote) {
      // CREDIT NOTE (CN-XXXXXX)
      let noteNo = '';

      withDbRetry(() => {
        const existingCn = db.select({ noteNo: creditNotes.noteNo }).from(creditNotes).all();
        const cnSet = new Set(existingCn.map((c) => c.noteNo));
        let cnCounter = existingCn.length + 1;
        let generatedNo = `CN-${cnCounter.toString().padStart(6, '0')}`;
        while (cnSet.has(generatedNo)) {
          cnCounter++;
          generatedNo = `CN-${cnCounter.toString().padStart(6, '0')}`;
        }
        noteNo = generatedNo;

        db.transaction((tx) => {
        // 1. Insert Credit Note Record
        tx.insert(creditNotes).values({
          id: noteId,
          noteNo,
          date: input.date,
          partyType: input.partyType,
          partyId: input.partyId,
          noteType: input.noteType,
          referenceInvoiceNo: input.referenceInvoiceNo || null,
          taxableAmount: totalTaxable,
          cgstAmount: totalCgst,
          sgstAmount: totalSgst,
          igstAmount: totalIgst,
          totalAmount,
          adjustedAmount: 0,
          balanceAmount: totalAmount,
          status: 'OPEN',
          remarks: input.remarks || null,
        }).run();

        // 2. Inventory Handling: Expiry / Broken routes to quarantineQty
        if (input.noteType === 'EXPIRY_BROKEN') {
          for (const item of validatedItems) {
            if (item.batchId) {
              tx.update(productBatches)
                .set({
                  quarantineQty: sql`${productBatches.quarantineQty} + ${item.quantity}`,
                  updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(productBatches.id, item.batchId))
                .run();
            }
          }
        }

        // 3. Customer Ledger Posting (Credit customer -> reduces closingBalance receivable)
        if (input.partyType === 'CUSTOMER') {
          tx.update(customers)
            .set({
              closingBalance: sql`${customers.closingBalance} - ${totalAmount}`,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(customers.id, input.partyId))
            .run();
        }

        // 4. Audit Log
        tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          action: 'CREDIT_NOTE_CREATE',
          entityType: 'credit_note',
          entityId: noteId,
          userId: input.operatorId || 'SYSTEM',
          newValues: JSON.stringify({ noteNo, totalAmount, noteType: input.noteType }),
          remarks: `Credit Note ${noteNo} issued for ${input.noteType}`,
        }).run();
      });
    });

      safeRevalidatePath('/billing');
      safeRevalidatePath('/billing/notes');

      return {
        success: true,
        noteId,
        noteNo,
        totalAmount,
      };
    } else {
      // DEBIT NOTE (DN-XXXXXX)
      let noteNo = '';

      withDbRetry(() => {
        const existingDn = db.select({ noteNo: debitNotes.noteNo }).from(debitNotes).all();
        const dnSet = new Set(existingDn.map((d) => d.noteNo));
        let dnCounter = existingDn.length + 1;
        let generatedNo = `DN-${dnCounter.toString().padStart(6, '0')}`;
        while (dnSet.has(generatedNo)) {
          dnCounter++;
          generatedNo = `DN-${dnCounter.toString().padStart(6, '0')}`;
        }
        noteNo = generatedNo;

        db.transaction((tx) => {
        // 1. Insert Debit Note Record
        tx.insert(debitNotes).values({
          id: noteId,
          noteNo,
          date: input.date,
          partyType: input.partyType,
          partyId: input.partyId,
          noteType: input.noteType,
          referenceInvoiceNo: input.referenceInvoiceNo || null,
          taxableAmount: totalTaxable,
          cgstAmount: totalCgst,
          sgstAmount: totalSgst,
          igstAmount: totalIgst,
          totalAmount,
          adjustedAmount: 0,
          balanceAmount: totalAmount,
          status: 'OPEN',
          remarks: input.remarks || null,
        }).run();

        // 2. Supplier Ledger Posting (Debit supplier -> reduces vendor payable liability)
        if (input.partyType === 'SUPPLIER') {
          tx.update(suppliers)
            .set({
              currentBalance: sql`${suppliers.currentBalance} - ${totalAmount}`,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(suppliers.id, input.partyId))
            .run();
        }

        // 3. Audit Log
        tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          action: 'DEBIT_NOTE_CREATE',
          entityType: 'debit_note',
          entityId: noteId,
          userId: input.operatorId || 'SYSTEM',
          newValues: JSON.stringify({ noteNo, totalAmount, noteType: input.noteType }),
          remarks: `Debit Note ${noteNo} issued for ${input.noteType}`,
        }).run();
      });
    });

      safeRevalidatePath('/billing');
      safeRevalidatePath('/billing/notes');
      safeRevalidatePath('/stock');

      return {
        success: true,
        noteId,
        noteNo,
        totalAmount,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to process note',
    };
  }
}

/**
 * Loads recent credit and debit notes.
 */
export async function getRecentNotes() {
  const [cNotes, dNotes] = await Promise.all([
    db.query.creditNotes.findMany({
      orderBy: [desc(creditNotes.date)],
      limit: 15,
    }),
    db.query.debitNotes.findMany({
      orderBy: [desc(debitNotes.date)],
      limit: 15,
    }),
  ]);

  return { creditNotes: cNotes, debitNotes: dNotes };
}

/**
 * Loads all active suppliers for debit note party selection.
 */
export async function getSuppliersList() {
  return db.query.suppliers.findMany({
    orderBy: [asc(suppliers.name)],
  });
}
