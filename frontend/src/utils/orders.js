export const ORDER_STATUSES = {
    S3: 'Chờ xác nhận', S4: 'Chờ người giao hàng', S5: 'Đang giao hàng', S6: 'Đã giao hàng', S7: 'Đã hủy',
    S8: 'Giao không thành công', S9: 'Đang hoàn về kho', S10: 'Đã hoàn về kho',
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

export const canCustomerCancel = (order) => ['S3', 'S4'].includes(order.statusId) && Number(order.isPaymentOnlien) === 0 && !order.shipment && (!order.deliveryProvider || order.deliveryProvider === 'internal');
export const canCustomerConfirmReceipt = (order) => order.statusId === 'S5' && Boolean(order.shipperId);
export const canCustomerRateShipper = (order) => order.statusId === 'S6' && Boolean(order.shipperId) && order.canRateShipper === true && !order.shipperRating;

// Mutations return order columns, while GETs include products, address and media.
// Apply confirmed scalar changes without replacing those loaded relations or
// a displayable proof image with its JSON-serialized database Buffer.
export function mergeOrderUpdate(order, updated) {
    if (!order || String(updated?.id) !== String(order.id)) return order;
    const next = { ...order, statusOrderData: undefined };
    for (const [key, value] of Object.entries(updated)) {
        if (key === 'image') {
            if (value == null) next.image = '';
            else if (typeof value === 'string' && /^(data:image\/|https?:\/\/|\/api\/media\/)/.test(value)) next.image = value;
        } else if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
            next[key] = value;
        }
    }
    return next;
}

export const RETURN_STATUSES = { REQUESTED: 'Chờ duyệt trả hàng', APPROVED: 'Đã duyệt, chờ gửi hàng', SHIPPED: 'Khách đã gửi hàng về', REFUND_PENDING: 'Đã nhận hàng, chờ hoàn tiền', REFUNDED: 'Đã hoàn tiền', REJECTED: 'Yêu cầu bị từ chối' };

export function paymentLabel(order) {
    if (order.paymentStatus === 'REFUNDED' || order.returnRequest?.status === 'REFUNDED') return 'Đã hoàn tiền';
    if (order.paymentStatus === 'REFUND_PENDING' || order.returnRequest?.status === 'REFUND_PENDING') return 'Chờ hoàn tiền';
    if (order.paymentStatus && order.paymentStatus !== 'PAID') return ({ PENDING: 'Chờ thanh toán', FAILED: 'Thanh toán thất bại', CANCELLED: 'Thanh toán đã hủy', EXPIRED: 'Thanh toán hết hạn' })[order.paymentStatus] || order.paymentStatus;
    return Number(order.isPaymentOnlien) === 1 ? 'Đã thanh toán trực tuyến' : order.statusId === 'S6' ? 'Đã thu tiền khi giao hàng' : 'Tiền mặt khi nhận hàng';
}

export function flattenCustomerOrders(addresses = []) {
    return addresses.flatMap(address => address.order || [])
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}
