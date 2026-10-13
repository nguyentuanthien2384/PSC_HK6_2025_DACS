const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const { Op } = require('sequelize');
const { createDeliveryService } = require('../src/services/deliveryService');
const { canReadOrder, canTransitionOrder } = require('../src/utils/commerce');

const buyer = { id: 20, roleId: 'R2' };
const courier = { id: 30, roleId: 'R3' };
const anotherCourier = { id: 31, roleId: 'R3' };
const admin = { id: 10, roleId: 'R1' };
const image = 'data:image/png;base64,aGVsbG8=';

// The fixture provides isolated transaction snapshots and serializes the row
// lock. Its assertions make accidental unlocked order mutations fail the test.
function fixture(overrides = {}) {
    let state = {
        orders: [{ id: 1, addressUserId: 2, statusId: 'S4', shipperId: null, isPaymentOnlien: 0, totalPrice: 100, ...overrides }],
        addresses: [{ id: 2, userId: buyer.id, shipName: 'Buyer', shipAdress: '123 Test' }],
        users: [{ ...courier, statusId: 'S1', firstName: 'Courier' }, { ...anotherCourier, statusId: 'S1', firstName: 'Other' }, { ...buyer, statusId: 'S1' }],
        ratings: []
    };
    let pending = Promise.resolve();
    const clone = value => structuredClone(value);
    const rowsFor = (key, query = {}) => (query.transaction ? query.transaction.state : state)[key];
    function matches(row, where = {}) {
        return Object.keys(where).every(key => where[key] && typeof where[key] === 'object' && where[key][Op.in]
            ? where[key][Op.in].some(value => String(row[key]) === String(value)) : String(row[key] ?? null) === String(where[key] ?? null)) &&
            (!where[Op.or] || where[Op.or].some(clause => matches(row, clause))) &&
            (!where[Op.and] || where[Op.and].every(clause => matches(row, clause)));
    }
    const project = (row, attributes) => Array.isArray(attributes)
        ? Object.fromEntries(attributes.map(key => [key, row[key]]))
        : Object.fromEntries(Object.entries(row).filter(([key]) => !attributes?.exclude?.includes(key)));
    const model = (key, row, tx) => ({ ...clone(row), async save(query) {
        assert.equal(query.transaction, tx);
        const values = Object.fromEntries(Object.entries(this).filter(([, value]) => typeof value !== 'function'));
        const rows = rowsFor(key, query);
        Object.assign(rows.find(existing => existing.id === row.id), clone(values));
    }, get() { return Object.fromEntries(Object.entries(this).filter(([, value]) => typeof value !== 'function')); } });
    function table(key) {
        return {
            async findOne(query) {
                if (key === 'orders' && query.transaction) assert.equal(query.lock, query.transaction.LOCK.UPDATE);
                if (key === 'ratings' && query.attributes) {
                    assert.deepEqual(query.attributes.map(attribute => attribute[1]), ['ratingCount', 'ratingAverage']);
                    const rows = rowsFor(key, query).filter(value => matches(value, query.where));
                    return { ratingCount: rows.length, ratingAverage: rows.length ? rows.reduce((sum, row) => sum + row.rating, 0) / rows.length : null };
                }
                const row = rowsFor(key, query).find(value => matches(value, query.where));
                if (!row) return null;
                const values = project(row, query.attributes);
                return query.raw ? clone(values) : model(key, row, query.transaction);
            },
            async findAll(query = {}) {
                const rows = rowsFor(key, query).filter(row => matches(row, query.where));
                if (key === 'ratings' && query.group) {
                    assert.deepEqual(query.group, ['shipperId']);
                    assert.deepEqual(query.attributes.slice(1).map(attribute => attribute[1]), ['ratingCount', 'ratingAverage']);
                    return [...new Set(rows.map(row => row.shipperId))].map(shipperId => {
                        const reviews = rows.filter(row => row.shipperId === shipperId);
                        return { shipperId, ratingCount: reviews.length, ratingAverage: reviews.reduce((sum, row) => sum + row.rating, 0) / reviews.length };
                    });
                }
                return clone(rows.map(row => project(row, query.attributes)));
            },
            async count(query = {}) { return rowsFor(key, query).filter(row => matches(row, query.where)).length; },
            async sum(field, query = {}) { return rowsFor(key, query).filter(row => matches(row, query.where)).reduce((sum, row) => sum + row[field], 0); },
            async create(data, query) {
                const rows = rowsFor(key, query);
                if (key === 'ratings' && rows.some(row => row.orderId === data.orderId)) throw new Error('unique orderId constraint');
                const row = { id: rows.length + 1, ...clone(data), createdAt: new Date() };
                rows.push(row);
                return model(key, row, query.transaction);
            }
        };
    }
    const db = {
        sequelize: { async transaction(options, work) {
            const before = pending;
            let release;
            pending = new Promise(resolve => { release = resolve; });
            await before;
            const tx = { LOCK: { UPDATE: 'UPDATE' }, state: clone(state) };
            try { const result = await work(tx); state = tx.state; return result; }
            finally { release(); }
        } },
        OrderProduct: table('orders'), AddressUser: table('addresses'), User: table('users'), ShipperRating: table('ratings'),
        OrderDetail: { async findAll() { return []; } }, TypeShip: {}, Voucher: {}, Allcode: {}
    };
    return { db, service: createDeliveryService(db), state: () => state };
}

