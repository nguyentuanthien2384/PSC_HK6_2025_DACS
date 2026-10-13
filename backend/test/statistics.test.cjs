const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const { Op } = require('sequelize');
function service(db) {
  const filename = path.resolve(__dirname, '../src/services/statisticService.js');
  const code = babel.transformFileSync(filename, { babelrc: false, configFile: false, presets: [[require.resolve('@babel/preset-env'), { targets: { node: 'current' } }]] }).code;
  const loaded = new Module(filename, module);
  loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = loaded.require.bind(loaded);
  loaded.require = name => name === '../models/index' ? db : original(name);
  loaded._compile(code, filename); return loaded.exports;
}
function fixture(orders = [], lines = [], receipts = []) {
  return { OrderProduct: { findAll: async () => orders }, OrderDetail: { findAll: async () => lines }, TypeVoucher: { findAll: async () => [] }, ReceiptDetail: { findAll: async () => receipts } };
}
test('reports reject missing, invalid and reversed dates before touching database', async () => {
  const s = service({});
  for (const data of [{}, { type: 'day', oneDate: '2026-10-01' }, { type: 'day', oneDate: '2026-10-03', twoDate: '2026-10-01' }, { type: 'month', oneDate: 'invalid' }, { type: 'invalid', oneDate: '2026-10-01' }]) {
    assert.equal((await s.getStatisticOverturn(data)).errCode, 1);
  }
  assert.equal((await s.getStatisticByDay({ month: 13, year: 2026 })).errCode, 1);
  assert.equal((await s.getStatisticByDay({ month: 2 })).errCode, 1);
});
test('February handles leap centuries and returns zero revenue on empty periods', async () => {
  const s = service(fixture());
  assert.equal((await s.getStatisticByDay({ month: 2, year: 2000 })).data.arrayDayValue.length, 29);
  assert.equal((await s.getStatisticByDay({ month: 2, year: 2100 })).data.arrayDayValue.length, 28);
  assert.ok((await s.getStatisticByMonth({ year: 2026 })).data.arrayMonthValue.every(value => value === 0));
});
test('revenue uses immutable delivery date and stored order price in the shop timezone', async () => {
  const s = service(fixture([
    { id: 1, deliveredAt: '2026-09-30T17:10:00Z', updatedAt: '2026-11-01', totalPrice: '150000', typeShipData: { price: 999999 } },
    { id: 2, deliveredAt: '2026-09-30T16:59:00Z', updatedAt: '2026-10-03', totalPrice: '250000' },
    { id: 3, deliveredAt: null, updatedAt: '2026-10-02T02:00:00Z', totalPrice: '50000' },
  ], [{ orderId: 1, quantity: 1, realPrice: 123, productId: 8 }]));
  const days = (await s.getStatisticByDay({ year: 2026, month: 10 })).data.arrayDayValue;
  assert.equal(days[0], 150000); assert.equal(days[1], 50000); assert.equal(days.reduce((a, b) => a + b), 200000);
});
test('profit excludes receipts imported after actual delivery', async () => {
  const s = service(fixture([{ id: 1, deliveredAt: '2026-10-05T12:00:00+07:00', totalPrice: 500 }], [{ orderId: 1, productId: 8, quantity: 2, realPrice: 250 }], [
    { productDetailSizeId: 8, quantity: 2, price: 100, createdAt: '2026-10-01' },
    { productDetailSizeId: 8, quantity: 2, price: 200, createdAt: '2026-10-02' },
    { productDetailSizeId: 8, quantity: 100, price: 10000, createdAt: '2026-10-06' },
  ]));
  const row = (await s.getStatisticProfit({ type: 'month', oneDate: '2026-10-01' })).data[0];
  assert.equal(row.importPrice, 300); assert.equal(row.profitPrice, 200);
});
test('revenue subtracts only settled refunds and reverses estimated cost for resellable whole returns', async () => {
  const db = fixture([{ id: 1, deliveredAt: '2026-10-05T12:00:00+07:00', totalPrice: 500 }], [{ orderId: 1, productId: 8, quantity: 2, realPrice: 250 }], [{ productDetailSizeId: 8, quantity: 2, price: 100, createdAt: '2026-10-01' }]);
  db.ReturnRequest = { findAll: async query => { assert.equal(query.where.status, 'REFUNDED'); return [{ orderId: 1, amount: 500, resellable: true }]; } };
  const s = service(db);
  const row = (await s.getStatisticProfit({ type: 'month', oneDate: '2026-10-01' })).data[0];
  assert.equal(row.totalpriceProduct, 500); assert.equal(row.refundAmount, 500); assert.equal(row.netRevenue, 0); assert.equal(row.profitPrice, 0);
  assert.equal((await s.getStatisticByDay({ year: 2026, month: 10 })).data.arrayDayValue[4], 0);
});
test('status chart filters by creation date instead of mutable last update', async () => {
  const s = service({ Allcode: { findAll: async () => [{ code: 'S3', value: 'Chờ xác nhận' }, { code: 'S6', value: 'Đã giao' }] }, OrderProduct: { findAll: async options => {
    assert.ok(options.where.createdAt[Op.between]); assert.equal(options.where.updatedAt, undefined);
    return [{ statusId: 'S6' }, { statusId: 'S6' }];
  } } });
  assert.deepEqual((await s.getCountStatusOrder({ type: 'month', oneDate: '2026-10-01' })).data.arrayValue, [0, 2]);
});
test('date-only period boundaries remain in shop time even on a UTC+14 server', async () => {
  const oldTimezone = process.env.TZ;
  process.env.TZ = 'Pacific/Kiritimati';
  try {
    const s = service({ Allcode: { findAll: async () => [] }, OrderProduct: { findAll: async options => {
      const [start, end] = options.where.createdAt[Op.between];
      assert.equal(start.toISOString(), '2026-09-30T17:00:00.000Z');
      assert.equal(end.toISOString(), '2026-10-31T16:59:59.999Z');
      return [];
    } } });
    assert.equal((await s.getCountStatusOrder({ type: 'month', oneDate: '2026-10-01' })).errCode, 0);
  } finally {
    if (oldTimezone === undefined) delete process.env.TZ; else process.env.TZ = oldTimezone;
  }
});
test('stock paginates offset zero, excludes cancelled sales and subtracts pending reservations', async () => {
  const s = service({
    Allcode: {}, ProductDetailSize: { findAndCountAll: async options => { assert.equal(options.limit, 10); assert.equal(options.offset, 0); return { count: 45, rows: [{ id: 8, productdetailId: 2 }] }; } },
    ReceiptDetail: { findAll: async () => [{ productDetailSizeId: 8, quantity: 10 }] },
    OrderDetail: { findAll: async () => [{ orderId: 1, productId: 8, quantity: 3 }, { orderId: 2, productId: 8, quantity: 4 }] },
    OrderProduct: { findAll: async () => [{ id: 1 }] },
    PaymentSession: { findAll: async options => { assert.equal(options.where.status, 'PENDING'); assert.ok(options.where.expiresAt[Op.gt]); return [{ checkoutData: JSON.stringify({ lines: [{ productId: 8, quantity: 2 }] }) }]; } },
    ProductDetail: { findAll: async () => [{ id: 2, productId: 6 }] }, Product: { findAll: async () => [{ id: 6, name: 'Áo' }] },
  });
  const result = await s.getStatisticStockProduct({ limit: 10, offset: 0 });
  assert.equal(result.count, 45); assert.equal(result.data[0].onHand, 7); assert.equal(result.data[0].reserved, 2); assert.equal(result.data[0].stock, 5);
});
