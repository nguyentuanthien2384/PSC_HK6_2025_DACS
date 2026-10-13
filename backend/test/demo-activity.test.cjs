'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildActivityOrders, orderEvents } = require('../scripts/demo/activity-scenarios.cjs');

const DAY = 86400000;
const NOW = new Date('2026-10-13T05:30:00.000Z');
const positiveInteger = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const time = value => value == null ? NaN : new Date(value).getTime();
const localDay = value => new Date(time(value) + 7 * 3600000).toISOString().slice(0, 10);

function fixtures(overrides = {}) {
  const customers = Array.from({ length: 6 }, (_, index) => ({ id: 101 + index, roleId: 'R2', statusId: 'S1', isActiveEmail: true }));
  return {
    now: new Date(NOW),
    customers,
    addresses: customers.flatMap(customer => [
      { id: customer.id * 10, userId: customer.id },
      { id: customer.id * 10 + 1, userId: customer.id },
    ]),
    shippingMethods: [{ id: 21, price: 25000 }, { id: 22, price: 40000 }],
    variants: Array.from({ length: 11 }, (_, index) => ({
      id: 501 + index, productId: 901 + index, statusId: 'S1', price: 159000 + index * 27000,
      costPrice: 95000 + index * 16000, initialStock: 40 + index, stockMode: 'normal',
    })),
    shippers: Array.from({ length: 3 }, (_, index) => ({ id: 201 + index, roleId: 'R3', statusId: 'S1' })),
    ...overrides,
  };
}

test('activity orders are deterministic and leave fixture inputs unchanged', () => {
  const input = fixtures();
  const before = structuredClone(input);
  const first = buildActivityOrders(input);
  assert.deepEqual(buildActivityOrders(fixtures()), first);
  assert.deepEqual(input, before, 'The pure builder mutated its inputs');
  assert.equal(new Set(first.map(order => order.key)).size, first.length, 'Scenario keys must be unique');
});

test('default volumes cover every buyer workflow and all delivery states', () => {
  const input = fixtures();
  const orders = buildActivityOrders(input);
  assert.equal(orders.length, 1200 + input.customers.length * 5 + input.shippers.length * 3);
  assert.equal(orders.filter(order => order.statusId === 'S6').length, 1200 + input.customers.length);
  for (const customer of input.customers) {
    const statuses = new Set(orders.filter(order => Number(order.customerId) === customer.id).map(order => order.statusId));
    for (const status of ['S3', 'S4', 'S5', 'S6', 'S7']) assert.ok(statuses.has(status), `Buyer ${customer.id} lacks ${status}`);
  }
  const statuses = new Set(orders.map(order => order.statusId));
  assert.deepEqual([...statuses].sort(), ['S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10'].sort());
});

test('every courier has active deliveries, delivery history, and exception workflows', () => {
  const input = fixtures();
  const orders = buildActivityOrders(input);
  const courierIds = new Set(input.shippers.map(shipper => shipper.id));
  for (const shipper of input.shippers) {
    const statuses = new Set(orders.filter(order => Number(order.shipperId) === shipper.id).map(order => order.statusId));
    for (const status of ['S5', 'S6', 'S8', 'S9', 'S10']) assert.ok(statuses.has(status), `Courier ${shipper.id} lacks ${status}`);
  }
  for (const order of orders) {
    if (['S5', 'S6', 'S8', 'S9', 'S10'].includes(order.statusId)) assert.ok(courierIds.has(Number(order.shipperId)), `${order.key}: assigned courier missing`);
    else assert.ok(!positiveInteger(order.shipperId), `${order.key}: unassigned workflow has a courier`);
    if (order.statusId === 'S7') assert.equal(Number(order.isPaymentOnlien), 0, 'Cancelled demo orders must be COD');
  }
});

