'use strict';

// This verifier deliberately uses SELECTs and read-only HTTP routes. Integration
// tests must never run against the project's populated application database.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
process.env.DOTENV_CONFIG_QUIET = 'true';
require('../src/config/env');
require('@babel/register')({
  presets: [require.resolve('@babel/preset-env')], babelrc: false, configFile: false,
  cache: false, extensions: ['.js'], ignore: [/node_modules/],
});
const db = require('../src/models');

const MARKER = 'DEMO_DACS_ACTIVITY_V2_SEEDED';
const PREFIX = '[DEMO DACS v2]';
const DOMAIN = '@demo.dacs.test';
const DAY = 86400000;
const STATUSES = ['S3', 'S4', 'S5', 'S6', 'S7'];
const RETURN_STATUSES = ['REQUESTED', 'APPROVED', 'SHIPPED', 'REFUND_PENDING', 'REFUNDED', 'REJECTED'];
const activityKey = order => {
  const match = /^\[DEMO DACS v2\] #(\d+)/.exec(order.note || '');
  assert.ok(match, `Order ${order.id}: activity sequence is missing`);
  return Number(match[1]);
};
const ids = rows => new Set(rows.map(row => Number(row.id)));
const byId = rows => new Map(rows.map(row => [Number(row.id), row]));
const positive = value => value != null && Number.isSafeInteger(Number(value)) && Number(value) > 0;
const money = value => value != null && value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
const localDay = value => new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 10);
const timestamp = (value, label) => {
  const result = value == null ? NaN : new Date(value).getTime();
  assert.ok(Number.isFinite(result), `${label}: missing or invalid timestamp`);
  return result;
};
const group = (rows, key) => {
  const result = new Map();
  for (const row of rows) {
    const id = Number(row[key]);
    if (!result.has(id)) result.set(id, []);
    result.get(id).push(row);
  }
  return result;
};
const parseJson = (value, label) => {
  try { return typeof value === 'string' ? JSON.parse(value) : value; }
  catch (_) { assert.fail(`${label}: malformed JSON`); }
};
function chronology(row, keys, label) {
  let previous = -Infinity;
  for (const key of keys) {
    const value = timestamp(row[key], `${label}.${key}`);
    assert.ok(value >= previous, `${label}: ${key} precedes the previous lifecycle stage`);
    previous = value;
  }
}

