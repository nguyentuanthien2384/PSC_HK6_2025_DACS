const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAdminInventoryService } = require('../src/services/adminInventoryService');
const { fail } = require('../src/utils/commerce');
const admin = { id: 1, roleId: 'R1' }, staff = { id: 2, roleId: 'R4' };
const input = overrides => ({ variantId: 10, targetOnHand: 8, expectedOnHand: 10, reason: 'Kiểm kê hàng hỏng', idempotencyKey: 'inventory-test-key-0001', ...overrides });
function fixture({ onHand = 10, reserved = 0 } = {}) {
    const movements = [], audits = [], locks = [], queries = [];
    let tail = Promise.resolve();
    const tables = ['ProductDetailSize', 'ProductDetail', 'Product', 'ReceiptDetail', 'InventoryAdjustment', 'StockMovement', 'OrderDetail', 'OrderProduct'];
    const db = Object.fromEntries(tables.map(name => [name, { getTableName: () => `${name}s` }]));
    db.StockMovement.findOne = async ({ where }) => movements.find(row => row.idempotencyKey === where.idempotencyKey) || null;
    db.StockMovement.create = async (values, options) => {
        assert.equal(options.transaction.isTestTransaction, true);
        const row = { id: movements.length + 1, createdAt: new Date(), ...values }; movements.push(row); return row;
    };
    db.ProductDetailSize.findByPk = async id => id === 10 ? { id } : null;
    db.StockMovement.findAndCountAll = async options => {
        assert.ok(options.attributes.exclude.includes('idempotencyKey'));
        return { rows: movements.map(({ idempotencyKey, ...row }) => row), count: movements.length };
    };
    db.User = { findAll: async () => [{ id: 1, firstName: 'Quản trị', lastName: 'Kho' }] };
    db.PaymentSession = { findAll: async () => [{ checkoutData: JSON.stringify({ lines: [{ productId: 11, quantity: 9 }] }) }] };
    db.Allcode = { findAll: async () => [{ code: 'M', value: 'M', type: 'SIZE' }, { code: 'C1', value: 'Áo', type: 'CATEGORY' }] };
    db.sequelize = { getQueryInterface: () => ({ queryGenerator: { quoteTable: name => `\`${name}\`` } }),
        query: async (sql, options) => {
            queries.push({ sql, options });
            return [10, 11, 12].map(variantId => ({ variantId, productId: variantId, productName: `Áo ${variantId}`, variantName: 'Xanh', sizeId: 'M', categoryId: 'C1', statusId: 'S1', onHand: variantId === 12 ? 2 : 10 }));
        } };
    const commerce = {
        transaction(work) {
            const run = tail.then(async () => {
                const before = movements.length, auditBefore = audits.length;
                try { return await work({ isTestTransaction: true }); }
                catch (error) { movements.splice(before); audits.splice(auditBefore); throw error; }
            });
            tail = run.catch(() => {}); return run;
        },
        lockVariants: async lines => { locks.push(lines); if (lines[0].productId !== 10) fail('Không tìm thấy biến thể.', 2); },
        stockSnapshot: async () => ({ onHand: onHand + movements.reduce((sum, row) => sum + row.quantity, 0), reserved, available: onHand - reserved })
    };
    const deps = { commerce, recordAudit: async (_db, event, tx) => { assert.equal(tx.isTestTransaction, true); audits.push(event); } };
    return { db, deps, movements, audits, locks, queries, service: createAdminInventoryService(db, deps) };
}

test('inventory privileges use the authenticated staff actor and reject callers before reads/writes', async () => {
    const f = fixture();
    for (const actor of [null, { id: 3, roleId: 'R2' }, { id: 4, roleId: 'R3' }, { id: true, roleId: 'R1' }]) {
        assert.equal((await f.service.list({}, actor)).errCode, 403);
        assert.equal((await f.service.countStock(input(), actor)).errCode, 403);
        assert.equal((await f.service.history({ variantId: 10 }, actor)).errCode, 403);
    }
    assert.equal(f.queries.length, 0); assert.equal(f.movements.length, 0);
    const counted = await f.service.countStock(input({ actorId: 999, userId: 999 }), staff);
    assert.equal(counted.errCode, 0); assert.equal(f.movements[0].actorId, staff.id);
});

