'use server';

import { db } from '../../../lib/db';
import { customers, areas, salesmen } from '../../../lib/db/schema/masters';
import { invoices } from '../../../lib/db/schema/transactions';
import { customerOutstandings } from '../../../lib/db/schema/ledgers';
import { eq, asc, sql, and, or, like } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-HTTP context
  }
}

export interface CustomerInput {
  id?: string;
  code: string;
  name: string;
  contactPerson?: string;
  areaId: string;
  salesmanId?: string | null;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  addressLine4?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  billingType?: string; // 'L' | 'O'
  paymentTerms?: string; // 'C' | 'R' | 'H'
  preferredLorry?: string;
  routeCode?: string;
  gstin?: string;
  pan?: string;
  dlNo20b?: string;
  dlNo21b?: string;
  dlExpiryDate?: string;
  fssaiNo?: string;
  creditDays?: number;
  creditLimit?: number;
  defaultDiscountPct?: number;
  openingBalance?: number;
  closingBalance?: number;
  isBlocked?: boolean;
  isTaxExempt?: boolean;
  isTcsApplicable?: boolean;
  remarks?: string;
}

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function internalSanitizePhone(phone?: string): string {
  if (!phone) return '';
  return phone.replace(/[^0-9]/g, '');
}

function internalValidateGstin(gstin?: string): boolean {
  if (!gstin || !gstin.trim()) return true; // Optional for non-registered parties
  return GSTIN_REGEX.test(gstin.trim().toUpperCase());
}

function internalExtractPanFromGstin(gstin?: string): string {
  if (!gstin || gstin.trim().length !== 15) return '';
  return gstin.trim().substring(2, 12).toUpperCase();
}

/**
 * Sanitizes phone number by stripping formatting symbols
 */
export async function sanitizePhone(phone?: string): Promise<string> {
  return internalSanitizePhone(phone);
}

/**
 * Validates GSTIN statutory format
 */
export async function validateGstin(gstin?: string): Promise<boolean> {
  return internalValidateGstin(gstin);
}

/**
 * Extracts 10-char PAN from 15-char GSTIN
 */
export async function extractPanFromGstin(gstin?: string): Promise<string> {
  return internalExtractPanFromGstin(gstin);
}

/**
 * 1. Fetch next sequential customer code (e.g. '0001' or 'C001')
 */
export async function getNextCustomerCode(): Promise<string> {
  const result = db.select({
    maxCode: sql<number>`MAX(CAST(${customers.code} AS INTEGER))`
  }).from(customers).get();

  const nextVal = (result?.maxCode || 0) + 1;
  return nextVal.toString().padStart(4, '0');
}

/**
 * 2. Get list of customers with optional search and area filter
 */
export async function getCustomersList(searchQuery: string = '', areaFilter: string = '') {
  const list = await db.query.customers.findMany({
    orderBy: [asc(customers.name)],
    with: {
      area: true,
      salesman: true,
    },
  });

  return list.filter((c) => {
    // Area filter
    if (areaFilter.trim()) {
      const aTerm = areaFilter.trim().toLowerCase();
      const areaName = c.area?.name?.toLowerCase() || '';
      const areaCode = c.area?.code?.toLowerCase() || '';
      if (!areaName.includes(aTerm) && !areaCode.includes(aTerm)) {
        return false;
      }
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const codeMatches = c.code.toLowerCase().includes(q);
      const nameMatches = c.name.toLowerCase().includes(q);
      const phoneMatches = c.phone?.toLowerCase().includes(q);
      const gstinMatches = c.gstin?.toLowerCase().includes(q);
      return codeMatches || nameMatches || phoneMatches || gstinMatches;
    }

    return true;
  });
}

/**
 * 3. Get customer by ID
 */
export async function getCustomerById(id: string) {
  return await db.query.customers.findFirst({
    where: eq(customers.id, id),
    with: {
      area: true,
      salesman: true,
    },
  });
}

/**
 * 4. Create Customer
 */