function loadSource(relativePath, dependencies) {
    const filename = path.resolve(__dirname, '../src', relativePath);
    const code = babel.transformFileSync(filename, { babelrc: false, configFile: false,
        presets: [[require.resolve('@babel/preset-env'), { targets: { node: 'current' } }]] }).code;
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    const requireOriginal = loaded.require.bind(loaded);
    loaded.require = name => Object.hasOwn(dependencies, name) ? dependencies[name] : requireOriginal(name);
    loaded._compile(code, filename);
    return loaded.exports;
}

test('only active couriers can claim a ready order and forged shipperId is ignored', async () => {
    const f = fixture();
    assert.equal((await f.service.confirmOrder({ orderId: 1, statusId: 'S5', shipperId: anotherCourier.id }, buyer)).errCode, 403);
    const result = await f.service.confirmOrder({ orderId: 1, statusId: 'S5', shipperId: anotherCourier.id }, courier);
    assert.equal(result.errCode, 0);
    assert.equal(f.state().orders[0].shipperId, courier.id);
    assert.equal(f.state().orders[0].statusId, 'S5');
    assert.ok(f.state().orders[0].assignedAt instanceof Date);
});

test('concurrent claims assign exactly one courier and retry does not change assignment time', async () => {
    const f = fixture();
    const results = await Promise.all([
        f.service.confirmOrder({ orderId: 1, statusId: 'S5' }, courier),
        f.service.confirmOrder({ orderId: 1, statusId: 'S5' }, anotherCourier)
    ]);
    assert.equal(results.filter(result => result.errCode === 0).length, 1);
    const assignedAt = f.state().orders[0].assignedAt.getTime();
    assert.equal((await f.service.confirmOrder({ orderId: 1, statusId: 'S5' }, courier)).errCode, 0);
    assert.equal(f.state().orders[0].assignedAt.getTime(), assignedAt);
});

test('pending, cancelled, already assigned and missing orders cannot be claimed', async () => {
    for (const overrides of [{ statusId: 'S3' }, { statusId: 'S7' }, { statusId: 'S6' }, { shipperId: anotherCourier.id }]) {
        const f = fixture(overrides);
        assert.notEqual((await f.service.confirmOrder({ orderId: 1, statusId: 'S5' }, courier)).errCode, 0);
        assert.deepEqual(f.state().orders[0], { id: 1, addressUserId: 2, statusId: 'S4', shipperId: null, isPaymentOnlien: 0, totalPrice: 100, ...overrides });
    }
    assert.notEqual((await fixture().service.confirmOrder({ orderId: 99, statusId: 'S5' }, courier)).errCode, 0);
});

test('admin assignment rejects inactive couriers and wrong roles without changing the order', async () => {
    const f = fixture();
    f.state().users[0].statusId = 'S2';
    for (const shipperId of [courier.id, buyer.id, 999, null, true]) {
        assert.notEqual((await f.service.confirmOrder({ orderId: 1, statusId: 'S5', shipperId }, admin)).errCode, 0);
    }
    assert.equal(f.state().orders[0].statusId, 'S4');
    assert.equal((await f.service.confirmOrder({ orderId: 1, statusId: 'S5', shipperId: anotherCourier.id }, { ...admin, roleId: 'R4' })).errCode, 0);
});

test('an order without a delivery address cannot be assigned', async () => {
    const f = fixture(); f.state().addresses.length = 0;
    assert.notEqual((await f.service.confirmOrder({ orderId: 1, statusId: 'S5' }, courier)).errCode, 0);
    assert.equal(f.state().orders[0].shipperId, null);
});

