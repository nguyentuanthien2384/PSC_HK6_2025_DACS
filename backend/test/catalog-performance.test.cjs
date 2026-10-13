const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { createCatalogService } = require('../src/services/catalogService');
const { catalogDb } = require('./helpers/catalog-db.cjs');

function fixture(count = 30) {
    const products = Array.from({ length: count }, (_, index) => ({
        id: index + 1, name: `Product ${index + 1}`, statusId: 'S1', categoryId: 'C1', brandId: 'B1',
        contentHTML: 'large description'.repeat(10000), contentMarkdown: 'large source'.repeat(10000),
    }));
    const details = products.flatMap(product => [
        { id: product.id * 10, productId: product.id, nameDetail: 'First', discountPrice: (count - product.id + 1) * 100, originalPrice: 5000, description: 'detail body'.repeat(1000) },
        { id: product.id * 10 + 1, productId: product.id, nameDetail: 'Second', discountPrice: 1, originalPrice: 5000 },
    ]);
    const images = details.flatMap(detail => [
        { id: detail.id * 10, productdetailId: detail.id, image: Buffer.from('data:image/png;base64,' + 'AAAA'.repeat(10000)), updatedAt: new Date(2026, 0, 1), imageVersion: 'a'.repeat(64) },
        { id: detail.id * 10 + 1, productdetailId: detail.id, image: Buffer.from('data:image/png;base64,' + 'AAAA'.repeat(10000)), updatedAt: new Date(2026, 0, 1), imageVersion: 'b'.repeat(64) },
    ]);
    const sizes = details.map(detail => ({ id: detail.id * 100, productdetailId: detail.id, sizeId: 'SIZE_M' }));
    return { products, details, images, sizes };
}

test('public catalog needs four SQL reads for one or one hundred cards, without fetching blobs or article bodies', async () => {
    for (const limit of [1, 100]) {
        const { db, queries } = catalogDb(fixture(100));
        const result = await createCatalogService(db).list({ limit });
        assert.equal(result.data.length, limit);
        assert.equal(queries.reduce((sum, query) => sum + (query.sqlCount || 1), 0), 4);
        assert.deepEqual(queries.map(query => query.name), ['Product', 'ProductDetail', 'ProductImage']);
        assert.ok(!queries[0].query.attributes.includes('contentHTML'));
        assert.ok(!queries[0].query.attributes.includes('contentMarkdown'));
        assert.ok(!queries[1].query.attributes.includes('description'));
        assert.ok(!queries[2].query.attributes.includes('image'));
        assert.equal(result.data[0].productDetail.length, 1);
        assert.equal(result.data[0].productDetail[0].productImage.length, 1);
        assert.match(result.data[0].productDetail[0].productImage[0].image, /^\/api\/media\/product-images\/\d+\/[a-f0-9]{64}\/card$/);
        assert.ok(!JSON.stringify(result).includes('base64'));
        assert.ok(JSON.stringify(result).length < limit * 1000 + 100);
    }
});

test('price ordering happens globally in SQL before pagination and uses the displayed first variant', async () => {
    const { db, queries } = catalogDb(fixture(20));
    const result = await createCatalogService(db).list({ limit: 3, offset: 3, sortPrice: 'true' });
    assert.deepEqual(result.data.map(product => product.id), [17, 16, 15]);
    assert.deepEqual(result.data.map(product => product.price), [400, 500, 600]);
    assert.match(queries[0].query.order[0][0].val, /ORDER BY `catalogDetail`.`id` ASC LIMIT 1/);
    assert.equal(queries[0].query.limit, 3);
    assert.equal(queries[0].query.offset, 3);
});

test('public listing bounds absent or invalid pagination and filters inactive products in the database', async () => {
    const data = fixture(30); data.products[0].statusId = 'S2';
    const { db, queries } = catalogDb(data);
    const result = await createCatalogService(db).list({ limit: '', offset: Infinity });
    assert.equal(result.count, 29); assert.equal(result.data.length, 20);
    assert.equal(queries[0].query.where.statusId, 'S1');
    assert.equal(queries[0].query.offset, 0);
    assert.ok(!result.data.some(product => product.id === 1));
});

test('admin catalog batches all variants and sizes while retaining the full receipt selector option list', async () => {
    const { db, queries } = catalogDb(fixture(25));
    const result = await createCatalogService(db).list({ limit: '' }, { admin: true });
    assert.equal(result.data.length, 25);
    assert.equal(queries.reduce((sum, query) => sum + (query.sqlCount || 1), 0), 5);
    assert.equal(result.data[0].productDetail.length, 2);
    assert.equal(result.data[0].productDetail[0].productDetailSize.length, 1);
    assert.ok(!JSON.stringify(result).includes('base64'));
});

test('empty pages skip child queries and products without variants have a safe empty card', async () => {
    const { db, queries } = catalogDb({ products: [{ id: 1, statusId: 'S1', name: 'No variants' }] });
    const catalog = createCatalogService(db);
    assert.deepEqual((await catalog.list({ offset: 10 })).data, []); assert.equal(queries.length, 1);
    const card = (await catalog.list({ limit: 1 })).data[0];
    assert.equal(card.price, null); assert.deepEqual(card.productDetail, []);
    assert.equal(queries.at(-1).name, 'ProductDetail');
});

test('recommendations favor neighbors with shared positive ratings using a bounded metadata-only read', async () => {
    const data = fixture(4);
    data.ratings = [
        { id: 1, productId: 1, userId: 7, star: 5 }, { id: 2, productId: 1, userId: 8, star: 4 },
        { id: 3, productId: 2, userId: 8, star: 5 }, { id: 4, productId: 3, userId: 9, star: 5 },
    ];
    const { db, queries } = catalogDb(data);
    const result = await createCatalogService(db).recommend({ userId: 7, limit: 1 });
    assert.deepEqual(result.data.map(product => product.id), [2]);
    assert.equal(queries[0].query.limit, 2000);
    assert.deepEqual(queries[0].query.attributes, ['productId', 'userId', 'star']);
    assert.equal(queries.filter(query => query.name === 'Product').length, 1);
});

test('cart product suggestions resolve duplicate variants in batches and exclude inactive products', async () => {
    const data = fixture(4); data.products[0].statusId = 'S2';
    data.carts = [
        { userId: 7, productdetailsizeId: 1000 }, { userId: 7, productdetailsizeId: 2000 },
        { userId: 7, productdetailsizeId: 2100 }, { userId: 8, productdetailsizeId: 3000 },
    ];
    const { db, queries } = catalogDb(data);
    const result = await createCatalogService(db).cart({ userId: 7, limit: 3 });
    assert.deepEqual(result.data.map(product => product.id), [2]);
    assert.deepEqual(queries[1].query.where.id[Op.in], [1000, 2000, 2100]);
    assert.equal(queries.filter(query => query.name === 'Product').length, 1);
});