export async function createCustomer(input: CustomerInput) {
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error('Customer Name is required');
  if (!input.code.trim()) throw new Error('Customer Code is required');
  if (!input.areaId) throw new Error('Area assignment is required');

  // Check duplicate code
  const existing = await db.query.customers.findFirst({
    where: eq(customers.code, input.code.trim()),
  });
  if (existing) {
    throw new Error(`Customer Code ${input.code.trim()} already exists in database`);
  }

  // GSTIN Validation
  const gstinClean = input.gstin ? input.gstin.trim().toUpperCase() : '';
  if (gstinClean && !internalValidateGstin(gstinClean)) {
    throw new Error('GSTIN must be 15 characters matching statutory format');
  }

  const panClean = input.pan?.trim().toUpperCase() || internalExtractPanFromGstin(gstinClean);
  const phoneClean = internalSanitizePhone(input.phone);

  // Credit days = 0 forces payment terms to 'C' (Cash)
  const creditDays = input.creditDays !== undefined ? Number(input.creditDays) : 21;
  const paymentTerms = creditDays === 0 ? 'C' : (input.paymentTerms || 'R');

  const customerId = input.id || crypto.randomUUID();
  const openingBalance = Number(input.openingBalance || 0);
  const closingBalance = input.closingBalance !== undefined ? Number(input.closingBalance) : openingBalance;

  db.transaction((tx) => {
    tx.insert(customers).values({
      id: customerId,
      code: input.code.trim(),
      name: trimmedName,
      contactPerson: input.contactPerson?.trim() || null,
      areaId: input.areaId,
      salesmanId: input.salesmanId || null,
      addressLine1: input.addressLine1?.trim() || null,
      addressLine2: input.addressLine2?.trim() || null,
      addressLine3: input.addressLine3?.trim() || null,
      addressLine4: input.addressLine4?.trim() || null,
      pincode: input.pincode?.trim() || null,
      phone: phoneClean || null,
      email: input.email?.trim() || null,
      billingType: input.billingType || 'L',
      paymentTerms,
      preferredLorry: input.preferredLorry?.trim() || null,
      routeCode: input.routeCode?.trim() || null,
      gstin: gstinClean || null,
      pan: panClean || null,
      dlNo20b: input.dlNo20b?.trim() || null,
      dlNo21b: input.dlNo21b?.trim() || null,
      dlExpiryDate: input.dlExpiryDate || null,
      fssaiNo: input.fssaiNo?.trim() || null,
      creditDays,
      creditLimit: Number(input.creditLimit || 0),
      defaultDiscountPct: Number(input.defaultDiscountPct || 0),
      openingBalance,
      closingBalance,
      isBlocked: Boolean(input.isBlocked),
      isTaxExempt: Boolean(input.isTaxExempt),
      isTcsApplicable: Boolean(input.isTcsApplicable),
      isActive: true,
      remarks: input.remarks?.trim() || null,
    }).run();
  });

  safeRevalidatePath('/masters/customers');
  return { success: true, id: customerId };
}

/**
 * 5. Update Customer
 */
export async function updateCustomer(input: CustomerInput) {
  if (!input.id) throw new Error('Customer ID is required for update');
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error('Customer Name is required');

  // GSTIN Validation
  const gstinClean = input.gstin ? input.gstin.trim().toUpperCase() : '';
  if (gstinClean && !internalValidateGstin(gstinClean)) {
    throw new Error('GSTIN must be 15 characters matching statutory format');
  }

  const panClean = input.pan?.trim().toUpperCase() || internalExtractPanFromGstin(gstinClean);
  const phoneClean = internalSanitizePhone(input.phone);

  // Credit days = 0 forces payment terms to 'C' (Cash)
  const creditDays = input.creditDays !== undefined ? Number(input.creditDays) : 21;
  const paymentTerms = creditDays === 0 ? 'C' : (input.paymentTerms || 'R');

  db.transaction((tx) => {
    tx.update(customers).set({
      code: input.code.trim(),
      name: trimmedName,
      contactPerson: input.contactPerson?.trim() || null,
      areaId: input.areaId,
      salesmanId: input.salesmanId || null,
      addressLine1: input.addressLine1?.trim() || null,
      addressLine2: input.addressLine2?.trim() || null,
      addressLine3: input.addressLine3?.trim() || null,
      addressLine4: input.addressLine4?.trim() || null,
      pincode: input.pincode?.trim() || null,
      phone: phoneClean || null,
      email: input.email?.trim() || null,
      billingType: input.billingType || 'L',
      paymentTerms,
      preferredLorry: input.preferredLorry?.trim() || null,
      routeCode: input.routeCode?.trim() || null,
      gstin: gstinClean || null,
      pan: panClean || null,
      dlNo20b: input.dlNo20b?.trim() || null,
      dlNo21b: input.dlNo21b?.trim() || null,
      dlExpiryDate: input.dlExpiryDate || null,
      fssaiNo: input.fssaiNo?.trim() || null,
      creditDays,
      creditLimit: Number(input.creditLimit || 0),
      defaultDiscountPct: Number(input.defaultDiscountPct || 0),
      openingBalance: Number(input.openingBalance || 0),
      closingBalance: Number(input.closingBalance ?? input.openingBalance ?? 0),
      isBlocked: Boolean(input.isBlocked),
      isTaxExempt: Boolean(input.isTaxExempt),
      isTcsApplicable: Boolean(input.isTcsApplicable),
      remarks: input.remarks?.trim() || null,
      updatedAt: new Date().toISOString(),
    }).where(eq(customers.id, input.id!)).run();
  });

  safeRevalidatePath('/masters/customers');
  return { success: true };
}

/**
 * 6. Delete Customer with Referential Guard
 */
export async function deleteCustomer(customerId: string) {
  // Check invoice history
  const inv = await db.select({ count: sql<number>`COUNT(*)` })
    .from(invoices)
    .where(eq(invoices.customerId, customerId))
    .get();

  if (inv && inv.count > 0) {
    throw new Error('Cannot delete customer with active transactions');
  }

  // Check outstandings ledger history
  const out = await db.select({ count: sql<number>`COUNT(*)` })
    .from(customerOutstandings)
    .where(eq(customerOutstandings.customerId, customerId))
    .get();

  if (out && out.count > 0) {
    throw new Error('Cannot delete customer with active transactions');
  }

  db.transaction((tx) => {
    tx.delete(customers).where(eq(customers.id, customerId)).run();
  });

  safeRevalidatePath('/masters/customers');
  return { success: true };
}

/**
 * 7. Toggle Customer Blocked Status
 */
export async function toggleCustomerBlocked(customerId: string, isBlocked: boolean) {
  await db.update(customers).set({
    isBlocked,
    updatedAt: new Date().toISOString(),
  }).where(eq(customers.id, customerId)).run();

  safeRevalidatePath('/masters/customers');
  return { success: true, isBlocked };
}
