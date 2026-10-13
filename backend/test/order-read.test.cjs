const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const { Op } = require('sequelize');
const { createDeliveryService } = require('../src/services/deliveryService');
const { createOrderReadService } = require('../src/services/orderReadService');

const buyer = { id: 20, roleId: 'R2' };
const courier = { id: 30, roleId: 'R3' };

function fixture(orderCount = 1) {
    const state = {
        OrderProduct: Array.from({ length: orderCount }, (_, index) => ({ id: index + 1, addressUserId: index % 2 + 1,
            statusId: 'S6', shipperId: courier.id, totalPrice: 25000, deliveredAt: new Date(), image: null,
            typeShipData: { price: 5000 }, voucherData: { id: 1, typeVoucherId: 1 }, createdAt: new Date(2026, 9, index + 1) })),
        AddressUser: [{ id: 1, userId: buyer.id, shipAdress: 'Address one' }, { id: 2, userId: buyer.id, shipAdress: 'Address two' }],
        User: [{ ...buyer, firstName: 'Buyer', email: 'buyer-private@example.com', password: 'password-hash', usertoken: 'secret', image: 'private-image' },
            { ...courier, firstName: 'Courier', email: 'courier-private@example.com', dob: '1980-01-01', password: 'secret', statusId: 'S1' }],
        ShipperRating: [{ id: 1, orderId: 1001, shipperId: courier.id, rating: 4 }, { id: 2, orderId: 1002, shipperId: courier.id, rating: 5 }],
        OrderEvent: [{ id: 2, orderId: 1, title: 'Delivered' }, { id: 1, orderId: 1, title: 'Assigned' }],
        ReturnRequest: [{ id: 1, orderId: 1, status: 'REJECTED' }, { id: 2, orderId: 1, status: 'REFUND_PENDING', refundProof: 'private-proof', refundReference: 'private-reference', payoutDetails: 'private-account' }],
        Shipment: [{ id: 1, orderId: 1, status: 'DELIVERED', requestData: 'private-carrier-request', leaseUntil: new Date() }],
        PaymentSession: [{ id: 'session', orderId: 1, provider: 'paypal', status: 'COMPLETED', totalPrice: 25000,
            providerPaymentId: 'DEMO-paypal-1', checkoutData: 'private-checkout', gatewayOutcome: 'private-gateway' }],
        TypeVoucher: [{ id: 1, typeVoucher: 'percent', value: 10, maxValue: 5000 }],
        OrderDetail: Array.from({ length: orderCount * 3 }, (_, index) => ({ id: index + 1, orderId: Math.floor(index / 3) + 1,
            productId: index % 2 + 11, quantity: 1, realPrice: 10000 })),
        ProductDetailSize: [{ id: 11, productdetailId: 21, sizeData: { value: 'M' } }, { id: 12, productdetailId: 21, sizeData: { value: 'L' } }],
        ProductDetail: [{ id: 21, productId: 41, nameDetail: 'Green', discountPrice: 10000 }],
        Product: [{ id: 41, name: 'Shirt', contentHTML: '<p>Long article body</p>', contentMarkdown: 'Long article body' }],
        ProductImage: [{ id: 31, productdetailId: 21, caption: 'Front', imageVersion: 'a'.repeat(64), updatedAt: new Date(), image: Buffer.alloc(1024 * 1024, 65) }]
    };
    const calls = [];
    const matches = (row, where = {}) => Object.keys(where).every(key => where[key] && typeof where[key] === 'object' && where[key][Op.in]
        ? where[key][Op.in].some(value => String(value) === String(row[key])) : String(row[key] ?? null) === String(where[key] ?? null)) &&
        (!where[Op.or] || where[Op.or].some(clause => matches(row, clause))) && (!where[Op.and] || where[Op.and].every(clause => matches(row, clause)));
    const project = (row, attributes) => Array.isArray(attributes)
        ? Object.fromEntries(attributes.filter(key => typeof key === 'string').map(key => [key, row[key]]))
        : Object.fromEntries(Object.entries(row).filter(([key]) => !attributes?.exclude?.includes(key)));
    const db = { Allcode: {} };
    for (const name of Object.keys(state)) db[name] = {
        async findAll(options = {}) {
            calls.push({ name, options });
            let rows = state[name].filter(row => matches(row, options.where));
            if (options.group) {
                assert.equal(name, 'ShipperRating');
                return [...new Set(rows.map(row => row.shipperId))].map(shipperId => {
                    const reviews = rows.filter(row => row.shipperId === shipperId);
                    return { shipperId, ratingCount: String(reviews.length), ratingAverage: String(reviews.reduce((sum, row) => sum + row.rating, 0) / reviews.length) };
                });
            }
            if (options.order) rows = [...rows].sort((left, right) => {
                for (const [field, direction] of options.order) {
                    if (left[field] < right[field]) return direction === 'DESC' ? 1 : -1;
                    if (left[field] > right[field]) return direction === 'DESC' ? -1 : 1;
                }
                return 0;
            });
            return structuredClone(rows.map(row => project(row, options.attributes)));
        },
        async findOne(options = {}) {
            calls.push({ name, options });
            const row = state[name].find(row => matches(row, options.where));
            return row ? structuredClone(project(row, options.attributes)) : null;
        }
    };
    const delivery = createDeliveryService(db);
    return { state, calls, db, delivery, reader: createOrderReadService(db, delivery) };
}

