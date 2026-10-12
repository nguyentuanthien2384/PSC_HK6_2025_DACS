import { cartItemAvailabilityError, cartSubtotal, createCheckoutPayload, discountedSubtotal } from "./checkout";

const cart = [{ productdetailsizeId: 7, quantity: 2, productDetail: { discountPrice: "150000" } }];
const input = { userId: 1, addressUserId: 2, dataTypeShip: { id: 3 }, dataCart: cart, note: " hello " };

test("builds checkout identities and quantities without client-supplied prices", () => {
    expect(createCheckoutPayload(input)).toEqual({ userId: 1, addressUserId: 2, typeShipId: 3,
        voucherId: undefined, note: "hello", arrDataShopCart: [{ productId: 7, quantity: 2 }] });
    expect(cartSubtotal(cart)).toBe(300000);
});

test.each([
    [{ ...input, dataCart: [] }, "Giỏ hàng"],
    [{ ...input, addressUserId: "" }, "địa chỉ"],
    [{ ...input, dataTypeShip: {} }, "vận chuyển"],
    [{ ...input, dataCart: [{ ...cart[0], quantity: -2 }] }, "Số lượng"],
    [{ ...input, dataCart: [{ ...cart[0], quantity: 1.5 }] }, "Số lượng"],
])("rejects incomplete or invalid checkout %#", (data, error) => {
    expect(() => createCheckoutPayload(data)).toThrow(error);
});

test("discount estimate respects minimum spend, percentage cap and zero floor", () => {
    const voucher = (rule) => ({ voucherData: { typeVoucherOfVoucherData: rule } });
    expect(discountedSubtotal(100000, voucher({ typeVoucher: "percent", value: 50, maxValue: 20000 }))).toBe(80000);
    expect(discountedSubtotal(10000, voucher({ typeVoucher: "money", maxValue: 20000 }))).toBe(0);
    expect(discountedSubtotal(10000, voucher({ minValue: 20000, typeVoucher: "money", maxValue: 5000 }))).toBe(10000);
    expect(discountedSubtotal(10000, {})).toBe(10000);
});

test('checkout blocks unavailable products and quantities above current stock', () => {
    for (const item of [
        { ...cart[0], available: false },
        { ...cart[0], productData: { statusId: 'S2' } },
        { ...cart[0], productdetailsizeData: { stock: 1 } },
    ]) {
        expect(cartItemAvailabilityError(item)).toBeTruthy();
        expect(() => createCheckoutPayload({ ...input, dataCart: [item] })).toThrow(/giỏ hàng/);
    }
    expect(cartItemAvailabilityError({ ...cart[0], available: true, productdetailsizeData: { stock: 2 } })).toBe('');
});

test('shipping fees do not meet voucher minimum product spend and selected invalid vouchers block checkout', () => {
    const selected = { voucherId: 9, voucherData: { typeVoucherOfVoucherData: { minValue: 310000, typeVoucher: 'money', maxValue: 10000 } } };
    expect(discountedSubtotal(cartSubtotal(cart), selected)).toBe(300000);
    expect(() => createCheckoutPayload({ ...input, dataTypeShip: { id: 3, price: 20000 }, dataVoucher: selected })).toThrow(/tối thiểu/);
});
