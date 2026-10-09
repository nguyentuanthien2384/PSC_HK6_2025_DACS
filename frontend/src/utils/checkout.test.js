import { cartSubtotal, createCheckoutPayload, discountedSubtotal } from "./checkout";

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