function loadOrderService(db) {
    const filename = path.resolve(__dirname, '../src/services/orderService.js');
    const code = babel.transformFileSync(filename, { babelrc: false, configFile: false,
        presets: [[require.resolve('@babel/preset-env'), { targets: { node: 'current' } }]] }).code;
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    const requireOriginal = loaded.require.bind(loaded);
    loaded.require = name => name === '../models/index' ? db : name === '../utils/constants' ? { EXCHANGE_RATES: { USD: 25000 } } : requireOriginal(name);
    loaded._compile(code, filename);
    return loaded.exports;
}

test('many orders and product lines use the same bounded relation reads and no image blobs', async () => {
    for (const orderCount of [1, 30]) {
        const f = fixture(orderCount);
        const orders = structuredClone(f.state.OrderProduct);
        await f.reader.hydrateOrders(orders, courier);
        assert.equal(f.calls.length, 15, 'relation reads must not grow with the order or line count');
        assert.equal(f.calls.filter(call => call.name === 'ProductDetailSize').length, 1);
        assert.deepEqual(f.calls.find(call => call.name === 'ProductDetailSize').options.where.id[Op.in], [11, 12]);
        assert.equal(f.calls.filter(call => call.name === 'ShipperRating' && call.options.group).length, 1);
        assert.equal(f.calls.find(call => call.name === 'ProductImage').options.attributes.includes('image'), false);
        assert.deepEqual(f.calls.find(call => call.name === 'Product').options.attributes.exclude, ['contentHTML', 'contentMarkdown']);
        for (const order of orders) {
            assert.equal(order.orderDetail.length, 3);
            assert.equal(order.orderDetail[0].product.name, 'Shirt');
            assert.equal(order.orderDetail[0].product.contentHTML, undefined);
            assert.equal(order.orderDetail[0].product.contentMarkdown, undefined);
            assert.equal(order.orderDetail[0].productDetailSize.sizeData.value, order.orderDetail[0].productId === 11 ? 'M' : 'L');
            assert.equal(order.orderDetail[0].productImage[0].image, `/api/media/product-images/31/${'a'.repeat(64)}/card`);
            assert.equal(order.shipperData.ratingCount, 2);
            assert.equal(order.shipperData.ratingAverage, 4.5);
        }
        assert.ok(JSON.stringify(orders).length < orderCount * 20000, 'base64 image bytes must not inflate order responses');
    }
});

test('batch hydration preserves return ordering, payment flags, timeline and courier privacy', async () => {
    const f = fixture();
    const [order] = await f.reader.hydrateOrders(structuredClone(f.state.OrderProduct), courier);
    assert.equal(order.returnRequest.id, 2);
    for (const field of ['refundProof', 'refundReference', 'payoutDetails']) assert.equal(order.returnRequest[field], undefined);
    assert.equal(f.state.ReturnRequest[1].refundProof, 'private-proof');
    assert.deepEqual(order.events.map(event => event.id), [1, 2]);
    assert.equal(order.events[0].orderId, undefined);
    for (const field of ['requestData', 'leaseUntil']) assert.equal(order.shipment[field], undefined);
    assert.equal(order.paymentSession.isDemo, true);
    for (const field of ['orderId', 'providerPaymentId', 'checkoutData', 'gatewayOutcome']) assert.equal(order.paymentSession[field], undefined);
    assert.equal(order.shipperData.email, undefined);
    assert.equal(order.shipperData.dob, undefined);
    assert.equal(order.userData.email, undefined);
    assert.equal(order.userData.password, undefined);
    assert.equal(order.canRateShipper, false);
});

