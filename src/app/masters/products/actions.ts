'use server';

import { db } from '../../../lib/db';
import { products, productBatches, taxSlabs, companies, suppliers } from '../../../lib/db/schema/masters';
import { invoiceItems, purchaseItems } from '../../../lib/db/schema/transactions';
import { eq, desc, asc, sql, and, or, like } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Silently continue in unit test / non-HTTP environment
  }
}

export interface BatchInput {
  id?: string;
  batchNo: string;
  expiryMonthYear?: string; // 'MM/YY'
  expiryDate?: string;      // 'YYYY-MM-DD'
  purchaseRate: number;
  sellingRate: number;
  secondaryRate?: number;
  mrp: number;
  stockQty: number;
  quarantineQty?: number;
  schemeThreshold?: number;
  schemeFreeQty?: number;
  taxCode?: string;
  offerDiscountPct?: number;
  isBlocked?: boolean;
}

export interface ProductInput {
  id?: string;
  code: string;
  name: string;
  genericName?: string; // Stored in packagingDetail or semantic generic
  companyId: string;
  supplierId?: string | null;
  taxCode: string;
  packaging: string;
  packagingDetail?: string;
  uqc?: string;
  rackLocation?: string;
  hsnCode: string;
  barcode?: string;
  drugScheduleFlag?: string;
  isScheduleH?: boolean;
  isPsychotropic?: boolean;
  defaultSupplierDiscountPct?: number;
  minOrderQty?: number;
  reorderLevel?: number;
  warningQty?: number;
  allowInvoiceDiscount?: boolean;
  allowRateModification?: boolean;
  isBlocked?: boolean;
  batches?: BatchInput[];
}