test('status transitions cannot skip assignment, finish somebody else delivery or reopen finished orders', async () => {
    const waiting = fixture();
    assert.notEqual((await waiting.service.updateStatusOrder({ id: 1, statusId: 'S5' }, admin)).errCode, 0);
    const f = fixture({ statusId: 'S5', shipperId: courier.id });
    assert.equal((await f.service.updateStatusOrder({ id: 1, statusId: 'S6' }, anotherCourier)).errCode, 403);
    assert.equal((await f.service.updateStatusOrder({ id: 1, statusId: 'S7' }, buyer)).errCode, 403);
    assert.equal((await f.service.updateStatusOrder({ id: 1, statusId: 'S6', image }, courier)).errCode, 0);
    assert.equal(f.state().orders[0].image, image);
    assert.ok(f.state().orders[0].deliveredAt instanceof Date);
    const completed = f.state().orders[0].deliveredAt.getTime();
    assert.equal((await f.service.updateStatusOrder({ id: 1, statusId: 'S6', image }, courier)).errCode, 0);
    assert.equal(f.state().orders[0].deliveredAt.getTime(), completed);
    assert.notEqual((await f.service.updateStatusOrder({ id: 1, statusId: 'S4' }, admin)).errCode, 0);
    assert.equal((await f.service.updateStatusOrder({ id: 1, statusId: 'S6' }, anotherCourier)).errCode, 403);
});

test('customer receipt confirmation requires a real assigned courier', async () => {
    const invalid = fixture({ statusId: 'S5' });
    for (const actor of [buyer, admin]) assert.notEqual((await invalid.service.updateStatusOrder({ id: 1, statusId: 'S6' }, actor)).errCode, 0);
    const f = fixture({ statusId: 'S5', shipperId: courier.id });
    assert.equal((await f.service.updateStatusOrder({ id: 1, statusId: 'S6' }, buyer)).errCode, 0);
    assert.ok(f.state().orders[0].deliveredAt);
});

test('owner can cancel an unpaid order before assignment, preserving cancellation reason and time', async () => {
    const f = fixture();
    assert.equal((await f.service.updateStatusOrder({ id: 1, statusId: 'S7', cancelReason: '  Đổi địa chỉ  ' }, buyer)).errCode, 0);
    assert.equal(f.state().orders[0].cancellationReason, 'Đổi địa chỉ');
    const cancelledAt = f.state().orders[0].cancelledAt.getTime();
    assert.equal((await f.service.updateStatusOrder({ id: 1, statusId: 'S7', cancelReason: 'retry' }, buyer)).errCode, 0);
    assert.equal(f.state().orders[0].cancelledAt.getTime(), cancelledAt);
    assert.equal(f.state().orders[0].cancellationReason, 'Đổi địa chỉ');
    const paid = fixture({ isPaymentOnlien: 1 });
    assert.equal((await paid.service.updateStatusOrder({ id: 1, statusId: 'S7' }, buyer)).errCode, 2);
});

test('paid orders cannot be cancelled without a refund workflow, including admin and staff', async () => {
    for (const statusId of ['S3', 'S4']) {
        const f = fixture({ statusId, isPaymentOnlien: 1 });
        const before = structuredClone(f.state().orders[0]);
        for (const actor of [admin, { ...admin, roleId: 'R4' }, buyer]) {
            const result = await f.service.updateStatusOrder({ id: 1, statusId: 'S7', cancelReason: 'Hủy đơn' }, actor);
            assert.equal(result.errCode, 2);
            assert.match(result.errMessage, /đối soát.*hoàn tiền/);
            assert.deepEqual(f.state().orders[0], before);
        }
        assert.equal(canTransitionOrder(f.state().orders[0], f.state().addresses[0], admin, 'S7'), false);
    }
    const cancelled = fixture({ statusId: 'S7', isPaymentOnlien: 1, cancelledAt: new Date('2026-10-01T01:00:00Z') });
    const before = structuredClone(cancelled.state().orders[0]);
    assert.equal((await cancelled.service.updateStatusOrder({ id: 1, statusId: 'S7' }, admin)).errCode, 0);
    assert.deepEqual(cancelled.state().orders[0], before);
});

