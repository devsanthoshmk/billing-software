'use server';

import { db } from '../../../lib/db';
import { suppliers } from '../../../lib/db/schema/masters';
import { purchases } from '../../../lib/db/schema/transactions';
import { supplierPayments } from '../../../lib/db/schema/ledgers';
import { eq, asc, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-HTTP context
  }
}

export interface SupplierInput {
  id?: string;
  code: string;
  name: string;
  contactPerson?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  addressLine4?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  pan?: string;
  drugLicenseNo?: string;
  fssaiNo?: string;
  tdsFlag?: boolean;
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  glAccountCode?: string;
  openingBalance?: number;
  currentBalance?: number;
  creditDays?: number;
  defaultDiscountPct?: number;
  isBlocked?: boolean;
}

const SUPERVISOR_PASSWORD = 'SPM';

/**
 * 1. Verify supervisor password for edit unlocking
 */
export async function verifySupervisorPassword(password: string): Promise<boolean> {
  // Strict case-sensitive match
  return password === SUPERVISOR_PASSWORD;
}

/**
 * 2. Get next sequential supplier code
 */
export async function getNextSupplierCode(): Promise<string> {
  const result = db.select({
    maxCode: sql<number>`MAX(CAST(${suppliers.code} AS INTEGER))`
  }).from(suppliers).get();

  const nextVal = (result?.maxCode || 0) + 1;
  return nextVal.toString().padStart(3, '0');
}

/**
 * 3. Get supplier list with search filter
 */
export async function getSuppliersList(searchQuery: string = '') {
  const list = await db.query.suppliers.findMany({
    orderBy: [asc(suppliers.name)],
  });

  if (!searchQuery.trim()) return list;

  const q = searchQuery.trim().toLowerCase();
  return list.filter((s) => {
    return (
      s.code.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      (s.phone && s.phone.toLowerCase().includes(q)) ||
      (s.contactPerson && s.contactPerson.toLowerCase().includes(q))
    );
  });
}

/**
 * 4. Get supplier by ID
 */
export async function getSupplierById(id: string) {
  return await db.query.suppliers.findFirst({
    where: eq(suppliers.id, id),
  });
}

/**
 * 5. Get supplier payables & ledger summary (F4)
 */
export async function getSupplierPayablesSummary(supplierId: string) {
  const supp = await db.query.suppliers.findFirst({
    where: eq(suppliers.id, supplierId),
  });
  if (!supp) throw new Error('Supplier not found');

  // Sum total purchases
  const purSummary = db.select({
    count: sql<number>`COUNT(*)`,
    total: sql<number>`COALESCE(SUM(${purchases.netAmount}), 0)`
  }).from(purchases).where(eq(purchases.supplierId, supplierId)).get();

  // Sum total payments
  const pmtSummary = db.select({
    count: sql<number>`COUNT(*)`,
    total: sql<number>`COALESCE(SUM(${supplierPayments.totalAmount}), 0)`
  }).from(supplierPayments).where(eq(supplierPayments.supplierId, supplierId)).get();

  const totalPurchases = Number(purSummary?.total || 0);
  const totalPayments = Number(pmtSummary?.total || 0);
  const outstandingPayable = Number(supp.currentBalance || (totalPurchases - totalPayments));

  return {
    supplierCode: supp.code,
    supplierName: supp.name,
    openingBalance: Number(supp.openingBalance || 0),
    totalPurchases,
    purchaseCount: Number(purSummary?.count || 0),
    totalPayments,
    paymentCount: Number(pmtSummary?.count || 0),
    outstandingPayable,
  };
}

/**
 * 6. Create Supplier
 */
