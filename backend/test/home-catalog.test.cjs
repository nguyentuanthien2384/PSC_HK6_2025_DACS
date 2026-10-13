const test = require('node:test');
const assert = require('node:assert/strict');
const { createCatalogService } = require('../src/services/catalogService');
const { catalogDb } = require('./helpers/catalog-db.cjs');

function serviceWith({ products, recommendationIds = [] }) {
    const { db, queries } = catalogDb({
        products,
        details: products.map(product => ({ id: product.id * 10, productId: product.id, discountPrice: 100000 })),
        ratings: recommendationIds.map((productId, index) => ({ id: index + 1, productId: Number(productId), userId: 8, star: 5 })),
    });
    const catalog = createCatalogService(db);
    return { service: { getProductFeature: catalog.featured, getProductNew: catalog.newest, getProductRecommend: catalog.recommend }, queries };
}

const products = [
    { id: 1, name: '[DEMO] retired', statusId: 'S2', view: 99999, createdAt: 99999 },
    { id: 2, name: 'Current popular', statusId: 'S1', view: 50, createdAt: 20 },
    { id: 3, name: 'Current new', statusId: 'S1', view: 10, createdAt: 30 },
];

test('featured and new home sections exclude retired records before applying order and limit', async () => {
    const { service } = serviceWith({ products });
    assert.deepEqual((await service.getProductFeature(1)).data.map(product => product.id), [2]);
    assert.deepEqual((await service.getProductNew(1)).data.map(product => product.id), [3]);
    assert.deepEqual((await service.getProductFeature(100)).data.map(product => product.id), [2, 3]);
});

test('home listing limits are finite positive integers bounded at 100', async () => {
    const { service, queries } = serviceWith({ products });
    const examples = [[undefined, 20], ['', 20], ['nope', 20], [Infinity, 20], [-5, 20], [0, 20], ['2.9', 2], [0.5, 1], [200, 100]];
    for (const method of ['getProductFeature', 'getProductNew']) for (const [input, expected] of examples) {
        await service[method](input);
        assert.equal(queries.filter(query => query.name === 'Product').at(-1).query.limit, expected, `${method}(${input})`);
    }
});

test('tied view counts and creation timestamps use the newest id consistently', async () => {
    const { service } = serviceWith({ products: [
        { id: 4, statusId: 'S1', view: 0, createdAt: 50 }, { id: 5, statusId: 'S1', view: 0, createdAt: 50 },
    ] });
    assert.deepEqual((await service.getProductFeature(2)).data.map(product => product.id), [5, 4]);
    assert.deepEqual((await service.getProductNew(2)).data.map(product => product.id), [5, 4]);
});

test('recommendations filter retired and missing products before the active SQL result limit', async () => {
    const { service, queries } = serviceWith({ products, recommendationIds: ['1', '999', '2', '3'] });
    const result = await service.getProductRecommend({ userId: 7, limit: 1 });
    assert.equal(result.errCode, 0);
    assert.deepEqual(result.data.map(product => product.id), [2]);
    const productQueries = queries.filter(query => query.name === 'Product');
    assert.equal(productQueries.length, 1);
    assert.equal(productQueries[0].query.where.statusId, 'S1');
});

test('recommendation result limit is bounded and accepts fractional or invalid input safely', async () => {
    const manyProducts = Array.from({ length: 105 }, (_, index) => ({ id: index + 1, statusId: 'S1' }));
    const { service } = serviceWith({ products: manyProducts, recommendationIds: manyProducts.map(product => String(product.id)) });
    assert.equal((await service.getProductRecommend({ userId: 7, limit: 1000 })).data.length, 100);
    assert.equal((await service.getProductRecommend({ userId: 7, limit: '2.9' })).data.length, 2);
    assert.equal((await service.getProductRecommend({ userId: 7, limit: 'invalid' })).data.length, 20);
});