test('order snapshots resolve ownership and unique variant lines with valid historical prices', () => {
  const input = fixtures();
  const addresses = new Map(input.addresses.map(address => [address.id, address]));
  const shippingIds = new Set(input.shippingMethods.map(method => method.id));
  const variants = new Map(input.variants.map(variant => [variant.id, variant]));
  for (const order of buildActivityOrders(input)) {
    assert.equal(Number(addresses.get(Number(order.addressUserId))?.userId), Number(order.customerId), `${order.key}: address belongs to another buyer`);
    assert.ok(shippingIds.has(Number(order.typeShipId)));
    assert.ok([0, 1].includes(Number(order.isPaymentOnlien)));
    assert.ok(order.lines.length > 0);
    assert.equal(new Set(order.lines.map(line => Number(line.productId))).size, order.lines.length, `${order.key}: duplicate variant line`);
    let subtotal = 0;
    for (const line of order.lines) {
      const variant = variants.get(Number(line.productId));
      assert.ok(variant, `${order.key}: productId must refer to a variant, rather than its parent product`);
      assert.ok(positiveInteger(line.quantity));
      assert.ok(Number.isSafeInteger(Number(line.realPrice)) && Number(line.realPrice) > 0);
      assert.equal(Number(line.realPrice), Number(variant.price));
      subtotal += Number(line.quantity) * Number(line.realPrice);
    }
    assert.ok(Number.isSafeInteger(subtotal) && subtotal > 0);
    if (order.subtotal !== undefined) assert.equal(Number(order.subtotal), subtotal);
  }
});

test('delivery and cancellation dates describe chronological completed workflows without future events', () => {
  for (const order of buildActivityOrders(fixtures())) {
    const created = time(order.createdAt), updated = time(order.updatedAt);
    assert.ok(Number.isFinite(created) && created <= updated, `${order.key}: invalid order dates`);
    assert.ok(updated <= NOW.getTime(), `${order.key}: order update is in the future`);
    const dates = ['assignedAt', 'deliveredAt', 'cancelledAt', 'failedDeliveryAt', 'returnStartedAt', 'warehouseReceivedAt'];
    for (const key of dates) if (order[key] != null) {
      assert.ok(Number.isFinite(time(order[key])) && time(order[key]) >= created && time(order[key]) <= updated, `${order.key}: invalid ${key}`);
    }
    if (['S5', 'S6', 'S8', 'S9', 'S10'].includes(order.statusId)) assert.ok(Number.isFinite(time(order.assignedAt)), `${order.key}: assignment timestamp missing`);
    if (order.statusId === 'S6') assert.ok(time(order.deliveredAt) >= time(order.assignedAt), `${order.key}: completion precedes assignment`);
    if (order.statusId === 'S7') {
      assert.ok(Number.isFinite(time(order.cancelledAt)));
      assert.ok(typeof order.cancellationReason === 'string' && order.cancellationReason.trim().length >= 3);
    }
    if (['S8', 'S9', 'S10'].includes(order.statusId)) {
      assert.ok(positiveInteger(order.deliveryAttempts));
      assert.ok(time(order.failedDeliveryAt) >= time(order.assignedAt));
      assert.ok(typeof order.lastDeliveryFailureReason === 'string' && order.lastDeliveryFailureReason.trim().length >= 3);
    }
    if (['S9', 'S10'].includes(order.statusId)) assert.ok(time(order.returnStartedAt) >= time(order.failedDeliveryAt));
    if (order.statusId === 'S10') {
      assert.ok(time(order.warehouseReceivedAt) >= time(order.returnStartedAt));
      assert.equal(typeof order.returnResellable, 'boolean');
    }
  }
});

test('historical completed sales populate monthly and recent daily charts with varied business volumes', () => {
  const orders = buildActivityOrders(fixtures()).filter(order => order.statusId === 'S6');
  const months = new Map(), recentDays = new Set(), totals = new Set();
  for (const order of orders) {
    const delivered = time(order.deliveredAt);
    assert.ok(delivered >= NOW.getTime() - 365 * DAY && delivered <= NOW.getTime(), `${order.key}: delivery lies outside the demo reporting year`);
    const day = localDay(order.deliveredAt), month = day.slice(0, 7);
    const subtotal = order.lines.reduce((sum, line) => sum + Number(line.realPrice) * Number(line.quantity), 0);
    const value = months.get(month) || { orders: 0, revenue: 0 };
    months.set(month, { orders: value.orders + 1, revenue: value.revenue + subtotal });
    totals.add(subtotal);
    if (delivered >= NOW.getTime() - 29 * DAY) recentDays.add(day);
  }
  assert.ok(months.size >= 12, 'Monthly chart needs sales throughout the last year');
  assert.ok([...months.values()].every(month => month.orders > 0 && month.revenue > 0));
  assert.ok(new Set([...months.values()].map(month => month.orders)).size >= 3, 'Monthly volumes should vary');
  assert.ok(new Set([...months.values()].map(month => month.revenue)).size >= 3, 'Monthly revenue should vary');
  assert.ok(totals.size >= 10, 'Historical baskets should have varied values');
  assert.ok(recentDays.size >= 20, 'Default 30-day dashboard needs enough populated days');
});

