const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const { Op } = require('sequelize');

function load(relativePath, dependencies) {
  const filename = path.resolve(__dirname, '../src', relativePath);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = loaded.require.bind(loaded);
  loaded.require = name => Object.prototype.hasOwnProperty.call(dependencies, name) ? dependencies[name] : original(name);
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  return loaded.exports;
}

function fixture({ status = 'S6', owner = 1, purchasedVariant = 61, comments = [] } = {}) {
  const calls = [];
  const data = {
    User: [{ id: 1, firstName: 'Buyer', lastName: 'One', image: '', password: 'never-expose' }, { id: 2 }],
    Product: [{ id: 10 }, { id: 11 }], Blog: [{ id: 5 }],
    AddressUser: [{ id: 21, userId: owner }],
    OrderProduct: [{ id: 41, addressUserId: 21, statusId: status }],
    ProductDetail: [{ id: 51, productId: 10 }, { id: 52, productId: 11 }],
    ProductDetailSize: [{ id: 61, productdetailId: 51 }, { id: 62, productdetailId: 52 }],
    OrderDetail: [{ id: 71, orderId: 41, productId: purchasedVariant }],
    Comment: comments.map(row => ({ ...row })),
  };
  const matches = (row, where = {}) => Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === 'object') {
      if (Op.in in expected) return expected[Op.in].some(value => String(value) === String(row[key]));
      if (Op.is in expected) return row[key] == null;
    }
    return String(row[key]) === String(expected);
  });
  const db = {};
  for (const [name, rows] of Object.entries(data)) {
    db[name] = {
      async findAll(query = {}) { calls.push({ name, method: 'findAll', query }); return rows.filter(row => matches(row, query.where)).map(row => ({ ...row })); },
      async findOne(query) { return (await this.findAll(query))[0] || null; },
      async findByPk(id, query = {}) {
        calls.push({ name, method: 'findByPk', query });
        const row = rows.find(row => Number(row.id) === Number(id));
        if (!row) return null;
        return query.attributes ? Object.fromEntries(query.attributes.map(key => [key, row[key]])) : { ...row };
      },
      async create(values, query = {}) { calls.push({ name, method: 'create', query }); const row = { id: rows.length + 101, ...values }; rows.push(row); return row; },
    };
  }
  let queue = Promise.resolve();
  db.sequelize = { async transaction(work) {
    const previous = queue;
    let release;
    queue = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await work({ LOCK: { UPDATE: 'UPDATE' } }); } finally { release(); }
  } };
  return { service: load('services/commentService.js', { '../models': db }), data, calls };
}
const review = { productId: 10, userId: 1, content: '  Sản phẩm tốt  ', star: 5 };

test('review eligibility follows buyer address, delivered status and purchased size variant', async () => {
  const cases = [
    [{}, true], [{ status: 'S3' }, false], [{ status: 'S4' }, false], [{ status: 'S5' }, false],
    [{ status: 'S7' }, false], [{ owner: 2 }, false], [{ purchasedVariant: 62 }, false],
  ];
  for (const [options, allowed] of cases) {
    const { service, data } = fixture(options);
    const result = await service.createNewReview(review);
    assert.equal(result.errCode === 0, allowed, JSON.stringify(options));
    assert.equal(data.Comment.length, allowed ? 1 : 0);
    if (!allowed) assert.equal(result.reviewEligibility.reason, 'DELIVERED_PURCHASE_REQUIRED');
  }
});

test('repeat and concurrent submissions create one review and serialize the author before reading eligibility', async () => {
  const { service, data, calls } = fixture();
  const results = await Promise.all([service.createNewReview(review), service.createNewReview(review)]);
  assert.equal(results.filter(result => result.errCode === 0).length, 1);
  assert.equal(results.find(result => result.errCode !== 0).reviewEligibility.reason, 'ALREADY_REVIEWED');
  assert.equal(data.Comment.length, 1);
  assert.equal(data.Comment[0].content, 'Sản phẩm tốt');
  const lockCalls = calls.filter(call => call.name === 'User' && call.method === 'findByPk');
  assert.equal(lockCalls.length, 2);
  assert.ok(lockCalls.every(call => call.query.transaction && call.query.lock === 'UPDATE'));
  assert.ok(calls.findIndex(call => call.name === 'User') < calls.findIndex(call => call.name === 'Comment'));
  assert.ok(calls.find(call => call.name === 'Comment' && call.method === 'create').query.transaction);
});

test('a reply does not count as a submitted rating and does not require a customer purchase', async () => {
  const { service, data } = fixture({ comments: [{ id: 100, productId: 10, userId: 2, star: 4, parentId: null }] });
  const reply = await service.ReplyReview({ productId: 10, userId: 1, parentId: 100, content: 'Cảm ơn' });
  assert.equal(reply.errCode, 0);
  assert.equal((await service.createNewReview(review)).errCode, 0);
  assert.equal(data.Comment.filter(row => !row.parentId).length, 2);
  assert.equal(data.Comment.find(row => row.parentId).star, undefined);
});

test('stars must be integers from 1 to 5 and blank content is rejected before writes', async () => {
  for (const star of [0, -1, 6, 1.5, '', 'bad', null, true, false, [], {}]) {
    const { service, data } = fixture();
    assert.notEqual((await service.createNewReview({ ...review, star })).errCode, 0, String(star));
    assert.equal(data.Comment.length, 0);
  }
  const { service } = fixture();
  assert.notEqual((await service.createNewReview({ ...review, content: '  ' })).errCode, 0);
  assert.equal((await service.createNewReview({ ...review, star: '4' })).errCode, 0);
});

test('public review listing provides login guidance without leaking private user details', async () => {
  const { service } = fixture({ comments: [{ id: 100, productId: 10, userId: 1, star: 4, parentId: null }] });
  const response = await service.getAllReviewByProductId(10);
  assert.equal(response.reviewEligibility.reason, 'LOGIN_REQUIRED');
  assert.equal(response.data.length, 1);
  assert.equal(response.data[0].user.password, undefined);
  assert.equal(response.data[0].user.email, undefined);
  const authorized = await service.getAllReviewByProductId(10, 1);
  assert.equal(authorized.reviewEligibility.reason, 'ALREADY_REVIEWED');
  const other = await service.getAllReviewByProductId(10, 2);
  assert.equal(other.reviewEligibility.reason, 'DELIVERED_PURCHASE_REQUIRED');
});

test('review controller gets eligibility actor from authenticated request identity', async () => {
  let received;
  const controller = load('controllers/commentController.js', { '../services/commentService': {
    async getAllReviewByProductId(...args) { received = args; return { errCode: 0 }; },
  } });
  await controller.getAllReviewByProductId({ query: { id: 10, userId: 2 }, user: { id: 1 } }, { json() {} }, error => { throw error; });
  assert.deepEqual(received, [10, 1]);
});
