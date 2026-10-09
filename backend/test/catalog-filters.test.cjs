const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const { Op } = require('sequelize');

function loadSource(relativePath, dependencies = {}) {
    const filename = path.resolve(__dirname, '../src', relativePath);
    const code = babel.transformFileSync(filename, {
        babelrc: false, configFile: false,
        presets: [[require.resolve('@babel/preset-env'), { targets: { node: 'current' } }]],
    }).code;
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    const originalRequire = loaded.require.bind(loaded);
    loaded.require = (name) => Object.prototype.hasOwnProperty.call(dependencies, name) ? dependencies[name] : originalRequire(name);
    loaded._compile(code, filename);
    return loaded.exports;
}

const codes = [
    { type: 'BRAND', code: 'NIKE', value: 'Nike' },
    { type: 'BRAND', code: 'DEMO', value: 'Archived demo' },
    { type: 'BRAND', code: 'UNUSED', value: 'Unused brand' },
    { type: 'CATEGORY', code: 'SHOES', value: 'Giày' },
    { type: 'CATEGORY', code: 'ARCHIVED', value: 'Old category' },
    { type: 'SIZE', code: 'EU40', value: 'EU 40' },
];
const products = [
    { statusId: 'S1', categoryId: 'SHOES', brandId: 'NIKE' },
    { statusId: 'S1', categoryId: 'SHOES', brandId: 'NIKE' },
    { statusId: 'S2', categoryId: 'ARCHIVED', brandId: 'DEMO' },
];

function serviceWith(rows = products) {
    const productQueries = [];
    const service = loadSource('services/allcodeService.js', { '../models/index': {
        Product: { async findAll(query) {
            productQueries.push(query);
            return rows.filter((product) => product.statusId === query.where.statusId);
        } },
        Allcode: { async findAll({ where }) {
            return codes.filter((code) => code.type === where.type && (!where.code || where.code[Op.in].includes(code.code)));
        } },
    } });
    return { service, productQueries };
}

test('storefront brand and category filters exclude archived and unused codes', async () => {
    const { service, productQueries } = serviceWith();
    assert.deepEqual((await service.getAllCodeService('BRAND', { activeCatalog: 'true' })).data.map((item) => item.code), ['NIKE']);
    assert.deepEqual((await service.getAllCodeService('CATEGORY', { activeCatalog: true })).data.map((item) => item.code), ['SHOES']);
    assert.deepEqual(productQueries.map((query) => query.attributes), [['brandId'], ['categoryId']]);
    assert.ok(productQueries.every((query) => query.where.statusId === 'S1'));
});

test('admin default and explicit false preserve all codes without querying products', async () => {
    const { service, productQueries } = serviceWith();
    for (const options of [undefined, { activeCatalog: false }, { activeCatalog: 'false' }, { activeCatalog: '0' }]) {
        const result = await service.getAllCodeService('BRAND', options);
        assert.deepEqual(result.data.map((item) => item.code), ['NIKE', 'DEMO', 'UNUSED']);
    }
    assert.equal(productQueries.length, 0);
});

test('empty active catalog returns no storefront filters and other code types stay available', async () => {
    const { service, productQueries } = serviceWith([]);
    assert.deepEqual((await service.getAllCodeService('BRAND', { activeCatalog: true })).data, []);
    assert.deepEqual((await service.getAllCodeService('SIZE', { activeCatalog: true })).data.map((item) => item.code), ['EU40']);
    assert.deepEqual((await service.getAllCodeService('toString', { activeCatalog: true })).data, []);
    assert.equal(productQueries.length, 1);
});

test('controller forwards optional storefront scope and preserves existing response shape', async () => {
    let received;
    const result = { errCode: 0, data: [codes[0]] };
    const controller = loadSource('controllers/allcodeController.js', { '../services/allcodeService': {
        async getAllCodeService(...args) { received = args; return result; },
    } });
    const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await controller.getAllCodeService({ query: { type: 'BRAND', activeCatalog: 'true' } }, response);
    assert.deepEqual(received, ['BRAND', { activeCatalog: 'true' }]);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, result);
});
