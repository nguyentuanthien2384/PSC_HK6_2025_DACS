'use strict';

const DAY = 86400000;
const HOUR = 3600000;
const orderPrefix = '[DEMO DACS v2]';
const notes = ['Gọi trước khi giao khoảng 15 phút.', 'Nhận hàng tại quầy lễ tân trong giờ hành chính.',
  'Vui lòng đóng gói cẩn thận và giữ nguyên tem sản phẩm.', 'Giao sau 17 giờ, khách sẽ nghe điện thoại.',
  'Khách đã kiểm tra bảng kích thước trước khi đặt hàng.', 'Mua làm quà, vui lòng không ghi giá trên bao bì.'];

function buildActivityOrders({ now, customers, addresses, shippingMethods, variants, shippers, historicalCount = 1200 }) {
  const anchor = new Date(now).getTime();
  if (!Number.isFinite(anchor)) throw new Error('Activity seed requires a valid date.');
  if (!Number.isSafeInteger(historicalCount) || historicalCount < 365) throw new Error('At least 365 historical orders are required.');
  const buyers = (customers || []).filter(row => row.id && row.roleId === 'R2' && row.statusId === 'S1');
  const couriers = (shippers || []).filter(row => row.id && row.roleId === 'R3' && row.statusId === 'S1');
  const goods = (variants || []).filter(row => row.id && Number(row.price) > 0 && (!row.statusId || row.statusId === 'S1'));
  if (!buyers.length || !couriers.length || !goods.length || !shippingMethods?.length) throw new Error('Activity orders require customers, shippers, variants and shipping methods.');
  const byBuyer = new Map(buyers.map(buyer => [Number(buyer.id), (addresses || []).filter(row => Number(row.userId) === Number(buyer.id))]));
  if (buyers.some(buyer => !byBuyer.get(Number(buyer.id)).length)) throw new Error('Every customer needs a delivery address.');
  const orders = [];
  function add(buyer, statusId, ageDays, courier, recent = false) {
    const index = orders.length;
    const finish = new Date(anchor - ageDays * DAY - (1 + index % 6) * 600000);
    const createdAt = new Date(finish.getTime() - (statusId === 'S3' ? 0 : (1 + index % 4) * DAY));
    const assigned = ['S5', 'S6', 'S8', 'S9', 'S10'].includes(statusId);
    const assignedAt = assigned ? new Date(createdAt.getTime() + 8 * HOUR) : null;
    const cancelledAt = statusId === 'S7' ? finish : null;
    const failedDeliveryAt = ['S8', 'S9', 'S10'].includes(statusId) ? new Date(finish.getTime() - (statusId === 'S8' ? 0 : 8 * HOUR)) : null;
    const customerAddresses = byBuyer.get(Number(buyer.id)).filter(address => !address.createdAt || new Date(address.createdAt).getTime() <= createdAt.getTime());
    if (!customerAddresses.length) throw new Error('Delivery addresses must exist before their orders.');
    const address = customerAddresses[index % customerAddresses.length];
    const shipping = shippingMethods[index % shippingMethods.length];
    const lines = new Map();
    for (let line = 0; line < 1 + index % 4; line++) {
      const variant = goods[(index * 17 + line * 11 + Math.floor(index / 7)) % goods.length];
      const quantity = (index + line) % 9 === 0 ? 3 : 1 + (index + line) % 2;
      if (lines.has(variant.id)) lines.get(variant.id).quantity += quantity;
      else lines.set(variant.id, { productId: variant.id, quantity, realPrice: Number(variant.price) });
    }
    const normalized = [...lines.values()];
    const subtotal = normalized.reduce((sum, row) => sum + row.quantity * row.realPrice, 0);
    const shippingFee = Number(shipping.price);
    orders.push({ key: index + 1, customerId: buyer.id, recent,
      addressUserId: address.id, statusId, typeShipId: shipping.id, voucherId: null,
      note: `${orderPrefix} #${String(index + 1).padStart(4, '0')} · ${notes[index % notes.length]}`,
      // Simulated provider payments exist only for completed deliveries.
      isPaymentOnlien: statusId === 'S6' && (recent ? index % 3 === 1 : index % 4 === 1) ? 1 : 0,
      subtotal, shippingFee, discountAmount: 0, totalPrice: subtotal + shippingFee,
      deliveryProvider: 'internal', shipperId: assigned ? courier.id : null, assignedAt,
      deliveredAt: statusId === 'S6' ? finish : null, cancelledAt,
      cancellationReason: cancelledAt ? ['Khách đặt nhầm kích thước, muốn đặt lại.', 'Khách thay đổi kế hoạch nhận hàng.', 'Khách muốn gộp các sản phẩm vào một đơn.'][index % 3] : null,
      deliveryAttempts: failedDeliveryAt ? (statusId === 'S8' ? 1 : 2) : 0,
      failedDeliveryAt, lastDeliveryFailureReason: failedDeliveryAt ? 'Không liên hệ được người nhận tại thời điểm giao hẹn.' : null,
      returnStartedAt: ['S9', 'S10'].includes(statusId) ? new Date(finish.getTime() - 4 * HOUR) : null,
      warehouseReceivedAt: statusId === 'S10' ? finish : null,
      returnResellable: statusId === 'S10' ? true : null,
      createdAt, updatedAt: finish, lines: normalized,
    });
  }
  for (let index = 0; index < historicalCount; index++) {
    // One delivery each day, plus extra volume increasingly concentrated in recent months.
    const age = index < 365 ? index : Math.floor(364 * Math.pow((index - 365) / Math.max(1, historicalCount - 366), 1.4));
    const placedAt = anchor - age * DAY - (1 + index % 6) * 600000 - (1 + index % 4) * DAY;
    const eligible = buyers.filter(buyer => (!buyer.createdAt || new Date(buyer.createdAt).getTime() <= placedAt)
      && byBuyer.get(Number(buyer.id)).some(address => !address.createdAt || new Date(address.createdAt).getTime() <= placedAt));
    if (!eligible.length) throw new Error('Historical orders require customers registered before their order dates.');
    const eligibleCouriers = couriers.filter(courier => !courier.createdAt || new Date(courier.createdAt).getTime() <= placedAt + 8 * HOUR);
    if (!eligibleCouriers.length) throw new Error('Historical deliveries require shippers registered before assignment.');
    add(eligible[index % eligible.length], 'S6', age, eligibleCouriers[(index * 7 + Math.floor(index / 9)) % eligibleCouriers.length]);
  }
  for (const [index, buyer] of buyers.entries()) {
    for (const [offset, status] of ['S3', 'S4', 'S5', 'S6', 'S7'].entries()) {
      add(buyer, status, status === 'S6' ? index % 6 : index % 3, couriers[(index + offset) % couriers.length], true);
    }
  }
  for (const [index, courier] of couriers.entries()) {
    for (const status of ['S8', 'S9', 'S10']) add(buyers[index % buyers.length], status, index % 3, courier, true);
  }
  return orders;
}