test('custom historical volumes and small catalogs retain workflow coverage and unique lines', () => {
  const input = fixtures({ historicalCount: 400 });
  input.variants = input.variants.slice(0, 2);
  const orders = buildActivityOrders(input);
  assert.equal(orders.length, 400 + input.customers.length * 5 + input.shippers.length * 3);
  for (const order of orders) {
    assert.ok(order.lines.length >= 1 && order.lines.length <= input.variants.length);
    assert.equal(new Set(order.lines.map(line => Number(line.productId))).size, order.lines.length);
  }
});

test('order timelines connect placement, assignment, completion and warehouse exceptions with the correct actors', () => {
  const terminalEvents = { S3: 'ORDER_CREATED', S4: 'ORDER_CONFIRMED', S5: 'SHIPPER_ASSIGNED', S6: 'ORDER_DELIVERED',
    S7: 'ORDER_CANCELLED', S8: 'DELIVERY_FAILED', S9: 'DELIVERY_RETURN_STARTED', S10: 'UNDELIVERED_RECEIVED' };
  const staffId = 301;
  for (const descriptor of buildActivityOrders(fixtures({ historicalCount: 365 }))) {
    const order = { ...descriptor, id: 10000 + descriptor.key };
    const events = orderEvents(order, order.customerId, staffId);
    assert.equal(events[0].type, 'ORDER_CREATED');
    assert.equal(events[0].actorId, order.customerId);
    assert.equal(events.at(-1).type, terminalEvents[order.statusId]);
    assert.equal(events.length, new Set(events.map(event => event.type)).size);
    for (const [index, event] of events.entries()) {
      assert.equal(event.orderId, order.id);
      assert.ok(time(event.createdAt) >= time(order.createdAt) && time(event.createdAt) <= time(order.updatedAt));
      if (index) assert.ok(time(event.createdAt) >= time(events[index - 1].createdAt), `${order.key}: timeline goes backwards`);
      const metadata = JSON.parse(event.metadata);
      assert.equal(metadata.demo, true);
      assert.equal(metadata.version, 2);
      assert.equal(typeof event.title, 'string');
      assert.equal(typeof event.message, 'string');
      const expectedActor = ['ORDER_CREATED', 'ORDER_CANCELLED'].includes(event.type) ? order.customerId
        : ['ORDER_CONFIRMED', 'UNDELIVERED_RECEIVED'].includes(event.type) ? staffId : order.shipperId;
      assert.equal(event.actorId, expectedActor);
    }
    if (order.statusId === 'S7') assert.deepEqual(events.map(event => event.type), ['ORDER_CREATED', 'ORDER_CANCELLED']);
    if (order.statusId === 'S6') assert.deepEqual(events.map(event => event.type), ['ORDER_CREATED', 'ORDER_CONFIRMED', 'SHIPPER_ASSIGNED', 'ORDER_DELIVERED']);
  }
});

test('invalid clock and missing commerce dependencies fail before producing activity', () => {
  assert.throws(() => buildActivityOrders(fixtures({ now: new Date('invalid') })));
  for (const key of ['customers', 'addresses', 'shippingMethods', 'variants', 'shippers']) {
    assert.throws(() => buildActivityOrders(fixtures({ [key]: [] })), `Missing ${key} should be rejected`);
  }
  const input = fixtures();
  input.addresses = input.addresses.filter(address => address.userId !== input.customers[0].id);
  assert.throws(() => buildActivityOrders(input), 'A buyer without an address should be rejected');
  for (const historicalCount of [-1, 0, 364, 365.5, NaN]) assert.throws(() => buildActivityOrders(fixtures({ historicalCount })));
});
