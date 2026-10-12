const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { createAfterSalesService, evaluateReturnEligibility, validateEvidence } = require('../src/services/afterSalesService');
const { createDeliveryService } = require('../src/services/deliveryService');
const { canReadOrder, canTransitionOrder } = require('../src/utils/commerce');
const admin = { id: 1, roleId: 'R1' }, buyer = { id: 2, roleId: 'R2' }, courier = { id: 3, roleId: 'R3' };
const current = new Date('2026-10-12T04:00:00Z');
const picture = 'data:image/png;base64,aGVsbG8=';

// Snapshot transactions serialize the order lock; all writes and credits must
// use that transaction and variant credits must also hold the checkout lock.
function fixture(orderOverrides = {}, dependencies = {}) {
    let state = {
        orders: [{ id: 10, addressUserId: 20, shipperId: courier.id, statusId: 'S6', totalPrice: 220000,
            isPaymentOnlien: 0, deliveredAt: new Date('2026-10-11T04:00:00Z'), deliveryProvider: 'internal', deliveryAttempts: 0, ...orderOverrides }],
        addresses: [{ id: 20, userId: buyer.id }],
        variants: [{ id: 30 }, { id: 31 }],
        details: [{ id: 1, orderId: 10, productId: 31, quantity: 1 }, { id: 2, orderId: 10, productId: 30, quantity: 2 }],
        requests: [], adjustments: [], events: []
    };
    let queue = Promise.resolve();
    const clone = value => structuredClone(value);
    const rows = (key, options = {}) => (options.transaction ? options.transaction.state : state)[key];
    function matches(row, where = {}) {
        for (const key of Object.keys(where)) {
            const expected = where[key];
            if (expected && typeof expected === 'object' && expected[Op.in]) {
                if (!expected[Op.in].some(value => String(row[key]) === String(value))) return false;
            } else if (String(row[key]) !== String(expected)) return false;
        }
        if (where[Op.or] && !where[Op.or].some(value => matches(row, value))) return false;
        return !where[Op.and] || where[Op.and].every(value => matches(row, value));
    }
    function model(key, row, tx) {
        return { ...clone(row), get() { return clone(Object.fromEntries(Object.entries(this).filter(([, value]) => typeof value !== 'function'))); },
            async save(options) {
                assert.equal(options.transaction, tx);
                Object.assign(rows(key, options).find(value => value.id === row.id), this.get());
            } };
    }
    const lockLog = [];
    function table(key) {
        return {
            async findOne(options = {}) {
                if (['orders', 'variants', 'requests'].includes(key) && options.transaction) {
                    assert.equal(options.lock, options.transaction.LOCK.UPDATE);
                    lockLog.push({ key, id: options.where.id });
                }
                let result = rows(key, options).filter(row => matches(row, options.where));
                if (options.order && options.order[0][1] === 'DESC') result = [...result].reverse();
                if (!result.length) return null;
                return options.raw ? clone(result[0]) : model(key, result[0], options.transaction);
            },
            async findAll(options = {}) { return clone(rows(key, options).filter(row => matches(row, options.where))); },
            async create(data, options = {}) {
                assert.ok(options.transaction, 'writes must be transactional');
                const collection = rows(key, options);
                if (key === 'requests' && data.activeOrderId && collection.some(row => row.activeOrderId === data.activeOrderId)) throw new Error('unique active order');
                if (key === 'adjustments' && collection.some(row => row.idempotencyKey === data.idempotencyKey)) throw new Error('unique credit');
                const row = { id: collection.length + 1, ...clone(data), createdAt: new Date() };
                collection.push(row); return model(key, row, options.transaction);
            }
        };
    }
    const db = { sequelize: { async transaction(options, work) {
        const before = queue; let release; queue = new Promise(resolve => { release = resolve; }); await before;
        const tx = { LOCK: { UPDATE: 'UPDATE' }, state: clone(state) };
        try { const result = await work(tx); state = tx.state; return result; } finally { release(); }
    } }, OrderProduct: table('orders'), AddressUser: table('addresses'), ProductDetailSize: table('variants'),
        OrderDetail: table('details'), ReturnRequest: table('requests'), InventoryAdjustment: table('adjustments'), OrderEvent: table('events') };
    const service = createAfterSalesService(db, { now: () => current, ...dependencies });
    return { db, service, delivery: createDeliveryService(db), state: () => state, lockLog };
}
const request = async f => { const result = await f.service.createReturnRequest({ orderId: 10, reason: 'Sản phẩm sai màu', amount: 1, userId: 999 }, buyer); assert.equal(result.errCode, 0); return result; };
const approved = async f => { await request(f); assert.equal((await f.service.reviewReturnRequest({ orderId: 10, decision: 'APPROVE' }, admin)).errCode, 0); };
const shipped = async f => { await approved(f); assert.equal((await f.service.markReturnShipped({ orderId: 10, carrier: 'GHN', trackingNumber: 'RETURN123' }, buyer)).errCode, 0); };
const received = async (f, resellable = true) => { await shipped(f); assert.equal((await f.service.receiveReturn({ orderId: 10, resellable, inspectionNote: 'Đã kiểm tra đủ sản phẩm' }, admin)).errCode, 0); };

