'use strict';

// Uses the project's configured database. Only SELECT queries and read-only API
// operations are allowed here; do not run integration tests on this database.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
process.env.DOTENV_CONFIG_QUIET = 'true';
require('../src/config/env');
require('@babel/register')({
  presets: [require.resolve('@babel/preset-env')],
  babelrc: false,
  configFile: false,
  cache: false,
  extensions: ['.js'],
  ignore: [/node_modules/],
});
const db = require('../src/models');

const DOMAIN = '@demo.dacs.test';
const PRODUCT_PREFIX = '[DEMO] ';
const ORDER_PREFIX = '[DEMO DACS v1] ';
const MARKER = 'DEMO_DACS_V1_SEEDED';
const isId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const isMoney = value => value !== null && value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
const mapById = rows => new Map(rows.map(row => [Number(row.id), row]));
const idsOf = rows => new Set(rows.map(row => Number(row.id)));
const groupBy = (rows, key) => {
  const groups = new Map();
  for (const row of rows) {
    const id = Number(row[key]);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return groups;
};
const hasParent = (parents, value, label) => assert.ok(isId(value) && parents.has(Number(value)), `${label}: missing parent`);
const hasCode = (codes, code, label) => assert.ok(code && codes.has(code), `${label}: missing reference code`);

function verifyImage(value, label) {
  assert.ok(Buffer.isBuffer(value), `${label}: expected BLOB`);
  const uri = value.toString('utf8');
  const match = /^data:image\/(svg\+xml|png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(uri);
  assert.ok(match, `${label}: invalid image data URI`);
  const bytes = Buffer.from(match[2], 'base64');
  assert.ok(bytes.length > 0 && bytes.toString('base64') === match[2], `${label}: invalid base64 payload`);
  if (match[1] === 'svg+xml') assert.ok(/<svg[\s>]/.test(bytes.toString('utf8')) && /<\/svg>/.test(bytes.toString('utf8')), `${label}: invalid SVG`);
  if (match[1] === 'png') assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${label}: invalid PNG`);
  if (match[1] === 'jpeg') assert.equal(bytes.subarray(0, 2).toString('hex'), 'ffd8', `${label}: invalid JPEG`);
  if (match[1] === 'webp') assert.ok(bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP', `${label}: invalid WebP`);
  if (match[1] === 'gif') assert.ok(['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString()), `${label}: invalid GIF`);
}

async function verifyDatabase(database) {
  const modelNames = ['Allcode', 'User', 'Product', 'ProductDetail', 'ProductDetailSize', 'OrderProduct', 'OrderDetail',
    'AddressUser', 'Supplier', 'Receipt', 'ReceiptDetail', 'TypeShip', 'TypeVoucher', 'Voucher', 'VoucherUsed', 'ShopCart', 'Blog', 'Comment', 'RoomMessage', 'Message', 'Banner'];
  const attributes = {
    User: ['id', 'email', 'roleId', 'genderId', 'statusId'],
    Blog: ['id', 'title', 'subjectId', 'statusId', 'userId', 'image'],
    Comment: ['id', 'parentId', 'productId', 'blogId', 'userId', 'star'],
    OrderProduct: ['id', 'addressUserId', 'statusId', 'typeShipId', 'voucherId', 'note', 'isPaymentOnlien', 'subtotal', 'shippingFee', 'discountAmount', 'totalPrice', 'shipperId', 'createdAt', 'updatedAt'],
    Message: ['id', 'roomId', 'userId', 'unRead'],
  };
  const rows = {};
  await Promise.all(modelNames.map(async name => {
    rows[name] = await database[name].findAll({ raw: true, ...(attributes[name] ? { attributes: attributes[name] } : {}) });
  }));
  const maps = Object.fromEntries(modelNames.map(name => [name, mapById(rows[name])]));
  const codes = new Map(rows.Allcode.map(row => [row.code, row]));
  assert.ok(codes.has(MARKER), 'Demo seed marker is missing; run npm run db:seed:demo first.');

  const users = rows.User.filter(row => row.email?.endsWith(DOMAIN));
  const products = rows.Product.filter(row => row.name?.startsWith(PRODUCT_PREFIX));
  const orders = rows.OrderProduct.filter(row => row.note?.startsWith(ORDER_PREFIX));
  assert.ok(users.length >= 32, 'Expected at least 32 demo users');
  assert.ok(products.length >= 40, 'Expected at least 40 demo products');
  assert.ok(orders.length >= 96, 'Expected at least 96 demo orders');
  const userIds = idsOf(users), productIds = idsOf(products), orderIds = idsOf(orders);
  const details = rows.ProductDetail.filter(row => productIds.has(Number(row.productId)));
  const detailIds = idsOf(details);
  const variants = rows.ProductDetailSize.filter(row => detailIds.has(Number(row.productdetailId)));
  const variantIds = idsOf(variants);
  const addresses = rows.AddressUser.filter(row => userIds.has(Number(row.userId)));
  const receipts = rows.Receipt.filter(row => userIds.has(Number(row.userId)));
  const receiptIds = idsOf(receipts);
  const receiptLines = rows.ReceiptDetail.filter(row => receiptIds.has(Number(row.receiptId)) || variantIds.has(Number(row.productDetailSizeId)));
  const orderLines = rows.OrderDetail.filter(row => orderIds.has(Number(row.orderId)) || variantIds.has(Number(row.productId)));
  const carts = rows.ShopCart.filter(row => userIds.has(Number(row.userId)) || variantIds.has(Number(row.productdetailsizeId)));
  const blogs = rows.Blog.filter(row => row.title?.startsWith(PRODUCT_PREFIX) || userIds.has(Number(row.userId)));
  const blogIds = idsOf(blogs);
  const comments = rows.Comment.filter(row => productIds.has(Number(row.productId)) || blogIds.has(Number(row.blogId)) || userIds.has(Number(row.userId)));
  const rooms = rows.RoomMessage.filter(row => userIds.has(Number(row.userOne)) || userIds.has(Number(row.userTwo)));
  const roomIds = idsOf(rooms);
  const messages = rows.Message.filter(row => roomIds.has(Number(row.roomId)) || userIds.has(Number(row.userId)));
  const catalog = require('./demo/catalog-data.cjs');
  const banners = rows.Banner.filter(row => catalog.banners.some(item => item.name === row.name));
  const suppliers = rows.Supplier.filter(row => catalog.suppliers.some(item => item.name === row.name));
  const shippingMethods = rows.TypeShip.filter(row => catalog.shippingMethods.some(item => item.type === row.type));
  const paymentSessions = (await database.PaymentSession.findAll({ raw: true })).filter(row =>
    row.providerPaymentId?.startsWith('DEMO-') || userIds.has(Number(row.userId)) || orderIds.has(Number(row.orderId)));
  const voucherEntries = rows.VoucherUsed.filter(row => userIds.has(Number(row.userId)));
  const linkedVoucherIds = new Set([...orders.map(row => Number(row.voucherId)), ...voucherEntries.map(row => Number(row.voucherId))]);
  const vouchers = rows.Voucher.filter(row => row.codeVoucher?.startsWith('DEMO') || linkedVoucherIds.has(Number(row.id)));
  const voucherIds = idsOf(vouchers);
  const allDemoVoucherEntries = rows.VoucherUsed.filter(row => voucherIds.has(Number(row.voucherId)) || userIds.has(Number(row.userId)));

  assert.equal(new Set(users.map(row => row.email)).size, users.length, 'Duplicate demo user emails');
  for (const user of users) {
    assert.ok(['R1', 'R2', 'R3', 'R4'].includes(user.roleId), `User ${user.id}: invalid role`);
    hasCode(codes, user.roleId, `User ${user.id} role`);
    hasCode(codes, user.statusId, `User ${user.id} status`);
    if (user.genderId) hasCode(codes, user.genderId, `User ${user.id} gender`);
  }
  for (const role of ['R1', 'R2', 'R3', 'R4']) assert.ok(users.some(row => row.roleId === role && row.statusId === 'S1'), `No active demo user for ${role}`);
  for (const product of products) {
    hasCode(codes, product.categoryId, `Product ${product.id} category`);
    hasCode(codes, product.brandId, `Product ${product.id} brand`);
    hasCode(codes, product.statusId, `Product ${product.id} status`);
    assert.ok(details.some(row => Number(row.productId) === Number(product.id)), `Product ${product.id}: no detail`);
  }
  for (const detail of details) {
    hasParent(maps.Product, detail.productId, `Detail ${detail.id}`);
    assert.ok(isMoney(detail.originalPrice) && isMoney(detail.discountPrice), `Detail ${detail.id}: invalid price`);
    assert.ok(Number(detail.discountPrice) <= Number(detail.originalPrice), `Detail ${detail.id}: discounted price exceeds original price`);
    assert.ok(variants.some(row => Number(row.productdetailId) === Number(detail.id)), `Detail ${detail.id}: no variant`);
  }
  for (const variant of variants) {
    hasParent(maps.ProductDetail, variant.productdetailId, `Variant ${variant.id}`);
    hasCode(codes, variant.sizeId, `Variant ${variant.id} size`);
  }
  const images = detailIds.size ? await database.ProductImage.findAll({ where: { productdetailId: [...detailIds] }, raw: true }) : [];
  for (const image of images) {
    hasParent(maps.ProductDetail, image.productdetailId, `Product image ${image.id}`);
    verifyImage(image.image, `Product image ${image.id}`);
  }
  for (const detail of details) assert.ok(images.some(row => Number(row.productdetailId) === Number(detail.id)), `Detail ${detail.id}: missing image`);
  for (const address of addresses) hasParent(maps.User, address.userId, `Address ${address.id}`);
  for (const receipt of receipts) {
    hasParent(maps.User, receipt.userId, `Receipt ${receipt.id} user`);
    hasParent(maps.Supplier, receipt.supplierId, `Receipt ${receipt.id} supplier`);
    assert.ok(rows.ReceiptDetail.some(row => Number(row.receiptId) === Number(receipt.id)), `Receipt ${receipt.id}: no lines`);
  }
  for (const line of receiptLines) {
    hasParent(maps.Receipt, line.receiptId, `Receipt line ${line.id} receipt`);
    hasParent(maps.ProductDetailSize, line.productDetailSizeId, `Receipt line ${line.id} variant`);
    assert.ok(isId(line.quantity) && isMoney(line.price), `Receipt line ${line.id}: invalid quantity or price`);
  }
  const linesByOrder = groupBy(rows.OrderDetail, 'orderId');
  const statusCounts = {};
  const { voucherDiscount } = require('../src/utils/commerce');
  for (const order of orders) {
    const label = `Order ${order.id}`;
    hasParent(maps.AddressUser, order.addressUserId, `${label} address`);
    hasParent(maps.TypeShip, order.typeShipId, `${label} shipping`);
    hasParent(maps.User, maps.AddressUser.get(Number(order.addressUserId)).userId, `${label} customer`);
    hasCode(codes, order.statusId, `${label} status`);
    assert.ok(['S3', 'S4', 'S5', 'S6', 'S7'].includes(order.statusId), `${label}: invalid status`);
    statusCounts[order.statusId] = (statusCounts[order.statusId] || 0) + 1;
    if (order.shipperId) {
      hasParent(maps.User, order.shipperId, `${label} shipper`);
      assert.equal(maps.User.get(Number(order.shipperId)).roleId, 'R3', `${label}: shipper role is invalid`);
    }
    if (['S5', 'S6'].includes(order.statusId)) {
      assert.ok(order.shipperId, `${label}: delivery requires a shipper`);
      assert.equal(maps.User.get(Number(order.shipperId)).statusId, 'S1', `${label}: delivery shipper is inactive`);
    }
    assert.ok([0, 1].includes(Number(order.isPaymentOnlien)), `${label}: invalid payment flag`);
    const lines = linesByOrder.get(Number(order.id)) || [];
    assert.ok(lines.length > 0, `${label}: no order lines`);
    const subtotal = lines.reduce((sum, row) => sum + Number(row.realPrice) * Number(row.quantity), 0);
    for (const key of ['subtotal', 'shippingFee', 'discountAmount', 'totalPrice']) assert.ok(isMoney(order[key]), `${label}: invalid ${key} snapshot`);
    assert.equal(Number(order.subtotal), subtotal, `${label}: subtotal differs from historical line prices`);
    assert.ok(Number(order.discountAmount) <= subtotal, `${label}: discount exceeds subtotal`);
    if (order.voucherId) {
      hasParent(maps.Voucher, order.voucherId, `${label} voucher`);
      const voucher = maps.Voucher.get(Number(order.voucherId));
      hasParent(maps.TypeVoucher, voucher.typeVoucherId, `${label} voucher type`);
      assert.equal(Number(order.discountAmount), voucherDiscount(maps.TypeVoucher.get(Number(voucher.typeVoucherId)), subtotal), `${label}: discount snapshot differs from voucher`);
      const customerId = Number(maps.AddressUser.get(Number(order.addressUserId)).userId);
      assert.ok(rows.VoucherUsed.some(entry => Number(entry.voucherId) === Number(order.voucherId) && Number(entry.userId) === customerId && Number(entry.status) === 1), `${label}: used voucher history is missing`);
    } else assert.equal(Number(order.discountAmount), 0, `${label}: discount without a voucher`);
    assert.equal(Number(order.totalPrice), subtotal - Number(order.discountAmount) + Number(order.shippingFee), `${label}: total snapshot is inconsistent`);
  }
  for (const status of ['S3', 'S4', 'S5', 'S6', 'S7']) assert.ok(statusCounts[status] > 0, `No demo orders for status ${status}`);
  for (const line of orderLines) {
    hasParent(maps.OrderProduct, line.orderId, `Order line ${line.id} order`);
    hasParent(maps.ProductDetailSize, line.productId, `Order line ${line.id} variant`);
    assert.ok(isId(line.quantity) && isMoney(line.realPrice), `Order line ${line.id}: invalid quantity or historical price`);
  }
  const received = groupBy(rows.ReceiptDetail, 'productDetailSizeId');
  const sold = groupBy(rows.OrderDetail, 'productId');
  const stock = variants.map(variant => {
    const quantityIn = (received.get(Number(variant.id)) || []).reduce((sum, line) => sum + Number(line.quantity), 0);
    const quantityOut = (sold.get(Number(variant.id)) || []).reduce((sum, line) => sum + (maps.OrderProduct.get(Number(line.orderId))?.statusId !== 'S7' ? Number(line.quantity) : 0), 0);
    const available = quantityIn - quantityOut;
    assert.ok(Number.isSafeInteger(available) && available >= 0, `Variant ${variant.id}: receipts minus non-cancelled orders is negative`);
    return available;
  });
  assert.ok(stock.some(value => value === 0), 'Missing out-of-stock demo scenario');
  assert.ok(stock.some(value => value >= 1 && value <= 3), 'Missing low-stock demo scenario');
  assert.ok(stock.some(value => value > 3), 'Missing in-stock demo scenario');
  for (const cart of carts) {
    hasParent(maps.User, cart.userId, `Cart ${cart.id} user`);
    hasParent(maps.ProductDetailSize, cart.productdetailsizeId, `Cart ${cart.id} variant`);
    assert.ok(isId(cart.quantity), `Cart ${cart.id}: invalid quantity`);
  }
  const voucherPairs = new Set();
  for (const entry of allDemoVoucherEntries) {
    hasParent(maps.User, entry.userId, `Voucher entry ${entry.id} user`);
    hasParent(maps.Voucher, entry.voucherId, `Voucher entry ${entry.id} voucher`);
    assert.ok([0, 1].includes(Number(entry.status)), `Voucher entry ${entry.id}: invalid status`);
    const pair = `${entry.userId}:${entry.voucherId}`;
    assert.ok(!voucherPairs.has(pair), `Voucher entry ${entry.id}: duplicate user/voucher pair`);
    voucherPairs.add(pair);
    if (Number(entry.status) === 1) assert.ok(rows.OrderProduct.some(order => Number(order.voucherId) === Number(entry.voucherId) && Number(maps.AddressUser.get(Number(order.addressUserId))?.userId) === Number(entry.userId)), `Voucher entry ${entry.id}: marked used without an order`);
  }
  for (const voucher of vouchers) {
    hasParent(maps.TypeVoucher, voucher.typeVoucherId, `Voucher ${voucher.id} type`);
    assert.ok(isId(voucher.amount), `Voucher ${voucher.id}: invalid amount`);
    const entries = rows.VoucherUsed.filter(row => Number(row.voucherId) === Number(voucher.id));
    assert.ok(entries.filter(row => Number(row.status) === 1).length <= Number(voucher.amount), `Voucher ${voucher.id}: used count exceeds amount`);
  }
  for (const shipping of shippingMethods) assert.ok(isMoney(shipping.price), `Shipping ${shipping.id}: invalid fee`);
  for (const banner of banners) {
    hasCode(codes, banner.statusId, `Banner ${banner.id} status`);
    verifyImage(banner.image, `Banner ${banner.id}`);
  }
  for (const blog of blogs) {
    hasParent(maps.User, blog.userId, `Blog ${blog.id} author`);
    hasCode(codes, blog.subjectId, `Blog ${blog.id} subject`);
    hasCode(codes, blog.statusId, `Blog ${blog.id} status`);
    verifyImage(blog.image, `Blog ${blog.id}`);
  }
  for (const comment of comments) {
    hasParent(maps.User, comment.userId, `Comment ${comment.id} author`);
    const productReview = isId(comment.productId), blogComment = isId(comment.blogId);
    assert.ok(productReview !== blogComment, `Comment ${comment.id}: expected exactly one product/blog target`);
    if (productReview) hasParent(maps.Product, comment.productId, `Comment ${comment.id} product`);
    if (blogComment) hasParent(maps.Blog, comment.blogId, `Comment ${comment.id} blog`);
    if (comment.parentId != null) {
      hasParent(maps.Comment, comment.parentId, `Comment ${comment.id} parent`);
      const parent = maps.Comment.get(Number(comment.parentId));
      assert.equal(parent.parentId, null, `Comment ${comment.id}: reply must reference a root`);
      assert.equal(Number(parent.productId) || null, Number(comment.productId) || null, `Comment ${comment.id}: reply product differs from root`);
      assert.equal(Number(parent.blogId) || null, Number(comment.blogId) || null, `Comment ${comment.id}: reply blog differs from root`);
      assert.ok(comment.star == null || Number(comment.star) === 0, `Comment ${comment.id}: reply must not duplicate rating`);
    } else if (productReview) assert.ok(isId(comment.star) && Number(comment.star) <= 5, `Comment ${comment.id}: invalid rating`);
  }
  assert.ok(comments.some(row => row.parentId == null && isId(row.productId)), 'Missing demo reviews');
  assert.ok(comments.some(row => row.parentId == null && isId(row.blogId)), 'Missing demo blog comments');
  assert.ok(comments.some(row => row.parentId != null), 'Missing demo reply scenario');
  for (const room of rooms) {
    hasParent(maps.User, room.userOne, `Room ${room.id} customer`);
    hasParent(maps.User, room.userTwo, `Room ${room.id} support`);
    assert.notEqual(Number(room.userOne), Number(room.userTwo), `Room ${room.id}: participants must differ`);
    assert.ok(['R1', 'R4'].includes(maps.User.get(Number(room.userTwo)).roleId), `Room ${room.id}: support role is invalid`);
  }
  for (const message of messages) {
    hasParent(maps.User, message.userId, `Message ${message.id} sender`);
    hasParent(maps.RoomMessage, message.roomId, `Message ${message.id} room`);
    const room = maps.RoomMessage.get(Number(message.roomId));
    assert.ok([Number(room.userOne), Number(room.userTwo)].includes(Number(message.userId)), `Message ${message.id}: sender is not a participant`);
  }
  const paymentIds = new Set();
  for (const session of paymentSessions) {
    const label = `Payment session ${session.id}`;
    hasParent(maps.User, session.userId, `${label} customer`);
    hasParent(maps.OrderProduct, session.orderId, `${label} order`);
    assert.equal(session.status, 'COMPLETED', `${label}: demo payment must be completed`);
    assert.ok(['vnpay', 'paypal'].includes(session.provider), `${label}: unsupported provider`);
    assert.ok(session.providerPaymentId && !paymentIds.has(session.providerPaymentId), `${label}: duplicate/missing provider reference`);
    paymentIds.add(session.providerPaymentId);
    const order = maps.OrderProduct.get(Number(session.orderId));
    assert.equal(Number(order.isPaymentOnlien), 1, `${label}: order is not marked online paid`);
    assert.equal(Number(maps.AddressUser.get(Number(order.addressUserId)).userId), Number(session.userId), `${label}: order owner differs from payment owner`);
    assert.equal(Number(session.totalPrice), Number(order.totalPrice), `${label}: total differs from saved order`);
    assert.equal(session.currency, session.provider === 'vnpay' ? 'VND' : 'USD', `${label}: currency is invalid`);
    if (session.provider === 'vnpay') assert.equal(Number(session.providerAmount), Number(session.totalPrice) * 100, `${label}: VNPay amount is invalid`);
    else assert.ok(/^\d+\.\d{2}$/.test(session.providerAmount) && Number(session.providerAmount) > 0, `${label}: PayPal amount is invalid`);
    const checkout = JSON.parse(session.checkoutData);
    for (const key of ['addressUserId', 'typeShipId', 'subtotal', 'shippingFee', 'discountAmount', 'totalPrice']) assert.equal(Number(checkout[key]), Number(order[key]), `${label}: checkout ${key} differs from order`);
    assert.equal(Number(checkout.userId), Number(session.userId), `${label}: checkout owner differs from payment`);
    assert.equal(Number(checkout.voucherId) || null, Number(order.voucherId) || null, `${label}: checkout voucher differs from order`);
    const savedLines = (linesByOrder.get(Number(order.id)) || []).map(({ productId, quantity, realPrice }) => ({ productId: Number(productId), quantity: Number(quantity), realPrice: Number(realPrice) })).sort((a, b) => a.productId - b.productId);
    const paymentLines = checkout.lines.map(({ productId, quantity, realPrice }) => ({ productId: Number(productId), quantity: Number(quantity), realPrice: Number(realPrice) })).sort((a, b) => a.productId - b.productId);
    assert.deepEqual(paymentLines, savedLines, `${label}: checkout lines differ from saved order`);
  }
  for (const order of orders.filter(row => Number(row.isPaymentOnlien) === 1)) assert.equal(paymentSessions.filter(row => Number(row.orderId) === Number(order.id)).length, 1, `Order ${order.id}: expected one completed payment session`);
  return {
    counts: { users: users.length, products: products.length, details: details.length, variants: variants.length, productImages: images.length,
      addresses: addresses.length, orders: orders.length, orderLines: orderLines.length, receipts: receipts.length, receiptLines: receiptLines.length,
      carts: carts.length, suppliers: suppliers.length, shippingMethods: shippingMethods.length, banners: banners.length, paymentSessions: paymentSessions.length,
      vouchers: vouchers.length, savedVouchers: allDemoVoucherEntries.filter(row => Number(row.status) === 0).length,
      usedVouchers: allDemoVoucherEntries.filter(row => Number(row.status) === 1).length, blogs: blogs.length,
      reviews: comments.filter(row => row.parentId == null && isId(row.productId)).length,
      blogComments: comments.filter(row => row.parentId == null && isId(row.blogId)).length,
      replies: comments.filter(row => row.parentId != null).length, rooms: rooms.length, messages: messages.length },
    orderStatuses: statusCounts,
    inventory: { outOfStock: stock.filter(value => value === 0).length, lowStock: stock.filter(value => value >= 1 && value <= 3).length, inStock: stock.filter(value => value > 3).length },
    fixtures: { users, products, details, variants, blogs, orders, addresses, receipts, rooms, maps },
  };
}

async function verifyHttp(fixtures, password) {
  assert.ok(process.env.JWT_SECRET, 'JWT_SECRET must be configured in backend/.env');
  const { createApp } = require('../src/app');
  const server = await new Promise((resolve, reject) => {
    const listener = createApp().listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let checks = 0;
  const call = async (route, token, options = {}) => {
    // Login performs password validation and JWT issuance without changing data.
    assert.ok((options.method || 'GET') === 'GET' || (route === '/api/login' && options.method === 'POST'), 'Verifier attempted a mutation endpoint');
    const response = await fetch(base + route, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(30000) });
    const result = await response.json();
    checks += 1;
    return { ...result, status: response.status };
  };
  const ok = async (route, token) => {
    const result = await call(route, token);
    assert.equal(result.status, 200, `${route}: unexpected HTTP status`);
    assert.equal(result.errCode, 0, `${route}: ${result.errMessage || 'API error'}`);
    return result;
  };
  const noSecrets = value => {
    if (!value || typeof value !== 'object') return;
    assert.ok(!Object.hasOwn(value, 'password') && !Object.hasOwn(value, 'usertoken'), 'API response exposed authentication secrets');
    for (const item of Object.values(value)) noSecrets(item);
  };
  try {
    await ok('/api/health');
    const sessions = {};
    for (const [name, roleId] of [['admin', 'R1'], ['staff1', 'R4'], ['shipper1', 'R3'], ['customer01', 'R2'], ['customer02', 'R2']]) {
      const result = await call('/api/login', null, { method: 'POST', body: JSON.stringify({ email: name + DOMAIN, password }) });
      assert.equal(result.errCode, 0, `Login ${name}: failed`);
      assert.equal(result.user.roleId, roleId, `Login ${name}: invalid role`);
      assert.ok(result.accessToken, `Login ${name}: token missing`);
      noSecrets(result.user);
      sessions[name] = { token: result.accessToken, user: result.user };
    }
    const { admin, staff1, shipper1, customer01, customer02 } = sessions;
    const activeProduct = fixtures.products.find(row => row.statusId === 'S1');
    assert.ok(activeProduct, 'No active demo product for public catalog checks');
    const detail = fixtures.details.find(row => Number(row.productId) === Number(activeProduct.id));
    const variant = fixtures.variants.find(row => Number(row.productdetailId) === Number(detail.id));
    const catalog = await ok('/api/get-all-product-user?limit=100&offset=0&keyword=%5BDEMO%5D');
    assert.ok(catalog.data.length > 0 && catalog.data.every(row => row.statusId === 'S1'), 'Public catalog is empty or exposes inactive products');
    // Full product/blog detail GETs increment view counters; use their read-only
    // detail/variant/image/list APIs so verification remains repeatable.
    for (const route of [`/api/get-all-product-detail-by-id?id=${activeProduct.id}&limit=20&offset=0`, `/api/get-product-detail-by-id?id=${detail.id}`,
      `/api/get-all-product-detail-image-by-id?id=${detail.id}&limit=20&offset=0`, `/api/get-all-product-detail-size-by-id?id=${detail.id}&limit=20&offset=0`,
      `/api/get-detail-product-detail-size-by-id?id=${variant.id}`, '/api/get-product-feature?limit=6', '/api/get-product-new?limit=6',
      '/api/get-all-code?type=CATEGORY', '/api/get-all-category-blog?type=SUBJECT', '/api/get-all-banner', '/api/get-all-typeship',
      '/api/get-all-blog?limit=20&offset=0', '/api/get-feature-blog?limit=6', '/api/get-new-blog?limit=6',
      '/api/get-all-voucher?limit=20&offset=0', `/api/get-all-review-by-productId?id=${activeProduct.id}`]) noSecrets((await ok(route)).data);
    if (fixtures.blogs.length) noSecrets((await ok(`/api/get-all-comment-by-blogId?id=${fixtures.blogs[0].id}`)).data);
    noSecrets((await ok(`/api/get-product-recommend?userId=${customer01.user.id}&limit=6`)).data);
    for (const session of [customer01, customer02]) {
      const id = session.user.id, token = session.token;
      const forgedId = Number(id) === Number(customer01.user.id) ? customer02.user.id : customer01.user.id;
      const cart = await ok(`/api/get-all-shopcart-by-userId?id=${forgedId}`, token);
      assert.ok(cart.data.every(row => Number(row.userId) === Number(id)), 'Cart ownership scope is invalid');
      noSecrets((await ok(`/api/get-product-shopcart?userId=${forgedId}&limit=6`, token)).data);
      const addresses = await ok(`/api/get-all-address-user?id=${forgedId}`, token);
      assert.ok(addresses.data.every(row => Number(row.userId) === Number(id)), 'Address ownership scope is invalid');
      const history = await ok(`/api/get-all-order-by-user?id=${forgedId}`, token);
      assert.ok(history.data.every(row => Number(row.userId) === Number(id)), 'Order history ownership scope is invalid');
      noSecrets(history.data);
      const saved = await ok(`/api/get-all-voucher-by-userid?id=${forgedId}`, token);
      assert.ok(saved.data.every(row => Number(row.userId) === Number(id)), 'Voucher ownership scope is invalid');
      const chats = await ok(`/api/list-room-of-user?userId=${forgedId}`, token);
      assert.ok(chats.data.every(row => [Number(row.userOne), Number(row.userTwo)].includes(Number(id))), 'Chat room ownership scope is invalid');
      noSecrets(chats.data);
      await ok(`/api/get-detail-user-by-id?id=${id}`, token);
    }
    const ownOrder = fixtures.orders.find(order => Number(fixtures.maps.AddressUser.get(Number(order.addressUserId))?.userId) === Number(customer01.user.id));
    assert.ok(ownOrder, 'customer01 needs a demo order for private order verification');
    noSecrets((await ok(`/api/get-detail-order?id=${ownOrder.id}`, customer01.token)).data);
    assert.equal((await call(`/api/get-detail-order?id=${ownOrder.id}`, customer02.token)).status, 403, 'Unrelated customer can read an order');
    assert.equal((await call(`/api/get-detail-user-by-id?id=${customer01.user.id}`, customer02.token)).status, 403, 'Unrelated customer can read another profile');
    const latestOrder = [...fixtures.orders].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
    const date = new Date(latestOrder.updatedAt).toISOString().slice(0, 10), year = date.slice(0, 4), month = Number(date.slice(5, 7));
    for (const session of [admin, staff1]) {
      for (const route of ['/api/get-all-user?limit=100&offset=0', '/api/get-all-product-admin?limit=10&offset=0', '/api/get-all-order?limit=10&offset=0',
        '/api/get-all-supplier?limit=20&offset=0', '/api/get-all-receipt?limit=20&offset=0', '/api/get-all-typevoucher?limit=20&offset=0',
        '/api/list-room-of-admin', '/api/get-count-card-statistic', `/api/get-count-status-order?oneDate=${date}&type=year`,
        `/api/get-statistic-by-month?year=${year}`, `/api/get-statistic-by-day?year=${year}&month=${month}`,
        `/api/get-statistic-overturn?oneDate=${date}&type=year`, `/api/get-statistic-profit?oneDate=${date}&type=year`, '/api/get-statistic-stock-product?limit=100&offset=0']) noSecrets((await ok(route, session.token)).data);
    }
    assert.ok(fixtures.receipts.length, 'No demo receipts');
    noSecrets((await ok(`/api/get-detail-receipt?id=${fixtures.receipts[0].id}`, admin.token)).data);
    const delivery = await ok(`/api/get-all-order-by-shipper?shipperId=${shipper1.user.id}`, shipper1.token);
    assert.ok(delivery.data.length > 0 && delivery.data.every(row => Number(row.shipperId) === Number(shipper1.user.id)), 'Shipper delivery scope is invalid or empty');
    noSecrets(delivery.data);
    for (const session of [customer01, shipper1]) assert.equal((await call('/api/get-all-user?limit=10&offset=0', session.token)).status, 403, 'Non-manager can read administrative users');
    assert.equal((await call('/api/get-all-order-by-shipper', customer01.token)).status, 403, 'Customer can read shipper deliveries');
    assert.equal((await call('/api/get-all-user')).status, 401, 'Anonymous admin API access was accepted');
    assert.equal((await call('/api/get-all-shopcart-by-userId')).status, 401, 'Anonymous private cart access was accepted');
    return { status: 'ok', checks, authenticatedRoles: ['R1', 'R2', 'R3', 'R4'] };
  } finally {
    if (server.closeIdleConnections) server.closeIdleConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function verifyDemoData({ database = db, http = true, password = process.env.SEED_DEMO_PASSWORD || 'Demo@123456' } = {}) {
  await database.sequelize.authenticate();
  const { fixtures, ...summary } = await verifyDatabase(database);
  if (http) {
    assert.equal(database, db, 'HTTP smoke must use the same project database connection');
    const readState = async () => {
      const state = await Promise.all([
        database.Product.findAll({ attributes: ['id', 'view', 'updatedAt'], order: [['id', 'ASC']], raw: true }),
        database.Blog.findAll({ attributes: ['id', 'view', 'updatedAt'], order: [['id', 'ASC']], raw: true }),
        database.Message.findAll({ attributes: ['id', 'unRead', 'updatedAt'], order: [['id', 'ASC']], raw: true }),
        ...Object.values(database).filter(model => model.rawAttributes).map(model => model.count()),
      ]);
      return createHash('sha256').update(JSON.stringify(state)).digest('hex');
    };
    const before = await readState();
    summary.http = await verifyHttp(fixtures, password);
    assert.equal(await readState(), before, 'HTTP smoke changed views, message read state or database record counts');
    summary.http.readOnly = true;
  }
  return { status: 'ok', ...summary };
}

module.exports = { verifyDemoData };

if (require.main === module) {
  (async () => {
    try {
      console.log(JSON.stringify(await verifyDemoData(), null, 2));
    } catch (error) {
      const reason = error.name === 'AssertionError' ? error.message : (error.original?.code || error.code || error.name);
      console.error(`Demo verification failed: ${reason}`);
      process.exitCode = 1;
    } finally {
      await db.sequelize.close();
    }
  })();
}
