const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { createAdminCatalogService } = require('../src/services/adminCatalogService');
const actor = { id: 9, roleId: 'R1', firstName: 'Admin' };

function fixture() {
    const products = new Map([[1, { id: 1, statusId: 'S1' }], [2, { id: 2, statusId: 'S2' }]]), queries = [], audits = [];
    const tx = { LOCK: { UPDATE: 'UPDATE' } };
    const db = {
        Product: {
            findAndCountAll: async query => { queries.push(query); return { count: 21, rows: [{ id: 1, name: 'Product', statusId: 'S1', priceMin: '100', priceMax: '200', variantCount: '3' }] }; },
            findOne: async query => { queries.push(query); const found = products.get(query.where.id); return found ? { ...found, save: async function (options) { assert.equal(options.transaction, tx); products.set(this.id, { id: this.id, statusId: this.statusId }); } } : null; },
        },
        ProductImage: { findAll: async query => { queries.push(query); return [{ id: 8, productId: 1, imageVersion: 'a'.repeat(64) }]; } },
        Allcode: { findAll: async query => { queries.push(query); return [{ type: 'CATEGORY', code: 'C1', value: 'Category' }, { type: 'BRAND', code: 'B1', value: 'Brand' }]; } },
        sequelize: { transaction: async (_, work) => { const before = [...products].map(([id, row]) => [id, { ...row }]); try { return await work(tx); } catch (error) { products.clear(); before.forEach(([id, row]) => products.set(id, row)); throw error; } } },
    };
    return { db, products, queries, audits, tx, service: createAdminCatalogService(db, { recordAdminAudit: async (database, event, transaction) => { assert.equal(database, db); assert.equal(transaction, tx); audits.push(event); } }) };
}

test('catalog permits R1 only and rejects unsafe IDs, status, dates and unbounded pagination before queries', async () => {
    const f = fixture();
    for (const roleId of ['R2', 'R3', 'R4', undefined]) {
        assert.equal((await f.service.list({}, { id: 9, roleId })).errCode, 403);
        assert.equal((await f.service.updateStatus({ ids: [1], statusId: 'S2', reason: 'Hide product' }, { id: 9, roleId })).errCode, 403);
    }
    for (const query of [{ page: true }, { pageSize: 51 }, { fromDate: '2026-02-31' }, { fromDate: '2026-10-13', toDate: '2026-10-12' }, { sort: 'name; DROP' }, { statusId: 'S6' }]) assert.equal((await f.service.list(query, actor)).errCode, 1);
    for (const body of [{ ids: [true], statusId: 'S2', reason: 'Hide' }, { ids: [1], statusId: 'S7', reason: 'Hide' }, { ids: [1], statusId: 'S2', reason: ' ' }, { ids: Array(51).fill(1), statusId: 'S2', reason: 'Hide' }]) assert.equal((await f.service.updateStatus(body, actor)).errCode, 1);
    assert.equal(f.queries.length, 0);
});

test('catalog query bounds payload and applies literal keyword, inclusive Bangkok dates and global sort before pagination', async () => {
    const f = fixture();
    const result = await f.service.list({ page: 2, pageSize: 10, keyword: '  50%_discount  ', statusId: 'S2', categoryId: 'C1', brandId: 'B1', fromDate: '2026-10-12', toDate: '2026-10-13', sort: 'priceDesc' }, actor);
    assert.equal(result.errCode, 0); assert.equal(result.count, 21); assert.equal(result.pages, 3);
    const query = f.queries[0]; assert.equal(query.limit, 10); assert.equal(query.offset, 10);
    assert.equal(query.where.name[Op.like], '%50\\%\\_discount%'); assert.equal(query.where.statusId, 'S2');
    assert.equal(query.where.createdAt[Op.gte].toISOString(), '2026-10-11T17:00:00.000Z');
    assert.equal(query.where.createdAt[Op.lt].toISOString(), '2026-10-13T17:00:00.000Z');
    assert.match(query.order[0][0].val, /MAX/); assert.equal(query.order[0][1], 'DESC');
    assert.ok(!query.attributes.includes('contentHTML')); assert.ok(!f.queries[1].attributes.includes('image'));
    assert.equal(result.data[0].variantCount, 3); assert.equal(result.data[0].priceMin, 100);
    assert.match(result.data[0].image, /^\/api\/media\/product-images\/8\/a+\/card$/);
    assert.deepEqual(result.filters.categories, [{ type: 'CATEGORY', code: 'C1', value: 'Category' }]);
});

test('bulk status is deterministic, deduplicated, partial and audits only committed changes', async () => {
    const f = fixture(), response = await f.service.updateStatus({ ids: [99, 2, 1, 1], statusId: 'S2', reason: '  Product paused  ' }, actor);
    assert.deepEqual(response.data.map(row => [row.id, row.outcome]), [[1, 'changed'], [2, 'skipped'], [99, 'failed']]);
    assert.deepEqual([response.changed, response.skipped, response.failed], [1, 1, 1]); assert.equal(f.products.get(1).statusId, 'S2');
    assert.equal(f.audits.length, 1); assert.equal(f.audits[0].summary, 'Product paused');
    assert.deepEqual(f.audits[0].before, { statusId: 'S1' }); assert.deepEqual(f.audits[0].after, { statusId: 'S2' });
    assert.ok(f.queries.every(query => query.transaction === f.tx && query.lock === 'UPDATE'));
    assert.equal((await f.service.updateStatus({ ids: [1], statusId: 'S2', reason: 'Repeat request' }, actor)).skipped, 1); assert.equal(f.audits.length, 1);
});

test('a failed audit rolls back status while other valid rows may still complete', async () => {
    const f = fixture();
    const service = createAdminCatalogService(f.db, { recordAdminAudit: async (_, event) => { if (event.entityId === 1) throw new Error('Secret database details'); f.audits.push(event); } });
    const response = await service.updateStatus({ ids: [1, 2], statusId: 'S2', reason: 'Hide products' }, actor);
    assert.equal(response.failed, 1); assert.equal(response.skipped, 1); assert.equal(f.products.get(1).statusId, 'S1');
    assert.ok(!JSON.stringify(response).includes('Secret database'));
});