test('return request derives owner and immutable whole-order amount, rejects forged customer access', async () => {
    const f = fixture();
    assert.equal((await f.service.createReturnRequest({ orderId: 10, reason: 'Sai màu' }, courier)).errCode, 403);
    const result = await request(f);
    assert.equal(result.data.userId, buyer.id); assert.equal(result.data.amount, 220000);
    assert.equal(result.data.status, 'REQUESTED'); assert.equal(f.state().adjustments.length, 0);
    assert.equal(f.state().events[0].type, 'RETURN_REQUESTED');
});

test('return window requires delivered timestamp, successful delivery, and inclusive configured deadline', () => {
    const order = { statusId: 'S6', deliveredAt: new Date('2026-10-05T04:00:00Z') }, address = { userId: buyer.id };
    const exact = evaluateReturnEligibility(order, buyer, null, address, current);
    assert.equal(exact.canRequest, true); assert.equal(exact.scope, 'WHOLE_ORDER');
    assert.equal(evaluateReturnEligibility(order, buyer, null, address, new Date(current.getTime() + 1)).canRequest, false);
    for (const bad of [{ statusId: 'S5', deliveredAt: current }, { statusId: 'S6' }, { statusId: 'S6', deliveredAt: new Date('2026-10-13') }]) {
        assert.equal(evaluateReturnEligibility(bad, buyer, null, address, current).canRequest, false);
    }
    assert.equal(evaluateReturnEligibility(order, courier, null, address, current).canRequest, false);
});

test('expired, undelivered, boolean id, invalid reason and unsafe evidence never create a return', async () => {
    for (const overrides of [{ deliveredAt: new Date('2026-10-01') }, { statusId: 'S5' }, { deliveredAt: null }, { totalPrice: null }]) {
        const f = fixture(overrides);
        assert.notEqual((await f.service.createReturnRequest({ orderId: 10, reason: 'Sai màu' }, buyer)).errCode, 0);
        assert.equal(f.state().requests.length, 0);
    }
    const f = fixture();
    for (const data of [{ orderId: true, reason: 'Sai màu' }, { orderId: 10, reason: 'a' }, { orderId: 10, reason: 'a'.repeat(1001) }, { orderId: 10, reason: 'Sai màu', evidence: 'javascript:alert(1)' }]) {
        assert.notEqual((await f.service.createReturnRequest(data, buyer)).errCode, 0);
    }
    assert.equal(validateEvidence(picture), picture);
    assert.equal(validateEvidence('https://example.com/evidence.png'), 'https://example.com/evidence.png');
});