test('null and boolean courier IDs cannot complete or rate a legacy malformed delivery', async () => {
    for (const shipperId of [null, false, true, 0, undefined]) {
        const f = fixture({ statusId: 'S5', shipperId });
        assert.notEqual((await f.service.updateStatusOrder({ id: 1, statusId: 'S6' }, admin)).errCode, 0);
        assert.equal(f.state().orders[0].statusId, 'S5');
        const delivered = fixture({ statusId: 'S6', shipperId });
        assert.notEqual((await delivered.service.rateShipper({ orderId: 1, rating: 5 }, buyer)).errCode, 0);
        assert.equal(delivered.state().ratings.length, 0);
    }
});

test('delivery image requires a supported image and an own in-progress order', async () => {
    const f = fixture({ statusId: 'S5', shipperId: courier.id });
    assert.equal((await f.service.updateImageOrder({ id: 1, image }, anotherCourier)).errCode, 403);
    for (const invalid of ['javascript:alert(1)', 'data:image/svg+xml;base64,aGVsbG8=', '', null]) {
        assert.notEqual((await f.service.updateImageOrder({ id: 1, image: invalid }, courier)).errCode, 0);
        assert.notEqual((await f.service.updateStatusOrder({ id: 1, statusId: 'S6', image: invalid }, courier)).errCode, 0);
    }
    assert.equal(f.state().orders[0].statusId, 'S5');
    assert.equal((await f.service.updateImageOrder({ id: 1, image }, courier)).errCode, 0);
    await f.service.updateStatusOrder({ id: 1, statusId: 'S6' }, courier);
    assert.notEqual((await f.service.updateImageOrder({ id: 1, image }, courier)).errCode, 0);
});

test('only the buyer can rate the assigned courier after successful delivery', async () => {
    const f = fixture({ statusId: 'S6', shipperId: courier.id });
    for (const actor of [admin, courier, { id: 21, roleId: 'R2' }]) assert.equal((await f.service.rateShipper({ orderId: 1, rating: 5 }, actor)).errCode, 403);
    for (const overrides of [{ statusId: 'S5', shipperId: courier.id }, { statusId: 'S6', shipperId: null }]) {
        assert.notEqual((await fixture(overrides).service.rateShipper({ orderId: 1, rating: 5 }, buyer)).errCode, 0);
    }
    const result = await f.service.rateShipper({ orderId: 1, rating: 5, comment: '  Giao hàng nhanh  ', userId: 999, shipperId: anotherCourier.id }, buyer);
    assert.equal(result.errCode, 0);
    assert.equal(result.data.userId, buyer.id);
    assert.equal(result.data.shipperId, courier.id);
    assert.equal(result.data.comment, 'Giao hàng nhanh');
});

test('ratings reject invalid stars, oversized comments and self-rating', async () => {
    const f = fixture({ statusId: 'S6', shipperId: courier.id });
    for (const rating of [0, 6, 2.5, undefined, true, [], 'bad']) assert.notEqual((await f.service.rateShipper({ orderId: 1, rating }, buyer)).errCode, 0);
    for (const comment of [null, {}, 'a'.repeat(1001)]) assert.notEqual((await f.service.rateShipper({ orderId: 1, rating: 5, comment }, buyer)).errCode, 0);
    const own = fixture({ statusId: 'S6', shipperId: buyer.id });
    assert.equal((await own.service.rateShipper({ orderId: 1, rating: 5 }, buyer)).errCode, 403);
    assert.equal(f.state().ratings.length, 0);
});

test('simultaneous ratings are saved once and summary uses one review per order', async () => {
    const f = fixture({ statusId: 'S6', shipperId: courier.id });
    const results = await Promise.all([f.service.rateShipper({ orderId: 1, rating: 4 }, buyer), f.service.rateShipper({ orderId: 1, rating: 2 }, buyer)]);
    assert.equal(results.filter(result => result.errCode === 0).length, 1);
    assert.equal(f.state().ratings.length, 1);
    assert.deepEqual(await f.service.shipperSummary(courier.id), { working: 0, done: 1, ratingCount: 1, ratingAverage: 4 });
    assert.deepEqual(await f.service.ratingSummary(anotherCourier.id), { ratingCount: 0, ratingAverage: 0 });
});

test('shipper summary reads rating count and mean with one database aggregate', async () => {
    const f = fixture();
    f.state().ratings.push({ id: 1, orderId: 1, shipperId: courier.id, rating: 2 }, { id: 2, orderId: 2, shipperId: courier.id, rating: 5 }, { id: 3, orderId: 3, shipperId: courier.id, rating: 4 });
    f.db.ShipperRating.count = () => assert.fail('count must not race a separate sum');
    f.db.ShipperRating.sum = () => assert.fail('sum must not race a separate count');
    assert.deepEqual(await f.service.ratingSummary(courier.id), { ratingCount: 3, ratingAverage: 3.67 });
});