function internalConvertExpiryToIso(expiry: string): string {
  if (!expiry || !expiry.trim()) {
    // Default fallback to 2 years from today
    const d = new Date();
    d.setFullYear(d.getFullYear() + 2);
    return d.toISOString().split('T')[0];
  }
  const clean = expiry.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  const parts = clean.split('/');
  if (parts.length === 2) {
    const month = parseInt(parts[0], 10);
    let year = parseInt(parts[1], 10);
    if (year < 100) {
      year += 2000;
    }
    if (month >= 1 && month <= 12) {
      const lastDay = new Date(year, month, 0).getDate();
      const mm = month.toString().padStart(2, '0');
      const dd = lastDay.toString().padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
  }
  throw new Error(`Invalid expiry format: ${expiry}. Expected MM/YY.`);
}

export async function convertExpiryToIso(expiry: string): Promise<string> {
  return internalConvertExpiryToIso(expiry);
}

/**
 * 1. Fetch next sequential 5-digit product code (e.g. '00006')
 */
export async function getNextProductCode(): Promise<string> {
  const result = db.select({
    maxCode: sql<number>`MAX(CAST(${products.code} AS INTEGER))`
  }).from(products).get();

  const nextVal = (result?.maxCode || 0) + 1;
  return nextVal.toString().padStart(5, '0');
}

/**
 * 2. Get list of all products for master browsing
 */
export async function getProductsList() {
  return await db.query.products.findMany({
    orderBy: [asc(products.code)],
    with: {
      batches: true,
    },
  });
}

/**
 * 3. Get single product with full batches and relations
 */
export async function getProductWithBatches(productId: string) {
  return await db.query.products.findFirst({
    where: eq(products.id, productId),
    with: {
      batches: {
        orderBy: [desc(productBatches.expiryDate)],
      },
    },
  });
}

/**
 * 4. 4-way unified search across Name, Generic/Molecule, Barcode, Batch
 */
export async function searchProducts(
  query: string = '',
  inStockOnly: boolean = false,
  limit: number = 25,
  offset: number = 0
) {
  const cleanQuery = query.trim();
  // Safe literal escaping for SQL LIKE wildcards '%' and '_'
  const escapedQuery = cleanQuery.replace(/[%_]/g, '\\$&');

  // Query products with their batches
  const allProducts = await db.query.products.findMany({
    with: {
      batches: true,
    },
    orderBy: [asc(products.name)],
  });

  const filtered = allProducts.filter((product) => {
    // In-Stock filter
    if (inStockOnly && product.totalStockOnHand <= 0) {
      return false;
    }

    if (!cleanQuery) return true;

    const q = cleanQuery.toLowerCase();

    // 1. Code match
    if (product.code.toLowerCase().includes(q)) return true;

    // 2. Name match
    if (product.name.toLowerCase().includes(q)) return true;

    // 3. Generic / Molecule / packagingDetail match
    if (product.packagingDetail && product.packagingDetail.toLowerCase().includes(q)) {
      return true;
    }

    // 4. Barcode match
    if (product.barcode && product.barcode.toLowerCase().includes(q)) {
      return true;
    }

    // 5. Batch No match across any child batch
    if (product.batches?.some((b) => b.batchNo.toLowerCase().includes(q))) {
      return true;
    }

    return false;
  });

  const total = filtered.length;
  const paged = filtered.slice(offset, offset + limit);

  return {
    products: paged,
    total,
  };
}

/**
 * 5. Create Product with Batches
 */
export async function createProductWithBatches(input: ProductInput) {
  // Validate duplicate code
  const existing = await db.query.products.findFirst({
    where: eq(products.code, input.code.trim()),
  });
  if (existing) {
    throw new Error(`Product Code ${input.code.trim()} already exists in database`);
  }

  // Validate pricing invariants across all batches
  const batches = input.batches || [];
  for (const b of batches) {
    if (b.mrp < b.sellingRate) {
      throw new Error(
        `Pricing invariant violated for batch ${b.batchNo}: MRP (${b.mrp}) cannot be less than Selling Rate (${b.sellingRate})`
      );
    }
    if (b.sellingRate < b.purchaseRate) {
      throw new Error(
        `Pricing invariant violated for batch ${b.batchNo}: Selling Rate (${b.sellingRate}) cannot be less than Purchase Rate (${b.purchaseRate})`
      );
    }
  }

  const productId = input.id || crypto.randomUUID();
  const totalStockOnHand = batches.reduce((sum, b) => sum + (Number(b.stockQty) || 0), 0);

  // Atomic database transaction
  db.transaction((tx) => {
    // Insert product
    tx.insert(products).values({
      id: productId,
      code: input.code.trim(), // Preserve leading zeros
      name: input.name.trim(),
      companyId: input.companyId,
      supplierId: input.supplierId || null,
      taxCode: input.taxCode || '02',
      packaging: input.packaging.trim(),
      packagingDetail: input.genericName || input.packagingDetail || null,
      uqc: input.uqc || 'BOX',
      rackLocation: input.rackLocation || null,
      hsnCode: input.hsnCode.trim(),
      barcode: input.barcode || null,
      drugScheduleFlag: input.drugScheduleFlag || 'NONE',
      isScheduleH: Boolean(input.isScheduleH || input.drugScheduleFlag === 'H'),
      isPsychotropic: Boolean(input.isPsychotropic),
      defaultSupplierDiscountPct: input.defaultSupplierDiscountPct || 0,
      minOrderQty: input.minOrderQty || 0,
      reorderLevel: input.reorderLevel || 0,
      warningQty: input.warningQty || 0,
      allowInvoiceDiscount: input.allowInvoiceDiscount ?? true,
      allowRateModification: input.allowRateModification ?? true,
      isBlocked: Boolean(input.isBlocked),
      isActive: true,
      totalStockOnHand,
    }).run();

    // Insert batches
    for (const b of batches) {
      const batchId = b.id || crypto.randomUUID();
      const expiryDate = b.expiryDate || internalConvertExpiryToIso(b.expiryMonthYear || '');
      const expiryMonthYear = b.expiryMonthYear || `${expiryDate.slice(5, 7)}/${expiryDate.slice(2, 4)}`;

      tx.insert(productBatches).values({
        id: batchId,
        productId,
        batchNo: b.batchNo.trim().toUpperCase(),
        expiryDate,
        expiryMonthYear,
        purchaseRate: Number(b.purchaseRate),
        sellingRate: Number(b.sellingRate),
        secondaryRate: Number(b.secondaryRate || 0),
        mrp: Number(b.mrp),
        stockQty: Number(b.stockQty || 0),
        quarantineQty: Number(b.quarantineQty || 0),
        schemeThreshold: Number(b.schemeThreshold || 0),
        schemeFreeQty: Number(b.schemeFreeQty || 0),
        taxCode: b.taxCode || input.taxCode || '02',
        offerDiscountPct: Number(b.offerDiscountPct || 0),
        isBlocked: Boolean(b.isBlocked),
        isActive: true,
      }).run();
    }
  });

  safeRevalidatePath('/masters/products');
  return { success: true, id: productId };
}

/**
 * 6. Update Product with Batches
 */
export async function updateProductWithBatches(input: ProductInput) {
  if (!input.id) throw new Error('Product ID is required for update');

  // Validate pricing invariants across all batches
  const batches = input.batches || [];
  for (const b of batches) {
    if (b.mrp < b.sellingRate) {
      throw new Error(
        `Pricing invariant violated for batch ${b.batchNo}: MRP (${b.mrp}) cannot be less than Selling Rate (${b.sellingRate})`
      );
    }
    if (b.sellingRate < b.purchaseRate) {
      throw new Error(
        `Pricing invariant violated for batch ${b.batchNo}: Selling Rate (${b.sellingRate}) cannot be less than Purchase Rate (${b.purchaseRate})`
      );
    }
  }

  const totalStockOnHand = batches.reduce((sum, b) => sum + (Number(b.stockQty) || 0), 0);

  db.transaction((tx) => {
    // 1. Update product header
    tx.update(products).set({
      code: input.code.trim(),
      name: input.name.trim(),
      companyId: input.companyId,
      supplierId: input.supplierId || null,
      taxCode: input.taxCode,
      packaging: input.packaging.trim(),
      packagingDetail: input.genericName || input.packagingDetail || null,
      uqc: input.uqc || 'BOX',
      rackLocation: input.rackLocation || null,
      hsnCode: input.hsnCode.trim(),
      barcode: input.barcode || null,
      drugScheduleFlag: input.drugScheduleFlag || 'NONE',
      isScheduleH: Boolean(input.isScheduleH || input.drugScheduleFlag === 'H'),
      isPsychotropic: Boolean(input.isPsychotropic),
      defaultSupplierDiscountPct: input.defaultSupplierDiscountPct || 0,
      minOrderQty: input.minOrderQty || 0,
      reorderLevel: input.reorderLevel || 0,
      warningQty: input.warningQty || 0,
      allowInvoiceDiscount: input.allowInvoiceDiscount ?? true,
      allowRateModification: input.allowRateModification ?? true,
      isBlocked: Boolean(input.isBlocked),
      totalStockOnHand,
      updatedAt: new Date().toISOString(),
    }).where(eq(products.id, input.id!)).run();

    // 2. Upsert batches
    for (const b of batches) {
      const expiryDate = b.expiryDate || internalConvertExpiryToIso(b.expiryMonthYear || '');
      const expiryMonthYear = b.expiryMonthYear || `${expiryDate.slice(5, 7)}/${expiryDate.slice(2, 4)}`;

      if (b.id) {
        tx.update(productBatches).set({
          batchNo: b.batchNo.trim().toUpperCase(),
          expiryDate,
          expiryMonthYear,
          purchaseRate: Number(b.purchaseRate),
          sellingRate: Number(b.sellingRate),
          secondaryRate: Number(b.secondaryRate || 0),
          mrp: Number(b.mrp),
          stockQty: Number(b.stockQty || 0),
          quarantineQty: Number(b.quarantineQty || 0),
          schemeThreshold: Number(b.schemeThreshold || 0),
          schemeFreeQty: Number(b.schemeFreeQty || 0),
          taxCode: b.taxCode || input.taxCode || '02',
          offerDiscountPct: Number(b.offerDiscountPct || 0),
          isBlocked: Boolean(b.isBlocked),
          updatedAt: new Date().toISOString(),
        }).where(eq(productBatches.id, b.id)).run();
      } else {
        tx.insert(productBatches).values({
          id: crypto.randomUUID(),
          productId: input.id!,
          batchNo: b.batchNo.trim().toUpperCase(),
          expiryDate,
          expiryMonthYear,
          purchaseRate: Number(b.purchaseRate),
          sellingRate: Number(b.sellingRate),
          secondaryRate: Number(b.secondaryRate || 0),
          mrp: Number(b.mrp),
          stockQty: Number(b.stockQty || 0),
          quarantineQty: Number(b.quarantineQty || 0),
          schemeThreshold: Number(b.schemeThreshold || 0),
          schemeFreeQty: Number(b.schemeFreeQty || 0),
          taxCode: b.taxCode || input.taxCode || '02',
          offerDiscountPct: Number(b.offerDiscountPct || 0),
          isBlocked: Boolean(b.isBlocked),
          isActive: true,
        }).run();
      }
    }
  });

  safeRevalidatePath('/masters/products');
  return { success: true };
}

/**
 * 7. Delete Product with Referential Integrity Guard
 */
export async function deleteProduct(productId: string) {
  // Check invoice history
  const invItems = await db.select({ count: sql<number>`COUNT(*)` })
    .from(invoiceItems)
    .where(eq(invoiceItems.productId, productId))
    .get();

  if (invItems && invItems.count > 0) {
    throw new Error('Cannot delete product with historical transactions. Block instead.');
  }

  // Check purchase history
  const purItems = await db.select({ count: sql<number>`COUNT(*)` })
    .from(purchaseItems)
    .where(eq(purchaseItems.productId, productId))
    .get();

  if (purItems && purItems.count > 0) {
    throw new Error('Cannot delete product with historical transactions. Block instead.');
  }

  // Clean delete: remove batches then product
  db.transaction((tx) => {
    tx.delete(productBatches).where(eq(productBatches.productId, productId)).run();
    tx.delete(products).where(eq(products.id, productId)).run();
  });

  safeRevalidatePath('/masters/products');
  return { success: true };
}

/**
 * 8. Toggle Block Status
 */
export async function toggleProductBlocked(productId: string, isBlocked: boolean) {
  await db.update(products).set({
    isBlocked,
    updatedAt: new Date().toISOString(),
  }).where(eq(products.id, productId)).run();

  safeRevalidatePath('/masters/products');
  return { success: true, isBlocked };
}