function orderEvents(order, customerId, staffId) {
  const rows = [];
  const add = (type, title, at, actorId, metadata = {}) => rows.push({ orderId: order.id, actorId, type, title,
    message: `${title}. Dữ liệu mô phỏng phục vụ kiểm thử dự án.`,
    metadata: JSON.stringify({ demo: true, version: 2, ...metadata }), createdAt: at });
  add('ORDER_CREATED', 'Khách hàng đặt đơn', order.createdAt, customerId, { toStatus: 'S3' });
  if (order.statusId === 'S3') return rows;
  if (order.statusId === 'S7') {
    add('ORDER_CANCELLED', 'Khách hàng hủy đơn', order.cancelledAt, customerId, { fromStatus: 'S3', toStatus: 'S7', reason: order.cancellationReason });
    return rows;
  }
  add('ORDER_CONFIRMED', 'Cửa hàng xác nhận đơn', new Date(order.createdAt.getTime() + 2 * HOUR), staffId, { fromStatus: 'S3', toStatus: 'S4' });
  if (!order.shipperId) return rows;
  add('SHIPPER_ASSIGNED', 'Shipper nhận giao hàng', order.assignedAt, order.shipperId, { fromStatus: 'S4', toStatus: 'S5', shipperId: order.shipperId });
  if (order.deliveredAt) add('ORDER_DELIVERED', 'Giao hàng thành công', order.deliveredAt, order.shipperId, { fromStatus: 'S5', toStatus: 'S6' });
  if (order.failedDeliveryAt) add('DELIVERY_FAILED', 'Giao hàng không thành công', order.failedDeliveryAt, order.shipperId, { fromStatus: 'S5', toStatus: 'S8' });
  if (order.returnStartedAt) add('DELIVERY_RETURN_STARTED', 'Shipper chuyển hàng về kho', order.returnStartedAt, order.shipperId, { fromStatus: 'S8', toStatus: 'S9' });
  if (order.warehouseReceivedAt) add('UNDELIVERED_RECEIVED', 'Kho đã nhận lại hàng chưa giao', order.warehouseReceivedAt, staffId, { fromStatus: 'S9', toStatus: 'S10', resellable: true });
  return rows;
}

module.exports = { buildActivityOrders, orderEvents, orderPrefix, DAY, HOUR };
