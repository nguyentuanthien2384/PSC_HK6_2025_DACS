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
        }, async findAndCountAll(options) {
            calls.push({ name: 'ProductImage', options });
            const selected = images.filter(row => row.productdetailId === Number(options.where.productdetailId));
            return { count: selected.length, rows: selected.slice(options.offset, options.offset + options.limit)
                .map(row => Object.fromEntries(options.attributes.map(field => [field, row[field]]))) };
        } },
        ProductDetailSize: children('ProductDetailSize', sizes)
    };
    return { service: loadService(db), calls, details, db, images, sizes };
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

test('seller gallery lists use small thumbnails and full preview URLs without reading original blobs', async () => {
    const f = fixture(30);
    const result = await f.service.getAllProductDetailImageById({ id: 10, limit: 1, offset: 1 });
    assert.equal(result.count, 2);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].id, 101);
    assert.equal(result.data[0].caption, 'Back');
    assert.equal(result.data[0].image, `/api/media/product-images/101/${'b'.repeat(64)}/card`);
    assert.equal(result.data[0].previewImage, `/api/media/product-images/101/${'b'.repeat(64)}/detail`);
    assert.equal(f.calls[0].options.attributes.includes('image'), false);
    assert.deepEqual(f.calls[0].options.order, [['id', 'ASC']]);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) < 1000);
    assert.equal(JSON.stringify(result).includes('base64'), false);
});

test('seller gallery validates ids and bounds pagination before database reads', async () => {
    const f = fixture();
    for (const id of [undefined, null, true, {}, [], -1, 0, 'invalid', 0.5]) {
        assert.equal((await f.service.getAllProductDetailImageById({ id })).errCode, 1);
    }
    assert.equal(f.calls.length, 0);
    await f.service.getAllProductDetailImageById({ id: '10', limit: Infinity, offset: Infinity });
    assert.equal(f.calls[0].options.limit, 20);
    assert.equal(f.calls[0].options.offset, 0);
    await f.service.getAllProductDetailImageById({ id: '10', limit: 500, offset: 1.9 });
    assert.equal(f.calls[1].options.limit, 100);
    assert.equal(f.calls[1].options.offset, 1);
});

test('public details keep live price, stock and gallery metadata while counting views once', async () => {
    const f = fixture(2);
    const product = { id: 1, name: 'Current product', statusId: 'S1', view: 5 };
    const views = [];
    f.db.Product = {
        async findOne() { return { ...product }; },
        async update(values, options) { views.push({ values, options }); },
    };
    f.db.ProductDetail.findAll = async () => f.details.map(row => ({ ...row }));
    let onHand = 10;
    f.db.ReceiptDetail = { async findAll() { return f.sizes.map(row => ({ productDetailSizeId: row.id, quantity: onHand })); } };
    f.db.OrderDetail = { async findAll() { return [{ productId: f.sizes[0].id, orderId: 1, quantity: 2 }]; } };
    f.db.OrderProduct = { async findAll() { return [{ id: 1 }]; } };
    f.db.PaymentSession = { async findAll() { return [{ checkoutData: JSON.stringify({ lines: [{ productId: f.sizes[0].id, quantity: 3 }] }) }]; } };
    const service = loadService(f.db);
    const first = await service.getDetailProductById(1);
    assert.equal(first.errCode, 0);
    assert.equal(first.data.productDetail[0].discountPrice, 100000);
    assert.deepEqual(first.data.productDetail.map(row => row.productDetailSize[0].stock), [5, 10]);
    assert.equal(first.data.productDetail[0].productImage[0].image, `/api/media/product-images/100/${'a'.repeat(64)}/detail`);
    assert.equal(views.length, 1);
    assert.match(views[0].values.view.val, /COALESCE\(`view`, 0\) \+ 1/);
    assert.deepEqual(views[0].options.where, { id: 1 });
    onHand = 7;
    f.details[0].discountPrice = 90000;
    const next = await service.getDetailProductById(1);
    assert.equal(next.data.productDetail[0].discountPrice, 90000);
    assert.equal(next.data.productDetail[0].productDetailSize[0].stock, 2);
    product.statusId = 'S2';
    assert.equal((await service.getDetailProductById(1)).errCode, 2);
    assert.equal(views.length, 2, 'hidden product reads do not count views or expose details to shoppers');
    assert.equal((await service.getDetailProductById(1, { roleId: 'R1' })).errCode, 0);
});
