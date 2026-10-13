const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

if (process.env.RUN_DB_TESTS !== 'true') {
    test('order operations MySQL integration (opt in with RUN_DB_TESTS=true and isolated TEST_DB_*)', { skip: true }, () => {});
} else {
    // Never fall back to the application's database and never reset an existing
    // schema. The caller supplies a separately migrated integration database.
    const required = ['TEST_DB_HOST', 'TEST_DB_PORT', 'TEST_DB_DATABASE_NAME', 'TEST_DB_USERNAME', 'TEST_DB_PASSWORD'];
    if (process.env.NODE_ENV !== 'test' || !/test|integration/i.test(process.env.TEST_DB_DATABASE_NAME || '') ||
        required.some(name => process.env[name] === undefined)) {
        throw new Error('Operations integration requires NODE_ENV=test and all TEST_DB_* variables for a dedicated test/integration database.');
    }
    process.env.JWT_SECRET = 'operations-integration-only-secret-at-least-32-characters';
    process.env.CORS_ORIGINS = 'http://localhost:3000';
    process.env.RETURN_WINDOW_DAYS = '7';
    process.env.DELIVERY_MAX_ATTEMPTS = '3';
    // These tests exercise real persistence and HTTP, with no remote money or
    // shipment requests. A missing merchant must keep online refunds pending.
    for (const name of ['VNP_TMNCODE', 'VNP_HASHSECRET', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'EMAIL_APP', 'EMAIL_APP_PASSWORD']) process.env[name] = '';
    require('@babel/register')({ cache: false });
    const db = require('../src/models');
    const { createApp } = require('../src/app');
    const CommonUtils = require('../src/utils/CommonUtils');
    const { createCommerceService } = require('../src/services/commerceService');
    const commerce = createCommerceService(db);
    const image = 'data:image/png;base64,aGVsbG8=';
    let server, base;
    before(async () => {
        await db.sequelize.authenticate();
        for (const [code, value, type] of [
            ['S1', 'Hoạt động', 'STATUS'], ['S3', 'Chờ xác nhận', 'STATUS-ORDER'], ['S4', 'Đã xác nhận', 'STATUS-ORDER'],
            ['S5', 'Đang giao', 'STATUS-ORDER'], ['S6', 'Đã giao', 'STATUS-ORDER'], ['S7', 'Đã hủy', 'STATUS-ORDER'],
            ['S8', 'Giao thất bại', 'STATUS-ORDER'], ['S9', 'Đang hoàn kho', 'STATUS-ORDER'], ['S10', 'Đã hoàn kho', 'STATUS-ORDER'],
            ['OPS_TEST_SIZE', 'M', 'SIZE'], ['OPS_TEST_CATEGORY', 'Áo', 'CATEGORY'], ['OPS_TEST_BRAND', 'Kiểm thử', 'BRAND']
        ]) await db.Allcode.findOrCreate({ where: { code }, defaults: { value, type } });
        server = createApp().listen(0, '127.0.0.1');
        await new Promise(resolve => server.once('listening', resolve));
        base = `http://127.0.0.1:${server.address().port}`;
    });
    after(async () => {
        if (server) await new Promise(resolve => server.close(resolve));
        await db.sequelize.close();
    });
    async function call(path, actor, body, method = body ? 'POST' : 'GET') {
        const response = await fetch(base + path, { method, headers: {
            ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {})
        }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { httpStatus: response.status, ...await response.json() };
    }
    const okay = result => { assert.equal(result.errCode, 0, result.errMessage); return result; };
    async function fixture(overrides = {}) {
        const tag = crypto.randomUUID();
        const users = [];
        for (const roleId of ['R1', 'R2', 'R3', 'R2']) {
            const user = await db.User.create({ email: `${tag}-${users.length}@example.com`, password: 'operations-fixture-password-hash',
                firstName: 'Operations', lastName: 'Test', roleId, statusId: 'S1', usertoken: '' });
            users.push({ id: user.id, roleId, token: CommonUtils.encodeToken(user.id, user.password) });
        }
        const [admin, buyer, courier, other] = users;
        const address = await db.AddressUser.create({ userId: buyer.id, shipName: 'Operations buyer', shipAdress: '123 Test street', shipEmail: `${tag}@example.com`, shipPhonenumber: '0901234567' });
        const shipping = await db.TypeShip.create({ type: 'Integration delivery', price: 20000 });
        const product = await db.Product.create({ name: `Operations ${tag}`, statusId: 'S1', categoryId: 'OPS_TEST_CATEGORY', brandId: 'OPS_TEST_BRAND', view: 0 });
        const detail = await db.ProductDetail.create({ productId: product.id, nameDetail: 'Xanh', originalPrice: 120000, discountPrice: 100000 });
        const variant = await db.ProductDetailSize.create({ productdetailId: detail.id, sizeId: 'OPS_TEST_SIZE' });
        const supplier = await db.Supplier.create({ name: `Operations supplier ${tag}`, address: 'Test street', email: `${tag}@example.com`, phonenumber: '0901234567' });
        const receipt = await db.Receipt.create({ supplierId: supplier.id, userId: admin.id });
        await db.ReceiptDetail.create({ receiptId: receipt.id, productDetailSizeId: variant.id, quantity: 10, price: 60000 });
        const order = await db.OrderProduct.create({ addressUserId: address.id, typeShipId: shipping.id,
            shipperId: courier.id, statusId: 'S6', isPaymentOnlien: 0, deliveryProvider: 'internal', deliveryAttempts: 0,
            subtotal: 200000, shippingFee: 20000, discountAmount: 0, totalPrice: 220000,
            deliveredAt: new Date(Date.now() - 86400000), ...overrides });
        await db.OrderDetail.create({ orderId: order.id, productId: variant.id, quantity: 2, realPrice: 100000 });
        return { admin, buyer, courier, other, order, variant, receipt };
    }
    async function shipReturn(f) {
        const created = okay(await call('/api/returns/request', f.buyer, { orderId: f.order.id, reason: 'Giao sai màu sản phẩm', evidence: image }));
        okay(await call('/api/returns/review', f.admin, { orderId: f.order.id, decision: 'APPROVE', note: 'Đã kiểm tra minh chứng' }));
        okay(await call('/api/returns/ship', f.buyer, { orderId: f.order.id, carrier: 'GHN', trackingNumber: `OPS-${created.data.id}` }));
        return created.data;
    }
    const receiveBody = f => ({ orderId: f.order.id, inspectionNote: 'Đã kiểm tra đủ sản phẩm nguyên vẹn', resellable: true });

    test('COD return HTTP flow persists one request, one warehouse credit and honest manual refund with owner-only notifications', async () => {
        const f = await fixture();
        assert.equal(await commerce.availableStock(f.variant.id), 8);
        const bodies = { orderId: f.order.id, reason: 'Sai màu sản phẩm', amount: 1, userId: f.other.id };
        assert.equal((await call('/api/returns/request', f.other, bodies)).httpStatus, 403);
        const concurrent = await Promise.all([1, 2].map(() => call('/api/returns/request', f.buyer, bodies)));
        assert.equal(concurrent.filter(result => result.errCode === 0).length, 1);
        const request = concurrent.find(result => result.errCode === 0).data;
        assert.equal(request.userId, f.buyer.id); assert.equal(Number(request.amount), 220000);
        assert.equal(await db.OrderEvent.count({ where: { orderId: f.order.id, type: 'RETURN_REQUESTED' } }), 1);
        assert.notEqual((await call('/api/returns/receive', f.admin, receiveBody(f))).errCode, 0);
        assert.equal((await call('/api/returns/review', f.buyer, { orderId: f.order.id, decision: 'APPROVE' })).httpStatus, 403);
        okay(await call('/api/returns/review', f.admin, { orderId: f.order.id, decision: 'APPROVE' }));
        const shipBody = { orderId: f.order.id, carrier: 'GHN', trackingNumber: `RET-${request.id}` };
        assert.equal((await call('/api/returns/ship', f.other, shipBody)).httpStatus, 403);
        okay(await call('/api/returns/ship', f.buyer, shipBody));
        const receipts = await Promise.all([1, 2].map(() => call('/api/returns/receive', f.admin, receiveBody(f))));
        receipts.forEach(okay);
        assert.equal(await db.InventoryAdjustment.count({ where: { orderId: f.order.id } }), 1);
        assert.equal(await commerce.availableStock(f.variant.id), 10);
        assert.equal((await db.ReturnRequest.findByPk(request.id)).status, 'REFUND_PENDING');
        assert.equal(await db.OrderEvent.count({ where: { orderId: f.order.id, type: 'RETURN_RECEIVED' } }), 1);
        assert.notEqual((await call('/api/returns/refund/manual', f.admin, { orderId: f.order.id, paymentReference: 'BANK-123' })).errCode, 0);
        const refunds = await Promise.all(['BANK-123', 'BANK-456'].map(paymentReference => call('/api/returns/refund/manual', f.admin,
            { orderId: f.order.id, paymentReference, paymentProof: image })));
        refunds.forEach(okay);
        const saved = await db.ReturnRequest.findByPk(request.id);
        assert.equal(saved.status, 'REFUNDED'); assert.equal(saved.refundMethod, 'manual'); assert.equal(saved.refundProof, image);
        assert.equal(await db.OrderEvent.count({ where: { orderId: f.order.id, type: 'REFUND_MANUALLY_CONFIRMED' } }), 1);
        // Returned stock still depends on the original intake. Deleting it
        // would remove stock and its cost source after a legitimate refund.
        const deletion = await call('/api/delete-receipt', f.admin, { id: f.receipt.id }, 'DELETE');
        assert.notEqual(deletion.errCode, 0, 'a fully restocked/refunded sale must retain its original receipt');
        assert.ok(await db.Receipt.findByPk(f.receipt.id));
        const intake = await db.ReceiptDetail.findOne({ where: { receiptId: f.receipt.id }, raw: true });
        assert.equal(intake.quantity, 10); assert.equal(Number(intake.price), 60000);
        assert.equal(await commerce.availableStock(f.variant.id), 10);
        const detail = okay(await call(`/api/get-detail-order?id=${f.order.id}`, f.buyer)).data;
        assert.equal(detail.returnRequest.id, request.id); assert.equal(detail.returnEligibility.canRequest, false);
        assert.ok(detail.events.some(event => event.type === 'REFUND_MANUALLY_CONFIRMED'));
        const inbox = okay(await call('/api/notifications?limit=100', f.buyer));
        const own = inbox.data.filter(row => row.orderId === f.order.id);
        assert.equal(own.length, 5); assert.ok(own.every(row => row.readAt === null));
        assert.equal(okay(await call('/api/notifications?limit=100', f.other)).data.some(row => row.orderId === f.order.id), false);
        const seen = await call('/api/notifications/read', f.other, { id: own[0].id });
        assert.notEqual(seen.errCode, 0); assert.equal((await db.Notification.findByPk(own[0].id)).readAt, null);
    });

    test('internal failure retries preserve stock until actual warehouse receipt; uncollected COD never invents a refund', async () => {
        const f = await fixture({ statusId: 'S5', deliveredAt: null });
        const failBody = { orderId: f.order.id, reason: 'Khách không nhận điện thoại' };
        assert.equal((await call('/api/shipping/fail', f.other, failBody)).httpStatus, 403);
        const attempts = await Promise.all([1, 2].map(() => call('/api/shipping/fail', f.courier, failBody)));
        attempts.forEach(okay);
        assert.equal((await db.OrderProduct.findByPk(f.order.id)).deliveryAttempts, 1);
        assert.equal(await commerce.availableStock(f.variant.id), 8);
        for (let attempt = 2; attempt <= 3; attempt++) {
            okay(await call('/api/shipping/retry', f.courier, { orderId: f.order.id }));
            okay(await call('/api/shipping/fail', f.courier, failBody));
        }
        assert.notEqual((await call('/api/shipping/retry', f.courier, { orderId: f.order.id })).errCode, 0);
        okay(await call('/api/shipping/return', f.courier, { orderId: f.order.id, reason: 'Đã hết số lần giao' }));
        assert.equal(await commerce.availableStock(f.variant.id), 8);
        assert.equal((await call('/api/shipping/return/receive', f.courier, receiveBody(f))).httpStatus, 403);
        const receipts = await Promise.all([1, 2].map(() => call('/api/shipping/return/receive', f.admin, receiveBody(f))));
        receipts.forEach(okay);
        assert.equal((await db.OrderProduct.findByPk(f.order.id)).statusId, 'S10');
        assert.equal(await commerce.availableStock(f.variant.id), 10);
        assert.equal(await db.InventoryAdjustment.count({ where: { orderId: f.order.id } }), 1);
        assert.equal(await db.ReturnRequest.count({ where: { orderId: f.order.id } }), 0);
        assert.equal(await db.OrderEvent.count({ where: { orderId: f.order.id, type: 'DELIVERY_FAILED' } }), 3);
        assert.equal(await db.OrderEvent.count({ where: { orderId: f.order.id, type: 'DELIVERY_RETURN_RECEIVED' } }), 1);
    });

    test('damaged returned products can be refunded after inspection without adding sellable stock', async () => {
        const f = await fixture(); const request = await shipReturn(f);
        okay(await call('/api/returns/receive', f.admin, { ...receiveBody(f), resellable: false, inspectionNote: 'Sản phẩm lỗi, không thể bán lại' }));
        assert.equal(await commerce.availableStock(f.variant.id), 8);
        assert.equal(await db.InventoryAdjustment.count({ where: { orderId: f.order.id } }), 0);
        okay(await call('/api/returns/refund/manual', f.admin, { orderId: f.order.id, paymentReference: 'BANK-DAMAGED', paymentProof: image }));
        assert.equal((await db.ReturnRequest.findByPk(request.id)).status, 'REFUNDED');
    });

    test('notification storage failure atomically rolls back real MySQL return receipt, timeline and inventory credit', async () => {
        const f = await fixture(); const request = await shipReturn(f);
        const beforeEvents = await db.OrderEvent.count({ where: { orderId: f.order.id } });
        const beforeNotifications = await db.Notification.count({ where: { orderId: f.order.id } });
        const original = db.Notification.bulkCreate;
        let result;
        try {
            db.Notification.bulkCreate = async () => { throw new Error('Injected operations notification failure'); };
            result = await call('/api/returns/receive', f.admin, receiveBody(f));
        } finally { db.Notification.bulkCreate = original; }
        assert.equal(result.httpStatus, 500);
        assert.equal((await db.ReturnRequest.findByPk(request.id)).status, 'SHIPPED');
        assert.equal(await db.InventoryAdjustment.count({ where: { orderId: f.order.id } }), 0);
        assert.equal(await db.OrderEvent.count({ where: { orderId: f.order.id } }), beforeEvents);
        assert.equal(await db.Notification.count({ where: { orderId: f.order.id } }), beforeNotifications);
        assert.equal(await commerce.availableStock(f.variant.id), 8);
        okay(await call('/api/returns/receive', f.admin, receiveBody(f)));
        assert.equal(await commerce.availableStock(f.variant.id), 10);
    });

    test('online refund URL identifies a return request; stale request and absent merchant cannot fabricate settlement', async () => {
        const f = await fixture({ isPaymentOnlien: 1 });
        const stale = okay(await call('/api/returns/request', f.buyer, { orderId: f.order.id, reason: 'Cần thêm minh chứng' })).data;
        okay(await call('/api/returns/review', f.admin, { orderId: f.order.id, decision: 'REJECT', note: 'Gửi lại ảnh đúng sản phẩm' }));
        const active = await shipReturn(f);
        okay(await call('/api/returns/receive', f.admin, receiveBody(f)));
        const sessionId = crypto.randomUUID();
        await db.PaymentSession.create({ id: sessionId, orderId: f.order.id, userId: f.buyer.id, provider: 'vnpay',
            providerPaymentId: `vnpay:${crypto.randomUUID()}`, status: 'COMPLETED', totalPrice: 220000, providerAmount: '22000000',
            currency: 'VND', checkoutData: '{}', expiresAt: new Date(), paidAt: new Date(), gatewayTransactionDate: '20261012120000' });
        assert.notEqual((await call(`/api/returns/${stale.id}/refund-online`, f.admin, {})).errCode, 0);
        assert.equal(await db.PaymentRefund.count({ where: { orderId: f.order.id } }), 0);
        assert.equal((await call('/api/returns/0/refund-online', f.admin, {})).httpStatus, 400);
        assert.equal((await call(`/api/returns/${active.id}/refund-online`, f.buyer, {})).httpStatus, 403);
        const pending = okay(await call(`/api/returns/${active.id}/refund-online`, f.admin, { orderId: -1 }));
        assert.equal(pending.data.status, 'REFUND_PENDING'); assert.equal(pending.data.refundedAt, null);
        assert.equal(pending.refund.status, 'NOT_CONFIGURED');
        okay(await call(`/api/returns/${active.id}/refund-online`, f.admin, {}));
        assert.equal(await db.PaymentRefund.count({ where: { orderId: f.order.id } }), 1);
        assert.equal((await db.ReturnRequest.findByPk(active.id)).status, 'REFUND_PENDING');
        assert.notEqual((await call('/api/returns/refund/manual', f.admin, { orderId: f.order.id, paymentReference: 'BANK-ONLINE', paymentProof: image })).errCode, 0);
    });

    test('carrier-managed orders refuse internal mutations but can be physically received with an honest prepaid refund pending', async () => {
        const f = await fixture({ statusId: 'S9', deliveryProvider: 'ghn', shipperId: null, isPaymentOnlien: 1, deliveredAt: null });
        for (const route of ['fail', 'retry', 'return']) {
            assert.notEqual((await call(`/api/shipping/${route}`, f.admin, { orderId: f.order.id, reason: 'Không nhận được hàng' })).errCode, 0);
        }
        okay(await call('/api/shipping/return/receive', f.admin, receiveBody(f)));
        okay(await call('/api/shipping/return/receive', f.admin, receiveBody(f)));
        assert.equal((await db.OrderProduct.findByPk(f.order.id)).statusId, 'S10');
        assert.equal(await commerce.availableStock(f.variant.id), 10);
        assert.equal(await db.InventoryAdjustment.count({ where: { orderId: f.order.id } }), 1);
        const request = await db.ReturnRequest.findOne({ where: { orderId: f.order.id }, raw: true });
        assert.equal(request.kind, 'UNDELIVERED'); assert.equal(request.status, 'REFUND_PENDING');
        assert.equal(Number(request.amount), 220000); assert.equal(request.refundedAt, null);
        assert.equal(await db.PaymentRefund.count({ where: { orderId: f.order.id } }), 0);
    });
}
