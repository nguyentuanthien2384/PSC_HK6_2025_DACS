const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

if (process.env.RUN_DB_TESTS !== 'true') {
    test('catalog performance MySQL integration (opt in on an isolated TEST_DB_* database)', { skip: true }, () => {});
} else {
    if (process.env.NODE_ENV !== 'test' || !/test|integration/i.test(process.env.TEST_DB_DATABASE_NAME || '')) throw new Error('Catalog integration requires a dedicated test database.');
    for (const key of ['TEST_DB_HOST', 'TEST_DB_PORT', 'TEST_DB_DATABASE_NAME', 'TEST_DB_USERNAME', 'TEST_DB_PASSWORD']) {
        if (!Object.prototype.hasOwnProperty.call(process.env, key)) throw new Error(`Explicit ${key} is required.`);
    }
    require('@babel/register')({ cache: false });
    const db = require('../src/models');
    const { createCatalogService } = require('../src/services/catalogService');
    const { catalogStocks } = require('../src/services/catalogStockService');
    const { createCommerceService } = require('../src/services/commerceService');
    before(() => db.sequelize.authenticate());
    after(() => db.sequelize.close());

    function scopedDatabase(transaction, sql) {
        const scoped = { ...db };
        for (const name of ['Product', 'ProductDetail', 'ProductDetailSize', 'ProductImage', 'ReceiptDetail', 'OrderDetail', 'OrderProduct', 'PaymentSession', 'InventoryAdjustment']) {
            scoped[name] = Object.fromEntries(['findAll', 'findAndCountAll', 'sum'].map(method => [method, (...args) => {
                const options = args.at(-1);
                args[args.length - 1] = { ...options, transaction, logging: statement => sql.push(statement) };
                return db[name][method](...args);
            }]));
        }
        return scoped;
    }

    test('real catalog SQL is bounded and paginates global first-variant prices without returning image blobs', async () => {
        const transaction = await db.sequelize.transaction();
        try {
            const tag = crypto.randomUUID().slice(0, 8);
            const categoryId = `CATPERF_${tag}`, brandId = `BRDPERF_${tag}`;
            await db.Allcode.bulkCreate([{ code: categoryId, value: 'Performance category', type: 'CATEGORY' }, { code: brandId, value: 'Performance brand', type: 'BRAND' }], { transaction });
            const activeProducts = [];
            for (let index = 0; index < 8; index++) {
                const product = await db.Product.create({ name: `Performance product ${index}`, statusId: index === 7 ? 'S2' : 'S1', categoryId, brandId, contentHTML: 'large HTML'.repeat(10000), contentMarkdown: 'large markdown'.repeat(10000), view: index }, { transaction });
                if (index !== 7) activeProducts.push(product);
                for (let variant = 0; variant < 2; variant++) {
                    const detail = await db.ProductDetail.create({ productId: product.id, nameDetail: `Variant ${variant}`, originalPrice: 2000, discountPrice: variant ? 1 : (8 - index) * 100, description: 'large detail'.repeat(1000) }, { transaction });
                    await db.ProductDetailSize.create({ productdetailId: detail.id, sizeId: 'PERFORMANCE_SIZE' }, { transaction });
                    await db.ProductImage.create({ productdetailId: detail.id, image: `data:image/png;base64,${'AAAA'.repeat(16000)}` }, { transaction });
                }
            }
            const sql = [], catalog = createCatalogService(scopedDatabase(transaction, sql));
            const result = await catalog.list({ categoryId, sortPrice: 'true', limit: 3, offset: 2 });
            assert.equal(result.errCode, 0); assert.equal(result.count, 7);
            assert.deepEqual(result.data.map(product => product.id), [activeProducts[4].id, activeProducts[3].id, activeProducts[2].id]);
            assert.deepEqual(result.data.map(product => Number(product.price)), [400, 500, 600]);
            assert.equal(sql.length, 4, sql.join('\n'));
            assert.ok(sql.every(statement => !/`image`|`contentHTML`|`contentMarkdown`|`description`/.test(statement)), sql.join('\n'));
            for (const product of result.data) {
                assert.equal(product.productDetail.length, 1);
                assert.match(product.productDetail[0].productImage[0].image, /^\/api\/media\/product-images\/\d+\/[a-f0-9]{64}\/card$/);
            }
            assert.ok(!JSON.stringify(result).includes('base64'));
            assert.ok(Buffer.byteLength(JSON.stringify(result)) < 4000);
            sql.length = 0;
            const full = await catalog.list({ categoryId, limit: '' }, { admin: true });
            assert.equal(full.count, 8); assert.equal(full.data.length, 8);
            assert.equal(full.data[0].productDetail.length, 2);
            assert.equal(full.data[0].productDetail[1].productDetailSize.length, 1);
            assert.equal(sql.length, 5);
        } finally {
            await transaction.rollback();
        }
    });

    test('real batched detail inventory agrees with checkout stock for returns, cancellations and active payment reservations', async () => {
        const transaction = await db.sequelize.transaction();
        try {
            const tag = crypto.randomUUID();
            const product = await db.Product.create({ name: 'Stock performance', statusId: 'S1', view: 0 }, { transaction });
            const detail = await db.ProductDetail.create({ productId: product.id, nameDetail: 'Stock variant', originalPrice: 1000, discountPrice: 900 }, { transaction });
            const first = await db.ProductDetailSize.create({ productdetailId: detail.id, sizeId: 'PERFORMANCE_SIZE' }, { transaction });
            const second = await db.ProductDetailSize.create({ productdetailId: detail.id, sizeId: 'PERFORMANCE_SIZE_TWO' }, { transaction });
            await db.ReceiptDetail.bulkCreate([{ productDetailSizeId: first.id, quantity: 10, price: 500 }, { productDetailSizeId: second.id, quantity: 2, price: 500 }], { transaction });
            const active = await db.OrderProduct.create({ statusId: 'S6' }, { transaction });
            const cancelled = await db.OrderProduct.create({ statusId: 'S7' }, { transaction });
            await db.OrderDetail.bulkCreate([
                { productId: first.id, orderId: active.id, quantity: 5, realPrice: 900 },
                { productId: first.id, orderId: cancelled.id, quantity: 7, realPrice: 900 },
                { productId: second.id, orderId: active.id, quantity: 3, realPrice: 900 },
            ], { transaction });
            await db.InventoryAdjustment.create({ productDetailSizeId: first.id, orderId: active.id, quantity: 2, idempotencyKey: `stock-performance-${tag}`, reason: 'RETURN_RECEIVED' }, { transaction });
            const session = { userId: 1, provider: 'vnpay', status: 'PENDING', totalPrice: 900, providerAmount: '900', currency: 'VND', checkoutData: JSON.stringify({ lines: [{ productId: first.id, quantity: 3 }] }) };
            await db.PaymentSession.bulkCreate([
                { ...session, id: crypto.randomUUID(), expiresAt: new Date(Date.now() + 60000) },
                { ...session, id: crypto.randomUUID(), expiresAt: new Date(Date.now() - 60000) },
            ], { transaction });
            const sql = [], scoped = scopedDatabase(transaction, sql);
            const actual = await catalogStocks(scoped, [first.id, second.id]);
            assert.deepEqual([...actual], [[first.id, 4], [second.id, 0]]);
            assert.equal(sql.length, 5);
            const commerce = createCommerceService(scoped);
            assert.equal(actual.get(first.id), await commerce.availableStock(first.id, transaction));
            assert.equal(actual.get(second.id), await commerce.availableStock(second.id, transaction));
        } finally {
            await transaction.rollback();
        }
    });
}