async function verifyDatabase(database) {
  const names = ['Allcode', 'User', 'AddressUser', 'Product', 'ProductDetail', 'ProductDetailSize', 'TypeShip', 'Voucher', 'TypeVoucher',
    'OrderProduct', 'OrderDetail', 'Receipt', 'ReceiptDetail', 'PaymentSession', 'OrderEvent', 'ShipperRating',
    'Comment', 'Notification', 'ReturnRequest', 'InventoryAdjustment', 'StockMovement'];
  const rows = {};
  const attributes = {
    User: ['id', 'email', 'roleId', 'statusId'],
    Product: ['id', 'name', 'statusId'], ProductDetail: ['id', 'productId', 'originalPrice', 'discountPrice'],
    Comment: ['id', 'userId', 'productId', 'parentId', 'star', 'content', 'createdAt'],
    OrderProduct: { exclude: ['image'] },
  };
  await Promise.all(names.map(async name => {
    assert.ok(database[name], `Missing model ${name}; apply database migrations first.`);
    rows[name] = await database[name].findAll({ raw: true, ...(attributes[name] ? { attributes: attributes[name] } : {}) });
  }));
  const maps = Object.fromEntries(names.map(name => [name, byId(rows[name])]));
  const marker = rows.Allcode.find(row => row.code === MARKER);
  assert.ok(marker, 'Activity seed marker missing; run npm run db:seed:activity first.');
  const metadata = parseJson(marker.value, 'Activity marker');
  assert.equal(Number(metadata.version), 2, 'Activity marker version is invalid');
  const seededAt = timestamp(metadata.now, 'Activity marker.now');
  const now = Date.now() + 60000;
  assert.ok(seededAt <= now, 'Activity marker is in the future');
  const users = rows.User.filter(row => row.statusId === 'S1');
  const customers = users.filter(row => row.roleId === 'R2');
  const shippers = users.filter(row => row.roleId === 'R3');
  const managers = users.filter(row => ['R1', 'R4'].includes(row.roleId));
  assert.ok(customers.length >= 120, 'Expected at least 120 active customers');
  assert.ok(shippers.length >= 8, 'Expected at least eight active shippers');
  for (let number = 25; number <= 120; number += 1) assert.ok(customers.some(row => row.email === `customer${String(number).padStart(2, '0')}${DOMAIN}`), `Missing active demo customer ${number}`);
  for (let number = 4; number <= 8; number += 1) assert.ok(shippers.some(row => row.email === `shipper${number}${DOMAIN}`), `Missing active demo shipper ${number}`);
  const orders = rows.OrderProduct.filter(row => row.note?.startsWith(PREFIX));
  assert.ok(orders.length >= 1200 + 5 * customers.length, 'Expected 1,200 historical deliveries and five status orders per active customer');
  assert.equal(Number(metadata.orders), orders.length, 'Seed marker order count differs from persisted activity');
  const orderIds = ids(orders);
  const lines = rows.OrderDetail.filter(row => orderIds.has(Number(row.orderId)));
  const linesByOrder = group(lines, 'orderId');
  const events = rows.OrderEvent.filter(row => orderIds.has(Number(row.orderId)));
  const eventsByOrder = group(events, 'orderId');
  const sessions = rows.PaymentSession.filter(row => orderIds.has(Number(row.orderId)));
  const sessionsByOrder = group(sessions, 'orderId');
  const ratings = rows.ShipperRating.filter(row => orderIds.has(Number(row.orderId)));
  const returns = rows.ReturnRequest.filter(row => orderIds.has(Number(row.orderId)));
  const adjustments = rows.InventoryAdjustment.filter(row => orderIds.has(Number(row.orderId)));
  const notifications = rows.Notification.filter(row => orderIds.has(Number(row.orderId)));
  const notificationsByOrder = group(notifications, 'orderId');
  const customerIds = ids(customers), shipperIds = ids(shippers), managerIds = ids(managers);
  const statuses = {}, ownerStatuses = new Map(), purchasedAt = new Map(), usedVariants = new Set();
  assert.equal(new Set(orders.map(activityKey)).size, orders.length, 'Duplicate activity sequence numbers');
  for (const order of orders) {
    const label = `Order ${order.id}`;
    const address = maps.AddressUser.get(Number(order.addressUserId));
    assert.ok(address && customerIds.has(Number(address.userId)), `${label}: owner is not an active customer`);
    const customerId = Number(address.userId);
    if (!ownerStatuses.has(customerId)) ownerStatuses.set(customerId, new Set());
    ownerStatuses.get(customerId).add(order.statusId);
    assert.ok([...STATUSES, 'S8', 'S9', 'S10'].includes(order.statusId), `${label}: invalid status`);
    statuses[order.statusId] = (statuses[order.statusId] || 0) + 1;
    assert.equal(order.deliveryProvider, 'internal', `${label}: delivery provider should be internal`);
    assert.ok(maps.TypeShip.has(Number(order.typeShipId)), `${label}: shipping method missing`);
    assert.ok(!Number(order.voucherId), `${label}: activity orders should not use vouchers`);
    assert.equal(Number(order.discountAmount), 0, `${label}: unexpected voucher discount`);
    assert.ok([0, 1].includes(Number(order.isPaymentOnlien)), `${label}: invalid online payment flag`);
    chronology(order, ['createdAt', 'updatedAt'], label);
    assert.ok(timestamp(order.updatedAt, label) <= now, `${label}: timestamp is in the future`);
    const orderLines = linesByOrder.get(Number(order.id)) || [];
    assert.ok(orderLines.length, `${label}: order has no lines`);
    let subtotal = 0;
    for (const line of orderLines) {
      const variant = maps.ProductDetailSize.get(Number(line.productId));
      const detail = variant && maps.ProductDetail.get(Number(variant.productdetailId));
      const product = detail && maps.Product.get(Number(detail.productId));
      assert.ok(product && product.statusId === 'S1', `${label}: line references a missing/inactive catalog product`);
      assert.ok(positive(line.quantity) && money(line.realPrice), `${label}: invalid line quantity or historical price`);
      chronology(line, ['createdAt', 'updatedAt'], `Order line ${line.id}`);
      assert.ok(timestamp(line.createdAt, label) >= timestamp(order.createdAt, label), `${label}: line precedes order`);
      subtotal += Number(line.quantity) * Number(line.realPrice);
      usedVariants.add(Number(line.productId));
      if (order.statusId === 'S6') {
        const pair = `${customerId}:${product.id}`, deliveredAt = timestamp(order.deliveredAt, label);
        purchasedAt.set(pair, Math.min(purchasedAt.get(pair) ?? Infinity, deliveredAt));
      }
    }
    for (const key of ['subtotal', 'shippingFee', 'discountAmount', 'totalPrice']) assert.ok(money(order[key]), `${label}: invalid ${key} snapshot`);
    assert.equal(Number(order.subtotal), subtotal, `${label}: subtotal differs from saved line prices`);
    assert.equal(Number(order.totalPrice), subtotal + Number(order.shippingFee), `${label}: total snapshot is inconsistent`);
    if (['S5', 'S6', 'S8', 'S9', 'S10'].includes(order.statusId)) {
      assert.ok(shipperIds.has(Number(order.shipperId)), `${label}: active delivery requires an active shipper`);
      chronology(order, ['createdAt', 'assignedAt', 'updatedAt'], label);
    } else assert.ok(!Number(order.shipperId), `${label}: unassigned/cancelled order unexpectedly has a shipper`);
    if (order.statusId === 'S6') chronology(order, ['createdAt', 'assignedAt', 'deliveredAt', 'updatedAt'], label);
    if (order.statusId === 'S7') {
      chronology(order, ['createdAt', 'cancelledAt', 'updatedAt'], label);
      assert.ok(order.cancellationReason?.trim(), `${label}: missing cancellation reason`);
      assert.equal(Number(order.isPaymentOnlien), 0, `${label}: cancelled demo order must be COD`);
    }
    if (['S8', 'S9', 'S10'].includes(order.statusId)) {
      chronology(order, ['createdAt', 'assignedAt', 'failedDeliveryAt', ...(order.statusId === 'S8' ? [] : ['returnStartedAt']), ...(order.statusId === 'S10' ? ['warehouseReceivedAt'] : []), 'updatedAt'], label);
      assert.ok(Number(order.deliveryAttempts) >= 1 && order.lastDeliveryFailureReason?.trim(), `${label}: failure history is missing`);
      assert.equal(Number(order.isPaymentOnlien), 0, `${label}: exceptional delivery fixture must be COD`);
    }
    const history = eventsByOrder.get(Number(order.id)) || [];
    assert.ok(history.length >= 1, `${label}: lifecycle history missing`);
    for (const event of history) {
      assert.ok(event.type && event.title && event.message, `${label}: incomplete lifecycle event`);
      assert.ok(!event.actorId || maps.User.has(Number(event.actorId)), `${label}: event actor missing`);
      assert.ok(timestamp(event.createdAt, label) >= timestamp(order.createdAt, label) && timestamp(event.createdAt, label) <= now, `${label}: event time is outside lifecycle`);
      assert.ok(parseJson(event.metadata, `Event ${event.id}`), `${label}: invalid event metadata`);
    }
    const payments = sessionsByOrder.get(Number(order.id)) || [];
    assert.equal(payments.length, Number(order.isPaymentOnlien) === 1 ? 1 : 0, `${label}: online flag does not match payment sessions`);
    if (payments.length) {
      assert.equal(order.statusId, 'S6', `${label}: only delivered activity orders have simulated online payments`);
      const payment = payments[0], checkout = parseJson(payment.checkoutData, `Payment ${payment.id}`);
      assert.equal(payment.status, 'COMPLETED', `${label}: payment is not completed`);
      assert.ok(['vnpay', 'paypal'].includes(payment.provider), `${label}: unsupported simulated payment provider`);
      assert.equal(payment.providerPaymentId, `DEMO-V2-${payment.provider}-${order.id}`, `${label}: simulated provider reference missing`);
      assert.equal(Number(payment.userId), customerId, `${label}: payment owner differs from customer`);
      assert.equal(Number(payment.totalPrice), Number(order.totalPrice), `${label}: payment total differs from order`);
      assert.equal(payment.currency, payment.provider === 'vnpay' ? 'VND' : 'USD', `${label}: wrong provider currency`);
      if (payment.provider === 'vnpay') assert.equal(Number(payment.providerAmount), Number(order.totalPrice) * 100, `${label}: incorrect VNPay amount`);
      else assert.ok(/^\d+\.\d{2}$/.test(payment.providerAmount) && Number(payment.providerAmount) > 0, `${label}: incorrect PayPal amount`);
      chronology(payment, ['createdAt', 'paidAt', 'updatedAt'], `Payment ${payment.id}`);
      assert.ok(timestamp(payment.paidAt, label) <= timestamp(order.deliveredAt, label), `${label}: payment follows delivery`);
      for (const key of ['addressUserId', 'typeShipId', 'subtotal', 'shippingFee', 'discountAmount', 'totalPrice']) assert.equal(Number(checkout[key]), Number(order[key]), `${label}: checkout ${key} differs from saved order`);
      assert.equal(Number(checkout.userId), customerId, `${label}: checkout owner differs from saved order`);
      assert.ok(!Number(checkout.voucherId), `${label}: checkout has unexpected voucher`);
      const normalize = items => items.map(({ productId, quantity, realPrice }) => ({ productId: Number(productId), quantity: Number(quantity), realPrice: Number(realPrice) })).sort((a, b) => a.productId - b.productId);
      assert.deepEqual(normalize(checkout.lines), normalize(orderLines), `${label}: checkout lines differ from saved lines`);
    }
  }
  for (const customer of customers) for (const status of STATUSES) assert.ok(ownerStatuses.get(Number(customer.id))?.has(status), `Customer ${customer.id}: no activity for ${status}`);
  const delivered = orders.filter(order => order.statusId === 'S6');
  const deliveryTimes = delivered.map(order => timestamp(order.deliveredAt, `Order ${order.id}`));
  assert.ok(delivered.length >= 1200 + customers.length, 'Historical deliveries are missing');
  assert.ok(Math.max(...deliveryTimes) - Math.min(...deliveryTimes) >= 350 * DAY, 'Historical activity does not span the last year');
  assert.ok(new Set(delivered.map(order => localDay(order.deliveredAt).slice(0, 7))).size >= 12, 'Monthly revenue history has gaps');
  assert.ok(ratings.length >= Math.floor(delivered.length * 0.65), 'Expected shipper ratings on most delivered orders');
  assert.equal(new Set(ratings.map(row => Number(row.orderId))).size, ratings.length, 'Duplicate shipper ratings');
  for (const rating of ratings) {
    const order = maps.OrderProduct.get(Number(rating.orderId)), address = maps.AddressUser.get(Number(order.addressUserId));
    assert.equal(order.statusId, 'S6', `Rating ${rating.id}: order is not delivered`);
    assert.equal(Number(rating.userId), Number(address.userId), `Rating ${rating.id}: reviewer did not purchase order`);
    assert.equal(Number(rating.shipperId), Number(order.shipperId), `Rating ${rating.id}: wrong shipper`);
    assert.ok(positive(rating.rating) && Number(rating.rating) <= 5, `Rating ${rating.id}: invalid stars`);
    assert.ok(timestamp(rating.createdAt, `Rating ${rating.id}`) >= timestamp(order.deliveredAt, `Order ${order.id}`), `Rating ${rating.id}: review precedes delivery`);
  }
  for (const shipper of shippers) {
    for (const status of ['S5', 'S6', 'S8', 'S9', 'S10']) assert.ok(orders.some(row => Number(row.shipperId) === Number(shipper.id) && row.statusId === status), `Shipper ${shipper.id}: no ${status} activity`);
    assert.ok(ratings.some(row => Number(row.shipperId) === Number(shipper.id)), `Shipper ${shipper.id}: no ratings`);
  }
  const reviews = rows.Comment.filter(row => row.parentId == null && positive(row.productId) && row.content?.startsWith(PREFIX));
  assert.ok(reviews.length >= 100, 'Expected purchased product reviews for populated customer activity');
  for (const review of reviews) {
    const pair = `${review.userId}:${review.productId}`, deliveredAt = purchasedAt.get(pair);
    assert.ok(Number.isFinite(deliveredAt), `Review ${review.id}: reviewer has no delivered purchase of this product`);
    assert.ok(timestamp(review.createdAt, `Review ${review.id}`) >= deliveredAt, `Review ${review.id}: review precedes delivery`);
    assert.ok(positive(review.star) && Number(review.star) <= 5, `Review ${review.id}: invalid stars`);
    assert.equal(rows.Comment.filter(row => row.parentId == null && Number(row.userId) === Number(review.userId) && Number(row.productId) === Number(review.productId)).length, 1, `Review ${review.id}: duplicate review for customer/product`);
  }
  assert.equal(new Set(notifications.map(row => row.dedupeKey)).size, notifications.length, 'Duplicate activity notification keys');
  for (const notification of notifications) {
    const order = maps.OrderProduct.get(Number(notification.orderId));
    assert.ok(activityKey(order) > 1200, `Notification ${notification.id}: historical fixture should not notify users`);
    const ownerId = Number(maps.AddressUser.get(Number(order.addressUserId)).userId);
    assert.ok([ownerId, Number(order.shipperId)].includes(Number(notification.userId)) || managerIds.has(Number(notification.userId)), `Notification ${notification.id}: recipient is unrelated to order`);
    assert.ok(notification.type && notification.title && notification.message && notification.link, `Notification ${notification.id}: incomplete notification`);
  }
  for (const roleUsers of [customers, shippers, managers]) for (const user of roleUsers) assert.ok(notifications.some(row => Number(row.userId) === Number(user.id)), `User ${user.id}: recent activity notifications missing`);
  for (const order of orders.filter(row => activityKey(row) > 1200)) {
    const recipients = new Set((notificationsByOrder.get(Number(order.id)) || []).map(row => Number(row.userId)));
    assert.ok(recipients.has(Number(maps.AddressUser.get(Number(order.addressUserId)).userId)), `Order ${order.id}: recent customer notification missing`);
    if (Number(order.shipperId)) assert.ok(recipients.has(Number(order.shipperId)), `Order ${order.id}: recent shipper notification missing`);
    assert.ok(managers.some(row => recipients.has(Number(row.id))), `Order ${order.id}: recent manager notification missing`);
  }
  assert.ok(returns.length >= 18, 'Expected at least 18 return requests');
  const returnCounts = {};
  for (const request of returns) {
    const label = `Return ${request.id}`, order = maps.OrderProduct.get(Number(request.orderId));
    assert.equal(request.kind, 'CUSTOMER_RETURN', `${label}: invalid request kind`);
    assert.ok(RETURN_STATUSES.includes(request.status), `${label}: invalid return status`);
    returnCounts[request.status] = (returnCounts[request.status] || 0) + 1;
    assert.equal(order.statusId, 'S6', `${label}: return order is not delivered`);
    assert.equal(Number(order.isPaymentOnlien), 0, `${label}: manual return fixture must be COD`);
    assert.equal(Number(request.userId), Number(maps.AddressUser.get(Number(order.addressUserId)).userId), `${label}: wrong customer`);
    assert.equal(Number(request.amount), Number(order.totalPrice), `${label}: refund amount differs from order`);
    assert.equal(Number(request.activeOrderId) || null, request.status === 'REJECTED' ? null : Number(order.id), `${label}: active return slot is inconsistent`);
    assert.ok(timestamp(request.requestedAt, label) >= timestamp(order.deliveredAt, label), `${label}: request predates delivery`);
    const sequence = ['requestedAt'];
    if (request.status === 'REJECTED') sequence.push('rejectedAt');
    else if (request.status !== 'REQUESTED') sequence.push('approvedAt');
    if (['SHIPPED', 'REFUND_PENDING', 'REFUNDED'].includes(request.status)) {
      sequence.push('shippedAt');
      assert.ok(request.carrier && request.trackingNumber, `${label}: return tracking missing`);
    }
    if (['REFUND_PENDING', 'REFUNDED'].includes(request.status)) {
      sequence.push('receivedAt');
      assert.ok(request.inspectionNote && managerIds.has(Number(request.receivedById)), `${label}: warehouse inspection missing`);
    }
    if (request.status === 'REFUNDED') {
      sequence.push('refundedAt');
      assert.equal(request.refundMethod, 'manual', `${label}: manual refund method missing`);
      assert.ok(request.refundReference && request.refundProof && managerIds.has(Number(request.refundedById)), `${label}: simulated refund proof missing`);
    }
    chronology(request, sequence, label);
  }
  for (const status of RETURN_STATUSES) assert.ok(returnCounts[status] >= 3, `Missing three return requests for ${status}`);
  const demoCustomer = customers.find(row => row.email === `customer01${DOMAIN}`);
  assert.ok(demoCustomer, 'customer01 is missing');
  const interactiveOrder = orders.find(row => activityKey(row) > 1200 && row.statusId === 'S6' && Number(maps.AddressUser.get(Number(row.addressUserId))?.userId) === Number(demoCustomer.id));
  assert.ok(interactiveOrder, 'customer01 needs a recent delivered activity order');
  assert.ok(!ratings.some(row => Number(row.orderId) === Number(interactiveOrder.id)), 'customer01 recent delivery should remain available for rating');
  assert.ok(!returns.some(row => Number(row.orderId) === Number(interactiveOrder.id)), 'customer01 recent delivery should remain available for a return request');
  const interactiveProducts = [...new Set(linesByOrder.get(Number(interactiveOrder.id)).map(line => {
    const variant = maps.ProductDetailSize.get(Number(line.productId));
    return Number(maps.ProductDetail.get(Number(variant.productdetailId)).productId);
  }))];
  assert.ok(interactiveProducts.some(productId => !rows.Comment.some(row => row.parentId == null && Number(row.userId) === Number(demoCustomer.id) && Number(row.productId) === productId)), 'customer01 recent delivery should include a product available for review');
  const adjustmentKeys = new Set();
  for (const adjustment of adjustments) {
    const label = `Adjustment ${adjustment.id}`, order = maps.OrderProduct.get(Number(adjustment.orderId));
    assert.ok(positive(adjustment.quantity) && maps.ProductDetailSize.has(Number(adjustment.productDetailSizeId)), `${label}: invalid restock line`);
    assert.ok(!adjustmentKeys.has(adjustment.idempotencyKey), `${label}: duplicate restock key`); adjustmentKeys.add(adjustment.idempotencyKey);
    if (adjustment.returnRequestId) {
      const request = maps.ReturnRequest.get(Number(adjustment.returnRequestId));
      assert.ok(request && Number(request.orderId) === Number(order.id) && request.receivedAt && request.resellable && ['REFUND_PENDING', 'REFUNDED'].includes(request.status), `${label}: return was not received/resellable`);
      assert.equal(adjustment.idempotencyKey, `return:${request.id}:variant:${adjustment.productDetailSizeId}`, `${label}: invalid customer return ledger key`);
    } else {
      assert.ok(order.statusId === 'S10' && order.warehouseReceivedAt && order.returnResellable, `${label}: undelivered order not received/resellable`);
      assert.equal(adjustment.idempotencyKey, `undelivered:${order.id}:variant:${adjustment.productDetailSizeId}`, `${label}: invalid failed delivery ledger key`);
    }
  }
  const verifyRestock = (order, request) => {
    const expected = new Map();
    for (const line of linesByOrder.get(Number(order.id))) expected.set(Number(line.productId), (expected.get(Number(line.productId)) || 0) + Number(line.quantity));
    for (const [variantId, quantity] of expected) {
      const matches = adjustments.filter(row => Number(row.orderId) === Number(order.id) && Number(row.productDetailSizeId) === variantId && (Number(row.returnRequestId) || null) === (request ? Number(request.id) : null));
      assert.equal(matches.length, 1, `Order ${order.id}: missing or duplicate restock for variant ${variantId}`);
      assert.equal(Number(matches[0].quantity), quantity, `Order ${order.id}: restock quantity differs from purchased quantity`);
    }
  };
  for (const request of returns.filter(row => row.receivedAt && row.resellable)) verifyRestock(maps.OrderProduct.get(Number(request.orderId)), request);
  for (const order of orders.filter(row => row.statusId === 'S10' && row.returnResellable)) verifyRestock(order);
  // catalogStocks clamps negatives, so independently check the unclamped ledger.
  const incoming = new Map(), outgoing = new Map(), reserved = new Map();
  const add = (map, id, quantity) => map.set(Number(id), (map.get(Number(id)) || 0) + Number(quantity));
  for (const line of rows.ReceiptDetail) add(incoming, line.productDetailSizeId, line.quantity);
  for (const adjustment of rows.InventoryAdjustment) add(incoming, adjustment.productDetailSizeId, adjustment.quantity);
  for (const movement of rows.StockMovement) add(incoming, movement.productDetailSizeId, movement.quantity);
  for (const line of rows.OrderDetail) if (maps.OrderProduct.get(Number(line.orderId))?.statusId !== 'S7') add(outgoing, line.productId, line.quantity);
  for (const session of rows.PaymentSession.filter(row => row.status === 'PENDING' && timestamp(row.expiresAt, `Payment ${row.id}`) > Date.now())) for (const line of parseJson(session.checkoutData, `Payment ${session.id}`).lines || []) add(reserved, line.productId, line.quantity);
  const { catalogStocks } = require('../src/services/catalogStockService');
  const stocks = await catalogStocks(database, [...usedVariants]);
  for (const variantId of usedVariants) {
    const stock = (incoming.get(variantId) || 0) - (outgoing.get(variantId) || 0) - (reserved.get(variantId) || 0);
    assert.ok(Number.isSafeInteger(stock) && stock >= 0, `Variant ${variantId}: funded stock became negative`);
    assert.equal(stocks.get(variantId), stock, `Variant ${variantId}: catalog stock differs from inventory ledger`);
  }
  const funding = new Map();
  for (const order of orders.filter(row => row.statusId !== 'S7')) {
    const month = localDay(order.createdAt).slice(0, 7);
    if (!funding.has(month)) funding.set(month, new Map());
    for (const line of linesByOrder.get(Number(order.id))) add(funding.get(month), line.productId, line.quantity);
  }
  let fundedReceipts = 0;
  for (const [month, quantities] of funding) {
    const expectedDate = Date.parse(`${month}-01T00:00:00+07:00`) - DAY;
    const receipts = rows.Receipt.filter(row => timestamp(row.createdAt, `Receipt ${row.id}`) === expectedDate && managerIds.has(Number(row.userId)));
    assert.ok(receipts.length, `Month ${month}: stock funding receipt is missing`);
    const receiptIds = ids(receipts), funded = new Map();
    for (const line of rows.ReceiptDetail.filter(row => receiptIds.has(Number(row.receiptId)))) {
      assert.ok(positive(line.quantity) && money(line.price), `Receipt line ${line.id}: invalid funding quantity/cost`);
      assert.equal(timestamp(line.createdAt, `Receipt line ${line.id}`), expectedDate, `Receipt line ${line.id}: funding date differs from receipt`);
      add(funded, line.productDetailSizeId, line.quantity);
    }
    for (const [variantId, quantity] of quantities) assert.ok((funded.get(variantId) || 0) >= quantity, `Month ${month}: receipt does not cover added consumption of variant ${variantId}`);
    fundedReceipts += receipts.length;
  }
  return {
    counts: { customers: customers.length, shippers: shippers.length, orders: orders.length, delivered: delivered.length, orderLines: lines.length,
      shipperRatings: ratings.length, purchasedReviews: reviews.length, events: events.length, notifications: notifications.length, fundedReceipts,
      returns: returns.length, restockLines: adjustments.length, simulatedPayments: sessions.length, purchasedVariants: usedVariants.size },
    statuses, returnStatuses: returnCounts, history: { from: localDay(Math.min(...deliveryTimes)), to: localDay(Math.max(...deliveryTimes)), months: new Set(delivered.map(row => localDay(row.deliveredAt).slice(0, 7))).size },
    fixtures: { rows, maps, orders, customers, shippers, returns, seededAt, interactiveOrder, interactiveProducts },
  };
}

