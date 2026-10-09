const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'http-tests-only-secret-with-at-least-32-characters';
process.env.CORS_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000';
require('@babel/register')({ cache: false, presets: [['@babel/preset-env', { targets: { node: 'current' } }]] });
const db = require('../src/models');
const { createApp } = require('../src/app');
const CommonUtils = require('../src/utils/CommonUtils');
let server, base;
const originals = { authenticate: db.sequelize.authenticate, findUser: db.User.findOne, findCode: db.Allcode.findAll };
before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
  db.sequelize.authenticate = async () => {};
  db.User.findOne = async () => null;
  db.Allcode.findAll = async () => [];
});
after(async () => {
  db.sequelize.authenticate = originals.authenticate;
  db.User.findOne = originals.findUser;
  db.Allcode.findAll = originals.findCode;
  await new Promise(resolve => server.close(resolve));
  await db.sequelize.close();
});
test('CORS preflight permits configured frontend and authorization', async () => {
  const res = await fetch(base + '/api/login', { method: 'OPTIONS', headers: {
    Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type',
  } });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  assert.match(res.headers.get('access-control-allow-headers'), /Authorization/);
});
test('CORS rejects unconfigured origins with a JSON error', async () => {
  const res = await fetch(base + '/api/health', { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).errCode, 403);
});
test('health differentiates available and unavailable database', async () => {
  assert.equal((await fetch(base + '/api/health')).status, 200);
  db.sequelize.authenticate = async () => { throw new Error('offline'); };
  const res = await fetch(base + '/api/health');
  assert.equal(res.status, 503);
  assert.equal((await res.json()).database, 'disconnected');
});
test('public catalog route responds without authentication', async () => {
  db.Allcode.findAll = async options => { assert.equal(options.where.type, 'CATEGORY'); return [{ code: 'C1', value: 'Áo' }]; };
  const res = await fetch(base + '/api/get-all-code?type=CATEGORY');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data[0].code, 'C1');
});
test('private endpoints consistently reject anonymous callers', async () => {
  for (const route of ['/api/get-all-order', '/api/get-detail-order?id=1', '/api/get-all-receipt', '/api/get-all-supplier',
    '/api/get-all-voucher-by-userid?id=1', '/api/get-detail-user-by-id?id=1', '/api/get-product-shopcart?userId=1']) {
    const res = await fetch(base + route);
    assert.equal(res.status, 401, route);
    assert.equal((await res.json()).refresh, true, route);
  }
});
test('valid customer receives forbidden on admin endpoint without invalidating session', async () => {
  const user = { id: 42, roleId: 'R2', statusId: 'S1', password: 'password-hash' };
  db.User.findOne = async () => user;
  const token = CommonUtils.encodeToken(user.id, user.password);
  const res = await fetch(base + '/api/get-all-order', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).refresh, undefined);
});
test('unknown routes and invalid JSON return structured HTTP errors', async () => {
  const missing = await fetch(base + '/api/does-not-exist');
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).errCode, 404);
  const malformed = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).errCode, 400);
});