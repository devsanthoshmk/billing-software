'use server';

import { db } from '@/lib/db';
import { products, taxSlabs, auditLogs } from '@/lib/db/schema';
import { eq, like, or } from 'drizzle-orm';

export async function getProductsForHsnMapping(query?: string) {
  try {
    const slabs = await db.query.taxSlabs.findMany({
      where: eq(taxSlabs.isActive, true),
      orderBy: [taxSlabs.code],
    });

    const prods = await db.query.products.findMany({
      where: eq(products.isActive, true),
      with: { company: true, taxSlab: true },
      orderBy: [products.name],
      limit: 100,
    });

    const filtered = prods.filter((p) => {
      if (!query || !query.trim()) return true;
      const q = query.toLowerCase().trim();
      return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.hsnCode.includes(q);
    });

    return {
      success: true,
      taxSlabs: slabs,
      products: filtered.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        company: p.company?.name || '',
        packaging: p.packaging,
        hsnCode: p.hsnCode,
        taxCode: p.taxCode,
        taxDescription: p.taxSlab?.description || '',
      })),
    };
  } catch (err: any) {
    console.error('getProductsForHsnMapping error:', err);
    return { success: false, error: err.message, taxSlabs: [], products: [] };
  }
}

export async function updateProductHsnAndTax(input: {
  productId: string;
  hsnCode: string;
  taxCode: string;
  operator: string;
}) {
  try {
    if (!input.hsnCode || input.hsnCode.length < 4) {
      return { success: false, error: 'Valid HSN code required (minimum 4 to 8 digits)' };
    }

    const current = await db.query.products.findFirst({
      where: eq(products.id, input.productId),
    });

    if (!current) {
      return { success: false, error: 'Product not found' };
    }

    await db
      .update(products)
      .set({
        hsnCode: input.hsnCode.trim(),
        taxCode: input.taxCode,
      })
      .where(eq(products.id, input.productId));

    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId: input.operator || 'ADMIN',
      action: 'HSN_UPDATE',
      entityType: 'product',
      entityId: input.productId,
      oldValues: JSON.stringify({ hsnCode: current.hsnCode, taxCode: current.taxCode }),
      newValues: JSON.stringify({ hsnCode: input.hsnCode, taxCode: input.taxCode }),
      remarks: `HSN code updated for ${current.name}`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('updateProductHsnAndTax error:', err);
    return { success: false, error: err.message };
  }
}