async function verifyHttp(fixtures, password) {
  assert.ok(process.env.JWT_SECRET, 'JWT_SECRET must be configured in backend/.env');
  const { createApp } = require('../src/app');
  const server = await new Promise((resolve, reject) => {
    const listener = createApp().listen(0, '127.0.0.1', () => resolve(listener)); listener.once('error', reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let checks = 0;
  const call = async (route, token, options = {}) => {
    assert.ok((options.method || 'GET') === 'GET' || (route === '/api/login' && options.method === 'POST'), 'Verifier attempted a mutation endpoint');
    const response = await fetch(base + route, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(60000) });
    const result = await response.json(); checks += 1; return { ...result, status: response.status };
  };
  const noSecrets = value => {
    if (!value || typeof value !== 'object') return;
    assert.ok(!Object.hasOwn(value, 'password') && !Object.hasOwn(value, 'usertoken'), 'API exposed authentication secrets');
    for (const child of Object.values(value)) noSecrets(child);
  };
  const ok = async (route, token) => {
    const result = await call(route, token);
    assert.equal(result.status, 200, `${route}: unexpected HTTP status`);
    assert.equal(result.errCode, 0, `${route}: ${result.errMessage || 'API error'}`); noSecrets(result); return result;
  };
  const refundByOrder = new Map();
  for (const request of fixtures.rows.ReturnRequest.filter(row => row.status === 'REFUNDED')) refundByOrder.set(Number(request.orderId), (refundByOrder.get(Number(request.orderId)) || 0) + Number(request.amount));
  const deliveryTime = order => order.deliveredAt || order.updatedAt;
  const allLinesByOrder = group(fixtures.rows.OrderDetail, 'orderId');
  const recordedTotal = order => {
    if (order.totalPrice != null) return Number(order.totalPrice);
    const subtotal = (allLinesByOrder.get(Number(order.id)) || []).reduce((sum, line) => sum + Number(line.realPrice) * Number(line.quantity), 0);
    const voucher = fixtures.maps.Voucher.get(Number(order.voucherId));
    const type = voucher && fixtures.maps.TypeVoucher.get(Number(voucher.typeVoucherId));
    let discount = type ? (type.typeVoucher === 'percent' ? Math.floor(subtotal * Number(type.value || 0) / 100) : Number(type.maxValue || type.value || 0)) : 0;
    if (Number(type?.maxValue) > 0) discount = Math.min(discount, Number(type.maxValue));
    return Math.max(0, subtotal - discount) + Number(fixtures.maps.TypeShip.get(Number(order.typeShipId))?.price || 0);
  };
  const revenue = order => Math.max(0, recordedTotal(order) - (refundByOrder.get(Number(order.id)) || 0));
  try {
    await ok('/api/health');
    const sessions = {};
    for (const [name, role] of [['admin', 'R1'], ['customer01', 'R2'], ['shipper1', 'R3']]) {
      const result = await call('/api/login', null, { method: 'POST', body: JSON.stringify({ email: name + DOMAIN, password }) });
      assert.equal(result.errCode, 0, `Login ${name}: failed`); assert.equal(result.user.roleId, role, `Login ${name}: wrong role`);
      assert.ok(result.accessToken, `Login ${name}: access token missing`); noSecrets(result.user);
      sessions[name] = { token: result.accessToken, id: Number(result.user.id) };
    }
    const { admin, customer01, shipper1 } = sessions;
    const history = await ok(`/api/get-all-order-by-user?id=${admin.id}`, customer01.token);
    assert.ok(history.data.length && history.data.every(address => Number(address.userId) === customer01.id), 'Customer order ownership is invalid');
    const customerOrders = history.data.flatMap(address => address.order || []).filter(order => order.note?.startsWith(PREFIX));
    for (const status of STATUSES) assert.ok(customerOrders.some(order => order.statusId === status), `Customer HTTP history lacks ${status}`);
    const ownOrder = customerOrders.find(order => Number(order.id) === Number(fixtures.interactiveOrder.id));
    assert.ok(ownOrder, 'Customer HTTP history is missing its recent delivery fixture');
    const detail = (await ok(`/api/get-detail-order?id=${ownOrder.id}`, customer01.token)).data;
    assert.ok(detail.events.length && detail.orderDetail.length && money(detail.totalPrice), 'Customer order detail lacks lifecycle or snapshots');
    assert.ok(detail.canRateShipper && !detail.shipperRating && !detail.returnRequest, 'Customer recent delivery does not expose rating/return actions');
    let reviewable = false;
    for (const productId of fixtures.interactiveProducts) {
      const result = await ok(`/api/get-all-review-by-productId?id=${productId}`, customer01.token);
      reviewable = reviewable || result.reviewEligibility?.canReview === true;
    }
    assert.ok(reviewable, 'Customer recent delivery products have no available review action');
    const working = await ok(`/api/get-all-order-by-shipper?shipperId=${admin.id}&status=working`, shipper1.token);
    assert.ok(working.data.length && working.data.every(order => Number(order.shipperId) === shipper1.id && ['S5', 'S8', 'S9'].includes(order.statusId)), 'Shipper assigned order scope is invalid');
    assert.ok(working.summary.working > 0 && working.summary.done > 0 && working.summary.ratingCount > 0 && working.summary.ratingAverage > 0, 'Shipper summary has no work, completed orders or ratings');
    const done = await ok('/api/get-all-order-by-shipper?status=done', shipper1.token);
    assert.ok(done.data.length && done.data.every(order => Number(order.shipperId) === shipper1.id && order.statusId === 'S6'), 'Shipper delivery history is empty/invalid');
    assert.ok(done.data.some(order => order.shipperRating), 'Shipper completed orders have no visible ratings');
    const available = await ok('/api/get-available-order-for-shipper', shipper1.token);
    assert.ok(available.data.length && available.data.every(order => order.statusId === 'S4' && !Number(order.shipperId) && order.deliveryProvider === 'internal'), 'Available delivery orders are empty/invalid');
    for (const session of Object.values(sessions)) {
      const notifications = await ok('/api/notifications?limit=100&offset=0', session.token);
      assert.ok(notifications.count > 0 && notifications.data.length && notifications.unreadCount > 0, 'Role has no visible unread notifications');
    }
    const today = localDay(fixtures.seededAt), year = today.slice(0, 4), month = Number(today.slice(5, 7));
    const allDelivered = fixtures.rows.OrderProduct.filter(order => order.statusId === 'S6');
    // Compare every chart bucket with persisted orders, not just a successful API response.
    const monthly = await ok(`/api/get-statistic-by-month?year=${year}`, admin.token);
    assert.equal(monthly.data.arrayMonthValue.length, 12, 'Monthly chart must have 12 buckets');
    const expectedMonths = Array.from({ length: 12 }, (_, index) => allDelivered.filter(order => localDay(deliveryTime(order)).startsWith(`${year}-${String(index + 1).padStart(2, '0')}`)).reduce((sum, order) => sum + revenue(order), 0));
    assert.deepEqual(monthly.data.arrayMonthValue.map(Number), expectedMonths, 'Monthly chart values differ from recorded net revenue');
    assert.ok(expectedMonths.some(value => value > 0), 'Monthly chart is empty');
    const daily = await ok(`/api/get-statistic-by-day?year=${year}&month=${month}`, admin.token);
    const monthDays = new Date(Number(year), month, 0).getDate();
    const expectedDays = Array.from({ length: monthDays }, (_, index) => allDelivered.filter(order => localDay(deliveryTime(order)) === `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`).reduce((sum, order) => sum + revenue(order), 0));
    assert.deepEqual(daily.data.arrayDayValue.map(Number), expectedDays, 'Daily chart values differ from recorded net revenue');
    assert.ok(expectedDays.some(value => value > 0), 'Daily chart is empty');
    const from = localDay(fixtures.seededAt - 29 * DAY);
    const dashboard = (await ok(`/api/admin/operations/dashboard?from=${from}&to=${today}`, admin.token)).data;
    const periodOrders = allDelivered.filter(order => localDay(deliveryTime(order)) >= from && localDay(deliveryTime(order)) <= today);
    assert.equal(dashboard.metrics.deliveredOrders, periodOrders.length, 'Dashboard delivered count differs from recorded orders');
    assert.equal(dashboard.metrics.grossRevenue, periodOrders.reduce((sum, order) => sum + Number(order.totalPrice), 0), 'Dashboard gross revenue differs from recorded totals');
    assert.ok(dashboard.metrics.grossRevenue > 0 && dashboard.dailyTrend.some(day => day.orders > 0 && day.grossRevenue > 0), 'Dashboard trend has no actual sales');
    assert.equal(dashboard.dailyTrend.length, 30, 'Dashboard must return the requested 30 daily buckets');
    for (const status of STATUSES) assert.ok(dashboard.queues[status] > 0, `Dashboard order queue lacks ${status}`);
    for (const status of RETURN_STATUSES) assert.ok(dashboard.returnQueues[status] > 0, `Dashboard return queue lacks ${status}`);
    const adminReturns = await ok('/api/admin/operations/returns?pageSize=50', admin.token);
    assert.ok(adminReturns.count >= 18 && adminReturns.data.length, 'Admin return page is empty');
    for (const status of RETURN_STATUSES) assert.ok(adminReturns.counters[status] >= 3, `Admin return counters lack ${status}`);
    const counts = await ok('/api/get-count-card-statistic', admin.token);
    assert.ok(counts.data.countUser >= 120 && counts.data.countOrder >= 1200 && counts.data.countReview > 0, 'Dashboard cards have insufficient populated activity');
    const statusChart = await ok(`/api/get-count-status-order?oneDate=${today}&type=year`, admin.token);
    assert.ok(statusChart.data.arrayValue.filter(value => Number(value) > 0).length >= 5, 'Status chart lacks populated lifecycle states');
    assert.equal((await call('/api/admin/operations/dashboard', customer01.token)).status, 403, 'Customer could access manager dashboard');
    assert.equal((await call('/api/get-available-order-for-shipper', customer01.token)).status, 403, 'Customer could access delivery queue');
    return { status: 'ok', checks, authenticatedRoles: ['R1', 'R2', 'R3'], chartBucketsCompared: 12 + monthDays,
      revenue: { currency: 'VND', year: Number(year), monthlyNetRevenueTotal: expectedMonths.reduce((sum, value) => sum + value, 0),
        month, currentMonthNetRevenue: expectedDays.reduce((sum, value) => sum + value, 0),
        last30DaysGrossRevenue: dashboard.metrics.grossRevenue, last30DaysNetRevenue: dashboard.metrics.netRevenue,
        last30DaysDeliveredOrders: dashboard.metrics.deliveredOrders }, readOnly: true };
  } finally {
    if (server.closeIdleConnections) server.closeIdleConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function verifyDemoActivity({ database = db, http = true, password = process.env.SEED_DEMO_PASSWORD || 'Demo@123456' } = {}) {
  await database.sequelize.authenticate();
  const { fixtures, ...summary } = await verifyDatabase(database);
  if (http) {
    assert.equal(database, db, 'HTTP smoke must use the application database connection');
    const readState = async () => {
      const state = await Promise.all([
        database.Product.findAll({ attributes: ['id', 'view', 'updatedAt'], order: [['id', 'ASC']], raw: true }),
        database.Blog.findAll({ attributes: ['id', 'view', 'updatedAt'], order: [['id', 'ASC']], raw: true }),
        database.Message.findAll({ attributes: ['id', 'unRead', 'updatedAt'], order: [['id', 'ASC']], raw: true }),
        database.Notification.findAll({ attributes: ['id', 'readAt', 'updatedAt'], order: [['id', 'ASC']], raw: true }),
        database.OrderProduct.findAll({ attributes: ['id', 'statusId', 'shipperId', 'totalPrice', 'updatedAt'], order: [['id', 'ASC']], raw: true }),
        ...Object.values(database).filter(model => model.rawAttributes).map(model => model.count()),
      ]);
      return createHash('sha256').update(JSON.stringify(state)).digest('hex');
    };
    const before = await readState();
    summary.http = await verifyHttp(fixtures, password);
    assert.equal(await readState(), before, 'HTTP verification changed views, notification/message read state or record counts');
  }
  return { status: 'ok', ...summary };
}

module.exports = { verifyDemoActivity };

if (require.main === module) {
  (async () => {
    try { console.log(JSON.stringify(await verifyDemoActivity(), null, 2)); }
    catch (error) {
      const reason = error.name === 'AssertionError' ? error.message : (error.original?.code || error.code || error.name);
      console.error(`Activity verification failed: ${reason}`); process.exitCode = 1;
    } finally { await db.sequelize.close(); }
  })();
}
