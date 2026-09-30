import { describe, it, expect } from 'vitest';
import { getPriceListData } from '@/app/masters/price-lists/actions';
import { getAddressLabelsData } from '@/app/masters/address-labels/actions';

describe('Masters Hub Extensions (2.5 & 2.6 Price Lists & Address Labels)', () => {
  it('1. generates 7 price list formats with zero errors', async () => {
    const wholesaleList = await getPriceListData({ priceListType: 'WHOLESALE' });
    expect(wholesaleList.success).toBe(true);
    expect(wholesaleList.priceList.length).toBeGreaterThan(0);

    const mrpList = await getPriceListData({ priceListType: 'MRP' });
    expect(mrpList.success).toBe(true);

    const schHList = await getPriceListData({ priceListType: 'SCHEDULE_H' });
    expect(schHList.success).toBe(true);
  });

  it('2. generates customer and supplier address labels', async () => {
    const custLabels = await getAddressLabelsData('CUSTOMERS');
    expect(custLabels.success).toBe(true);
    expect(custLabels.parties.length).toBeGreaterThan(0);
    expect(custLabels.parties[0].code).toBeDefined();

    const supLabels = await getAddressLabelsData('SUPPLIERS');
    expect(supLabels.success).toBe(true);
    expect(supLabels.parties.length).toBeGreaterThan(0);
  });
});