test('concurrent double click writes one signed movement and one audit under the checkout variant lock', async () => {
    const f = fixture();
    const results = await Promise.all([f.service.countStock(input(), admin), f.service.countStock(input(), admin)]);
    results.forEach(row => assert.equal(row.errCode, 0));
    assert.equal(f.movements.length, 1); assert.equal(f.audits.length, 1); assert.equal(f.movements[0].quantity, -2);
    assert.deepEqual(f.locks, [[{ productId: 10 }], [{ productId: 10 }]]);
    assert.equal(results[1].repeated, true); assert.equal(results[0].data.idempotencyKey, undefined);
    assert.equal(f.audits[0].entityType, 'INVENTORY'); assert.deepEqual(f.audits[0].before, { onHand: 10, reserved: 0 });
});

test('stale expected stock and reservation reductions fail without inventing inventory credit', async () => {
    const f = fixture({ reserved: 7 });
    assert.equal((await f.service.countStock(input({ expectedOnHand: 9 }), admin)).errCode, 2);
    const blocked = await f.service.countStock(input({ targetOnHand: 6 }), admin);
    assert.equal(blocked.errCode, 2); assert.equal(blocked.current.reserved, 7);
    assert.equal(f.movements.length, 0); assert.equal(f.audits.length, 0);
    assert.equal((await f.service.countStock(input({ targetOnHand: 7 }), admin)).errCode, 0);
    assert.equal(f.movements[0].reservedAtCount, 7);
});

test('stock can be counted down to zero without reservations and repaired upward from negative recorded stock', async () => {
    const zero = fixture(); assert.equal((await zero.service.countStock(input({ targetOnHand: 0 }), admin)).errCode, 0);
    assert.equal(zero.movements[0].quantity, -10);
    const negative = fixture({ onHand: -2 });
    assert.equal((await negative.service.countStock(input({ targetOnHand: 0, expectedOnHand: -2 }), admin)).errCode, 0);
    assert.equal(negative.movements[0].quantity, 2);
});

test('invalid numbers, zero adjustments and reused request contents cannot alter stock', async () => {
    const f = fixture();
    for (const overrides of [{ variantId: true }, { targetOnHand: true }, { targetOnHand: '' }, { targetOnHand: -1 },
        { targetOnHand: 1.1 }, { targetOnHand: 2147483648 }, { expectedOnHand: null }, { targetOnHand: 10 },
        { reason: ' ' }, { reason: 'a'.repeat(1001) }, { idempotencyKey: 'short' }]) {
        assert.notEqual((await f.service.countStock(input(overrides), admin)).errCode, 0);
    }
    assert.equal(f.movements.length, 0);
    assert.equal((await f.service.countStock(input(), admin)).errCode, 0);
    assert.equal((await f.service.countStock(input({ targetOnHand: 7 }), admin)).errCode, 2);
    assert.equal(f.movements.length, 1);
});

test('audit failure rolls back the stock movement in the same transaction', async () => {
    const f = fixture();
    f.deps.recordAudit = async () => { throw new Error('audit unavailable'); };
    const service = createAdminInventoryService(f.db, f.deps);
    await assert.rejects(service.countStock(input(), admin), /audit unavailable/);
    assert.equal(f.movements.length, 0);
});

test('reservation-aware low stock filters run before pagination with exact summary and no images', async () => {
    const f = fixture();
    const result = await f.service.list({ stock: 'low', limit: 1, offset: 1 }, admin);
    assert.equal(result.errCode, 0); assert.equal(result.count, 2); assert.equal(result.data[0].variantId, 12);
    assert.deepEqual(result.summary, { variants: 3, onHand: 22, reserved: 9, available: 13, low: 2, out: 0 });
    assert.equal((await f.service.list({ stock: 'low', limit: 1, offset: 0 }, staff)).data[0].available, 1);
    assert.equal(f.queries.some(item => /image|contentHTML|contentMarkdown/i.test(item.sql)), false);
    assert.equal((await f.service.list({ limit: true }, admin)).errCode, 1);
    assert.equal((await f.service.list({ stock: 'unknown' }, admin)).errCode, 1);
    assert.equal((await f.service.list({ search: {} }, admin)).errCode, 1);
    const dashboard = await f.service.summary(admin);
    assert.equal(dashboard.lowStock[0].variantId, 11); assert.equal(dashboard.data.low, 2);
});

test('per-variant history excludes dedupe keys and keeps staff display names', async () => {
    const f = fixture(); await f.service.countStock(input(), admin);
    const result = await f.service.history({ variantId: 10 }, staff);
    assert.equal(result.errCode, 0); assert.equal(result.data[0].idempotencyKey, undefined);
    assert.equal(result.data[0].actorName, 'Quản trị Kho');
    assert.equal((await f.service.history({ variantId: true }, admin)).errCode, 1);
    assert.equal((await f.service.history({ variantId: 999 }, admin)).errCode, 2);
});
