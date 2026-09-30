'use server';

import { db } from '../../../lib/db';
import {
  doctors,
  salesmen,
  areas,
  taxSlabs,
  companies,
  customers,
  products,
} from '../../../lib/db/schema/masters';
import { invoices, invoiceItems } from '../../../lib/db/schema/transactions';
import { eq, asc, sql, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-HTTP context
  }
}

// -------------------------------------------------------------
// 1. DOCTORS MASTER ACTIONS
// -------------------------------------------------------------

export interface DoctorInput {
  id?: string;
  code: string;
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  phone?: string;
  registrationNo?: string;
  qualification?: string;
  specialization?: string;
}

export async function getDoctors() {
  return await db.query.doctors.findMany({
    orderBy: [asc(doctors.name)],
  });
}

export async function createDoctor(input: DoctorInput) {
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error('Doctor Name is required');
  const trimmedCode = input.code.trim();
  if (!trimmedCode) throw new Error('Doctor Code is required');

  const existing = await db.query.doctors.findFirst({
    where: eq(doctors.code, trimmedCode),
  });
  if (existing) {
    throw new Error(`Doctor Code ${trimmedCode} already exists in database`);
  }

  const id = input.id || crypto.randomUUID();
  db.insert(doctors).values({
    id,
    code: trimmedCode,
    name: trimmedName,
    addressLine1: input.addressLine1?.trim() || null,
    addressLine2: input.addressLine2?.trim() || null,
    addressLine3: input.addressLine3?.trim() || null,
    phone: input.phone?.trim() || null,
    registrationNo: input.registrationNo?.trim() || null, // Supports 'MCI/2018/00912', 'TNMC/45210'
    qualification: input.qualification?.trim() || null,
    specialization: input.specialization?.trim() || null,
    isActive: true,
  }).run();

  safeRevalidatePath('/masters/auxiliary');
  return { success: true, id };
}

export async function updateDoctor(input: DoctorInput) {
  if (!input.id) throw new Error('Doctor ID is required for update');

  db.update(doctors).set({
    code: input.code.trim(),
    name: input.name.trim(),
    addressLine1: input.addressLine1?.trim() || null,
    addressLine2: input.addressLine2?.trim() || null,
    addressLine3: input.addressLine3?.trim() || null,
    phone: input.phone?.trim() || null,
    registrationNo: input.registrationNo?.trim() || null,
    qualification: input.qualification?.trim() || null,
    specialization: input.specialization?.trim() || null,
    updatedAt: new Date().toISOString(),
  }).where(eq(doctors.id, input.id)).run();

  safeRevalidatePath('/masters/auxiliary');
  return { success: true };
}

export async function deleteDoctor(id: string) {
  db.delete(doctors).where(eq(doctors.id, id)).run();
  safeRevalidatePath('/masters/auxiliary');
  return { success: true };
}

// -------------------------------------------------------------
// 2. SALESMEN MASTER ACTIONS
// -------------------------------------------------------------

export interface SalesmanInput {
  id?: string;
  code: string;
  name: string;
  phone?: string;
  localCommissionPct?: number;
  outstationCommissionPct?: number;
  subSalesCommissionPct?: number;
}

export async function getSalesmen() {
  return await db.query.salesmen.findMany({
    orderBy: [asc(salesmen.name)],
  });
}

export async function createSalesman(input: SalesmanInput) {
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error('Salesman Name is required');
  const trimmedCode = input.code.trim();
  if (!trimmedCode) throw new Error('Salesman Code is required');

  const localComm = Number(input.localCommissionPct || 0);
  if (localComm < 0 || localComm > 50) {
    throw new Error('Salesman Commission must be between 0.00% and 50.00%');
  }

  const existing = await db.query.salesmen.findFirst({
    where: eq(salesmen.code, trimmedCode),
  });
  if (existing) {
    throw new Error(`Salesman Code ${trimmedCode} already exists in database`);
  }

  const id = input.id || crypto.randomUUID();
  db.insert(salesmen).values({
    id,
    code: trimmedCode,
    name: trimmedName,
    phone: input.phone?.trim() || null,
    localCommissionPct: localComm,
    outstationCommissionPct: Number(input.outstationCommissionPct || 0),
    subSalesCommissionPct: Number(input.subSalesCommissionPct || 0),
    isActive: true,
  }).run();

  safeRevalidatePath('/masters/auxiliary');
  return { success: true, id };
}