test('two concurrent customer requests preserve one active return and one event', async () => {
    const f = fixture();
    const results = await Promise.all([1, 2].map(() => f.service.createReturnRequest({ orderId: 10, reason: 'Sai màu' }, buyer)));
    assert.equal(results.filter(value => value.errCode === 0).length, 1);
    assert.equal(f.state().requests.length, 1); assert.equal(f.state().events.length, 1);
});

test('rejection requires an explanation and frees the order slot for a corrected in-window request', async () => {
    const f = fixture(); await request(f);
    assert.equal((await f.service.reviewReturnRequest({ orderId: 10, decision: 'APPROVE' }, buyer)).errCode, 403);
    assert.notEqual((await f.service.reviewReturnRequest({ orderId: 10, decision: 'REJECT', note: '' }, admin)).errCode, 0);
    assert.equal((await f.service.reviewReturnRequest({ orderId: 10, decision: 'REJECT', note: 'Cần thêm thông tin về sản phẩm' }, admin)).errCode, 0);
    assert.equal(f.state().requests[0].activeOrderId, null);
    await request(f); assert.equal(f.state().requests.length, 2); assert.equal(f.state().requests[1].activeOrderId, 10);
});

test('return shipment belongs to customer and requires prior approval; receipt and refund cannot skip it', async () => {
    const f = fixture(); await request(f);
    const shipping = { orderId: 10, carrier: 'GHN', trackingNumber: 'RET123' };
    assert.equal((await f.service.markReturnShipped(shipping, courier)).errCode, 403);
    assert.notEqual((await f.service.markReturnShipped(shipping, buyer)).errCode, 0);
    assert.notEqual((await f.service.receiveReturn({ orderId: 10, resellable: true, inspectionNote: 'Kiểm tra tốt' }, admin)).errCode, 0);
    assert.notEqual((await f.service.confirmManualRefund({ orderId: 10, paymentReference: 'BANK123', paymentProof: picture }, admin)).errCode, 0);
    assert.equal(f.state().adjustments.length, 0);
});

test('physical receipt locks variants in sorted order and concurrent replay restocks each exactly once', async () => {
    const f = fixture(); await shipped(f);
    const results = await Promise.all([1, 2].map(() => f.service.receiveReturn({ orderId: 10, resellable: true, inspectionNote: 'Đã nhận đủ hàng nguyên vẹn' }, admin)));
    assert.ok(results.every(value => value.errCode === 0));
    assert.deepEqual(f.state().adjustments.map(row => [row.productDetailSizeId, row.quantity]), [[30, 2], [31, 1]]);
    assert.deepEqual(f.lockLog.filter(entry => entry.key === 'variants').map(entry => entry.id), [30, 31]);
    assert.equal(f.state().requests[0].status, 'REFUND_PENDING'); assert.equal(f.state().requests[0].refundedAt, undefined);
    assert.equal(f.state().events.filter(event => event.type === 'RETURN_RECEIVED').length, 1);
});

test('non-resellable received items never inflate stock, and courier cannot self-confirm warehouse inspection', async () => {
    const f = fixture(); await shipped(f);
    assert.equal((await f.service.receiveReturn({ orderId: 10, resellable: true, inspectionNote: 'Đủ hàng' }, courier)).errCode, 403);
    assert.notEqual((await f.service.receiveReturn({ orderId: 10, resellable: 'true', inspectionNote: 'Đủ hàng' }, admin)).errCode, 0);
    assert.equal((await f.service.receiveReturn({ orderId: 10, resellable: false, inspectionNote: 'Hàng lỗi không thể bán lại' }, admin)).errCode, 0);
    assert.equal(f.state().adjustments.length, 0); assert.equal(f.state().requests[0].status, 'REFUND_PENDING');
});

