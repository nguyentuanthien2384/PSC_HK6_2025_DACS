const test = require('node:test');
const assert = require('node:assert/strict');
const { catalogStocks } = require('../src/services/catalogStockService');

function stockDb(count) {
    let reads = 0;
    const rows = modelRows => ({ async findAll() { reads++; return modelRows; } });
    return {
        reads: () => reads,
        db: {
            ReceiptDetail: rows(Array.from({ length: count }, (_, index) => ({ productDetailSizeId: index + 1, quantity: '10' }))),
            OrderDetail: rows([{ productId: 1, orderId: 1, quantity: '4' }, { productId: 1, orderId: 2, quantity: 2 }, { productId: 2, orderId: 3, quantity: 100 }]),
            OrderProduct: rows([{ id: 1 }, { id: 3 }]),
            InventoryAdjustment: rows([{ productDetailSizeId: 1, quantity: '1' }]),
            PaymentSession: rows([{ checkoutData: JSON.stringify({ lines: [{ productId: 1, quantity: 2 }, { productId: 999, quantity: 10 }] }) }]),
        },
    };
}

test('batched storefront stock includes returned inventory, excludes cancelled orders and pending reservations', async () => {
    const { db, reads } = stockDb(3);
    const result = await catalogStocks(db, [1, 2, 3]);
    assert.deepEqual([...result], [[1, 5], [2, 0], [3, 10]]);
    assert.equal(reads(), 5);
});

test('stock query count stays constant as variant count grows', async () => {
    for (const count of [1, 100]) {
        const { db, reads } = stockDb(count);
        const result = await catalogStocks(db, Array.from({ length: count }, (_, index) => index + 1));
        assert.equal(result.size, count);
        assert.equal(reads(), 5);
    }
});

test('empty variant sets need no stock queries', async () => {
    const { db, reads } = stockDb(10);
    assert.deepEqual([...await catalogStocks(db, [])], []);
    assert.equal(reads(), 0);
});