export async function createSupplier(input: SupplierInput) {
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error('Supplier Name is required');
  const trimmedCode = input.code.trim();
  if (!trimmedCode) throw new Error('Supplier Code is required');

  // Code length validation (3-10 chars)
  if (trimmedCode.length < 3 || trimmedCode.length > 10) {
    throw new Error('Supplier Code must be between 3 and 10 characters');
  }

  // Duplicate check
  const existing = await db.query.suppliers.findFirst({
    where: eq(suppliers.code, trimmedCode),
  });
  if (existing) {
    throw new Error(`Supplier Code ${trimmedCode} already exists in database`);
  }

  // Discount validation (0 - 99.99%)
  const discountPct = Number(input.defaultDiscountPct || 0);
  if (discountPct < 0 || discountPct > 99.99) {
    throw new Error('Default discount percentage must be between 0.00% and 99.99%');
  }

  const supplierId = input.id || crypto.randomUUID();
  const openingBalance = Number(input.openingBalance || 0);
  const currentBalance = input.currentBalance !== undefined ? Number(input.currentBalance) : openingBalance;

  db.transaction((tx) => {
    tx.insert(suppliers).values({
      id: supplierId,
      code: trimmedCode,
      name: trimmedName,
      contactPerson: input.contactPerson?.trim() || null,
      addressLine1: input.addressLine1?.trim() || '',
      addressLine2: input.addressLine2?.trim() || '',
      addressLine3: input.addressLine3?.trim() || '',
      addressLine4: input.addressLine4?.trim() || '',
      pincode: input.pincode?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      gstin: input.gstin?.trim()?.toUpperCase() || null,
      pan: input.pan?.trim()?.toUpperCase() || null,
      drugLicenseNo: input.drugLicenseNo?.trim() || null,
      fssaiNo: input.fssaiNo?.trim() || null,
      tdsFlag: Boolean(input.tdsFlag),
      bankName: input.bankName?.trim() || null,
      bankAccountNo: input.bankAccountNo?.trim() || null,
      bankIfsc: input.bankIfsc?.trim()?.toUpperCase() || null,
      glAccountCode: input.glAccountCode?.trim() || '0014',
      openingBalance,
      currentBalance,
      creditDays: Number(input.creditDays || 30),
      defaultDiscountPct: discountPct,
      isBlocked: Boolean(input.isBlocked),
      isActive: true,
    }).run();
  });

  safeRevalidatePath('/masters/suppliers');
  return { success: true, id: supplierId };
}

/**
 * 7. Update Supplier
 */
export async function updateSupplier(input: SupplierInput, supervisorPassword?: string) {
  if (!input.id) throw new Error('Supplier ID is required for update');
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error('Supplier Name is required');

  // Verify supervisor password if provided
  if (supervisorPassword !== undefined && supervisorPassword !== SUPERVISOR_PASSWORD) {
    throw new Error('Incorrect supervisor password. Edit rejected.');
  }

  const discountPct = Number(input.defaultDiscountPct || 0);
  if (discountPct < 0 || discountPct > 99.99) {
    throw new Error('Default discount percentage must be between 0.00% and 99.99%');
  }

  db.transaction((tx) => {
    tx.update(suppliers).set({
      code: input.code.trim(),
      name: trimmedName,
      contactPerson: input.contactPerson?.trim() || null,
      addressLine1: input.addressLine1?.trim() || '',
      addressLine2: input.addressLine2?.trim() || '',
      addressLine3: input.addressLine3?.trim() || '',
      addressLine4: input.addressLine4?.trim() || '',
      pincode: input.pincode?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      gstin: input.gstin?.trim()?.toUpperCase() || null,
      pan: input.pan?.trim()?.toUpperCase() || null,
      drugLicenseNo: input.drugLicenseNo?.trim() || null,
      fssaiNo: input.fssaiNo?.trim() || null,
      tdsFlag: Boolean(input.tdsFlag),
      bankName: input.bankName?.trim() || null,
      bankAccountNo: input.bankAccountNo?.trim() || null,
      bankIfsc: input.bankIfsc?.trim()?.toUpperCase() || null,
      glAccountCode: input.glAccountCode?.trim() || '0014',
      openingBalance: Number(input.openingBalance || 0),
      currentBalance: Number(input.currentBalance ?? input.openingBalance ?? 0),
      creditDays: Number(input.creditDays || 30),
      defaultDiscountPct: discountPct,
      isBlocked: Boolean(input.isBlocked),
      updatedAt: new Date().toISOString(),
    }).where(eq(suppliers.id, input.id!)).run();
  });

  safeRevalidatePath('/masters/suppliers');
  return { success: true };
}

/**
 * 8. Delete Supplier with Deletion Guard
 */
export async function deleteSupplier(supplierId: string) {
  const supp = await db.query.suppliers.findFirst({
    where: eq(suppliers.id, supplierId),
  });
  if (!supp) throw new Error('Supplier not found');

  // Reject deletion if open payables exist
  if (supp.currentBalance && Math.abs(supp.currentBalance) > 0.01) {
    throw new Error('Cannot delete supplier with open payable balance');
  }

  // Reject deletion if active purchase bills exist
  const purCount = await db.select({ count: sql<number>`COUNT(*)` })
    .from(purchases)
    .where(eq(purchases.supplierId, supplierId))
    .get();

  if (purCount && purCount.count > 0) {
    throw new Error('Cannot delete supplier with active purchase bills');
  }

  db.transaction((tx) => {
    tx.delete(suppliers).where(eq(suppliers.id, supplierId)).run();
  });

  safeRevalidatePath('/masters/suppliers');
  return { success: true };
}
