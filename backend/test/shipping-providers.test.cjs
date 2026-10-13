const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createShippingProviderService, shippingState } = require('../src/services/shippingProviderService');
const admin = { id: 1, roleId: 'R1' };
const body = { orderId: 10, provider: 'ghn', parcel: { weight: 600, length: 25, width: 20, height: 10 }, destination: { province: 'Hồ Chí Minh', ward: 'Phường Sài Gòn' }, cod_amount: 1 };
function fixture({ provider = 'ghn', paid = false, fetchImpl, orderOverrides = {} } = {}) {
    const state = { order: { id: 10, addressUserId: 20, statusId: 'S4', totalPrice: 220000, subtotal: 200000, shippingFee: 20000, isPaymentOnlien: paid ? 1 : 0, shipperId: null, deliveryProvider: 'internal', ...orderOverrides }, shipments: [], events: [] };
    let queue = Promise.resolve(), calls = [];
    const model = object => ({ ...object, async save() { Object.assign(object, Object.fromEntries(Object.entries(this).filter(([, v]) => typeof v !== 'function'))); }, get() { return { ...object }; } });
    const match = (row, where) => Object.entries(where || {}).every(([key, value]) => String(row[key]) === String(value));
    const db = {
        sequelize: { async transaction(options, work) { const before = queue; let release; queue = new Promise(resolve => { release = resolve; }); await before; try { return await work({ LOCK: { UPDATE: 'UPDATE' } }); } finally { release(); } } },
        OrderProduct: { async findOne({ where, raw }) { return match(state.order, where) ? raw ? { ...state.order } : model(state.order) : null; } },
        Shipment: { async findOne({ where, raw }) { const row = state.shipments.find(item => match(item, where)); return row ? raw ? { ...row } : model(row) : null; }, async create(values) { const row = { id: state.shipments.length + 1, ...values }; state.shipments.push(row); return model(row); }, async update(values, { where }) { for (const row of state.shipments.filter(item => match(item, where))) Object.assign(row, values); } },
        AddressUser: { async findOne() { return { id: 20, userId: 2, shipName: 'Khách thử', shipPhonenumber: '0901234567', shipAdress: '12 Nguyễn Huệ' }; } },
        OrderDetail: { async findAll() { return [{ productId: 30, quantity: 2, realPrice: 100000 }]; } },
        ProductDetailSize: { async findOne() { return { id: 30, productdetailId: 40 }; } }, ProductDetail: { async findOne() { return { id: 40, productId: 50, nameDetail: 'Màu xanh' }; } }, Product: { async findOne() { return { id: 50, name: 'Áo cotton' }; } },
        OrderEvent: { async create(values) { const row = { id: state.events.length + 1, ...values }; state.events.push(row); return row; } },
    };
    const env = { GHN_TOKEN: 'test-token', GHN_SHOP_ID: '123', GHN_WEBHOOK_SECRET: 'unit-test-hook-secret-at-least-24', GHTK_TOKEN: 'test-token', SHIPPING_PICK_NAME: 'Kho thử', SHIPPING_PICK_PHONE: '0901234567', SHIPPING_PICK_ADDRESS: '12 Hàng Bông', SHIPPING_PICK_PROVINCE: 'Hà Nội', SHIPPING_PICK_WARD: 'Phường Hoàn Kiếm' };
    const fetchMock = async (url, options) => {
        calls.push({ url, options });
        if (fetchImpl) return fetchImpl(url, options, state);
        return { ok: true, status: 200, json: async () => provider === 'ghn' ? { code: 200, data: { order_code: 'GHN123', total_fee: 30000, status: 'ready_to_pick' } } : { success: true, order: { label: 'GHTK123', fee: 28000, status_id: 2 } } };
    };
    return { state, db, calls, env, service: createShippingProviderService(db, { env, fetchImpl: fetchMock }) };
}
test('providers default to sandbox and absent credentials cannot issue bookings or expose keys', async () => {
    const s = createShippingProviderService({}, { env: {}, fetchImpl: () => assert.fail('unconfigured provider must not call network') });
    const result = await s.providers();
    assert.equal(result.data[1].environment, 'sandbox'); assert.equal(result.data[2].supportsSandbox, true);
    assert.ok(result.data.slice(1).every(row => !row.configured && !('token' in row)));
    assert.equal((await s.book(body, admin)).errCode, 3);
});
test('only staff book valid unassigned ready orders; boolean IDs and invalid parcels are rejected', async () => {
    const f = fixture();
    assert.equal((await f.service.book(body, { id: 2, roleId: 'R2' })).errCode, 403);
    for (const data of [{ ...body, orderId: true }, { ...body, parcel: { ...body.parcel, weight: -1 } }, { ...body, destination: {} }]) assert.notEqual((await f.service.book(data, admin)).errCode, 0);
    assert.equal(f.calls.length, 0); assert.equal(f.state.shipments.length, 0);
});
test('GHN books a real API payload with stored receiver/items/amount and seller-paid shipping', async () => {
    const f = fixture(); const result = await f.service.book(body, admin);
    assert.equal(result.errCode, 0); assert.equal(result.data.trackingCode, 'GHN123'); assert.equal(result.data.environment, 'sandbox');
    const payload = JSON.parse(f.calls[0].options.body);
    assert.ok(f.calls[0].url.startsWith('https://dev-online-gateway.ghn.vn/'));
    assert.equal(payload.cod_amount, 220000); assert.equal(payload.payment_type_id, 1); assert.equal(payload.to_name, 'Khách thử'); assert.equal(payload.is_new_to_address, true);
    assert.equal(payload.items[0].quantity, 2); assert.equal(payload.items[0].price, 100000);
    assert.equal(f.state.order.statusId, 'S4'); assert.equal(f.state.order.deliveryProvider, 'ghn'); assert.equal(f.state.events.length, 1);
    assert.equal(result.data.requestData, undefined); assert.equal((await f.service.book(body, admin)).errCode, 0); assert.equal(f.calls.length, 1);
});
test('GHTK uses staging, kilograms and zero collection for online-paid orders', async () => {
    const f = fixture({ provider: 'ghtk', paid: true }); const result = await f.service.book({ ...body, provider: 'ghtk' }, admin);
    assert.equal(result.errCode, 0);
    const payload = JSON.parse(f.calls[0].options.body);
    assert.ok(f.calls[0].url.startsWith('https://services-staging.ghtklab.com/'));
    assert.equal(payload.order.pick_money, 0); assert.equal(payload.order.is_freeship, 1); assert.equal(payload.order.total_weight, 0.6);
    assert.equal(payload.products[0].weight, 0.3); assert.equal(payload.order.id, f.state.shipments[0].clientOrderCode);
});
test('concurrent booking keeps one durable shipment and sends one provider request', async () => {
    let reply; const f = fixture({ fetchImpl: () => new Promise(resolve => { reply = resolve; }) });
    const first = f.service.book(body, admin);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await f.service.book(body, admin)).errCode, 2);
    reply({ ok: true, status: 200, json: async () => ({ code: 200, data: { order_code: 'ONE', status: 'ready_to_pick' } }) });
    assert.equal((await first).errCode, 0); assert.equal(f.state.shipments.length, 1); assert.equal(f.calls.length, 1);
});
test('timeouts stay uncertain and cannot silently switch to own courier after failed recovery', async () => {
    let timeout = true;
    const f = fixture({ fetchImpl: async () => { if (timeout) throw new Error('timeout'); return { ok: false, status: 401, json: async () => ({ code: 401 }) }; } });
    assert.equal((await f.service.book(body, admin)).errCode, 3);
    const code = f.state.shipments[0].clientOrderCode;
    assert.equal(f.state.shipments[0].status, 'UNCERTAIN'); assert.equal(f.state.order.deliveryProvider, 'ghn');
    timeout = false; assert.equal((await f.service.book(body, admin)).errCode, 3);
    assert.equal(f.state.shipments[0].status, 'UNCERTAIN'); assert.equal(f.state.shipments[0].clientOrderCode, code); assert.equal(f.state.order.deliveryProvider, 'ghn');
});
test('webhook authenticates and re-queries carrier status instead of accepting forged delivered body', async () => {
    const f = fixture({ fetchImpl: async (url, options, state) => ({ ok: true, status: 200, json: async () => ({ code: 200, data: { order_code: 'GHN123', client_order_code: state.shipments[0].clientOrderCode, shop_id: 123, status: 'picked' } }) }) });
    f.state.shipments.push({ id: 1, orderId: 10, provider: 'ghn', environment: 'sandbox', clientOrderCode: 'DACS-test', trackingCode: 'GHN123', status: 'ready_to_pick' }); f.state.order.deliveryProvider = 'ghn';
    assert.equal((await f.service.webhook('ghn', { OrderCode: 'GHN123', Status: 'delivered' }, 'bad')).errCode, 403);
    assert.equal(f.calls.length, 0);
    assert.equal((await f.service.webhook('ghn', { OrderCode: 'GHN123', Status: 'delivered' }, f.env.GHN_WEBHOOK_SECRET)).errCode, 0);
    assert.equal(f.state.order.statusId, 'S5'); assert.equal(f.state.order.deliveredAt, undefined);
});
test('GHTK driver advisory statuses cannot mark delivery successful', () => {
    for (const status of [45, 49, 123, 410]) assert.equal(shippingState('ghtk', status), null);
    assert.equal(shippingState('ghtk', 5), 'S6'); assert.equal(shippingState('ghtk', 21), 'S9');
});
test('carrier cancellation response is checked before stock or business status changes', async () => {
    const f = fixture({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ code: 200, data: [{ order_code: 'GHN123', result: false }] }) }) });
    f.state.shipments.push({ id: 1, orderId: 10, provider: 'ghn', environment: 'sandbox', clientOrderCode: 'DACS-test', trackingCode: 'GHN123' });
    assert.equal((await f.service.cancel({ orderId: 10 }, admin)).errCode, 2); assert.equal(f.state.order.statusId, 'S4');
});
