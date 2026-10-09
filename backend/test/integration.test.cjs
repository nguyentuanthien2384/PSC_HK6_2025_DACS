const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const enabled = process.env.RUN_DB_TESTS === 'true';
if (!enabled) {
  test('real MySQL integration (opt in with RUN_DB_TESTS=true and TEST_DB_* on an isolated test database)', { skip: true }, () => {});
} else {
  if (process.env.NODE_ENV !== 'test' || !/test|integration/i.test(process.env.TEST_DB_DATABASE_NAME || '')) {
    throw new Error('Database integration requires NODE_ENV=test and a dedicated TEST_DB_DATABASE_NAME containing test or integration.');
  }
  process.env.JWT_SECRET = 'integration-only-jwt-secret-at-least-32-characters';
  process.env.CORS_ORIGINS = 'http://localhost:3000';
  process.env.PAYPAL_CLIENT_ID = '';
  process.env.PAYPAL_CLIENT_SECRET = '';
  process.env.VNP_TMNCODE = 'TESTCODE';
  process.env.VNP_HASHSECRET = 'integration-only-vnpay-signing-secret';
  process.env.EMAIL_APP = '';
  process.env.EMAIL_APP_PASSWORD = '';
  require('@babel/register')({ cache: false });
  const db = require('../src/models');
  const bcrypt = require('bcryptjs');
  const { createApp } = require('../src/app');
  const { signVnpay } = require('../src/utils/commerce');
  const { createCommerceService } = require('../src/services/commerceService');
  const { configureSocket } = require('../src/socket');
  const commerce = createCommerceService(db);
  let server, io, base;
  before(async () => {
    await db.sequelize.authenticate();
    for (const [code, value, type] of [
      ['R1','Quản trị','ROLE'], ['R2','Khách hàng','ROLE'], ['R3','Giao hàng','ROLE'], ['R4','Nhân viên','ROLE'],
      ['S1','Hoạt động','STATUS'], ['S2','Ngừng hoạt động','STATUS'], ['S3','Chờ xác nhận','STATUSORDER'],
      ['S4','Đã xác nhận','STATUSORDER'], ['S5','Đang giao','STATUSORDER'], ['S6','Đã giao','STATUSORDER'], ['S7','Đã hủy','STATUSORDER'],
      ['TEST_CATEGORY','Áo','CATEGORY'], ['TEST_BRAND','Thử nghiệm','BRAND'], ['TEST_SIZE','M','SIZE']]) {
      await db.Allcode.findOrCreate({ where: { code }, defaults: { value, type } });
    }
    const app = createApp();
    server = require('http').createServer(app);
    io = require('socket.io')(server);
    configureSocket(io); app.set('io', io);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => { await new Promise(resolve => io.close(resolve)); await db.sequelize.close(); });
  async function call(path, { token, method = 'GET', body } = {}) {
    const res = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await res.json();
    return { status: res.status, ...result };
  }
  async function fixture(stock = 10) {
    const tag = crypto.randomUUID();
    const password = 'Integration123!';
    const users = [];
    for (const roleId of ['R1', 'R2', 'R2']) {
      const user = await db.User.create({ email: `${tag}-${users.length}@example.com`, password: await bcrypt.hash(password, 4), firstName: 'Test', lastName: 'User', roleId, statusId: 'S1', usertoken: '' });
      const login = await call('/api/login', { method: 'POST', body: { email: user.email, password } });
      assert.equal(login.errCode, 0); users.push({ id: user.id, token: login.accessToken, roleId });
    }
    const [admin, buyer, other] = users;
    const product = await db.Product.create({ name: 'Áo thử nghiệm', statusId: 'S1', categoryId: 'TEST_CATEGORY', brandId: 'TEST_BRAND', view: 0 });
    const detail = await db.ProductDetail.create({ productId: product.id, nameDetail: 'Xanh', originalPrice: 120000, discountPrice: 100000 });
    const variant = await db.ProductDetailSize.create({ productdetailId: detail.id, sizeId: 'TEST_SIZE' });
    await db.ProductImage.create({ productdetailId: detail.id, image: 'data:image/png;base64,AAAA' });
    const supplier = await db.Supplier.create({ name: 'Test supplier', address: 'Test', email: 'supplier@example.com', phonenumber: '0901234567' });
    const receipt = await call('/api/create-new-receipt', { token: admin.token, method: 'POST', body: { supplierId: supplier.id, userId: other.id, productDetailSizeId: variant.id, quantity: stock, price: 60000 } });
    assert.equal(receipt.errCode, 0); assert.equal(receipt.data.userId, admin.id);
    const shipping = await db.TypeShip.create({ type: 'Tiêu chuẩn', price: 20000 });
    const addressResult = await call('/api/create-new-address-user', { token: buyer.token, method: 'POST', body: { userId: other.id, shipName: 'Test User', shipAdress: '123 Test', shipEmail: 'buyer@example.com', shipPhonenumber: '0901234567' } });
    assert.equal(addressResult.errCode, 0); assert.equal(addressResult.data.userId, buyer.id);
    return { admin, buyer, other, product, detail, variant, receipt: receipt.data, shipping, address: addressResult.data };
  }
  const payload = (f, quantity = 2) => ({ userId: f.other.id, addressUserId: f.address.id, typeShipId: f.shipping.id, totalPrice: 1, arrDataShopCart: [{ productId: f.variant.id, quantity, realPrice: 1 }] });
  async function add(f, user = f.buyer, quantity = 2) {
    const result = await call('/api/add-shopcart', { token: user.token, method: 'POST', body: { userId: f.other.id, productdetailsizeId: f.variant.id, quantity } });
    assert.equal(result.errCode, 0); return result;
  }
  test('registration/login and public catalog work against the migrated schema', async () => {
    const email = `registered-${crypto.randomUUID()}@example.com`;
    const created = await call('/api/create-new-user', { method: 'POST', body: { email, lastName: 'Khách hàng', password: 'Password123!', roleId: 'R1' } });
    assert.equal(created.errCode, 0);
    const login = await call('/api/login', { method: 'POST', body: { email, password: 'Password123!' } });
    assert.equal(login.user.roleId, 'R2'); assert.equal(login.user.password, undefined); assert.equal(login.user.usertoken, undefined);
    for (const route of ['/api/get-all-code?type=CATEGORY','/api/get-all-product-user?limit=6&offset=0','/api/get-all-blog?limit=6&offset=0','/api/get-all-banner','/api/get-all-typeship']) {
      const result = await call(route); assert.equal(result.errCode, 0, route + ': ' + result.errMessage);
    }
  });
  test('address and cart identities come from JWT and unrelated customers cannot read private data', async () => {
    const f = await fixture(); await add(f);
    const cart = await call(`/api/get-all-shopcart-by-userId?id=${f.other.id}`, { token: f.buyer.token });
    assert.equal(cart.data.length, 1); assert.equal(cart.data[0].userId, f.buyer.id);
    const otherCart = await call(`/api/get-all-shopcart-by-userId?id=${f.buyer.id}`, { token: f.other.token });
    assert.equal(otherCart.data.length, 0);
    const address = await call(`/api/get-detail-address-user-by-id?id=${f.address.id}`, { token: f.other.token });
    assert.notEqual(address.errCode, 0);
    const user = await call(`/api/get-detail-user-by-id?id=${f.buyer.id}`, { token: f.other.token });
    assert.equal(user.status, 403);
  });
  test('COD checkout persists authoritative totals, consumes cart once and keeps historical prices', async () => {
    const f = await fixture(); await add(f);
    const result = await call('/api/create-new-order', { token: f.buyer.token, method: 'POST', body: payload(f) });
    assert.equal(result.errCode, 0); assert.equal(Number(result.data.totalPrice), 220000);
    assert.equal(await commerce.availableStock(f.variant.id), 8);
    const retry = await call('/api/create-new-order', { token: f.buyer.token, method: 'POST', body: payload(f) });
    assert.notEqual(retry.errCode, 0);
    await db.ProductDetail.update({ discountPrice: 999999 }, { where: { id: f.detail.id } });
    const order = await call(`/api/get-detail-order?id=${result.orderId}`, { token: f.buyer.token });
    assert.equal(order.errCode, 0); assert.equal(Number(order.data.totalPrice), 220000); assert.equal(Number(order.data.orderDetail[0].realPrice), 100000);
    const denied = await call(`/api/get-detail-order?id=${result.orderId}`, { token: f.other.token });
    assert.equal(denied.status, 403);
  });
  test('invalid address and oversell roll back without creating orders or losing the cart', async () => {
    const f = await fixture(2); await add(f);
    const before = await db.OrderProduct.count();
    const invalid = await call('/api/create-new-order', { token: f.other.token, method: 'POST', body: payload(f) });
    assert.notEqual(invalid.errCode, 0);
    const oversell = await call('/api/create-new-order', { token: f.buyer.token, method: 'POST', body: payload(f, 3) });
    assert.notEqual(oversell.errCode, 0); assert.equal(await db.OrderProduct.count(), before);
    assert.equal(await db.ShopCart.count({ where: { userId: f.buyer.id } }), 1);
    const onlineForgery = await call('/api/create-new-order', { token: f.buyer.token, method: 'POST', body: { ...payload(f), isPaymentOnlien: 1 } });
    assert.notEqual(onlineForgery.errCode, 0);
  });
  test('concurrent buyers cannot both buy the last units', async () => {
    const f = await fixture(2); await add(f); await add(f, f.other);
    const otherAddress = await db.AddressUser.create({ userId: f.other.id, shipName: 'Other', shipAdress: 'Other street', shipEmail: 'other@example.com', shipPhonenumber: '0901234567' });
    const results = await Promise.all([
      call('/api/create-new-order', { token: f.buyer.token, method: 'POST', body: payload(f) }),
      call('/api/create-new-order', { token: f.other.token, method: 'POST', body: { ...payload(f), addressUserId: otherAddress.id } }),
    ]);
    assert.equal(results.filter(result => result.errCode === 0).length, 1, JSON.stringify(results));
    assert.equal(await commerce.availableStock(f.variant.id), 0);
  });
  test('cancellation releases stock and a sold receipt cannot be deleted', async () => {
    const f = await fixture(2); await add(f);
    const order = await call('/api/create-new-order', { token: f.buyer.token, method: 'POST', body: payload(f) });
    assert.equal(order.errCode, 0);
    const deleted = await call('/api/delete-receipt', { token: f.admin.token, method: 'DELETE', body: { id: f.receipt.id } });
    assert.notEqual(deleted.errCode, 0);
    const denied = await call('/api/update-status-order', { token: f.other.token, method: 'PUT', body: { id: order.orderId, statusId: 'S7' } });
    assert.equal(denied.status, 403);
    const cancel = await call('/api/update-status-order', { token: f.buyer.token, method: 'PUT', body: { id: order.orderId, statusId: 'S7' } });
    assert.equal(cancel.errCode, 0); assert.equal(await commerce.availableStock(f.variant.id), 2);
    const removed = await call('/api/delete-receipt', { token: f.admin.token, method: 'DELETE', body: { id: f.receipt.id } });
    assert.equal(removed.errCode, 0); assert.equal(await db.ReceiptDetail.count({ where: { receiptId: f.receipt.id } }), 0);
  });
  test('VNPay sessions reserve stock, reject tampering, verify totals and create exactly one paid order', async () => {
    const f = await fixture(2); await add(f);
    const started = await call('/api/payment-order-vnpay', { token: f.buyer.token, method: 'POST', body: { ...payload(f), amount: 1 } });
    assert.equal(started.errCode, 0); assert.equal(started.totalPrice, 220000); assert.equal(await commerce.availableStock(f.variant.id), 0);
    const params = { vnp_TmnCode: 'TESTCODE', vnp_TxnRef: started.checkoutToken, vnp_Amount: '22000000', vnp_ResponseCode: '00', vnp_TransactionStatus: '00', vnp_TransactionNo: String(Date.now()) };
    const callback = { ...params, checkoutToken: started.checkoutToken, vnp_SecureHash: signVnpay(params, process.env.VNP_HASHSECRET) };
    const bad = await call('/api/payment-order-vnpay-success', { token: f.buyer.token, method: 'POST', body: { ...callback, vnp_Amount: '100' } });
    assert.notEqual(bad.errCode, 0);
    const forged = await call('/api/payment-order-vnpay-success', { token: f.other.token, method: 'POST', body: callback });
    assert.equal(forged.status, 403);
    const paid = await call('/api/payment-order-vnpay-success', { token: f.buyer.token, method: 'POST', body: callback });
    assert.equal(paid.errCode, 0); assert.equal(paid.data.isPaymentOnlien, 1); assert.equal(Number(paid.data.totalPrice), 220000);
    const repeated = await call('/api/payment-order-vnpay-success', { token: f.buyer.token, method: 'POST', body: callback });
    assert.equal(repeated.orderId, paid.orderId);
    assert.equal(await commerce.availableStock(f.variant.id), 0);
  });
  test('review author comes from JWT, nested replies do not duplicate ratings or expose secrets', async () => {
    const f = await fixture();
    const created = await call('/api/create-new-review', { token: f.buyer.token, method: 'POST', body: { productId: f.product.id, userId: f.other.id, content: 'Tốt', star: 5 } });
    assert.equal(created.errCode, 0);
    const row = await db.Comment.findOne({ where: { productId: f.product.id }, raw: true }); assert.equal(row.userId, f.buyer.id);
    const reply = await call('/api/reply-review', { token: f.admin.token, method: 'POST', body: { productId: f.product.id, parentId: row.id, content: 'Cảm ơn', userId: f.other.id } });
    assert.equal(reply.errCode, 0);
    const loaded = await call(`/api/get-all-review-by-productId?id=${f.product.id}`);
    assert.equal(loaded.data.length, 1); assert.equal(loaded.data[0].childComment.length, 1);
    assert.equal(loaded.data[0].user.password, undefined); assert.equal(loaded.data[0].user.email, undefined);
    const removed = await call('/api/delete-review', { token: f.admin.token, method: 'DELETE', body: { id: row.id } });
    assert.equal(removed.errCode, 0); assert.equal(await db.Comment.count({ where: { productId: f.product.id } }), 0);
  });
  test('chat rooms are idempotent and outsiders cannot read or impersonate their participants', async () => {
    const f = await fixture();
    const room = await call('/api/create-new-room', { token: f.buyer.token, method: 'POST', body: { userId1: f.other.id } });
    assert.equal(room.errCode, 0); assert.equal(room.data.userOne, f.buyer.id);
    const repeat = await call('/api/create-new-room', { token: f.buyer.token, method: 'POST', body: {} });
    assert.equal(repeat.data.id, room.data.id);
    const message = await call('/api/send-message', { token: f.buyer.token, method: 'POST', body: { roomId: room.data.id, userId: f.other.id, text: 'Xin chào' } });
    assert.equal(message.errCode, 0); assert.equal(message.data.userId, f.buyer.id);
    const denied = await call(`/api/load-message?roomId=${room.data.id}`, { token: f.other.token });
    assert.equal(denied.status, 403);
    const messages = await call(`/api/load-message?roomId=${room.data.id}`, { token: f.buyer.token });
    assert.equal(messages.data[0].userData.password, undefined); assert.equal(messages.data[0].userData.usertoken, undefined);
  });
  test('optional unconfigured PayPal and SMTP return actionable errors', async () => {
    const f = await fixture(); await add(f);
    const paypal = await call('/api/payment-order', { token: f.buyer.token, method: 'POST', body: payload(f) });
    assert.equal(paypal.errCode, 3);
    const email = await call('/api/send-forgotpassword-email', { method: 'POST', body: { email: 'test@example.com' } });
    assert.equal(email.status, 503);
  });

  test('voucher saving, owner scoping and authoritative discount consumption are consistent', async () => {
    const f = await fixture(); await add(f);
    const type = await call('/api/create-new-typevoucher', { token: f.admin.token, method: 'POST', body: { typeVoucher: 'percent', value: 10, minValue: 0, maxValue: 30000 } });
    assert.equal(type.errCode, 0);
    const voucher = await call('/api/create-new-voucher', { token: f.admin.token, method: 'POST', body: { codeVoucher: 'QA-' + crypto.randomUUID(), typeVoucherId: type.data.id, amount: 5, fromDate: String(Date.now() - 86400000), toDate: String(Date.now() + 86400000) } });
    assert.equal(voucher.errCode, 0);
    const saved = await call('/api/save-user-voucher', { token: f.buyer.token, method: 'POST', body: { voucherId: voucher.data.id, userId: f.other.id } });
    assert.equal(saved.errCode, 0);
    const own = await call(`/api/get-all-voucher-by-userid?id=${f.other.id}`, { token: f.buyer.token });
    assert.ok(own.data.some(row => row.voucherId === voucher.data.id));
    const unrelated = await call(`/api/get-all-voucher-by-userid?id=${f.buyer.id}`, { token: f.other.token });
    assert.ok(!unrelated.data.some(row => row.voucherId === voucher.data.id));
    const order = await call('/api/create-new-order', { token: f.buyer.token, method: 'POST', body: { ...payload(f), voucherId: voucher.data.id, discountAmount: 999999 } });
    assert.equal(order.errCode, 0); assert.equal(Number(order.data.discountAmount), 20000); assert.equal(Number(order.data.totalPrice), 200000);
    assert.equal(await db.VoucherUsed.count({ where: { voucherId: voucher.data.id, userId: f.buyer.id, status: 1 } }), 1);
    const again = await call('/api/save-user-voucher', { token: f.buyer.token, method: 'POST', body: { voucherId: voucher.data.id } });
    assert.notEqual(again.errCode, 0);
  });
  test('catalog filters retain active status and product detail reports payment reservations', async () => {
    const f = await fixture(2); await add(f);
    const before = await call(`/api/get-detail-product-by-id?id=${f.product.id}`);
    assert.equal(before.errCode, 0); assert.equal(before.data.productDetail[0].productDetailSize[0].stock, 2);
    const start = await call('/api/payment-order-vnpay', { token: f.buyer.token, method: 'POST', body: payload(f) });
    assert.equal(start.errCode, 0);
    const reserved = await call(`/api/get-detail-product-by-id?id=${f.product.id}`);
    assert.equal(reserved.data.productDetail[0].productDetailSize[0].stock, 0);
    await db.Product.update({ statusId: 'S2' }, { where: { id: f.product.id } });
    const filtered = await call('/api/get-all-product-user?categoryId=TEST_CATEGORY&limit=100&offset=0');
    assert.ok(filtered.data.every(product => product.statusId === 'S1'));
    assert.notEqual((await call(`/api/get-detail-product-by-id?id=${f.product.id}`)).errCode, 0);
    assert.equal((await call(`/api/get-detail-product-by-id?id=${f.product.id}`, { token: f.admin.token })).errCode, 0);
  });
  test('inventory and delivery history cannot be orphaned by administrative deletion', async () => {
    const f = await fixture(); await add(f);
    const variant = await call('/api/delete-product-detail-size', { token: f.admin.token, method: 'DELETE', body: { id: f.variant.id } });
    assert.notEqual(variant.errCode, 0);
    const detail = await call('/api/delete-product-detail', { token: f.admin.token, method: 'DELETE', body: { id: f.detail.id } });
    assert.notEqual(detail.errCode, 0);
    const order = await call('/api/create-new-order', { token: f.buyer.token, method: 'POST', body: payload(f) });
    assert.equal(order.errCode, 0);
    const deleted = await call('/api/delete-address-user', { token: f.buyer.token, method: 'DELETE', body: { id: f.address.id } });
    assert.notEqual(deleted.errCode, 0);
    const edited = await call('/api/edit-address-user', { token: f.buyer.token, method: 'PUT', body: { ...f.address, shipAdress: 'Different street' } });
    assert.notEqual(edited.errCode, 0);
    assert.equal((await call(`/api/get-detail-order?id=${order.orderId}`, { token: f.buyer.token })).errCode, 0);
  });
  test('missing admin records return errors without leaving requests pending', async () => {
    const f = await fixture();
    const requests = [
      ['/api/delete-banner', 'DELETE', { id: 2147483647 }],
      ['/api/delete-blog', 'DELETE', { id: 2147483647 }],
      ['/api/delete-supplier', 'DELETE', { id: 2147483647 }],
      ['/api/delete-typeship', 'DELETE', { id: 2147483647 }],
      ['/api/delete-voucher', 'DELETE', { id: 2147483647 }],
      ['/api/update-typevoucher', 'PUT', { id: 2147483647, typeVoucher: 'percent', value: 10, minValue: 0, maxValue: 1000 }],
    ];
    for (const [path, method, body] of requests) {
      const response = await call(path, { token: f.admin.token, method, body });
      assert.notEqual(response.errCode, 0, path);
    }
  });

  test('statistics use the saved order amount after shipping and product price edits', async () => {
    const f = await fixture(); await add(f);
    const created = await call('/api/create-new-order', { token: f.buyer.token, method: 'POST', body: payload(f) });
    assert.equal(created.errCode, 0);
    await db.OrderProduct.update({ statusId: 'S6' }, { where: { id: created.orderId } });
    await db.TypeShip.update({ price: 99000 }, { where: { id: f.shipping.id } });
    const year = String(new Date().getFullYear());
    const summary = await call(`/api/get-statistic-overturn?oneDate=${year}-01-01&type=year`, { token: f.admin.token });
    assert.equal(summary.errCode, 0); assert.equal(summary.data.find(order => order.id === created.orderId).totalpriceProduct, 220000);
    const profit = await call(`/api/get-statistic-profit?oneDate=${year}-01-01&type=year`, { token: f.admin.token });
    assert.equal(profit.errCode, 0); assert.equal(profit.data.find(order => order.id === created.orderId).profitPrice, 100000);
    const cards = await call('/api/get-count-card-statistic', { token: f.admin.token });
    assert.equal(cards.errCode, 0);
  });

  test('authenticated sockets persist messages before acknowledgement and reject strangers', async () => {
    const f = await fixture();
    const room = await call('/api/create-new-room', { token: f.buyer.token, method: 'POST', body: {} });
    const { io: connectClient } = require('../../frontend/node_modules/socket.io-client');
    const connect = token => new Promise((resolve, reject) => {
      const client = connectClient(base, { auth: { token }, reconnection: false, timeout: 5000 });
      client.once('connect', () => resolve(client));
      client.once('connect_error', error => { client.close(); reject(error); });
    });
    const buyer = await connect(f.buyer.token), stranger = await connect(f.other.token);
    try {
      const send = (client, body) => new Promise((resolve, reject) => client.timeout(5000).emit('sendDataClient', body, (error, result) => error ? reject(error) : resolve(result)));
      const denied = await send(stranger, { roomId: room.data.id, userId: f.buyer.id, text: 'Forged message' });
      assert.equal(denied.errCode, 403);
      const saved = await send(buyer, { roomId: room.data.id, userId: f.other.id, text: 'Socket integration message' });
      assert.equal(saved.errCode, 0); assert.equal(saved.data.userId, f.buyer.id);
      const persisted = await db.Message.findByPk(saved.data.id, { raw: true });
      assert.equal(persisted.text, 'Socket integration message');
      await assert.rejects(connect('invalid-token'));
    } finally { buyer.close(); stranger.close(); }
  });

  test('concurrent registration cannot create two accounts with the same normalized email', async () => {
    const email = 'concurrent-' + crypto.randomUUID() + '@example.com';
    const results = await Promise.all([
      call('/api/create-new-user', { method: 'POST', body: { email, password: 'Password123!', lastName: 'One' } }),
      call('/api/create-new-user', { method: 'POST', body: { email: email.toUpperCase(), password: 'Password123!', lastName: 'Two' } }),
    ]);
    assert.equal(results.filter(result => result.errCode === 0).length, 1);
    assert.equal(await db.User.count({ where: { email } }), 1);
  });
}