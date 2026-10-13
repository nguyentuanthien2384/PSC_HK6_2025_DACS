const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const { Op } = require('sequelize');

function loadService(db) {
    const filename = path.resolve(__dirname, '../src/services/productService.js');
    const code = babel.transformFileSync(filename, { babelrc: false, configFile: false,
        presets: [[require.resolve('@babel/preset-env'), { targets: { node: 'current' } }]] }).code;
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    const original = loaded.require.bind(loaded);
    loaded.require = name => name === '../models/index' ? db : name === 'dotenv' ? { config() {} } : original(name);
    loaded._compile(code, filename);
    return loaded.exports;
}

const sourceImage = 'data:image/jpeg;base64,aGVsbG8=';
function fixture(detailCount = 1) {
    const calls = [];
    const details = Array.from({ length: detailCount }, (_, index) => ({ id: index + 10, productId: 1,
        nameDetail: `Color ${index}`, originalPrice: 120000, discountPrice: 100000, description: 'Variant details' }));
    const images = details.flatMap(detail => [
        { id: detail.id * 10, productdetailId: detail.id, imageVersion: 'a'.repeat(64), caption: 'Front', image: Buffer.from(sourceImage) },
        { id: detail.id * 10 + 1, productdetailId: detail.id, imageVersion: 'b'.repeat(64), caption: 'Back', image: Buffer.from(sourceImage) }
    ]);
    const sizes = details.map(detail => ({ id: detail.id * 100, productdetailId: detail.id, sizeId: 'M', width: 10, height: 20, weight: 300 }));
    const children = (name, rows) => ({ async findAll(options) {
        calls.push({ name, options });
        const selected = rows.filter(row => options.where.productdetailId[Op.in].includes(row.productdetailId));
        return selected.map(row => options.attributes ? Object.fromEntries(options.attributes.map(field => [field, row[field]])) : { ...row });
    } });
    const db = {
        ProductDetail: { async findAndCountAll(options) {
            calls.push({ name: 'ProductDetail', options });
            return { count: details.length, rows: details.slice(options.offset, options.offset + options.limit).map(row => ({ ...row })) };
        } },
        ProductImage: { ...children('ProductImage', images), async findOne(options) {
            calls.push({ name: 'ProductImage', options });
            return { ...images.find(row => row.id === options.where.id) };
        } },
        ProductDetailSize: children('ProductDetailSize', sizes)
    };
    return { service: loadService(db), calls, details };
}

test('admin variant lists batch child relations once and keep metadata with lightweight media URLs', async () => {
    for (const detailCount of [1, 30]) {
        const f = fixture(detailCount);
        const result = await f.service.getAllProductDetailById({ id: 1, limit: 100, offset: 0 });
        assert.equal(result.errCode, 0);
        assert.equal(result.count, detailCount);
        assert.equal(result.data.length, detailCount);
        assert.equal(f.calls.length, 3, 'list and child reads must stay constant as variant count grows');
        assert.equal(f.calls.find(call => call.name === 'ProductImage').options.attributes.includes('image'), false);
        for (const detail of result.data) {
            assert.equal(detail.discountPrice, 100000);
            assert.equal(detail.description, 'Variant details');
            assert.equal(detail.productImageData.length, 2);
            assert.equal(detail.productImageData[0].productdetailId, detail.id);
            assert.equal(detail.productImageData[0].image, `/api/media/product-images/${detail.id * 10}/${'a'.repeat(64)}/card`);
            assert.equal(detail.productsize.length, 1);
            assert.equal(detail.productsize[0].productdetailId, detail.id);
            assert.equal(detail.productsize[0].width, 10);
        }
    }
});

test('pagination batches only selected variants and empty pages skip all child reads', async () => {
    const f = fixture(10);
    const result = await f.service.getAllProductDetailById({ id: 1, limit: 3, offset: 3 });
    assert.equal(result.count, 10);
    assert.deepEqual(result.data.map(row => row.id), [13, 14, 15]);
    assert.deepEqual(f.calls[1].options.where.productdetailId[Op.in], [13, 14, 15]);
    assert.deepEqual(f.calls[2].options.where.productdetailId[Op.in], [13, 14, 15]);
    f.calls.length = 0;
    assert.deepEqual(await f.service.getAllProductDetailById({ id: 1, offset: 10 }), { errCode: 0, data: [], count: 10 });
    assert.equal(f.calls.length, 1);
});

test('invalid identifiers do not query and malformed pagination stays finite and integral', async () => {
    const f = fixture();
    for (const id of [undefined, null, true, {}, [], -1, 0, 'invalid', 0.5]) {
        assert.equal((await f.service.getAllProductDetailById({ id })).errCode, 1);
    }
    assert.equal(f.calls.length, 0);
    for (const [input, expected] of [[undefined, 20], [0, 20], ['bad', 20], [Infinity, 20], [0.5, 1], [2.5, 2], [200, 100]]) {
        await f.service.getAllProductDetailById({ id: '1', limit: input, offset: Infinity });
        const query = f.calls.filter(call => call.name === 'ProductDetail').at(-1).options;
        assert.equal(query.limit, expected);
        assert.equal(query.offset, 0);
    }
});

test('image editor still fetches the original upload required when saving a caption edit', async () => {
    const f = fixture();
    const result = await f.service.getDetailProductImageById(100);
    assert.equal(result.errCode, 0);
    assert.equal(result.data.image, sourceImage);
});
