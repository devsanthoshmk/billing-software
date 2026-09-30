'use server';

import { db } from '@/lib/db';
import { products, productBatches, companies, taxSlabs } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';

export async function getPriceListData(options: {
  companyId?: string;
  priceListType: 'WHOLESALE' | 'MRP' | 'NET_RATE' | 'SCHEDULE_H' | 'SPECIAL' | 'ALL';
}) {
  try {
    const companiesList = await db.query.companies.findMany({
      where: eq(companies.isActive, true),
      orderBy: [companies.name],
    });

    let whereClause = eq(products.isActive, true);
    if (options.companyId && options.companyId.trim()) {
      whereClause = and(eq(products.isActive, true), eq(products.companyId, options.companyId)) as any;
    }

    const prods = await db.query.products.findMany({
      where: whereClause,
      with: {
        company: true,
        batches: {
          where: eq(productBatches.isActive, true),
          orderBy: [productBatches.batchNo],
        },
      },
      orderBy: [products.name],
    });

    // Flatten into price list rows
    const listRows: any[] = [];
    for (const p of prods) {
      if (options.priceListType === 'SCHEDULE_H' && !p.isScheduleH) continue;

      if (p.batches && p.batches.length > 0) {
        for (const b of p.batches) {
          listRows.push({
            productId: p.id,
            code: p.code,
            name: p.name,
            company: p.company?.name || 'GENERIC',
            packaging: p.packaging,
            hsnCode: p.hsnCode,
            isScheduleH: p.isScheduleH,
            batchNo: b.batchNo,
            expiryDate: b.expiryDate,
            purchaseRate: b.purchaseRate,
            sellingRate: b.sellingRate,
            secondaryRate: b.secondaryRate || b.sellingRate,
            mrp: b.mrp,
            scheme: b.schemeThreshold > 0 ? `${b.schemeThreshold}+${b.schemeFreeQty}` : '-',
            stockQty: b.stockQty,
          });
        }
      } else {
        listRows.push({
          productId: p.id,
          code: p.code,
          name: p.name,
          company: p.company?.name || 'GENERIC',
          packaging: p.packaging,
          hsnCode: p.hsnCode,
          isScheduleH: p.isScheduleH,
          batchNo: 'N/A',
          expiryDate: 'N/A',
          purchaseRate: 0,
          sellingRate: 0,
          secondaryRate: 0,
          mrp: 0,
          scheme: '-',
          stockQty: p.totalStockOnHand || 0,
        });
      }
    }

    return { success: true, companies: companiesList, priceList: listRows };
  } catch (err: any) {
    console.error('getPriceListData error:', err);
    return { success: false, error: err.message, companies: [], priceList: [] };
  }
}