test('a failed rating write rolls back and leaves delivery state intact', async () => {
    const f = fixture({ statusId: 'S6', shipperId: courier.id });
    const before = structuredClone(f.state());
    f.db.ShipperRating.create = async () => { throw new Error('write failed'); };
    await assert.rejects(f.service.rateShipper({ orderId: 1, rating: 5 }, buyer), /write failed/);
    assert.deepEqual(f.state(), before);
});

test('courier previews include only ready unassigned orders and cannot read somebody else history', () => {
    assert.equal(canReadOrder({ statusId: 'S4', shipperId: null }, { userId: buyer.id }, courier), true);
    for (const order of [{ statusId: 'S3', shipperId: null }, { statusId: 'S5', shipperId: anotherCourier.id }, { statusId: 'S6', shipperId: anotherCourier.id }]) {
        assert.equal(canReadOrder(order, { userId: buyer.id }, courier), false);
    }
    assert.equal(canTransitionOrder({ statusId: 'S4' }, { userId: buyer.id }, admin, 'S5'), false);
    assert.equal(canTransitionOrder({ statusId: 'S5' }, { userId: buyer.id }, buyer, 'S6'), false);
});

test('order APIs expose available queue, authenticated history summary and rating eligibility', async () => {
    const f = fixture();
    f.db.PaymentSession = { async findAll(options) {
        assert.ok(options.attributes.includes('status'));
        assert.equal(options.attributes.includes('checkoutData'), false);
        assert.equal(options.attributes.includes('gatewayOutcome'), false);
        return options.where.orderId[Op.in].map(orderId => ({ id: 'demo-session', orderId, provider: 'paypal', status: 'COMPLETED', totalPrice: 100, providerPaymentId: 'DEMO-paypal-1' }));
    } };
    f.state().orders.push({ id: 3, addressUserId: 2, statusId: 'S3', shipperId: null, totalPrice: 100 });
    const service = loadSource('services/orderService.js', { '../models/index': f.db, '../utils/constants': { EXCHANGE_RATES: { USD: 25000 } } });
    assert.equal((await service.getAvailableOrdersForShipper({}, buyer)).errCode, 403);
    const available = await service.getAvailableOrdersForShipper({}, courier);
    assert.deepEqual(available.data.map(order => order.id), [1]);
    assert.equal(available.count, 1);
    assert.equal((await service.getAllOrdersByShipper({ shipperId: courier.id }, buyer)).errCode, 403);
    await f.service.confirmOrder({ orderId: 1, statusId: 'S5' }, courier);
    await f.service.updateStatusOrder({ id: 1, statusId: 'S6' }, courier);
    const details = await service.getDetailOrderById(1, buyer);
    assert.equal(details.errCode, 0);
    assert.equal(details.data.canRateShipper, true);
    assert.equal(details.data.shipperData.ratingAverage, 0);
    await f.service.rateShipper({ orderId: 1, rating: 5 }, buyer);
    const updated = await service.getDetailOrderById(1, buyer);
    assert.equal(updated.data.canRateShipper, false);
    assert.equal(updated.data.shipperRating.rating, 5);
    assert.equal(updated.data.shipperData.ratingCount, 1);
    f.state().users.find(user => user.id === courier.id).email = 'private-courier@example.com';
    f.state().users.find(user => user.id === courier.id).dob = '1980-01-01';
    f.state().users.find(user => user.id === buyer.id).email = 'private-customer@example.com';
    const courierDetails = await service.getDetailOrderById(1, courier);
    assert.equal(courierDetails.data.shipperData.email, undefined);
    assert.equal(courierDetails.data.shipperData.dob, undefined);
    assert.equal(courierDetails.data.userData.email, undefined);
    assert.equal(courierDetails.data.userData.id, buyer.id);
    assert.equal(courierDetails.data.paymentSession.isDemo, true);
    assert.equal(courierDetails.data.paymentSession.providerPaymentId, undefined);
    assert.equal(courierDetails.data.paymentSession.providerOutcome, undefined);
    const ownHistory = await service.getAllOrdersByShipper({ shipperId: anotherCourier.id, status: 'done' }, courier);
    assert.deepEqual(ownHistory.data.map(order => order.id), [1]);
    assert.deepEqual(ownHistory.summary, { working: 0, done: 1, ratingCount: 1, ratingAverage: 5 });
});
