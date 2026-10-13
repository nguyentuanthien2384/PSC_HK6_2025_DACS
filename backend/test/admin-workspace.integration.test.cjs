const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

if (process.env.RUN_DB_TESTS !== 'true') {
    test('admin workspace MySQL integration (opt in with an isolated TEST_DB_* database)', { skip: true }, () => {});
} else {
    // No database fallback, reset or remote carrier/payment calls are permitted.
    const required = ['TEST_DB_HOST', 'TEST_DB_PORT', 'TEST_DB_DATABASE_NAME', 'TEST_DB_USERNAME', 'TEST_DB_PASSWORD'];
    if (process.env.NODE_ENV !== 'test' || !/test|integration/i.test(process.env.TEST_DB_DATABASE_NAME || '') ||
        required.some(key => !Object.prototype.hasOwnProperty.call(process.env, key))) {
        throw new Error('Admin integration requires NODE_ENV=test and explicit TEST_DB_* variables for a dedicated test/integration database.');
    }
    process.env.JWT_SECRET = 'admin-workspace-integration-only-secret-32-characters';
    process.env.CORS_ORIGINS = 'http://localhost:3000';
    for (const key of ['VNP_TMNCODE', 'VNP_HASHSECRET', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'GHN_TOKEN', 'GHTK_TOKEN', 'EMAIL_APP', 'EMAIL_APP_PASSWORD']) process.env[key] = '';
    require('@babel/register')({ cache: false });
    const db = require('../src/models');
    const { createApp } = require('../src/app');
    const CommonUtils = require('../src/utils/CommonUtils');
    const { createCommerceService } = require('../src/services/commerceService');
    const { createAdminCatalogService } = require('../src/services/adminCatalogService');
    const { createAdminInventoryService } = require('../src/services/adminInventoryService');
    const { catalogStocks } = require('../src/services/catalogStockService');
    const commerce = createCommerceService(db);
    let server, base;
    before(async () => {
        await db.sequelize.authenticate();
        for (const [code, value, type] of [
            ['S1', 'Hoạt động', 'STATUS'], ['S2', 'Ngừng hoạt động', 'STATUS'],
            ['S3', 'Chờ xác nhận', 'STATUS-ORDER'], ['S4', 'Đã xác nhận', 'STATUS-ORDER'], ['S5', 'Đang giao', 'STATUS-ORDER'],
            ['S6', 'Đã giao', 'STATUS-ORDER'], ['S7', 'Đã hủy', 'STATUS-ORDER'], ['S8', 'Giao thất bại', 'STATUS-ORDER'],
            ['S9', 'Đang hoàn kho', 'STATUS-ORDER'], ['S10', 'Đã hoàn kho', 'STATUS-ORDER'],
            ['ADMIN_TEST_SIZE', 'M', 'SIZE'], ['ADMIN_TEST_CATEGORY', 'Danh mục kiểm thử', 'CATEGORY'], ['ADMIN_TEST_BRAND', 'Thương hiệu kiểm thử', 'BRAND']
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
    async function fixture() {
        const tag = crypto.randomUUID();
        const users = [];
        for (const roleId of ['R1', 'R4', 'R2', 'R3']) {
            const user = await db.User.create({ email: `${tag}-${roleId}@example.test`, password: 'admin-integration-password-hash',
                firstName: 'Admin test', lastName: roleId, roleId, statusId: 'S1', usertoken: '' });
            users.push({ id: user.id, roleId, firstName: user.firstName, lastName: user.lastName, token: CommonUtils.encodeToken(user.id, user.password, user.authVersion) });
        }
        const [admin, staff, buyer, courier] = users;
        const address = await db.AddressUser.create({ userId: buyer.id, shipName: `Khách ${tag} 50%_literal`, shipAdress: '123 Integration street', shipEmail: `${tag}@example.test`, shipPhonenumber: '0901234567' });
        const shipping = await db.TypeShip.create({ type: `Admin test ${tag}`, price: 10000 });
        const product = await db.Product.create({ name: `Admin ${tag} 50%_literal`, statusId: 'S1', categoryId: 'ADMIN_TEST_CATEGORY', brandId: 'ADMIN_TEST_BRAND',
            view: 3, contentHTML: '<p>large catalog data</p>'.repeat(10000), contentMarkdown: 'large catalog data'.repeat(10000) });
        const detail = await db.ProductDetail.create({ productId: product.id, nameDetail: 'Xanh', originalPrice: 120000, discountPrice: 100000 });
        const variant = await db.ProductDetailSize.create({ productdetailId: detail.id, sizeId: 'ADMIN_TEST_SIZE' });
        await db.ProductImage.create({ productdetailId: detail.id, image: 'data:image/png;base64,aGVsbG8=' });
        const supplier = await db.Supplier.create({ name: `Admin supplier ${tag}`, address: 'Integration street', email: `${tag}@example.test`, phonenumber: '0901234567' });
        const receipt = await db.Receipt.create({ supplierId: supplier.id, userId: admin.id });
        await db.ReceiptDetail.create({ receiptId: receipt.id, productDetailSizeId: variant.id, quantity: 10, price: 60000 });
        const order = async (overrides = {}, quantity = 0) => {
            const saved = await db.OrderProduct.create({ addressUserId: address.id, typeShipId: shipping.id,
                statusId: 'S3', shipperId: null, isPaymentOnlien: 0, deliveryProvider: 'internal', totalPrice: 110000,
                subtotal: 100000, shippingFee: 10000, discountAmount: 0, deliveryAttempts: 0, ...overrides });
            if (quantity) await db.OrderDetail.create({ orderId: saved.id, productId: variant.id, quantity, realPrice: 100000 });
            return saved;
        };
        return { tag, admin, staff, buyer, courier, product, variant, receipt, order };
    }
    const payment = (f, overrides = {}) => db.PaymentSession.create({ id: crypto.randomUUID(), userId: f.buyer.id, provider: 'paypal',
        providerPaymentId: `admin-fixture-${crypto.randomUUID()}`, status: 'PENDING', totalPrice: 100000, providerAmount: '4.00',
        currency: 'USD', checkoutData: '{}', expiresAt: new Date(Date.now() + 86400000), ...overrides });

    test('admin order HTTP filters are literal, paged and unique; bulk transactions report partial results with one atomic audit per actual change', async () => {
        const f = await fixture();
        const fresh = await f.order(), canceled = await f.order({ statusId: 'S7' }), ready = await f.order({ statusId: 'S4' }), external = await f.order({ statusId: 'S4', deliveryProvider: 'ghn' });
        await payment(f, { orderId: fresh.id, status: 'COMPLETED' });
        assert.equal((await call('/api/admin/operations/orders', f.buyer)).httpStatus, 403);
        assert.equal((await call('/api/admin/operations/bulk', f.courier, { action: 'CONFIRM', orderIds: [fresh.id] })).httpStatus, 403);
        const query = `keyword=${encodeURIComponent(f.tag)}&pageSize=2&page=1`;
        const page = okay(await call(`/api/admin/operations/orders?${query}`, f.staff));
        assert.equal(page.count, 4); assert.equal(page.data.length, 2);
        assert.equal(new Set(page.data.map(row => row.id)).size, page.data.length);
        const next = okay(await call(`/api/admin/operations/orders?${query.replace('page=1', 'page=2')}`, f.staff));
        assert.equal(new Set([...page.data, ...next.data].map(row => row.id)).size, 4);
        const literal = okay(await call(`/api/admin/operations/orders?keyword=${encodeURIComponent(f.tag + ' 50%_literal')}`, f.admin));
        assert.equal(literal.count, 4); assert.ok(!JSON.stringify(literal).includes('checkoutData'));
        const confirmed = okay(await call('/api/admin/operations/bulk', f.staff, { action: 'CONFIRM', orderIds: [fresh.id, canceled.id] }));
        assert.deepEqual([confirmed.succeeded, confirmed.failed], [1, 1]);
        assert.equal((await db.OrderProduct.findByPk(fresh.id)).statusId, 'S4');
        assert.equal((await db.OrderProduct.findByPk(canceled.id)).statusId, 'S7');
        assert.equal(await db.AdminAudit.count({ where: { entityType: 'ORDER', entityId: String(fresh.id), action: 'ORDER_CONFIRMED' } }), 1);
        const assigned = okay(await call('/api/admin/operations/bulk', f.admin, { action: 'ASSIGN', orderIds: [ready.id, external.id], shipperId: f.courier.id }));
        assert.deepEqual([assigned.succeeded, assigned.failed], [1, 1]);
        assert.equal((await db.OrderProduct.findByPk(ready.id)).shipperId, f.courier.id);
        assert.equal((await db.OrderProduct.findByPk(external.id)).shipperId, null);
        assert.equal(await db.OrderEvent.count({ where: { orderId: ready.id, type: 'SHIPPER_ASSIGNED' } }), 1);
        assert.equal(await db.AdminAudit.count({ where: { entityType: 'ORDER', entityId: String(ready.id), action: 'SHIPPER_ASSIGNED' } }), 1);
        const changed = okay(await call(`/api/admin/operations/orders?keyword=${f.tag}&status=S4&carrier=internal&payment=COD`, f.admin));
        assert.equal(changed.count, 1); assert.equal(changed.data[0].id, fresh.id); assert.equal(changed.counters.S5, 1);
        assert.notEqual((await call('/api/admin/operations/bulk', f.admin, { action: 'CONFIRM', orderIds: [fresh.id, fresh.id] })).errCode, 0);
    });

    test('dashboard date boundary, real revenue and settled refunds follow UTC+7; staff receive operational metrics only', async t => {
        const f = await fixture();
        const orderIds = [];
        t.after(async () => {
            // Remove only the synthetic report dates owned by this case, so
            // reruns cannot double the aggregate for the same calendar day.
            if (orderIds.length) {
                await db.ReturnRequest.destroy({ where: { orderId: orderIds } });
                await db.OrderProduct.destroy({ where: { id: orderIds } });
            }
        });
        const first = await f.order({ statusId: 'S6', totalPrice: 100000, deliveredAt: new Date('2099-12-31T18:30:00.000Z') });
        orderIds.push(first.id);
        orderIds.push((await f.order({ statusId: 'S6', totalPrice: 300000, deliveredAt: new Date('2100-01-01T16:30:00.000Z') })).id);
        orderIds.push((await f.order({ statusId: 'S6', totalPrice: 900000, deliveredAt: new Date('2100-01-01T17:01:00.000Z') })).id);
        orderIds.push((await f.order({ statusId: 'S3', totalPrice: 800000, deliveredAt: new Date('2099-12-31T18:30:00.000Z') })).id);
        await db.ReturnRequest.create({ orderId: first.id, activeOrderId: first.id, userId: f.buyer.id, kind: 'CUSTOMER_RETURN', status: 'REFUNDED',
            reason: 'Refund fixture', amount: 40000, requestedAt: new Date('2100-01-01T00:00:00.000Z'), refundedAt: new Date('2100-01-01T01:00:00.000Z') });
        const admin = okay(await call('/api/admin/operations/dashboard?from=2100-01-01&to=2100-01-01', f.admin)).data;
        assert.equal(admin.metrics.deliveredOrders, 2); assert.equal(admin.metrics.grossRevenue, 400000);
        assert.equal(admin.metrics.refundsAgainstDeliveredOrders, 40000); assert.equal(admin.metrics.netRevenue, 360000);
        assert.equal(admin.metrics.refundedInPeriod, 40000);
        assert.deepEqual(admin.dailyTrend, [{ day: '2100-01-01', orders: 2, grossRevenue: 400000, refunds: 40000, netRevenue: 360000 }]);
        const staff = okay(await call('/api/admin/operations/dashboard?from=2100-01-01&to=2100-01-01', f.staff)).data;
        assert.equal(staff.financialAccess, false); assert.equal(staff.metrics.grossRevenue, undefined); assert.equal(staff.metrics.netRevenue, undefined);
        assert.deepEqual(staff.dailyTrend, [{ day: '2100-01-01', orders: 2 }]);
        const queue = okay(await call(`/api/admin/operations/returns?keyword=${f.tag}&status=REFUNDED`, f.staff));
        assert.equal(queue.count, 1); assert.equal(queue.data[0].amount, 40000);
        assert.ok(!JSON.stringify(queue).includes('evidence')); assert.ok(!JSON.stringify(queue).includes('refundProof'));
        const legacy = await f.order({ statusId: 'S6', totalPrice: 50000, deliveredAt: null }); orderIds.push(legacy.id);
        await db.sequelize.query('UPDATE Orderproducts SET updatedAt = :date WHERE id = :id', { replacements: { id: legacy.id, date: new Date('2100-01-01T01:00:00.000Z') } });
        const withLegacy = okay(await call('/api/admin/operations/dashboard?from=2100-01-01&to=2100-01-01', f.admin)).data;
        assert.equal(withLegacy.metrics.deliveredOrders, 3); assert.equal(withLegacy.metrics.netRevenue, 410000);
        assert.equal(withLegacy.metrics.legacyDeliveryDates, 1);
        assert.equal(withLegacy.dailyTrend[0].orders, 3);
    });

    test('actual inventory count locks, deduplicates, prevents stale or reserved reductions and updates both checkout and catalog stock', async () => {
        const f = await fixture(); await f.order({}, 2);
        await payment(f, { checkoutData: JSON.stringify({ lines: [{ productId: f.variant.id, quantity: 6 }] }) });
        const before = okay(await call(`/api/admin/inventory?search=${f.tag}&stock=low`, f.staff));
        assert.equal(before.count, 1); assert.deepEqual([before.data[0].onHand, before.data[0].reserved, before.data[0].available], [8, 6, 2]);
        const body = { variantId: f.variant.id, expectedOnHand: 8, targetOnHand: 6, reason: 'Kiểm kê hàng hỏng', idempotencyKey: crypto.randomUUID() };
        assert.equal((await call('/api/admin/inventory/count', f.buyer, body)).httpStatus, 403);
        assert.notEqual((await call('/api/admin/inventory/count', f.staff, { ...body, expectedOnHand: 7 })).errCode, 0);
        assert.notEqual((await call('/api/admin/inventory/count', f.staff, { ...body, targetOnHand: 5 })).errCode, 0);
        const results = await Promise.all([call('/api/admin/inventory/count', f.staff, body), call('/api/admin/inventory/count', f.staff, body)]);
        results.forEach(okay); assert.equal(results.filter(result => result.repeated).length, 1);
        assert.equal(await db.StockMovement.count({ where: { productDetailSizeId: f.variant.id } }), 1);
        assert.equal(await db.AdminAudit.count({ where: { entityType: 'INVENTORY', entityId: String(f.variant.id), action: 'STOCK_COUNT' } }), 1);
        assert.equal(await commerce.availableStock(f.variant.id), 0);
        assert.equal((await catalogStocks(db, [f.variant.id])).get(f.variant.id), 0);
        const after = okay(await call(`/api/admin/inventory?search=${f.tag}&stock=out`, f.admin));
        assert.equal(after.count, 1); assert.deepEqual([after.data[0].onHand, after.data[0].reserved, after.data[0].available], [6, 6, 0]);
        assert.notEqual((await call('/api/admin/inventory/count', f.staff, { ...body, reason: 'Nội dung đã thay đổi' })).errCode, 0);
        const history = okay(await call(`/api/admin/inventory/${f.variant.id}/history`, f.staff));
        assert.equal(history.count, 1); assert.equal(history.data[0].quantity, -2); assert.equal(history.data[0].actorId, f.staff.id);
        assert.equal(history.data[0].idempotencyKey, undefined);
    });

    test('two distinct inventory counts from the same stale snapshot permit exactly one adjustment, and audit failure rolls back its movement', async () => {
        const f = await fixture(); const service = createAdminInventoryService(db);
        const first = { variantId: f.variant.id, expectedOnHand: 10, targetOnHand: 8, reason: 'Kiểm kê cùng thời điểm', idempotencyKey: crypto.randomUUID() };
        const second = { ...first, targetOnHand: 7, idempotencyKey: crypto.randomUUID() };
        const results = await Promise.all([service.countStock(first, f.admin), service.countStock(second, f.admin)]);
        assert.equal(results.filter(result => result.errCode === 0).length, 1);
        assert.equal(await db.StockMovement.count({ where: { productDetailSizeId: f.variant.id } }), 1);
        const current = (await commerce.stockSnapshot(f.variant.id)).onHand;
        const oldCreate = db.AdminAudit.create;
        try {
            db.AdminAudit.create = async () => { throw new Error('Injected inventory audit outage'); };
            await assert.rejects(service.countStock({ ...first, expectedOnHand: current, targetOnHand: current + 2, idempotencyKey: crypto.randomUUID() }, f.admin), /audit outage/);
        } finally { db.AdminAudit.create = oldCreate; }
        assert.equal((await commerce.stockSnapshot(f.variant.id)).onHand, current);
        assert.equal(await db.StockMovement.count({ where: { productDetailSizeId: f.variant.id } }), 1);
        const deletion = await call('/api/delete-receipt', f.admin, { id: f.receipt.id }, 'DELETE');
        assert.notEqual(deletion.errCode, 0, 'a stock count must retain its intake source even without any sales');
        assert.ok(await db.Receipt.findByPk(f.receipt.id));
        assert.equal((await commerce.stockSnapshot(f.variant.id)).onHand, current);
    });

    test('real catalog status uses locked model instances and atomic audit; retry is a no-op and a failed audit cannot hide a product', async () => {
        const f = await fixture();
        assert.equal((await call(`/api/admin/catalog?keyword=${f.tag}`, f.staff)).httpStatus, 403);
        const listed = okay(await call(`/api/admin/catalog?keyword=${encodeURIComponent(f.tag + ' 50%_literal')}&pageSize=1`, f.admin));
        assert.equal(listed.count, 1); assert.equal(listed.data[0].variantCount, 1); assert.equal(listed.data[0].priceMin, 100000);
        assert.match(listed.data[0].image, /\/api\/media\/product-images\/\d+\/[a-f0-9]{64}\/card$/);
        assert.ok(!JSON.stringify(listed).includes('large catalog data')); assert.ok(!JSON.stringify(listed).includes('base64'));
        const body = { ids: [f.product.id], statusId: 'S2', reason: 'Tạm ngừng kinh doanh' };
        assert.equal((await call('/api/admin/catalog/status', f.staff, body)).httpStatus, 403);
        const hidden = okay(await call('/api/admin/catalog/status', f.admin, body));
        assert.equal(hidden.changed, 1); assert.equal((await db.Product.findByPk(f.product.id)).statusId, 'S2');
        const retry = okay(await call('/api/admin/catalog/status', f.admin, body));
        assert.equal(retry.skipped, 1); assert.equal(await db.AdminAudit.count({ where: { entityType: 'PRODUCT', entityId: String(f.product.id) } }), 1);
        const service = createAdminCatalogService(db); const oldCreate = db.AdminAudit.create;
        try {
            db.AdminAudit.create = async () => { throw new Error('Injected catalog audit outage'); };
            const blocked = okay(await service.updateStatus({ ...body, statusId: 'S1' }, f.admin));
            assert.equal(blocked.failed, 1); assert.equal(blocked.changed, 0);
        } finally { db.AdminAudit.create = oldCreate; }
        assert.equal((await db.Product.findByPk(f.product.id)).statusId, 'S2');
        assert.equal(await db.AdminAudit.count({ where: { entityType: 'PRODUCT', entityId: String(f.product.id) } }), 1);
        assert.equal(okay(await service.updateStatus({ ...body, statusId: 'S1' }, f.admin)).changed, 1);
        const audits = await db.AdminAudit.findAll({ where: { entityType: 'PRODUCT', entityId: String(f.product.id) }, order: [['id', 'ASC']], raw: true });
        assert.equal(audits.length, 2); assert.deepEqual(JSON.parse(audits[1].afterData), { statusId: 'S1' });
    });

    test('receipt deletion serializes a concurrent new-variant line instead of bypassing its stock-count history', async () => {
        const first = await fixture(), counted = await fixture();
        okay(await createAdminInventoryService(db).countStock({ variantId: counted.variant.id, expectedOnHand: 10, targetOnHand: 8,
            reason: 'Kiểm kê trước khi thêm dòng nhập', idempotencyKey: crypto.randomUUID() }, counted.admin));
        const receipts = require('../src/services/receiptService');
        const originalRead = db.ReceiptDetail.findAll, originalReceipt = db.Receipt.findByPk;
        let snapshotReached, releaseSnapshot, additionAttempted;
        const snapshot = new Promise(resolve => { snapshotReached = resolve; });
        const release = new Promise(resolve => { releaseSnapshot = resolve; });
        const attempted = new Promise(resolve => { additionAttempted = resolve; });
        let deleteTask, addTask, snapshotTaken = false;
        try {
            db.ReceiptDetail.findAll = async function (options) {
                const rows = await originalRead.call(this, options);
                if (!snapshotTaken && Number(options.where?.receiptId) === first.receipt.id && options.transaction) {
                    snapshotTaken = true; snapshotReached(); await release;
                }
                return rows;
            };
            db.Receipt.findByPk = function (id, options) {
                if (snapshotTaken && Number(id) === first.receipt.id && options?.raw === true) additionAttempted();
                return originalReceipt.call(this, id, options);
            };
            deleteTask = receipts.deleteReceipt({ id: first.receipt.id });
            await snapshot;
            addTask = receipts.createNewReceiptDetail({ receiptId: first.receipt.id, productDetailSizeId: counted.variant.id, quantity: 2, price: 60000 });
            await attempted;
            // Give the append a chance to commit if the receipt snapshot was
            // unprotected. A correctly locked receipt keeps it waiting until
            // deletion commits, after which the append must report missing.
            await Promise.race([addTask, new Promise(resolve => setTimeout(resolve, 150))]);
            releaseSnapshot();
            const [deleted, appended] = await Promise.all([deleteTask, addTask]);
            okay(deleted);
            assert.notEqual(appended.errCode, 0, 'an append cannot report success after a locked receipt snapshot was taken for deletion');
            assert.equal(await db.Receipt.findByPk(first.receipt.id), null);
            assert.equal(await db.ReceiptDetail.count({ where: { receiptId: first.receipt.id } }), 0);
            assert.equal((await commerce.stockSnapshot(counted.variant.id)).onHand, 8);
            assert.equal(await db.StockMovement.count({ where: { productDetailSizeId: counted.variant.id } }), 1);
        } finally {
            releaseSnapshot();
            await Promise.allSettled([deleteTask, addTask].filter(Boolean));
            db.ReceiptDetail.findAll = originalRead; db.Receipt.findByPk = originalReceipt;
        }
    });
}
