const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

function serviceWith({ products, recommendationIds = [] }) {
    const queries = [];
    const db = {
        Allcode: {},
        Product: {
            async findAll(query) {
                queries.push(query);
                return products.filter((product) => !query.where || product.statusId === query.where.statusId)
                    .sort((left, right) => {
                        for (const [field, direction] of query.order) {
                            const difference = left[field] < right[field] ? -1 : left[field] > right[field] ? 1 : 0;
                            if (difference) return direction === 'DESC' ? -difference : difference;
                        }
                        return 0;
                    })
                    .slice(0, query.limit).map((product) => ({ ...product }));
            },
            async findOne(query) {
                queries.push(query);
                const found = products.find((product) => String(product.id) === String(query.where.id) && (!query.where.statusId || product.statusId === query.where.statusId));
                return found ? { ...found } : null;
            },
        },
        ProductDetail: { async findAll({ where }) { return [{ id: where.productId * 10, productId: where.productId, discountPrice: 100000 }]; } },
        ProductDetailSize: { async findAll() { return []; } },
        ProductImage: { async findAll() { return []; } },
        Comment: { async findAll() { return []; } },
    };
    const jsrecommender = {
        Table: class { setCell() {} },
        Recommender: class {
            fit() { return {}; }
            transform() { return { columnNames: ['7'], rowNames: recommendationIds, getCell() { return 5; } }; }
        },
    };
    const filename = path.resolve(__dirname, '../src/services/productService.js');
    const code = babel.transformFileSync(filename, {
        babelrc: false, configFile: false,
        presets: [[require.resolve('@babel/preset-env'), { targets: { node: 'current' } }]],
    }).code;
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    const mocks = { '../models/index': db, 'js-recommender': jsrecommender, 'dotenv': { config() {} }, './commerceService': { createCommerceService() { return {}; } } };
    const originalRequire = loaded.require.bind(loaded);
    loaded.require = (name) => Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : originalRequire(name);
    loaded._compile(code, filename);
    return { service: loaded.exports, queries };
}

const products = [
    { id: 1, name: '[DEMO] retired', statusId: 'S2', view: 99999, createdAt: 99999 },
    { id: 2, name: 'Current popular', statusId: 'S1', view: 50, createdAt: 20 },
    { id: 3, name: 'Current new', statusId: 'S1', view: 10, createdAt: 30 },
];

test('featured and new home sections exclude retired records before applying order and limit', async () => {
    const { service } = serviceWith({ products });
    assert.deepEqual((await service.getProductFeature(1)).data.map((product) => product.id), [2]);
    assert.deepEqual((await service.getProductNew(1)).data.map((product) => product.id), [3]);
    assert.deepEqual((await service.getProductFeature(100)).data.map((product) => product.id), [2, 3]);
});

test('home listing limits are finite positive integers bounded at 100', async () => {
    const { service, queries } = serviceWith({ products });
    const examples = [[undefined, 20], ['', 20], ['nope', 20], [Infinity, 20], [-5, 20], [0, 20], ['2.9', 2], [0.5, 1], [200, 100]];
    for (const method of ['getProductFeature', 'getProductNew']) {
        for (const [input, expected] of examples) {
            await service[method](input);
            assert.equal(queries.at(-1).limit, expected, `${method}(${input})`);
        }
    }
});

test('tied view counts and creation timestamps use the newest id consistently', async () => {
    const { service } = serviceWith({ products: [
        { id: 4, statusId: 'S1', view: 0, createdAt: 50 },
        { id: 5, statusId: 'S1', view: 0, createdAt: 50 },
    ] });
    assert.deepEqual((await service.getProductFeature(2)).data.map((product) => product.id), [5, 4]);
    assert.deepEqual((await service.getProductNew(2)).data.map((product) => product.id), [5, 4]);
});

test('recommendations skip retired and missing records without consuming the active result limit', async () => {
    const { service, queries } = serviceWith({ products, recommendationIds: ['1', '999', '2', '3'] });
    const result = await service.getProductRecommend({ userId: 7, limit: 1 });
    assert.equal(result.errCode, 0);
    assert.deepEqual(result.data.map((product) => product.id), [2]);
    assert.ok(queries.every((query) => query.where.statusId === 'S1'));
    assert.equal(queries.length, 3);
});

test('recommendation result limit is bounded and accepts fractional or invalid input safely', async () => {
    const manyProducts = Array.from({ length: 105 }, (_, index) => ({ id: index + 1, statusId: 'S1' }));
    const { service } = serviceWith({ products: manyProducts, recommendationIds: manyProducts.map((product) => String(product.id)) });
    assert.equal((await service.getProductRecommend({ userId: 7, limit: 1000 })).data.length, 100);
    assert.equal((await service.getProductRecommend({ userId: 7, limit: '2.9' })).data.length, 2);
    assert.equal((await service.getProductRecommend({ userId: 7, limit: 'invalid' })).data.length, 20);
});
