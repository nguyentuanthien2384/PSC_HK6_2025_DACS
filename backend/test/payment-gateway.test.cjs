const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { createPaymentGatewayService, signVnpayApi, verifyVnpayApi, VNP_RESPONSE, VNP_QUERY_REQUEST, VNP_REFUND_REQUEST, sameAmount } = require('../src/services/paymentGatewayService');
const { signVnpay, CommerceError } = require('../src/utils/commerce');

const clock = new Date('2026-10-12T09:00:00Z');
const ID = 'b4736252-181b-446a-a739-792a46fcaf55';
const env = { VNP_TMNCODE: 'TESTCODE', VNP_HASHSECRET: 'test-only-never-merchant-secret', PAYPAL_MODE: 'sandbox', PAYPAL_CLIENT_ID: 'test-client', PAYPAL_CLIENT_SECRET: 'test-secret', PAYPAL_WEBHOOK_ID: 'test-webhook' };
const staff = { id: 1, roleId: 'R1' };
function matches(row, where = {}) {
    return Object.keys(where).every(key => {
        const expected = where[key];
        if (expected && typeof expected === 'object') {
            if (expected[Op.in]) return expected[Op.in].includes(row[key]);
            if (expected[Op.ne] !== undefined) return row[key] !== expected[Op.ne];
        }
        return String(row[key]) === String(expected);
    });
}
function fixture(overrides = {}, options = {}) {
    const sessions = [{ id: ID, provider: 'vnpay', userId: 2, currency: 'VND', providerAmount: '22000000', totalPrice: 220000,
        status: 'PENDING', providerPaymentId: null, orderId: null, expiresAt: new Date(clock.getTime() + 30 * 60000), createdAt: clock,
        checkoutData: JSON.stringify({ userId: 2, addressUserId: 3, totalPrice: 220000, subtotal: 200000, lines: [{ productId: 4, quantity: 2 }] }), ...overrides }];
    const refunds = [], orders = [], calls = [];
    let tail = Promise.resolve();
    const model = rows => ({
        async findOne({ where, raw }) { const row = rows.find(row => matches(row, where)); return row ? (raw ? { ...row } : row) : null; },
        async findAll({ where }) { return rows.filter(row => matches(row, where)).map(row => ({ ...row })); },
        async findAndCountAll({ where }) { const found = rows.filter(row => matches(row, where)); return { rows: found.map(row => ({ ...row })), count: found.length }; },
        async create(data) { const row = { ...data, createdAt: clock, save: async () => {} }; rows.push(row); return row; },
        async update(data, { where }) { rows.filter(row => matches(row, where)).forEach(row => Object.assign(row, data)); }
    });
    sessions.forEach(row => row.save = async () => {});
    const db = { PaymentSession: model(sessions), PaymentRefund: model(refunds), OrderProduct: model(orders),
        AddressUser: { findOne: async () => options.noAddress ? null : { id: 3, userId: 2 } } };
    const commerce = {
        transaction: async work => { let release; const previous = tail; tail = new Promise(resolve => release = resolve); await previous; try { return await work({ LOCK: { UPDATE: 'UPDATE' } }); } finally { release(); } },
        lockOptions: tx => ({ transaction: tx, lock: tx.LOCK.UPDATE }),
        checkStock: async () => { if (options.noStock) throw new CommerceError('Hết tồn kho.', 2); },
        checkVoucher: async () => { if (options.noVoucher) throw new CommerceError('Voucher hết hiệu lực.', 2); },
        persistOrder: async checkout => { const order = { id: orders.length + 1, isPaymentOnlien: 1, totalPrice: checkout.totalPrice }; orders.push(order); return { errCode: 0, orderId: order.id, data: order }; }
    };
    const queue = [];
    const fetch = async (url, request) => {
        calls.push({ url, request });
        const next = queue.shift();
        if (next instanceof Error) throw next;
        const body = typeof next === 'function' ? next(url, request) : next;
        if (body === undefined) throw new Error('Unexpected network call');
        return { ok: true, status: 200, json: async () => body };
    };
    const service = createPaymentGatewayService(db, { commerce, env: { ...env, ...(options.env || {}) }, now: () => clock, fetch });
    return { service, sessions, refunds, orders, queue, calls };
}
function notice(data = {}) {
    const params = { vnp_TmnCode: env.VNP_TMNCODE, vnp_TxnRef: ID, vnp_Amount: '22000000', vnp_ResponseCode: '00', vnp_TransactionStatus: '00', vnp_TransactionNo: '123456789', ...data };
    return { ...params, vnp_SecureHash: signVnpay(params, env.VNP_HASHSECRET) };
}
const paypalSession = { provider: 'paypal', providerPaymentId: 'PAY-TEST', providerAmount: '8.80', currency: 'USD' };
function payment(data = {}) {
    return { id: 'PAY-TEST', state: 'approved', transactions: [{ custom: ID, amount: { total: '8.80', currency: 'USD' }, related_resources: [{ sale: { id: 'SALE-TEST', state: 'completed', amount: { total: '8.80', currency: 'USD' } } }] }], ...data };
}
const headers = { 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/test', 'paypal-transmission-id': 'test-transmission', 'paypal-transmission-sig': 'test-signature', 'paypal-transmission-time': clock.toISOString() };
const event = { id: 'EVENT-TEST', event_type: 'PAYMENT.SALE.COMPLETED', resource: { id: 'SALE-TEST', parent_payment: 'FORGED-PAYMENT' } };
const token = { access_token: 'test-token', expires_in: 3600 };
function apiResponse(command, overrides = {}) {
    const data = { vnp_ResponseId: 'test-response', vnp_Command: command, vnp_TmnCode: env.VNP_TMNCODE, vnp_TxnRef: ID, vnp_Amount: '22000000', vnp_ResponseCode: '00', vnp_Message: 'Success', vnp_BankCode: 'NCB', vnp_PayDate: '20261012160000', vnp_TransactionNo: '987654321', vnp_TransactionType: command === 'refund' ? '02' : '01', vnp_TransactionStatus: '00', vnp_OrderInfo: 'test refund', ...overrides };
    return { ...data, vnp_SecureHash: signVnpayApi(data, command === 'querydr' ? [...VNP_RESPONSE, 'vnp_PromotionCode', 'vnp_PromotionAmount'] : VNP_RESPONSE, env.VNP_HASHSECRET) };
}

test('VNPay IPN rejects tampered signatures, merchant mismatch and duplicated query fields before mutation', async () => {
    const f = fixture();
    assert.equal((await f.service.vnpayIpn({ ...notice(), vnp_Amount: '1' })).RspCode, '97');
    assert.equal((await f.service.vnpayIpn(notice({ vnp_TmnCode: 'OTHER' }))).RspCode, '97');
    assert.equal((await f.service.vnpayIpn({ ...notice(), vnp_Amount: ['22000000', '1'] })).RspCode, '97');
    assert.equal(f.orders.length, 0); assert.equal(f.sessions[0].status, 'PENDING');
});
test('VNPay IPN responds with documented unknown-session and amount error codes', async () => {
    const f = fixture();
    assert.equal((await f.service.vnpayIpn(notice({ vnp_TxnRef: 'unknown-id' }))).RspCode, '01');
    assert.equal((await f.service.vnpayIpn(notice({ vnp_Amount: '22000100' }))).RspCode, '04');
    assert.equal(f.orders.length, 0);
});
test('VNPay IPN needs no browser or customer token and replay creates exactly one order', async () => {
    const f = fixture();
    const result = await Promise.all(Array.from({ length: 8 }, () => f.service.vnpayIpn(notice())));
    assert.equal(result.filter(row => row.RspCode === '00').length, 1);
    assert.equal(result.filter(row => row.RspCode === '02').length, 7);
    assert.equal(f.orders.length, 1); assert.equal(f.sessions[0].status, 'COMPLETED');
    assert.equal(JSON.parse(f.sessions[0].gatewayOutcome).source, 'ipn');
});
test('browser return and IPN share one finalizer; customer ownership remains enforced', async () => {
    const f = fixture();
    const other = await f.service.completeVnpay({ ...notice(), checkoutToken: ID, userId: 999 });
    assert.equal(other.errCode, 403);
    await f.service.vnpayIpn(notice());
    const result = await f.service.completeVnpay({ ...notice(), checkoutToken: ID, userId: 2 });
    assert.equal(result.errCode, 0); assert.equal(result.orderId, 1); assert.equal(f.orders.length, 1);
});
test('a different transaction number cannot replay a previously paid session', async () => {
    const f = fixture(); await f.service.vnpayIpn(notice());
    assert.equal((await f.service.vnpayIpn(notice({ vnp_TransactionNo: '111111' }))).RspCode, '99');
    assert.equal(f.orders.length, 1);
});
test('expired captured money is retained for review instead of disappearing or creating a late order', async () => {
    const f = fixture({ expiresAt: new Date(clock.getTime() - 60000) });
    assert.equal((await f.service.vnpayIpn(notice())).RspCode, '00');
    assert.equal(f.sessions[0].status, 'REVIEW_REQUIRED'); assert.equal(f.orders.length, 0);
    assert.equal(JSON.parse(f.sessions[0].gatewayOutcome).paid, true); assert.ok(f.sessions[0].paidAt);
    const customer = await f.service.completeVnpay({ ...notice(), userId: 2, checkoutToken: ID });
    assert.equal(customer.status, 'REVIEW_REQUIRED'); assert.equal(customer.errCode, 2);
});
for (const option of ['noStock', 'noAddress', 'noVoucher']) test(`captured payment retains evidence when fulfillment fails (${option})`, async () => {
    const f = fixture({}, { [option]: true });
    assert.equal((await f.service.vnpayIpn(notice())).RspCode, '00');
    assert.equal(f.sessions[0].status, 'REVIEW_REQUIRED'); assert.ok(f.sessions[0].paidAt); assert.equal(f.orders.length, 0);
});
test('failed gateway result never becomes a paid order or overwrites existing paid evidence', async () => {
    const f = fixture();
    const failed = notice({ vnp_ResponseCode: '24', vnp_TransactionStatus: '02', vnp_TransactionNo: '0' });
    assert.equal((await f.service.vnpayIpn(failed)).RspCode, '00'); assert.equal(f.sessions[0].status, 'FAILED'); assert.equal(f.orders.length, 0);
    await f.service.vnpayIpn(notice());
    assert.equal(f.sessions[0].status, 'REVIEW_REQUIRED');
    await f.service.vnpayIpn(failed);
    assert.equal(JSON.parse(f.sessions[0].gatewayOutcome).paid, true);
});
test('VNPay querydr request and response use provider pipe-field signatures, never IPN encoding', async () => {
    const f = fixture(); f.queue.push(apiResponse('querydr'));
    const result = await f.service.reconcileSession(ID, staff);
    assert.equal(result.errCode, 0); assert.equal(f.orders.length, 1);
    const body = JSON.parse(f.calls[0].request.body);
    assert.equal(body.vnp_SecureHash, signVnpayApi(body, VNP_QUERY_REQUEST, env.VNP_HASHSECRET));
    assert.equal(body.vnp_TransactionDate, '20261012160000');
    assert.equal(verifyVnpayApi(apiResponse('querydr'), 'querydr', env.VNP_HASHSECRET), true);
});
test('a forged querydr success never creates an order', async () => {
    const f = fixture(); f.queue.push({ ...apiResponse('querydr'), vnp_Amount: '1' });
    assert.equal((await f.service.reconcileSession(ID, staff)).errCode, 3); assert.equal(f.orders.length, 0);
});
test('PayPal signature is verified remotely with registered webhook ID before authoritative sale and payment reads', async () => {
    const f = fixture(paypalSession);
    f.queue.push(token, { verification_status: 'SUCCESS' }, { id: 'SALE-TEST', state: 'completed', parent_payment: 'PAY-TEST' }, payment());
    const result = await f.service.paypalWebhook(headers, event);
    assert.equal(result.errCode, 0); assert.equal(f.orders.length, 1); assert.equal(f.sessions[0].gatewaySaleId, 'SALE-TEST');
    const verify = JSON.parse(f.calls[1].request.body);
    assert.equal(verify.webhook_id, env.PAYPAL_WEBHOOK_ID); assert.deepEqual(verify.webhook_event, event);
    assert.match(f.calls[2].url, /\/sale\/SALE-TEST$/); assert.match(f.calls[3].url, /\/payment\/PAY-TEST$/);
});
test('PayPal invalid webhook signature does not read sale, mutate payment or trust resource metadata', async () => {
    const f = fixture(paypalSession); f.queue.push(token, { verification_status: 'FAILURE' });
    await assert.rejects(f.service.paypalWebhook(headers, event), error => error.errCode === 403);
    assert.equal(f.calls.length, 2); assert.equal(f.orders.length, 0); assert.equal(f.sessions[0].status, 'PENDING');
});
test('PayPal missing registered webhook ID fails closed without calls', async () => {
    const f = fixture(paypalSession, { env: { PAYPAL_WEBHOOK_ID: '' } });
    await assert.rejects(f.service.paypalWebhook(headers, event), error => error.errCode === 3); assert.equal(f.calls.length, 0);
});
test('PayPal payer approval alone does not count as completed sale', async () => {
    const f = fixture(paypalSession);
    f.queue.push(token, payment({ transactions: [{ custom: ID, amount: { total: '8.80', currency: 'USD' }, related_resources: [] }] }));
    const result = await f.service.completePaypal({ checkoutToken: ID, userId: 2, paymentId: 'PAY-TEST', PayerID: 'PAYER' });
    assert.equal(result.errCode, 3); assert.equal(f.orders.length, 0);
});
test('PayPal amount and currency are fixed by checkout and reject modified provider payload', async () => {
    const f = fixture(paypalSession);
    const p = payment(); p.transactions[0].amount.currency = 'EUR';
    f.queue.push(token, p);
    assert.equal((await f.service.completePaypal({ checkoutToken: ID, userId: 2, paymentId: 'PAY-TEST', PayerID: 'PAYER' })).errCode, 3);
    assert.equal(f.orders.length, 0);
});
test('PayPal executes approved payer with durable session request id and callback replay avoids second execution', async () => {
    const f = fixture(paypalSession);
    f.queue.push(token, payment({ state: 'created' }), payment(), payment());
    const args = { checkoutToken: ID, userId: 2, paymentId: 'PAY-TEST', PayerID: 'PAYER' };
    assert.equal((await f.service.completePaypal(args)).errCode, 0);
    assert.equal((await f.service.completePaypal(args)).orderId, 1);
    assert.equal(f.calls[2].request.headers['PayPal-Request-Id'], ID); assert.equal(f.orders.length, 1);
});
const paidPaypal = { ...paypalSession, orderId: 7, status: 'COMPLETED', paidAt: clock, gatewaySaleId: 'SALE-TEST' };
const refundArgs = { orderId: 7, refundKey: 'return-request:9', actorId: 1, reason: 'Hang khong dung mo ta' };
test('PayPal refund is idempotent, uses captured currency/amount, and needs settled provider result', async () => {
    const f = fixture(paidPaypal); f.queue.push(token, { id: 'REFUND-TEST', sale_id: 'SALE-TEST', state: 'completed', amount: { total: '8.80', currency: 'USD' } });
    const first = await f.service.requestRefund(refundArgs), repeated = await f.service.requestRefund(refundArgs);
    assert.equal(first.status, 'COMPLETED'); assert.equal(first.providerRefundId, 'REFUND-TEST');
    assert.equal(repeated.refundId, first.refundId); assert.equal(f.refunds.length, 1); assert.equal(f.calls.length, 2);
    assert.deepEqual(JSON.parse(f.calls[1].request.body).amount, { total: '8.80', currency: 'USD' });
    assert.equal(f.calls[1].request.headers['PayPal-Request-Id'], f.refunds[0].requestId);
});
test('provider pending refund remains pending and retry reads refund instead of issuing another refund', async () => {
    const f = fixture(paidPaypal); f.queue.push(token, { id: 'REFUND-TEST', sale_id: 'SALE-TEST', state: 'pending', amount: { total: '8.80', currency: 'USD' } }, { id: 'REFUND-TEST', sale_id: 'SALE-TEST', state: 'completed', amount: { total: '8.80', currency: 'USD' } });
    const first = await f.service.requestRefund(refundArgs);
    assert.equal(first.status, 'PENDING'); assert.equal(f.refunds[0].completedAt, undefined);
    assert.equal((await f.service.retryRefund(first.refundId, staff)).status, 'COMPLETED');
    assert.match(f.calls[2].url, /\/refund\/REFUND-TEST$/); assert.equal(f.calls[2].request.method, 'GET');
});
test('unknown PayPal refund result stays review-required and safe retry uses identical idempotency key', async () => {
    const f = fixture(paidPaypal); f.queue.push(token, new Error('network timeout'), { id: 'REFUND-TEST', sale_id: 'SALE-TEST', state: 'completed', amount: { total: '8.80', currency: 'USD' } });
    const first = await f.service.requestRefund(refundArgs); assert.equal(first.status, 'REVIEW_REQUIRED');
    const repeated = await f.service.retryRefund(first.refundId, staff); assert.equal(repeated.status, 'COMPLETED');
    assert.equal(f.calls[1].request.headers['PayPal-Request-Id'], f.calls[2].request.headers['PayPal-Request-Id']);
});
test('different refund keys cannot exceed captured amount; customer cannot retry', async () => {
    const f = fixture(paidPaypal); f.queue.push(token, { id: 'REFUND-TEST', sale_id: 'SALE-TEST', state: 'pending', amount: { total: '8.80', currency: 'USD' } });
    const first = await f.service.requestRefund(refundArgs);
    assert.equal((await f.service.requestRefund({ ...refundArgs, refundKey: 'another-refund' })).errCode, 2);
    assert.equal((await f.service.retryRefund(first.refundId, { id: 2, roleId: 'R2' })).errCode, 403);
});
test('missing provider credentials never report a refund or issue network calls', async () => {
    const f = fixture(paidPaypal, { env: { PAYPAL_CLIENT_SECRET: '' } });
    assert.equal((await f.service.requestRefund(refundArgs)).status, 'NOT_CONFIGURED');
    assert.equal(f.calls.length, 0); assert.equal(f.refunds[0].completedAt, undefined);
});
test('VNPay refund requires signed exact refund result, not merely accepted request', async () => {
    const f = fixture({ status: 'COMPLETED', orderId: 7, paidAt: clock, providerPaymentId: 'vnpay:123456789' });
    f.queue.push(apiResponse('refund', { vnp_TransactionStatus: '05' }), apiResponse('querydr', { vnp_TransactionType: '02' }));
    const first = await f.service.requestRefund(refundArgs); assert.equal(first.status, 'PENDING'); assert.equal(f.refunds[0].completedAt, undefined);
    const body = JSON.parse(f.calls[0].request.body);
    assert.equal(body.vnp_SecureHash, signVnpayApi(body, VNP_REFUND_REQUEST, env.VNP_HASHSECRET));
    assert.equal((await f.service.retryRefund(first.refundId, staff)).status, 'COMPLETED');
    assert.equal(JSON.parse(f.calls[1].request.body).vnp_Command, 'querydr');
});
test('VNPay timeout queries on retry and never blindly sends a second refund', async () => {
    const f = fixture({ status: 'COMPLETED', orderId: 7, paidAt: clock, providerPaymentId: 'vnpay:123456789' });
    f.queue.push(new Error('network timeout'), apiResponse('querydr'));
    const first = await f.service.requestRefund(refundArgs); assert.equal(first.status, 'REVIEW_REQUIRED');
    assert.equal((await f.service.retryRefund(first.refundId, staff)).status, 'REVIEW_REQUIRED');
    assert.equal(f.calls.filter(call => JSON.parse(call.request.body).vnp_Command === 'refund').length, 1);
});
test('orphan paid session can be refunded after expiry without inventing an order', async () => {
    const f = fixture({ expiresAt: new Date(clock.getTime() - 60000) }); await f.service.vnpayIpn(notice());
    f.queue.push(apiResponse('refund'));
    assert.equal((await f.service.refundSession({ sessionId: ID, reason: 'Phien het han, khach yeu cau hoan' }, staff)).status, 'COMPLETED');
    assert.equal(f.sessions[0].status, 'REFUNDED'); assert.equal(f.orders.length, 0);
    assert.equal(f.refunds[0].orderId, null);
});
test('staff listings exclude checkout contents and enforce role', async () => {
    const f = fixture();
    assert.equal((await f.service.getReconciliation({}, { id: 2, roleId: 'R2' })).errCode, 403);
    assert.equal((await f.service.getRefunds({}, { id: 2, roleId: 'R2' })).errCode, 403);
    // Model query projection is intentionally covered through captured query contract.
    let args; f.service = createPaymentGatewayService({ PaymentSession: { findAndCountAll: async input => { args = input; return { rows: [], count: 0 }; } } }, { env });
    assert.equal((await f.service.getReconciliation({}, staff)).errCode, 0);
    assert.ok(args.attributes.exclude.includes('checkoutData'));
});
test('amount comparison cannot accept exponent notation, NaN or float rounding tampering', () => {
    assert.equal(sameAmount('8.80', '8.8', 'USD'), true);
    assert.equal(sameAmount('8.801', '8.80', 'USD'), false);
    assert.equal(sameAmount('22e6', '22000000', 'VND'), false);
    assert.equal(sameAmount('NaN', '8.80', 'USD'), false);
});