test('COD manual refund requires proof and reference, is labelled manual, and cannot refund twice', async () => {
    const f = fixture(); await received(f);
    for (const data of [{ paymentReference: 'BANK123' }, { paymentProof: picture }, { paymentReference: 'BANK123', paymentProof: 'javascript:alert(1)' }]) {
        assert.notEqual((await f.service.confirmManualRefund({ orderId: 10, ...data }, admin)).errCode, 0);
    }
    assert.equal((await f.service.confirmManualRefund({ orderId: 10, paymentReference: 'BANK123', paymentProof: picture }, buyer)).errCode, 403);
    const results = await Promise.all(['BANK123', 'BANK456'].map(paymentReference => f.service.confirmManualRefund({ orderId: 10, paymentReference, paymentProof: picture }, admin)));
    assert.ok(results.every(value => value.errCode === 0));
    assert.equal(f.state().requests[0].status, 'REFUNDED'); assert.equal(f.state().requests[0].refundMethod, 'manual');
    assert.equal(f.state().requests[0].refundReference, 'BANK123');
    assert.equal(f.state().events.filter(event => event.type === 'REFUND_MANUALLY_CONFIRMED').length, 1);
    assert.notEqual((await f.service.createReturnRequest({ orderId: 10, reason: 'Trả lại lần nữa' }, buyer)).errCode, 0);
});

test('online returns reject manual payout, retain pending when provider missing, and complete only on verified refund', async () => {
    let providerResult = { errCode: 3, status: 'NOT_CONFIGURED', provider: 'paypal' }, calls = [];
    const gateway = { async requestRefund(payload) { calls.push(payload); return providerResult; } };
    const f = fixture({ isPaymentOnlien: 1 }, { paymentGateway: gateway }); await received(f);
    assert.notEqual((await f.service.confirmManualRefund({ orderId: 10, paymentReference: 'BANK123', paymentProof: picture }, admin)).errCode, 0);
    assert.equal((await f.service.refundOnlineReturn({ orderId: 10 }, buyer)).errCode, 403);
    assert.equal((await f.service.refundOnlineReturn({ orderId: 10 }, admin)).data.status, 'REFUND_PENDING');
    assert.equal(f.state().requests[0].refundedAt, undefined); assert.equal(f.state().requests[0].refundProviderStatus, 'NOT_CONFIGURED');
    providerResult = { errCode: 0, status: 'COMPLETED', refundId: 7, providerRefundId: 'PAYPAL-REFUND', provider: 'paypal' };
    const result = await f.service.refundOnlineReturn({ orderId: 10 }, admin);
    assert.equal(result.data.status, 'REFUNDED'); assert.equal(result.data.refundReference, '7');
    assert.equal(calls[0].refundKey, calls[1].refundKey); assert.equal(calls[0].amountVnd, 220000);
    await f.service.refundOnlineReturn({ orderId: 10 }, admin); assert.equal(calls.length, 2);
});

test('failure and retry are assigned-courier actions, concurrent failure counts once and credits no inventory', async () => {
    const f = fixture({ statusId: 'S5', deliveredAt: null });
    assert.equal((await f.delivery.reportDeliveryFailure({ orderId: 10, reason: 'Khách không nghe máy' }, buyer)).errCode, 403);
    const results = await Promise.all([1, 2].map(() => f.delivery.reportDeliveryFailure({ orderId: 10, reason: 'Khách không nghe máy' }, courier)));
    assert.ok(results.every(value => value.errCode === 0)); assert.equal(f.state().orders[0].deliveryAttempts, 1);
    assert.equal(f.state().orders[0].statusId, 'S8'); assert.equal(f.state().adjustments.length, 0);
    assert.equal(f.state().events.filter(event => event.type === 'DELIVERY_FAILED').length, 1);
    assert.equal((await f.delivery.retryDelivery({ orderId: 10 }, { id: 9, roleId: 'R3' })).errCode, 403);
    assert.equal((await f.delivery.retryDelivery({ orderId: 10 }, courier)).errCode, 0);
    assert.equal(f.state().orders[0].statusId, 'S5'); assert.equal(f.state().orders[0].deliveryAttempts, 1);
});

