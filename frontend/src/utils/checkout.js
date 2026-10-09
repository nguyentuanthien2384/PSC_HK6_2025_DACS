export const cartSubtotal = (items = []) => items.reduce((sum, item) =>
  sum + Number(item.quantity || 0) * Number(item.productDetail?.discountPrice || 0), 0);

// This is a display estimate; the backend validates the voucher and prices again.
export const discountedSubtotal = (subtotal, selectedVoucher) => {
  const rule = selectedVoucher?.voucherData?.typeVoucherOfVoucherData;
  if (!rule || subtotal < Number(rule.minValue || 0)) return subtotal;
  const maximum = Number(rule.maxValue || 0);
  const discount = rule.typeVoucher === "percent"
    ? Math.min(subtotal * Number(rule.value || 0) / 100, maximum)
    : maximum;
  return Math.max(0, subtotal - Math.max(0, discount));
};

export const createCheckoutPayload = ({ userId, addressUserId, dataTypeShip, dataVoucher, note, dataCart }) => {
  if (!dataCart?.length) throw new Error("Giỏ hàng đang trống");
  if (!addressUserId) throw new Error("Vui lòng thêm hoặc chọn địa chỉ nhận hàng");
  if (!dataTypeShip?.id) throw new Error("Vui lòng chọn đơn vị vận chuyển");
  const arrDataShopCart = dataCart.map((item) => {
    const quantity = Number(item.quantity);
    const productId = item.productdetailsizeId || item.productdetailsizeData?.id;
    if (!productId || !Number.isInteger(quantity) || quantity < 1) throw new Error("Số lượng sản phẩm không hợp lệ");
    return { productId, quantity };
  });
  return { userId, addressUserId, typeShipId: dataTypeShip.id,
    voucherId: dataVoucher?.voucherId || undefined, note: note?.trim() || "", arrDataShopCart };
};
