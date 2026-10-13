const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

if (process.env.RUN_DB_TESTS !== 'true') {
    test('shipping providers MySQL integration (opt in with RUN_DB_TESTS=true and isolated TEST_DB_*)', { skip: true }, () => {});
} else {
    const required = ['TEST_DB_HOST', 'TEST_DB_PORT', 'TEST_DB_DATABASE_NAME', 'TEST_DB_USERNAME', 'TEST_DB_PASSWORD'];
    if (process.env.NODE_ENV !== 'test' || !/test|integration/i.test(process.env.TEST_DB_DATABASE_NAME || '') || required.some(name => process.env[name] === undefined)) {
        throw new Error('Shipping integration requires NODE_ENV=test and all TEST_DB_* variables for a dedicated migrated test/integration database. Application database fallback is prohibited.');
    }
    // The actual database and transactions are exercised; every carrier call is
    // injected below, so these tests never book a parcel with an outside carrier.
    require('@babel/register')({ cache: false });
    const db = require('../src/models');
    const { createShippingProviderService } = require('../src/services/shippingProviderService');
    const { createDeliveryService } = require('../src/services/deliveryService');
    const delivery = createDeliveryService(db);
    const env = { GHN_MODE: 'sandbox', GHN_TOKEN: 'shipping-integration-only-token', GHN_SHOP_ID: '123',
        GHN_WEBHOOK_SECRET: 'shipping-integration-only-secret-at-least-24', GHTK_MODE: 'sandbox', GHTK_TOKEN: 'shipping-integration-only-token',
        GHTK_WEBHOOK_SECRET: 'ghtk-integration-only-secret-at-least-24',
        SHIPPING_PICK_NAME: 'Integration warehouse', SHIPPING_PICK_PHONE: '0901234567', SHIPPING_PICK_ADDRESS: '12 Hàng Bông',
        SHIPPING_PICK_PROVINCE: 'Hà Nội', SHIPPING_PICK_DISTRICT: 'Hoàn Kiếm', SHIPPING_PICK_WARD: 'Phường Hoàn Kiếm' };
    before(async () => {
        await db.sequelize.authenticate();
        for (const [code, value, type] of [
            ['S1', 'Hoạt động', 'STATUS'], ['S4', 'Đã xác nhận', 'STATUSORDER'], ['S5', 'Đang giao', 'STATUSORDER'], ['S6', 'Đã giao', 'STATUSORDER'],
            ['SHIP_TEST_SIZE', 'M', 'SIZE'], ['SHIP_TEST_CATEGORY', 'Áo', 'CATEGORY'], ['SHIP_TEST_BRAND', 'Kiểm thử', 'BRAND']
        ]) await db.Allcode.findOrCreate({ where: { code }, defaults: { value, type } });
    });
    after(async () => { await db.sequelize.close(); });
    const okay = result => { assert.equal(result.errCode, 0, result.errMessage); return result; };
    async function fixture(overrides = {}) {
        const tag = crypto.randomUUID();
        const users = [];
        for (const roleId of ['R1', 'R2', 'R3']) {
            const user = await db.User.create({ email: `${tag}-${users.length}@example.com`, password: 'shipping-fixture-hash',
                firstName: 'Shipping', lastName: 'Integration', roleId, statusId: 'S1', usertoken: '' });
            users.push({ id: user.id, roleId });
        }
        const [admin, buyer, courier] = users;
        const address = await db.AddressUser.create({ userId: buyer.id, shipName: 'Integration receiver', shipAdress: '12 Nguyễn Huệ',
            shipEmail: `${tag}@example.com`, shipPhonenumber: '0901234567' });
        const shipping = await db.TypeShip.create({ type: 'Shipping integration', price: 20000 });
        const product = await db.Product.create({ name: `Shipping ${tag}`, statusId: 'S1', categoryId: 'SHIP_TEST_CATEGORY', brandId: 'SHIP_TEST_BRAND', view: 0 });
        const detail = await db.ProductDetail.create({ productId: product.id, nameDetail: 'Xanh', originalPrice: 120000, discountPrice: 100000 });
        const variant = await db.ProductDetailSize.create({ productdetailId: detail.id, sizeId: 'SHIP_TEST_SIZE' });
        const order = await db.OrderProduct.create({ addressUserId: address.id, typeShipId: shipping.id, shipperId: null,
            statusId: 'S4', isPaymentOnlien: 0, deliveryProvider: 'internal', subtotal: 200000, shippingFee: 20000,
            discountAmount: 0, totalPrice: 220000, ...overrides });
        await db.OrderDetail.create({ orderId: order.id, productId: variant.id, quantity: 2, realPrice: 100000 });
        return { admin, buyer, courier, address, order, variant };
    }
    const booking = (f, provider = 'ghn') => ({ orderId: f.order.id, provider, parcel: { weight: 600, length: 25, width: 20, height: 10 },
        destination: { province: 'Hồ Chí Minh', ward: 'Phường Sài Gòn' }, cod_amount: 1, totalPrice: 1 });
    function carrier(provider = 'ghn', override) {
        const state = { calls: [], status: provider === 'ghn' ? 'ready_to_pick' : 2, trackingCode: `QA-${crypto.randomBytes(12).toString('hex')}`, clientOrderCode: null };
        const service = createShippingProviderService(db, { env, fetchImpl: async (url, init) => {
            const payload = init.body ? JSON.parse(init.body) : undefined;
            state.calls.push({ url, init, payload });
            if (override) {
                const response = await override(url, init, payload, state);
                if (response) return response;
            }
            if (init.method !== 'GET') state.clientOrderCode = provider === 'ghn' ? payload.client_order_code : payload.order.id;
            return { ok: true, status: 200, json: async () => provider === 'ghn'
                ? { code: 200, data: { order_code: state.trackingCode, client_order_code: state.clientOrderCode, shop_id: 123, status: state.status, total_fee: 30000 } }
                : { success: true, order: init.method === 'GET'
                    ? { label_id: state.trackingCode, partner_id: state.clientOrderCode, status: state.status, status_text: 'Integration snapshot', fee: 28000 }
                    : { label: state.trackingCode, status_id: state.status, fee: 28000 } } };
        } });
        return { service, state };
    }
    test('GHN concurrent booking commits one durable reservation before network, takes COD from stored order and calls carrier once', async () => {
        const f = await fixture();
        let started, release;
        const reached = new Promise(resolve => { started = resolve; });
        const gate = new Promise(resolve => { release = resolve; });
        const c = carrier('ghn', async (url, init) => { if (url.endsWith('/create')) { started(); await gate; } });
        const first = c.service.book(booking(f), f.admin);
        try {
            await Promise.race([reached, first.then(result => { throw new Error(`Booking returned before provider call: ${JSON.stringify(result)}`); })]);
            const reservation = await db.Shipment.findOne({ where: { orderId: f.order.id } });
            assert.equal(reservation.status, 'CREATING'); assert.ok(reservation.clientOrderCode); assert.ok(reservation.leaseUntil);
            assert.equal((await db.OrderProduct.findByPk(f.order.id)).deliveryProvider, 'ghn');
            const competitors = await Promise.all(Array.from({ length: 5 }, () => c.service.book(booking(f), f.admin)));
            assert.ok(competitors.every(result => result.errCode === 2), JSON.stringify(competitors));
        } finally { release(); }
        const result = okay(await first);
        const repeated = okay(await c.service.book(booking(f), f.admin)); assert.equal(repeated.data.id, result.data.id);
        assert.equal(await db.Shipment.count({ where: { orderId: f.order.id } }), 1); assert.equal(c.state.calls.length, 1);
        const payload = c.state.calls[0].payload; assert.equal(payload.cod_amount, 220000); assert.equal(payload.payment_type_id, 1);
        assert.equal(payload.to_name, f.address.shipName); assert.equal(payload.to_phone, f.address.shipPhonenumber);
        assert.equal(payload.to_address, f.address.shipAdress); assert.equal(payload.items[0].price, 100000); assert.equal(payload.items[0].quantity, 2);
        assert.equal(result.data.requestData, undefined); assert.equal(result.data.leaseUntil, undefined);
        assert.equal(await db.OrderEvent.count({ where: { orderId: f.order.id, type: 'SHIPMENT_BOOKED' } }), 1);
        assert.equal(await db.Notification.count({ where: { orderId: f.order.id, userId: f.buyer.id, type: 'SHIPMENT_BOOKED' } }), 1);
    });
    test('verified GHN webhook reads authoritative picked/delivered states and concurrent replay preserves delivery timestamp/events/notifications', async () => {
        const f = await fixture(); const c = carrier(); okay(await c.service.book(booking(f), f.admin));
        const callback = { OrderCode: c.state.trackingCode, Status: 'delivered' };
        assert.equal((await c.service.webhook('ghn', callback, 'invalid-secret')).errCode, 403); assert.equal(c.state.calls.length, 1);
        c.state.status = 'picked'; okay(await c.service.webhook('ghn', callback, env.GHN_WEBHOOK_SECRET));
        let order = await db.OrderProduct.findByPk(f.order.id); assert.equal(order.statusId, 'S5'); assert.equal(order.deliveredAt, null);
        c.state.status = 'delivered'; okay(await c.service.webhook('ghn', callback, env.GHN_WEBHOOK_SECRET));
        order = await db.OrderProduct.findByPk(f.order.id); assert.equal(order.statusId, 'S6'); assert.ok(order.deliveredAt);
        const deliveredAt = new Date(order.deliveredAt).getTime();
        const duplicates = await Promise.all(Array.from({ length: 6 }, () => c.service.webhook('ghn', callback, env.GHN_WEBHOOK_SECRET)));
        assert.ok(duplicates.every(result => result.errCode === 0), JSON.stringify(duplicates));
        order = await db.OrderProduct.findByPk(f.order.id); assert.equal(new Date(order.deliveredAt).getTime(), deliveredAt);
        assert.equal(await db.OrderEvent.count({ where: { orderId: f.order.id, type: 'SHIPMENT_STATUS' } }), 2);
        assert.equal(await db.Notification.count({ where: { orderId: f.order.id, userId: f.buyer.id, type: 'SHIPMENT_STATUS' } }), 2);
        assert.ok(c.state.calls.slice(1).every(call => call.init.method === 'GET'));
    });
    test('carrier reservation prevents internal courier claim, manual delivery completion and courier evidence', async () => {
        const f = await fixture(); const c = carrier(); okay(await c.service.book(booking(f), f.admin));
        assert.equal((await delivery.confirmOrder({ orderId: f.order.id, statusId: 'S5' }, f.courier)).errCode, 2);
        assert.equal((await delivery.confirmOrder({ orderId: f.order.id, statusId: 'S5', shipperId: f.courier.id }, f.admin)).errCode, 2);
        assert.equal((await delivery.updateStatusOrder({ id: f.order.id, statusId: 'S6' }, f.admin)).errCode, 2);
        assert.equal((await delivery.updateImageOrder({ id: f.order.id, image: 'data:image/png;base64,aGVsbG8=' }, f.admin)).errCode, 2);
        const order = await db.OrderProduct.findByPk(f.order.id); assert.equal(order.statusId, 'S4'); assert.equal(order.shipperId, null); assert.equal(order.deliveredAt, null);
        assert.equal(await db.OrderEvent.count({ where: { orderId: f.order.id, type: 'SHIPPER_ASSIGNED' } }), 0);
    });
    test('unknown GHN creation persists UNCERTAIN/client code and successful recovery looks up that code without a second create', async () => {
        const f = await fixture(); let timeout = true;
        const c = carrier('ghn', async (url, init, payload, state) => {
            if (timeout && url.endsWith('/create')) { state.clientOrderCode = payload.client_order_code; throw new Error('timeout after carrier accepted booking'); }
        });
        assert.equal((await c.service.book(booking(f), f.admin)).errCode, 3);
        const pending = await db.Shipment.findOne({ where: { orderId: f.order.id } });
        assert.equal(pending.status, 'UNCERTAIN'); assert.equal(pending.trackingCode, null); assert.equal(pending.leaseUntil, null);
        assert.equal((await db.OrderProduct.findByPk(f.order.id)).deliveryProvider, 'ghn');
        assert.equal((await delivery.confirmOrder({ orderId: f.order.id, statusId: 'S5' }, f.courier)).errCode, 2);
        timeout = false;
        const recovered = okay(await c.service.book(booking(f), f.admin)); assert.equal(recovered.data.clientOrderCode, pending.clientOrderCode);
        assert.equal(recovered.data.trackingCode, c.state.trackingCode); assert.equal(c.state.calls.length, 2);
        assert.match(c.state.calls[1].url, /detail-by-client-code\?client_order_code=/); assert.equal(c.state.calls[1].init.method, 'GET');
        assert.equal(c.state.calls.filter(call => call.url.endsWith('/create')).length, 1);
        assert.equal(await db.Shipment.count({ where: { orderId: f.order.id } }), 1);
    });
    test('GHTK uses staging and zero COD for paid orders; driver advisory cannot falsely mark real stored order delivered', async () => {
        const f = await fixture({ isPaymentOnlien: 1 }); const c = carrier('ghtk');
        okay(await c.service.book(booking(f, 'ghtk'), f.admin));
        const payload = c.state.calls[0].payload; assert.equal(payload.order.pick_money, 0); assert.equal(payload.order.total_weight, 0.6); assert.equal(payload.products[0].weight, 0.3);
        assert.ok(c.state.calls[0].url.startsWith('https://services-staging.ghtklab.com/'));
        c.state.status = 45;
        okay(await c.service.webhook('ghtk', { label_id: c.state.trackingCode, status_id: 5 }, env.GHTK_WEBHOOK_SECRET));
        let order = await db.OrderProduct.findByPk(f.order.id); assert.equal(order.statusId, 'S4'); assert.equal(order.deliveredAt, null);
        c.state.status = 5; okay(await c.service.webhook('ghtk', { label_id: c.state.trackingCode, status_id: 45 }, env.GHTK_WEBHOOK_SECRET));
        order = await db.OrderProduct.findByPk(f.order.id); assert.equal(order.statusId, 'S6'); assert.ok(order.deliveredAt);
        const deliveredAt = new Date(order.deliveredAt).getTime();
        okay(await c.service.webhook('ghtk', { label_id: c.state.trackingCode }, env.GHTK_WEBHOOK_SECRET));
        assert.equal(new Date((await db.OrderProduct.findByPk(f.order.id)).deliveredAt).getTime(), deliveredAt);
        assert.equal(await db.OrderEvent.count({ where: { orderId: f.order.id, type: 'SHIPMENT_STATUS' } }), 2);
    });
}
