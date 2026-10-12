import { canCustomerCancel, canCustomerConfirmReceipt, canCustomerRateShipper, orderTotals } from './orders';

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
