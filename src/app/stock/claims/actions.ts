'use server';

import { db } from '@/lib/db';
import { customers, suppliers, products, productBatches, creditNotes, debitNotes } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { roundToPaise } from '@/lib/business-engine/calculations';

export async function getClaimsInitialData() {
  try {
    const custs = await db.query.customers.findMany({
      where: eq(customers.isActive, true),
      orderBy: [customers.name],
    });

    const sups = await db.query.suppliers.findMany({
      where: eq(suppliers.isActive, true),
      orderBy: [suppliers.name],
    });

    const prods = await db.query.products.findMany({
      where: eq(products.isActive, true),
      with: {
        batches: true,
      },
      orderBy: [products.name],
    });

    return { success: true, customers: custs, suppliers: sups, products: prods };
  } catch (err: any) {
    console.error('getClaimsInitialData error:', err);
    return { success: false, error: err.message, customers: [], suppliers: [], products: [] };
  }
}

export async function submitBreakageExpiryClaim(input: {
  claimType: 'CUSTOMER_CLAIM' | 'COMPANY_CLAIM';
  partyId: string;
  claimDate: string;
  claimReason: 'EXPIRY' | 'BREAKAGE' | 'DISSOLUTION_DEFECT' | 'TRANSIT_DAMAGE';
  items: {
    productId: string;
    batchId: string;
    batchNo: string;
    expiryDate: string;
    quantity: number;
    rate: number;
  }[];
  operator: string;
}) {
  try {
    if (!input.items || input.items.length === 0) {
      return { success: false, error: 'Add at least 1 item for claim settlement' };
    }

    let totalClaimAmt = 0;
    for (const it of input.items) {
      totalClaimAmt += roundToPaise(it.quantity * it.rate);
    }

    const claimNo = `CLM-${Date.now().toString().slice(-6)}`;

    // If customer claim, issue Credit Note to customer
    if (input.claimType === 'CUSTOMER_CLAIM') {
      const noteId = crypto.randomUUID();
      await db.insert(creditNotes).values({
        id: noteId,
        noteNo: `CN-${claimNo}`,
        date: input.claimDate,
        partyType: 'CUSTOMER',
        partyId: input.partyId,
        noteType: 'EXPIRY_DAMAGE_CLAIM',
        taxableAmount: totalClaimAmt,
        totalAmount: totalClaimAmt,
        balanceAmount: totalClaimAmt,
        status: 'OPEN',
        remarks: `${input.claimReason} claim return settled for customer`,
      });

      // Quarantine stock
      for (const it of input.items) {
        const batch = await db.query.productBatches.findFirst({
          where: eq(productBatches.id, it.batchId),
        });
        if (batch) {
          await db
            .update(productBatches)
            .set({
              quarantineQty: batch.quarantineQty + it.quantity,
            })
            .where(eq(productBatches.id, it.batchId));
        }
      }
    } else {
      // If company claim, issue Debit Note to supplier
      const noteId = crypto.randomUUID();
      await db.insert(debitNotes).values({
        id: noteId,
        noteNo: `DN-${claimNo}`,
        date: input.claimDate,
        partyType: 'SUPPLIER',
        partyId: input.partyId,
        noteType: 'PURCHASE_RETURN',
        taxableAmount: totalClaimAmt,
        totalAmount: totalClaimAmt,
        balanceAmount: totalClaimAmt,
        status: 'OPEN',
        remarks: `${input.claimReason} claim debited to pharmaceutical company`,
      });

      // Deduct quarantine stock
      for (const it of input.items) {
        const batch = await db.query.productBatches.findFirst({
          where: eq(productBatches.id, it.batchId),
        });
        if (batch) {
          await db
            .update(productBatches)
            .set({
              quarantineQty: Math.max(0, batch.quarantineQty - it.quantity),
            })
            .where(eq(productBatches.id, it.batchId));
        }
      }
    }

    return { success: true, claimNo, totalAmount: totalClaimAmt };
  } catch (err: any) {
    console.error('submitBreakageExpiryClaim error:', err);
    return { success: false, error: err.message };
  }
}
