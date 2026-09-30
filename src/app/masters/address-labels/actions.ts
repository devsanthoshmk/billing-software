'use server';

import { db } from '@/lib/db';
import { customers, suppliers, areas } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function getAddressLabelsData(partyType: 'CUSTOMERS' | 'SUPPLIERS' = 'CUSTOMERS', areaId?: string) {
  try {
    const areasList = await db.query.areas.findMany({
      where: eq(areas.isActive, true),
      orderBy: [areas.name],
    });

    if (partyType === 'CUSTOMERS') {
      let custs = await db.query.customers.findMany({
        where: eq(customers.isActive, true),
        with: { area: true, salesman: true },
        orderBy: [customers.name],
      });

      if (areaId && areaId.trim()) {
        custs = custs.filter((c) => c.areaId === areaId);
      }

      return {
        success: true,
        areas: areasList,
        parties: custs.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          contactPerson: c.contactPerson || '',
          address1: c.addressLine1 || '',
          address2: c.addressLine2 || '',
          address3: c.addressLine3 || '',
          town: c.addressLine4 || '',
          pincode: c.pincode || '',
          phone: c.phone || '',
          gstin: c.gstin || '',
          dlNo: `${c.dlNo20b || ''} ${c.dlNo21b || ''}`.trim(),
          area: c.area?.name || '',
          salesman: c.salesman?.name || '',
        })),
      };
    } else {
      const sups = await db.query.suppliers.findMany({
        where: eq(suppliers.isActive, true),
        orderBy: [suppliers.name],
      });

      return {
        success: true,
        areas: areasList,
        parties: sups.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          contactPerson: s.contactPerson || '',
          address1: s.addressLine1 || '',
          address2: s.addressLine2 || '',
          address3: s.addressLine3 || '',
          town: s.addressLine4 || '',
          pincode: s.pincode || '',
          phone: s.phone || '',
          gstin: s.gstin || '',
          dlNo: s.drugLicenseNo || '',
          area: 'SUPPLIER',
          salesman: '',
        })),
      };
    }
  } catch (err: any) {
    console.error('getAddressLabelsData error:', err);
    return { success: false, error: err.message, areas: [], parties: [] };
  }
}
