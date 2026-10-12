import { voucherAvailabilityError } from './voucher';

export const cartSubtotal = (items = []) => items.reduce((sum, item) =>
  sum + Number(item.quantity || 0) * Number(item.productDetail?.discountPrice || 0), 0);

export const cartItemAvailabilityError = (item) => {
  const stock = Number(item.productdetailsizeData?.stock);
  if (item.available === false || (item.productData?.statusId && item.productData.statusId !== 'S1')) {
    return 'Sản phẩm đã hết hàng hoặc ngừng kinh doanh. Vui lòng xóa khỏi giỏ hàng.';
  }
  if (Number.isFinite(stock) && Number(item.quantity) > stock) {
    return `Chỉ còn ${stock} sản phẩm. Vui lòng giảm số lượng hoặc xóa khỏi giỏ hàng.`;
  }
  return '';
};

// This is a display estimate; the backend validates the voucher and prices again.
export const discountedSubtotal = (subtotal, selectedVoucher) => {
  const rule = selectedVoucher?.voucherData?.typeVoucherOfVoucherData;
  if (!rule || voucherAvailabilityError(selectedVoucher, subtotal)) return subtotal;
  const maximum = Number(rule.maxValue || 0);
  const discount = rule.typeVoucher === "percent"
    ? Math.floor(subtotal * Math.min(Number(rule.value || 0), 100) / 100)
    : (maximum || Number(rule.value || 0));
  return Math.max(0, subtotal - Math.max(0, maximum > 0 ? Math.min(discount, maximum) : discount));
};

export const createCheckoutPayload = ({ userId, addressUserId, dataTypeShip, dataVoucher, note, dataCart }) => {
  if (!dataCart?.length) throw new Error("Giỏ hàng đang trống");
  if (!addressUserId) throw new Error("Vui lòng thêm hoặc chọn địa chỉ nhận hàng");
  if (!dataTypeShip?.id) throw new Error("Vui lòng chọn đơn vị vận chuyển");
  if (dataVoucher?.voucherId) {
    const voucherError = voucherAvailabilityError(dataVoucher, cartSubtotal(dataCart));
    if (voucherError) throw new Error(voucherError);
  }
  const arrDataShopCart = dataCart.map((item) => {
    const availabilityError = cartItemAvailabilityError(item);
    if (availabilityError) throw new Error(availabilityError);
    const quantity = Number(item.quantity);
    const productId = item.productdetailsizeId || item.productdetailsizeData?.id;
    if (!productId || !Number.isInteger(quantity) || quantity < 1) throw new Error("Số lượng sản phẩm không hợp lệ");
    return { productId, quantity };
  });
  return { userId, addressUserId, typeShipId: dataTypeShip.id,
    voucherId: dataVoucher?.voucherId || undefined, note: note?.trim() || "", arrDataShopCart };
};