test('buyer fields and rating eligibility remain available without disclosing credentials', async () => {
    const f = fixture();
    f.state.ReturnRequest.length = 0;
    const [order] = await f.reader.hydrateOrders(structuredClone(f.state.OrderProduct), buyer);
    assert.equal(order.userData.email, 'buyer-private@example.com');
    for (const field of ['password', 'usertoken', 'image']) assert.equal(order.userData[field], undefined);
    assert.equal(order.canRateShipper, true);
    assert.equal(order.returnEligibility.canRequest, true);
});

test('missing catalog relations keep purchased lines readable and legacy totals intact', async () => {
    const f = fixture();
    f.state.ProductDetailSize.length = 0;
    f.state.OrderProduct[0].totalPrice = null;
    const [order] = await f.reader.hydrateOrders(structuredClone(f.state.OrderProduct), buyer);
    assert.equal(order.orderDetail.length, 3);
    assert.equal(order.orderDetail[0].productDetailSize.id, 11);
    assert.equal(order.orderDetail[0].productDetail.discountPrice, 10000);
    assert.equal(order.orderDetail[0].product.name, 'Sản phẩm đã mua');
    assert.deepEqual(order.orderDetail[0].productImage, [{ image: '' }]);
    assert.equal(order.subtotal, 30000);
    assert.equal(order.shippingFee, 5000);
    assert.equal(order.discountAmount, 3000);
    assert.equal(order.totalPrice, 32000);
});

test('empty and refreshed requests perform no unnecessary reads and retain no previous data', async () => {
    const f = fixture();
    assert.deepEqual(await f.reader.hydrateOrders([], courier), []);
    assert.equal(f.calls.length, 0);
    await f.reader.hydrateOrders(structuredClone(f.state.OrderProduct), courier);
    f.state.Product[0].name = 'Updated shirt';
    f.state.ShipperRating.push({ id: 3, orderId: 1, shipperId: courier.id, rating: 1 });
    const [updated] = await f.reader.hydrateOrders(structuredClone(f.state.OrderProduct), buyer);
    assert.equal(updated.orderDetail[0].product.name, 'Updated shirt');
    assert.equal(updated.shipperRating.rating, 1);
    assert.equal(updated.shipperData.ratingCount, 3);
    assert.equal(updated.canRateShipper, false);
});

test('buyer history loads every address in one order query with a serializable nested contract', async () => {
    const f = fixture(8);
    const service = loadOrderService(f.db);
    const result = await service.getAllOrdersByUser(buyer.id);
    assert.equal(result.errCode, 0);
    assert.equal(result.data.length, 2);
    assert.deepEqual(result.data[0].order.map(order => order.id), [7, 5, 3, 1]);
    assert.deepEqual(result.data[1].order.map(order => order.id), [8, 6, 4, 2]);
    assert.equal(f.calls.filter(call => call.name === 'OrderProduct').length, 1);
    assert.equal(f.calls.filter(call => call.name === 'AddressUser').length, 1);
    assert.equal(result.data[0].order[0].addressUser.order, undefined);
    assert.doesNotThrow(() => JSON.stringify(result));
});

test('active courier listing reads rating summaries once for every courier', async () => {
    const f = fixture();
    f.state.User.push({ id: 31, roleId: 'R3', statusId: 'S1', firstName: 'Other courier', email: 'private@example.com' });
    const result = await f.delivery.getActiveShippers({}, { id: 10, roleId: 'R1' });
    assert.equal(result.errCode, 0);
    assert.equal(f.calls.length, 2);
    assert.equal(result.data.find(row => row.id === courier.id).ratingAverage, 4.5);
    assert.equal(result.data.find(row => row.id === 31).ratingCount, 0);
    assert.equal(result.data.find(row => row.id === 31).ratingAverage, 0);
    assert.equal(result.data[0].email, undefined);
});
