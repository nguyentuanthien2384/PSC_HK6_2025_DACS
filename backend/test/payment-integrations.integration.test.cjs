const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

if (process.env.RUN_DB_TESTS !== 'true') {
    test('payment MySQL integration (opt in with RUN_DB_TESTS=true and isolated TEST_DB_*)', { skip: true }, () => {});
} else {
    const required = ['TEST_DB_HOST', 'TEST_DB_PORT', 'TEST_DB_DATABASE_NAME', 'TEST_DB_USERNAME', 'TEST_DB_PASSWORD'];
    if (process.env.NODE_ENV !== 'test' || !/test|integration/i.test(process.env.TEST_DB_DATABASE_NAME || '') || required.some(name => process.env[name] === undefined)) {
        throw new Error('Payment integration requires NODE_ENV=test and explicit TEST_DB_* for a dedicated migrated test/integration database. No application database fallback is permitted.');
    }
    // All provider responses below are injected, never real transactions or secrets.
    process.env.JWT_SECRET = 'payment-integration-only-secret-at-least-32-characters';
    process.env.CORS_ORIGINS = 'http://localhost:3000';
    process.env.VNP_TMNCODE = 'TESTCODE';
    process.env.VNP_HASHSECRET = 'payment-integration-only-signing-secret';
    for (const name of ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'EMAIL_APP', 'EMAIL_APP_PASSWORD']) process.env[name] = '';
    require('@babel/register')({ cache: false });
    const db = require('../src/models');
    const { createApp } = require('../src/app');
    const CommonUtils = require('../src/utils/CommonUtils');
    const { createCommerceService } = require('../src/services/commerceService');
    const { createPaymentGatewayService } = require('../src/services/paymentGatewayService');
    const { signVnpay } = require('../src/utils/commerce');
    const commerce = createCommerceService(db);
    let server, base;
    before(async () => {
        await db.sequelize.authenticate();
        for (const [code, value, type] of [
            ['S1', 'Hoạt động', 'STATUS'], ['S3', 'Chờ xác nhận', 'STATUSORDER'], ['S6', 'Đã giao', 'STATUSORDER'],
            ['PAY_TEST_SIZE', 'M', 'SIZE'], ['PAY_TEST_CATEGORY', 'Áo', 'CATEGORY'], ['PAY_TEST_BRAND', 'Kiểm thử', 'BRAND']
        ]) await db.Allcode.findOrCreate({ where: { code }, defaults: { value, type } });
        server = createApp().listen(0, '127.0.0.1');
        await new Promise(resolve => server.once('listening', resolve));
        base = `http://127.0.0.1:${server.address().port}`;
    });
    after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await db.sequelize.close(); });
    async function call(path, actor, body) {
        const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: {
            ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {})
        }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { httpStatus: response.status, ...await response.json() };
    }
    function mockedGateway() {
        const queue = [], calls = [];
        const service = createPaymentGatewayService(db, { env: { VNP_TMNCODE: 'TESTCODE', VNP_HASHSECRET: process.env.VNP_HASHSECRET,
            PAYPAL_MODE: 'sandbox', PAYPAL_CLIENT_ID: 'test-only-client', PAYPAL_CLIENT_SECRET: 'test-only-secret', PAYPAL_WEBHOOK_ID: 'test-webhook' },
            fetch: async (url, init) => {
                calls.push({ url, init }); const item = queue.shift();
                if (item instanceof Error) throw item;
                if (item === undefined) throw new Error(`Unexpected provider call: ${url}`);
                const data = typeof item === 'function' ? item(JSON.parse(init.body || '{}')) : item;
                return { ok: true, status: 200, json: async () => data };
            }
        });
        return { service, queue, calls };
    }
    async function fixture(provider = 'vnpay', status = 'PENDING') {
        const tag = crypto.randomUUID();
        const users = [];
        for (const roleId of ['R1', 'R2']) {
            const user = await db.User.create({ email: `${tag}-${users.length}@example.com`, password: 'payment-fixture-hash', firstName: 'Payment', lastName: 'Test', roleId, statusId: 'S1', usertoken: '' });
            users.push({ id: user.id, roleId, token: CommonUtils.encodeToken(user.id, user.password) });
        }
        const [admin, buyer] = users;
        const address = await db.AddressUser.create({ userId: buyer.id, shipName: 'Payment buyer', shipAdress: '123 Test street', shipEmail: `${tag}@example.com`, shipPhonenumber: '0901234567' });
        const shipping = await db.TypeShip.create({ type: 'Payment integration', price: 20000 });
        const product = await db.Product.create({ name: `Payment ${tag}`, statusId: 'S1', categoryId: 'PAY_TEST_CATEGORY', brandId: 'PAY_TEST_BRAND', view: 0 });
        const detail = await db.ProductDetail.create({ productId: product.id, nameDetail: 'Xanh', originalPrice: 120000, discountPrice: 100000 });
        const variant = await db.ProductDetailSize.create({ productdetailId: detail.id, sizeId: 'PAY_TEST_SIZE' });
        const supplier = await db.Supplier.create({ name: `Payment supplier ${tag}`, address: 'Test', email: `${tag}@example.com`, phonenumber: '0901234567' });
        const receipt = await db.Receipt.create({ supplierId: supplier.id, userId: admin.id });
        await db.ReceiptDetail.create({ receiptId: receipt.id, productDetailSizeId: variant.id, quantity: 10, price: 60000 });
        await db.ShopCart.create({ userId: buyer.id, productdetailsizeId: variant.id, quantity: 2, statusId: 0 });
        const checkout = await commerce.transaction(tx => commerce.quote({ userId: buyer.id, addressUserId: address.id, typeShipId: shipping.id, arrDataShopCart: [{ productId: variant.id, quantity: 2 }] }, tx));
        const providerPaymentId = provider === 'paypal' ? `ORDER-${crypto.randomBytes(12).toString('hex')}` : null;
        const session = await db.PaymentSession.create({ id: crypto.randomUUID(), userId: buyer.id, provider, status, totalPrice: 220000,
            currency: provider === 'paypal' ? 'USD' : 'VND', providerAmount: provider === 'paypal' ? '8.80' : '22000000',
            gatewayApiVersion: provider === 'paypal' ? 'v2' : 'v1', providerPaymentId, checkoutData: JSON.stringify(checkout), expiresAt: new Date(Date.now() + 1800000) });
        return { admin, buyer, address, shipping, variant, session };
    }
    function notice(f, overrides = {}) {
        const params = { vnp_TmnCode: 'TESTCODE', vnp_TxnRef: f.session.id, vnp_Amount: '22000000', vnp_ResponseCode: '00', vnp_TransactionStatus: '00', vnp_TransactionNo: String(Date.now()) + String(Math.floor(Math.random() * 10)), ...overrides };
        return { ...params, vnp_SecureHash: signVnpay(params, process.env.VNP_HASHSECRET) };
    }
    function providerOrder(f, captureId) {
        return { id: f.session.providerPaymentId, status: 'COMPLETED', purchase_units: [{ custom_id: f.session.id, amount: { currency_code: 'USD', value: '8.80' },
            payments: { captures: [{ id: captureId, status: 'COMPLETED', amount: { currency_code: 'USD', value: '8.80' } }] } }] };
    }
    async function paidReturnFixture() {
        const f = await fixture('paypal');
        const captureId = `CAP-${crypto.randomBytes(12).toString('hex')}`;
        const gateway = mockedGateway(); gateway.queue.push({ access_token: 'test-token', expires_in: 3600 }, providerOrder(f, captureId));
        const completed = await gateway.service.completePaypal({ checkoutToken: f.session.id, userId: f.buyer.id, paymentId: f.session.providerPaymentId });
        assert.equal(completed.errCode, 0, completed.errMessage);
        const request = await db.ReturnRequest.create({ orderId: completed.orderId, activeOrderId: completed.orderId, userId: f.buyer.id,
            status: 'REFUND_PENDING', reason: 'Sai mô tả', amount: 220000, requestedAt: new Date(), receivedAt: new Date() });
        return { ...f, gateway, captureId, request, orderId: completed.orderId };
    }
    const refundPayload = (f, id, status) => ({ id, status, amount: { currency_code: 'USD', value: '8.80' }, links: [{ rel: 'up', href: `https://api.sandbox.paypal.com/v2/payments/captures/${f.captureId}` }] });
    test('public signed VNPay IPN persists one paid order across concurrent retries without a buyer browser', async () => {
        const f = await fixture(); const payload = notice(f);
        const replies = await Promise.all(Array.from({ length: 6 }, () => call(`/api/payments/vnpay/ipn?${new URLSearchParams(payload)}`)));
        assert.equal(replies.filter(row => row.RspCode === '00').length, 1, JSON.stringify(replies));
        assert.equal(replies.filter(row => row.RspCode === '02').length, 5);
        const session = await db.PaymentSession.findByPk(f.session.id); assert.equal(session.status, 'COMPLETED'); assert.ok(session.orderId);
        assert.equal(await db.OrderProduct.count({ where: { addressUserId: f.address.id } }), 1);
        assert.equal(await db.OrderEvent.count({ where: { orderId: session.orderId, type: 'ORDER_CREATED' } }), 1);
        assert.equal(await db.ShopCart.count({ where: { userId: f.buyer.id } }), 0);
        assert.equal(await commerce.availableStock(f.variant.id), 8);
    });
    test('IPN tampering and amount mismatch do not mutate persisted payment or stock', async () => {
        const f = await fixture(); const valid = notice(f);
        assert.equal((await call(`/api/payments/vnpay/ipn?${new URLSearchParams({ ...valid, vnp_Amount: '100' })}`)).RspCode, '97');
        assert.equal((await call(`/api/payments/vnpay/ipn?${new URLSearchParams(notice(f, { vnp_Amount: '100' }))}`)).RspCode, '04');
        assert.equal((await db.PaymentSession.findByPk(f.session.id)).status, 'PENDING');
        assert.equal(await db.OrderProduct.count({ where: { addressUserId: f.address.id } }), 0);
    });
    test('expired paid VNPay session retains settlement evidence without creating an order', async () => {
        const f = await fixture(); await f.session.update({ expiresAt: new Date(Date.now() - 60000) });
        assert.equal((await call(`/api/payments/vnpay/ipn?${new URLSearchParams(notice(f))}`)).RspCode, '00');
        const stored = await db.PaymentSession.findByPk(f.session.id);
        assert.equal(stored.status, 'REVIEW_REQUIRED'); assert.ok(stored.paidAt); assert.equal(JSON.parse(stored.gatewayOutcome).paid, true);
        assert.equal(stored.orderId, null); assert.equal(await commerce.availableStock(f.variant.id), 10);
    });
    test('payment staff routes enforce authorization and leave unconfigured online refunds unsettled', async () => {
        const f = await paidReturnFixture();
        assert.equal((await call('/api/payments/reconciliation')).httpStatus, 401);
        assert.equal((await call('/api/payments/reconciliation', f.buyer)).httpStatus, 403);
        const ledger = await call('/api/payments/reconciliation', f.admin); assert.equal(ledger.errCode, 0);
        assert.ok(ledger.data.every(row => row.checkoutData === undefined));
        const service = createPaymentGatewayService(db, { env: { PAYPAL_MODE: 'sandbox' }, fetch: async () => { throw new Error('Unconfigured providers must never be called'); } });
        const refund = await service.requestRefund({ orderId: f.orderId, refundKey: `return-request:${f.request.id}`, amountVnd: 220000, actorId: f.admin.id });
        assert.equal(refund.status, 'NOT_CONFIGURED');
        assert.equal((await db.ReturnRequest.findByPk(f.request.id)).status, 'REFUND_PENDING');
        assert.equal((await db.PaymentRefund.findByPk(refund.refundId)).completedAt, null);
        assert.equal(await db.OrderEvent.count({ where: { orderId: f.orderId, type: 'RETURN_REFUNDED' } }), 0);
    });
    test('real DB refund polling atomically synchronizes received return/event/notification only once', async () => {
        const f = await paidReturnFixture(); const providerRefundId = `REF-${crypto.randomBytes(12).toString('hex')}`;
        f.gateway.queue.push(refundPayload(f, providerRefundId, 'PENDING'), refundPayload(f, providerRefundId, 'COMPLETED'));
        const args = { orderId: f.orderId, refundKey: `return-request:${f.request.id}`, amountVnd: 220000, actorId: f.admin.id };
        const first = await f.gateway.service.requestRefund(args); assert.equal(first.status, 'PENDING');
        assert.equal((await db.ReturnRequest.findByPk(f.request.id)).status, 'REFUND_PENDING');
        assert.equal((await f.gateway.service.retryRefund(first.refundId, f.admin)).status, 'COMPLETED');
        await f.gateway.service.retryRefund(first.refundId, f.admin);
        const returned = await db.ReturnRequest.findByPk(f.request.id); assert.equal(returned.status, 'REFUNDED');
        assert.equal(returned.refundReference, providerRefundId); assert.equal(returned.refundProviderStatus, 'COMPLETED');
        assert.ok((await db.PaymentRefund.findByPk(first.refundId)).fulfillmentSyncedAt);
        assert.equal(await db.OrderEvent.count({ where: { orderId: f.orderId, type: 'RETURN_REFUNDED' } }), 1);
        assert.equal(await db.Notification.count({ where: { orderId: f.orderId, userId: f.buyer.id, type: 'RETURN_REFUNDED' } }), 1);
        assert.equal(f.gateway.calls.filter(call => call.url.endsWith('/refund')).length, 1);
    });
    test('real DB concurrent refund requests reserve one budget and submit one provider refund', async () => {
        const f = await paidReturnFixture(); const providerRefundId = `REF-${crypto.randomBytes(12).toString('hex')}`;
        f.gateway.queue.push(refundPayload(f, providerRefundId, 'COMPLETED'));
        const args = { orderId: f.orderId, refundKey: `return-request:${f.request.id}`, amountVnd: 220000, actorId: f.admin.id };
        const results = await Promise.all(Array.from({ length: 6 }, () => f.gateway.service.requestRefund(args)));
        assert.ok(results.every(row => row.errCode === 0), JSON.stringify(results));
        assert.equal(new Set(results.map(row => row.refundId)).size, 1);
        assert.equal(await db.PaymentRefund.count({ where: { sessionId: f.session.id } }), 1);
        assert.equal(f.gateway.calls.filter(call => call.url.endsWith('/refund')).length, 1);
        assert.equal((await db.ReturnRequest.findByPk(f.request.id)).status, 'REFUNDED');
    });
}