test('three failed delivery attempts require physical return, whose receipt credits once and only by admin', async () => {
    const f = fixture({ statusId: 'S8', deliveryAttempts: 3, deliveredAt: null });
    assert.notEqual((await f.delivery.retryDelivery({ orderId: 10 }, courier)).errCode, 0);
    assert.equal((await f.delivery.startReturnToWarehouse({ orderId: 10, reason: 'Khách từ chối nhận hàng' }, courier)).errCode, 0);
    assert.equal(f.state().adjustments.length, 0);
    const receiving = { orderId: 10, resellable: true, inspectionNote: 'Đã nhận đủ hàng còn nguyên vẹn' };
    assert.equal((await f.delivery.receiveUndeliveredReturn(receiving, courier)).errCode, 403);
    const results = await Promise.all([1, 2].map(() => f.delivery.receiveUndeliveredReturn(receiving, admin)));
    assert.ok(results.every(value => value.errCode === 0)); assert.equal(f.state().orders[0].statusId, 'S10');
    assert.equal(f.state().adjustments.length, 2); assert.equal(f.state().requests.length, 0, 'uncollected COD has no fake refund');
    assert.equal(f.state().events.filter(event => event.type === 'DELIVERY_RETURN_RECEIVED').length, 1);
});

test('carrier-managed orders reject internal claim, completion, cancellation and retry but permit admin inspection', async () => {
    for (const statusId of ['S4', 'S5', 'S8']) {
        const f = fixture({ statusId, deliveryProvider: 'ghn' });
        assert.notEqual((await f.delivery.confirmOrder({ orderId: 10, statusId: 'S5', shipperId: courier.id }, admin)).errCode, 0);
        assert.notEqual((await f.delivery.updateStatusOrder({ id: 10, statusId: 'S6' }, admin)).errCode, 0);
        assert.notEqual((await f.delivery.updateStatusOrder({ id: 10, statusId: 'S7' }, admin)).errCode, 0);
        assert.notEqual((await f.delivery.retryDelivery({ orderId: 10 }, admin)).errCode, 0);
        assert.equal(canTransitionOrder(f.state().orders[0], f.state().addresses[0], admin, 'S6'), false);
    }
    assert.equal(canReadOrder({ statusId: 'S4', deliveryProvider: 'ghn' }, { userId: buyer.id }, courier), false);
    const f = fixture({ statusId: 'S9', deliveryProvider: 'ghtk', shipperId: null, isPaymentOnlien: 1, deliveredAt: null });
    assert.equal((await f.delivery.receiveUndeliveredReturn({ orderId: 10, resellable: true, inspectionNote: 'Kiểm hàng hoàn từ hãng' }, admin)).errCode, 0);
    assert.equal(f.state().orders[0].statusId, 'S10'); assert.equal(f.state().requests[0].status, 'REFUND_PENDING');
    assert.equal(f.state().requests[0].amount, 220000); assert.equal(f.state().adjustments.length, 2);
});

test('event write failure rolls back receipt, return state and all inventory credits together', async () => {
    const f = fixture(); await shipped(f); const before = structuredClone(f.state());
    f.db.OrderEvent.create = async () => { throw new Error('event write unavailable'); };
    await assert.rejects(f.service.receiveReturn({ orderId: 10, resellable: true, inspectionNote: 'Hàng nguyên vẹn' }, admin), /event write unavailable/);
    assert.deepEqual(f.state(), before);
});

test('variant disappearance rolls back physical receipt rather than partially crediting stock', async () => {
    const f = fixture(); await shipped(f); f.state().variants = [{ id: 30 }];
    const result = await f.service.receiveReturn({ orderId: 10, resellable: true, inspectionNote: 'Hàng nguyên vẹn' }, admin);
    assert.notEqual(result.errCode, 0); assert.equal(f.state().adjustments.length, 0);
    assert.equal(f.state().requests[0].status, 'SHIPPED');
});
