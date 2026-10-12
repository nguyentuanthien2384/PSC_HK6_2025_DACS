export const ORDER_STATUSES = {
    S3: 'Chờ xác nhận', S4: 'Chờ người giao hàng', S5: 'Đang giao hàng', S6: 'Đã giao hàng', S7: 'Đã hủy',
};

export const formatOrderMoney = (value) => new Intl.NumberFormat('vi-VN', {
    style: 'currency', currency: 'VND', maximumFractionDigits: 0,
}).format(Number(value) || 0);

export const formatOrderDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN');
};

export const shipperName = (shipper) => [shipper?.firstName, shipper?.lastName].filter(Boolean).join(' ') || 'Người giao hàng';

export function orderTotals(order) {
    const subtotal = Number(order.subtotal ?? (order.orderDetail || []).reduce((sum, line) =>
        sum + Number(line.realPrice ?? line.productDetail?.discountPrice ?? 0) * Number(line.quantity || 0), 0));
    const shippingFee = Number(order.shippingFee ?? order.typeShipData?.price ?? 0);
    const type = order.voucherData?.typeVoucherOfVoucherData;
    const legacyDiscount = type ? Math.min(subtotal, type.typeVoucher === 'percent'
        ? Math.min(Math.floor(subtotal * Number(type.value || 0) / 100), Number(type.maxValue || 0))
        : Number(type.maxValue || 0)) : 0;
    const discountAmount = Number(order.discountAmount ?? legacyDiscount);
    return { subtotal, shippingFee, discountAmount, totalPrice: Number(order.totalPrice ?? subtotal + shippingFee - discountAmount) };
}

export const canCustomerCancel = (order) => ['S3', 'S4'].includes(order.statusId) && Number(order.isPaymentOnlien) === 0;
export const canCustomerConfirmReceipt = (order) => order.statusId === 'S5' && Boolean(order.shipperId);
export const canCustomerRateShipper = (order) => order.statusId === 'S6' && Boolean(order.shipperId) && order.canRateShipper === true && !order.shipperRating;

export function flattenCustomerOrders(addresses = []) {
    return addresses.flatMap(address => address.order || [])
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}