export async function updateSalesman(input: SalesmanInput) {
  if (!input.id) throw new Error('Salesman ID is required for update');

  const localComm = Number(input.localCommissionPct || 0);
  if (localComm < 0 || localComm > 50) {
    throw new Error('Salesman Commission must be between 0.00% and 50.00%');
  }

  db.update(salesmen).set({
    code: input.code.trim(),
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    localCommissionPct: localComm,
    outstationCommissionPct: Number(input.outstationCommissionPct || 0),
    subSalesCommissionPct: Number(input.subSalesCommissionPct || 0),
    updatedAt: new Date().toISOString(),
  }).where(eq(salesmen.id, input.id)).run();

  safeRevalidatePath('/masters/auxiliary');
  return { success: true };
}

export async function deleteSalesman(id: string) {
  // Check if salesman assigned to customers or areas
  const custCount = await db.select({ count: sql<number>`COUNT(*)` })
    .from(customers)
    .where(eq(customers.salesmanId, id))
    .get();

  if (custCount && custCount.count > 0) {
    throw new Error('Cannot delete salesman with assigned customer accounts');
  }

  db.delete(salesmen).where(eq(salesmen.id, id)).run();
  safeRevalidatePath('/masters/auxiliary');
  return { success: true };
}

// -------------------------------------------------------------
// 3. AREAS MASTER ACTIONS
// -------------------------------------------------------------

export interface AreaInput {
  id?: string;
  code: string;
  name: string;
  district?: string;
  salesmanId?: string | null;
}

export async function getAreas() {
  return await db.query.areas.findMany({
    orderBy: [asc(areas.name)],
    with: {
      salesman: true,
    },
  });
}

export async function createArea(input: AreaInput) {
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error('Area Name is required');
  const trimmedCode = input.code.trim();
  if (!trimmedCode) throw new Error('Area Code is required');

  const existing = await db.query.areas.findFirst({
    where: eq(areas.code, trimmedCode),
  });
  if (existing) {
    throw new Error(`Area Code ${trimmedCode} already exists in database`);
  }

  const id = input.id || crypto.randomUUID();
  db.insert(areas).values({
    id,
    code: trimmedCode,
    name: trimmedName,
    district: input.district?.trim() || null,
    salesmanId: input.salesmanId || null,
    isActive: true,
  }).run();

  safeRevalidatePath('/masters/auxiliary');
  return { success: true, id };
}

export async function updateArea(input: AreaInput) {
  if (!input.id) throw new Error('Area ID is required for update');

  db.update(areas).set({
    code: input.code.trim(),
    name: input.name.trim(),
    district: input.district?.trim() || null,
    salesmanId: input.salesmanId || null,
    updatedAt: new Date().toISOString(),
  }).where(eq(areas.id, input.id)).run();

  safeRevalidatePath('/masters/auxiliary');
  return { success: true };
}

export async function deleteArea(id: string) {
  // Referential Guard: Ensure area has no active customers
  const custCount = await db.select({ count: sql<number>`COUNT(*)` })
    .from(customers)
    .where(eq(customers.areaId, id))
    .get();

  if (custCount && custCount.count > 0) {
    throw new Error('Cannot delete area containing active customer accounts');
  }

  db.delete(areas).where(eq(areas.id, id)).run();
  safeRevalidatePath('/masters/auxiliary');
  return { success: true };
}

// -------------------------------------------------------------
// 4. TAX SLABS MASTER ACTIONS
// -------------------------------------------------------------

export interface TaxSlabInput {
  code: string; // '01'..'05'
  description: string;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  scRate?: number; // Surcharge/cess
  glSalesAccount?: string;
  glTaxAccount?: string;
  glPurchaseAccount?: string;
  glPurchTaxAccount?: string;
}

export async function getTaxSlabs() {
  return await db.query.taxSlabs.findMany({
    orderBy: [asc(taxSlabs.code)],
  });
}

export async function createTaxSlab(input: TaxSlabInput) {
  const code = input.code.trim();
  if (!code) throw new Error('Tax Slab Code is required');
  const existing = await db.query.taxSlabs.findFirst({
    where: eq(taxSlabs.code, code),
  });
  if (existing) {
    throw new Error(`Tax Slab Code ${code} already exists in database`);
  }

  db.insert(taxSlabs).values({
    code,
    description: input.description.trim(),
    cgstRate: Number(input.cgstRate || 0),
    sgstRate: Number(input.sgstRate || 0),
    igstRate: Number(input.igstRate || 0),
    scRate: Number(input.scRate || 0),
    glSalesAccount: input.glSalesAccount?.trim() || null,
    glTaxAccount: input.glTaxAccount?.trim() || null,
    glPurchaseAccount: input.glPurchaseAccount?.trim() || null,
    glPurchTaxAccount: input.glPurchTaxAccount?.trim() || null,
    isExempt: code === '01',
    isActive: true,
  }).run();

  safeRevalidatePath('/masters/auxiliary');
  return { success: true, code };
}

