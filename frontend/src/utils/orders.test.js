import { canCustomerCancel, canCustomerConfirmReceipt, canCustomerRateShipper, mergeOrderUpdate, orderTotals } from './orders';

test('order amounts use checkout snapshots when current catalog and shipping prices change', () => {
    expect(orderTotals({ subtotal: 200000, shippingFee: 25000, discountAmount: 20000, totalPrice: 205000,
        typeShipData: { price: 90000 }, orderDetail: [{ realPrice: 500000, quantity: 1 }] }))
        .toEqual({ subtotal: 200000, shippingFee: 25000, discountAmount: 20000, totalPrice: 205000 });
});
test('legacy orders retain individual totals, including capped voucher discount and shipping', () => {
    expect(orderTotals({ orderDetail: [{ realPrice: 100000, quantity: 2 }], typeShipData: { price: 30000 }, voucherData: { typeVoucherOfVoucherData: { typeVoucher: 'percent', value: 20, maxValue: 25000 } } }).totalPrice).toBe(205000);
    expect(orderTotals({ orderDetail: [{ realPrice: 50000, quantity: 1 }] }).totalPrice).toBe(50000);
});
test('receipt and rating actions follow assigned shipment and delivered order authorization', () => {
    expect(canCustomerConfirmReceipt({ statusId: 'S5' })).toBe(false);
    expect(canCustomerConfirmReceipt({ statusId: 'S5', shipperId: 9 })).toBe(true);
    expect(canCustomerRateShipper({ statusId: 'S5', shipperId: 9, canRateShipper: true })).toBe(false);
    expect(canCustomerRateShipper({ statusId: 'S6', shipperId: 9, canRateShipper: true })).toBe(true);
    expect(canCustomerRateShipper({ statusId: 'S6', shipperId: 9, canRateShipper: true, shipperRating: { rating: 5 } })).toBe(false);
    expect(canCustomerCancel({ statusId: 'S4', isPaymentOnlien: 1 })).toBe(false);
});

test('confirmed updates preserve loaded products and proof images until the fresh detail arrives', () => {
    const before = { id: 5, statusId: 'S5', statusOrderData: { value: 'Đang giao hàng' },
        image: 'data:image/png;base64,proof', addressUser: { shipName: 'Khách' }, orderDetail: [{ product: { name: 'Áo' } }] };
    const next = mergeOrderUpdate(before, { id: 5, statusId: 'S6', image: { type: 'Buffer', data: [1, 2] }, deliveredAt: '2026-10-13T04:00:00Z' });
    expect(next.statusId).toBe('S6');
    expect(next.deliveredAt).toBe('2026-10-13T04:00:00Z');
    expect(next.orderDetail).toBe(before.orderDetail);
    expect(next.addressUser).toBe(before.addressUser);
    expect(next.image).toBe(before.image);
    expect(next.statusOrderData).toBeUndefined();
    expect(mergeOrderUpdate(before, { id: 6, statusId: 'S6' })).toBe(before);
});