export async function updateTaxSlab(input: TaxSlabInput) {
  const code = input.code.trim();

  // Code '01' 0% Exempt is immutable system default
  if (code === '01') {
    throw new Error('Exempted Tax Code (01) is protected');
  }

  db.update(taxSlabs).set({
    description: input.description.trim(),
    cgstRate: Number(input.cgstRate || 0),
    sgstRate: Number(input.sgstRate || 0),
    igstRate: Number(input.igstRate || 0),
    scRate: Number(input.scRate || 0),
    glSalesAccount: input.glSalesAccount?.trim() || null,
    glTaxAccount: input.glTaxAccount?.trim() || null,
    glPurchaseAccount: input.glPurchaseAccount?.trim() || null,
    glPurchTaxAccount: input.glPurchTaxAccount?.trim() || null,
    updatedAt: new Date().toISOString(),
  }).where(eq(taxSlabs.code, code)).run();

  safeRevalidatePath('/masters/auxiliary');
  return {
    success: true,
    warning: 'Note: Modifying tax slab rates affects future billing only',
  };
}

export async function deleteTaxSlab(code: string) {
  if (code === '01') {
    throw new Error('Exempted Tax Code (01) is protected');
  }

  // Check if assigned to catalog products
  const prodCount = await db.select({ count: sql<number>`COUNT(*)` })
    .from(products)
    .where(eq(products.taxCode, code))
    .get();

  if (prodCount && prodCount.count > 0) {
    throw new Error('Cannot delete tax slab assigned to catalog products');
  }

  db.delete(taxSlabs).where(eq(taxSlabs.code, code)).run();
  safeRevalidatePath('/masters/auxiliary');
  return { success: true };
}

// -------------------------------------------------------------
// 5. COMPANIES / MANUFACTURERS MASTER ACTIONS
// -------------------------------------------------------------

export interface CompanyInput {
  id?: string;
  code: string;
  name: string;
  shortName?: string;
  contactPerson?: string;
  addressLine1?: string;
  phone?: string;
  email?: string;
  defaultDiscountPct?: number;
  freeValueScheme?: string; // 'Y' | 'N'
  isBlocked?: boolean;
}

export async function getCompanies() {
  return await db.query.companies.findMany({
    orderBy: [asc(companies.name)],
  });
}

export async function getCompanyProducts(companyId: string, limit: number = 20, offset: number = 0) {
  // High-density paginated product catalog loading (< 150ms)
  const items = await db.query.products.findMany({
    where: eq(products.companyId, companyId),
    limit,
    offset,
    orderBy: [asc(products.name)],
  });

  const total = await db.select({ count: sql<number>`COUNT(*)` })
    .from(products)
    .where(eq(products.companyId, companyId))
    .get();

  return {
    items,
    total: total?.count || 0,
  };
}

export async function createCompany(input: CompanyInput) {
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error('Company Name is required');
  const trimmedCode = input.code.trim().toUpperCase();
  if (!trimmedCode) throw new Error('Company Code is required');

  const existing = await db.query.companies.findFirst({
    where: eq(companies.code, trimmedCode),
  });
  if (existing) {
    throw new Error(`Company Code ${trimmedCode} already exists in database`);
  }

  const id = input.id || crypto.randomUUID();
  db.insert(companies).values({
    id,
    code: trimmedCode,
    name: trimmedName,
    shortName: input.shortName?.trim() || null,
    contactPerson: input.contactPerson?.trim() || null,
    addressLine1: input.addressLine1?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    defaultDiscountPct: Number(input.defaultDiscountPct || 0),
    freeValueScheme: input.freeValueScheme || 'Y',
    isBlocked: Boolean(input.isBlocked),
    isActive: true,
  }).run();

  safeRevalidatePath('/masters/auxiliary');
  return { success: true, id };
}

export async function updateCompany(input: CompanyInput) {
  if (!input.id) throw new Error('Company ID is required for update');

  db.update(companies).set({
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    shortName: input.shortName?.trim() || null,
    contactPerson: input.contactPerson?.trim() || null,
    addressLine1: input.addressLine1?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    defaultDiscountPct: Number(input.defaultDiscountPct || 0),
    freeValueScheme: input.freeValueScheme || 'Y',
    isBlocked: Boolean(input.isBlocked),
    updatedAt: new Date().toISOString(),
  }).where(eq(companies.id, input.id)).run();

  safeRevalidatePath('/masters/auxiliary');
  return { success: true };
}

export async function deleteCompany(id: string) {
  const prodCount = await db.select({ count: sql<number>`COUNT(*)` })
    .from(products)
    .where(eq(products.companyId, id))
    .get();

  if (prodCount && prodCount.count > 0) {
    throw new Error('Cannot delete company with catalog products attached');
  }

  db.delete(companies).where(eq(companies.id, id)).run();
  safeRevalidatePath('/masters/auxiliary');
  return { success: true };
}
