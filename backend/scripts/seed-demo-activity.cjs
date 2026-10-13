'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Op, QueryTypes } = require('sequelize');
const db = require('../src/models');
const { seedDemoData, imageValue } = require('./seed-demo-data.cjs');
const { buildUsers, demoPassword } = require('./demo/scenarios.cjs');
const { buildActivityOrders, orderEvents, orderPrefix, DAY, HOUR } = require('./demo/activity-scenarios.cjs');

const markerCode = 'DEMO_DACS_ACTIVITY_V2_SEEDED';

async function seedDemoActivity({ now = new Date(), password = process.env.SEED_DEMO_PASSWORD || demoPassword } = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo activity is disabled in NODE_ENV=production.');
  now = new Date(now);
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid activity seed date.');
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) throw new Error('Demo password must be 8+ characters and at most 72 bytes.');
  // Bootstrap an empty development database through the existing additive seed.
  await seedDemoData({ now, password });
  const connection = await db.sequelize.connectionManager.getConnection({ type: 'WRITE' });
  let acquired = false;
  try {
    const [[lock]] = await connection.promise().query('SELECT GET_LOCK(?, 10) AS acquired', ['dacs-demo-activity-v2']);
    if (Number(lock.acquired) !== 1) throw new Error('Another activity seeder is running. Try again after it finishes.');
    acquired = true;
    return await db.sequelize.transaction(async transaction => {
      const opts = { transaction };
      if (await db.Allcode.findOne({ where: { code: markerCode }, ...opts })) return {
        status: 'already-seeded', message: 'Activity data already exists. Existing records and passwords are preserved.',
      };
      if (await db.OrderProduct.count({ where: { note: { [Op.like]: `${orderPrefix}%` } }, ...opts })) throw new Error('Activity orders exist without their seed marker. No records were overwritten.');
      const counts = {};
      const create = async (name, values) => {
        const row = await db[name].create(values, opts);
        counts[name] = (counts[name] || 0) + 1;
        return row.get({ plain: true });
      };
      const bulk = async (name, rows) => {
        for (let index = 0; index < rows.length; index += 250) await db[name].bulkCreate(rows.slice(index, index + 250), { ...opts, validate: true });
        counts[name] = (counts[name] || 0) + rows.length;
      };
      const oldDate = new Date(now.getTime() - 420 * DAY);
      const templates = buildUsers(now).filter(user => user.roleId === 'R2').slice(0, 24);
      const hash = await bcrypt.hash(password, 10);
      const generated = [];
      for (let number = 25; number <= 120; number++) {
        const { key, ...template } = templates[(number - 25) % templates.length];
        generated.push({ ...template, email: `customer${String(number).padStart(2, '0')}@demo.dacs.test`,
          firstName: templates[((number - 25) % 24 + Math.floor((number - 25) / 24) * 5) % 24].firstName,
          phonenumber: `089901${String(number).padStart(4, '0')}`, password: hash, image: null,
          createdAt: oldDate, updatedAt: oldDate });
      }
      for (let number = 4; number <= 8; number++) {
        const { key, ...template } = templates[number];
        generated.push({ ...template, email: `shipper${number}@demo.dacs.test`, roleId: 'R3',
          phonenumber: `089902${String(number).padStart(4, '0')}`, password: hash, image: null,
          createdAt: oldDate, updatedAt: oldDate });
      }
      if (await db.User.count({ where: { email: { [Op.in]: generated.map(row => row.email) } }, ...opts })) throw new Error('An activity demo email already exists without the seed marker. No account was overwritten.');
      await bulk('User', generated);
      const people = await db.User.findAll({ where: { statusId: 'S1' }, attributes: ['id', 'email', 'roleId', 'statusId', 'firstName', 'lastName', 'address', 'phonenumber', 'createdAt'], order: [['id', 'ASC']], ...opts, raw: true });
      const customers = people.filter(row => row.roleId === 'R2');
      const shippers = people.filter(row => row.roleId === 'R3');
      const managers = people.filter(row => ['R1', 'R4'].includes(row.roleId));
      const admin = managers.find(row => row.email === 'admin@demo.dacs.test') || managers.find(row => row.roleId === 'R1');
      const staff = managers.find(row => row.email === 'staff1@demo.dacs.test') || admin;
      if (!admin || !shippers.length) throw new Error('An active administrator and shipper are required.');
      const addresses = await db.AddressUser.findAll({ where: { userId: { [Op.in]: customers.map(row => row.id) } }, ...opts, raw: true });
      for (const customer of customers) {
        if (addresses.some(row => Number(row.userId) === Number(customer.id))) continue;
        // New locations are fictional; existing profile/address data is never edited.
        for (const [index, label] of ['Nhà riêng', 'Văn phòng'].entries()) addresses.push(await create('AddressUser', {
          userId: customer.id, isDefault: index === 0, shipName: `${customer.firstName || 'Khách'} ${customer.lastName || 'hàng mẫu'}`,
          shipAdress: `[DEMO] ${label}: ${templates[customer.id % templates.length].address}`,
          shipEmail: customer.email, shipPhonenumber: `089903${String(customer.id).padStart(4, '0')}`,
          createdAt: oldDate, updatedAt: oldDate,
        }));
      }
      const shippingMethods = await db.TypeShip.findAll({ ...opts, raw: true, order: [['id', 'ASC']] });
      const suppliers = await db.Supplier.findAll({ ...opts, raw: true, order: [['id', 'ASC']] });
      if (!suppliers.length) throw new Error('A supplier is required for stock funding.');
      // Use sellable variants with >3 on hand, preserving the existing low/out-of-stock scenarios.
      const variants = await db.sequelize.query(`SELECT v.id,d.productId,p.statusId,d.discountPrice AS price,
          COALESCE(r.costPrice,ROUND(d.discountPrice*0.55/1000)*1000) AS costPrice
        FROM ProductDetailSizes v JOIN ProductDetails d ON d.id=v.productdetailId JOIN Products p ON p.id=d.productId
        LEFT JOIN (SELECT productDetailSizeId,SUM(quantity) AS incoming,SUM(quantity*price)/NULLIF(SUM(quantity),0) AS costPrice FROM ReceiptDetails GROUP BY productDetailSizeId) r ON r.productDetailSizeId=v.id
        LEFT JOIN (SELECT l.productId,SUM(l.quantity) AS outgoing FROM Orderdetails l JOIN Orderproducts o ON o.id=l.orderId WHERE o.statusId<>'S7' GROUP BY l.productId) s ON s.productId=v.id
        LEFT JOIN (SELECT productDetailSizeId,SUM(quantity) AS quantity FROM InventoryAdjustments GROUP BY productDetailSizeId) a ON a.productDetailSizeId=v.id
        LEFT JOIN (SELECT productDetailSizeId,SUM(quantity) AS quantity FROM StockMovements GROUP BY productDetailSizeId) m ON m.productDetailSizeId=v.id
        WHERE p.statusId='S1' AND d.discountPrice>0 AND COALESCE(r.incoming,0)-COALESCE(s.outgoing,0)+COALESCE(a.quantity,0)+COALESCE(m.quantity,0)>3
        ORDER BY p.id,v.id`, { ...opts, type: QueryTypes.SELECT });
      const descriptors = buildActivityOrders({ now, customers, addresses, shippingMethods, variants, shippers });
      const stockFunding = new Map();
      for (const order of descriptors) {
        if (order.statusId === 'S7') continue;
        const local = new Date(order.createdAt.getTime() + 7 * HOUR).toISOString().slice(0, 7);
        if (!stockFunding.has(local)) stockFunding.set(local, new Map());
        for (const line of order.lines) {
          const bucket = stockFunding.get(local);
          bucket.set(line.productId, (bucket.get(line.productId) || 0) + line.quantity);
        }
      }
      const receiptIds = [];
      const byVariant = new Map(variants.map(row => [Number(row.id), row]));
      for (const [index, [month, quantities]] of [...stockFunding].sort(([left], [right]) => left.localeCompare(right)).entries()) {
        const receiptDate = new Date(Date.parse(`${month}-01T00:00:00+07:00`) - DAY);
        const receipt = await create('Receipt', { userId: admin.id, supplierId: suppliers[index % suppliers.length].id, createdAt: receiptDate, updatedAt: receiptDate });
        receiptIds.push(receipt.id);
        await bulk('ReceiptDetail', [...quantities].map(([id, quantity]) => ({ receiptId: receipt.id,
          productDetailSizeId: id, quantity, price: Math.max(1000, Math.round(Number(byVariant.get(Number(id)).costPrice) / 1000) * 1000),
          createdAt: receiptDate, updatedAt: receiptDate })));
      }
      const orders = [], events = [], ratings = [], payments = [], notifications = [];
      for (const descriptor of descriptors) {
        const { key, customerId, recent, lines, ...values } = descriptor;
        const order = await create('OrderProduct', { ...values, image: null });
        orders.push({ ...order, key, customerId, recent, lines });
        await bulk('OrderDetail', lines.map(line => ({ ...line, orderId: order.id, createdAt: order.createdAt, updatedAt: order.createdAt })));
        events.push(...orderEvents(order, customerId, staff.id));
        if (order.statusId === 'S6' && !recent && key % 4 !== 0) ratings.push({
          orderId: order.id, userId: customerId, shipperId: order.shipperId,
          rating: key % 13 === 0 ? 3 : key % 5 === 0 ? 4 : 5,
          comment: ['Shipper gọi trước khi đến, giao đúng giờ và rất lịch sự.', 'Hàng được giữ cẩn thận, hỗ trợ kiểm tra kiện hàng.',
            'Giao hơi muộn so với dự kiến nhưng có thông báo trước.', 'Nhận hàng nhanh, thái độ thân thiện và chuyên nghiệp.'][key % 4],
          createdAt: new Date(order.deliveredAt.getTime() + 300000), updatedAt: new Date(order.deliveredAt.getTime() + 300000),
        });
        if (order.isPaymentOnlien === 1) {
          const provider = Math.floor(key / 4) % 2 ? 'vnpay' : 'paypal';
          payments.push({ id: crypto.randomUUID(), userId: customerId, provider,
            providerPaymentId: `DEMO-V2-${provider}-${order.id}`, orderId: order.id, status: 'COMPLETED', totalPrice: order.totalPrice,
            providerAmount: provider === 'vnpay' ? String(Number(order.totalPrice) * 100) : (Number(order.totalPrice) / (Number(process.env.USD_EXCHANGE_RATE) || 24300)).toFixed(2),
            currency: provider === 'vnpay' ? 'VND' : 'USD', gatewayApiVersion: provider === 'paypal' ? 'v2' : 'v1',
            checkoutData: JSON.stringify({ userId: customerId, addressUserId: order.addressUserId, typeShipId: order.typeShipId,
              voucherId: null, note: order.note, lines, subtotal: order.subtotal, shippingFee: order.shippingFee,
              discountAmount: 0, totalPrice: order.totalPrice }),
            expiresAt: new Date(order.createdAt.getTime() + 30 * 60000), paidAt: new Date(order.createdAt.getTime() + 60000),
            gatewayOutcome: JSON.stringify({ demo: true, message: 'Mô phỏng thanh toán, không gọi cổng thật.' }),
            createdAt: order.createdAt, updatedAt: new Date(order.createdAt.getTime() + 60000),
          });
        }
        if (recent) {
          const latest = events[events.length - 1];
          const recipients = new Map(managers.map(row => [row.id, `/system/home/order-detail/${order.id}`]));
          recipients.set(customerId, `/user/order/${customerId}`);
          if (order.shipperId) recipients.set(order.shipperId, '/shipper');
          for (const [id, link] of recipients) notifications.push({ userId: id, orderId: order.id, type: latest.type,
            title: latest.title, message: latest.message, link, dedupeKey: `demo-v2:order:${order.id}:user:${id}`,
            readAt: key % 3 === 0 ? latest.createdAt : null, createdAt: latest.createdAt, updatedAt: latest.createdAt });
        }
        if (order.statusId === 'S10') await bulk('InventoryAdjustment', lines.map(line => ({
          productDetailSizeId: line.productId, orderId: order.id, returnRequestId: null, quantity: line.quantity,
          idempotencyKey: `undelivered:${order.id}:variant:${line.productId}`, reason: 'UNDELIVERED', createdAt: order.warehouseReceivedAt,
        })));
      }
      await bulk('PaymentSession', payments);
      await bulk('ShipperRating', ratings);
      // Reviews are only inserted for products actually delivered to the reviewer.
      const reviewed = new Set((await db.Comment.findAll({ where: { parentId: null, productId: { [Op.ne]: null } }, attributes: ['userId', 'productId'], ...opts, raw: true })).map(row => `${row.userId}:${row.productId}`));
      const reviews = [];
      for (const order of orders.filter(row => row.statusId === 'S6' && !row.recent).slice(0, 500)) {
        if (people.find(user => user.id === order.customerId)?.email === 'customer01@demo.dacs.test') continue;
        const productId = byVariant.get(Number(order.lines[0].productId)).productId;
        const pair = `${order.customerId}:${productId}`;
        if (reviewed.has(pair)) continue;
        reviewed.add(pair);
        const at = new Date(Math.min(now.getTime(), order.deliveredAt.getTime() + HOUR));
        reviews.push({ userId: order.customerId, productId, blogId: null, parentId: null, star: order.key % 9 === 0 ? 3 : order.key % 4 === 0 ? 4 : 5,
          content: `${orderPrefix} ${['Sản phẩm đúng hình, chất liệu tốt và đóng gói cẩn thận.', 'Kích thước vừa vặn, sử dụng hằng ngày rất tiện.',
            'Màu đẹp, shop tư vấn nhiệt tình. Tôi sẽ quay lại mua.', 'Chất lượng ổn trong tầm giá, giao hàng đúng hẹn.'][order.key % 4]}`,
          image: null, createdAt: at, updatedAt: at });
      }
      await bulk('Comment', reviews);
      // Seed complete COD after-sales cases without contacting a carrier, bank or gateway.
      const returnOrders = orders.filter(row => row.recent && row.statusId === 'S6' && !row.isPaymentOnlien
        && people.find(user => user.id === row.customerId)?.email !== 'customer01@demo.dacs.test').slice(0, 18);
      const returnStatuses = ['REQUESTED', 'APPROVED', 'SHIPPED', 'REFUND_PENDING', 'REFUNDED', 'REJECTED'];
      const proof = imageValue({ imagePath: 'frontend/public/resources/img/logo.png' });
      for (const [index, order] of returnOrders.entries()) {
        const status = returnStatuses[index % returnStatuses.length];
        const requestedAt = new Date(order.deliveredAt.getTime() + 60000);
        const reviewedAt = new Date(requestedAt.getTime() + 60000);
        const shippedAt = new Date(reviewedAt.getTime() + 60000);
        const receivedAt = new Date(shippedAt.getTime() + 60000);
        const refundedAt = new Date(receivedAt.getTime() + 60000);
        const approved = !['REQUESTED', 'REJECTED'].includes(status);
        const shipped = ['SHIPPED', 'REFUND_PENDING', 'REFUNDED'].includes(status);
        const received = ['REFUND_PENDING', 'REFUNDED'].includes(status);
        const request = await create('ReturnRequest', {
          orderId: order.id, activeOrderId: status === 'REJECTED' ? null : order.id, userId: order.customerId,
          kind: 'CUSTOMER_RETURN', status, reason: '[DEMO] Sản phẩm không phù hợp kích thước, khách muốn trả toàn bộ đơn.',
          amount: order.totalPrice, evidence: null, requestedAt, approvedAt: approved ? reviewedAt : null,
          rejectedAt: status === 'REJECTED' ? reviewedAt : null, reviewedById: status === 'REQUESTED' ? null : staff.id,
          reviewNote: status === 'REQUESTED' ? null : status === 'REJECTED' ? 'Đã kiểm tra: sản phẩm có dấu hiệu sử dụng, không đủ điều kiện trả.' : 'Đã duyệt yêu cầu, hướng dẫn khách gửi lại đầy đủ sản phẩm.',
          shippedAt: shipped ? shippedAt : null, carrier: shipped ? 'Vận chuyển mẫu nội bộ' : null,
          trackingNumber: shipped ? `DEMO-RETURN-${order.id}` : null,
          receivedAt: received ? receivedAt : null, receivedById: received ? staff.id : null,
          resellable: received ? true : null, inspectionNote: received ? 'Đã nhận đủ sản phẩm, nguyên tem; có thể bán lại.' : null,
          refundMethod: status === 'REFUNDED' ? 'manual' : null, refundReference: status === 'REFUNDED' ? `DEMO-REFUND-${order.id}` : null,
          refundProof: status === 'REFUNDED' ? proof : null, refundedAt: status === 'REFUNDED' ? refundedAt : null,
          refundedById: status === 'REFUNDED' ? admin.id : null,
          createdAt: requestedAt, updatedAt: status === 'REFUNDED' ? refundedAt : received ? receivedAt : shipped ? shippedAt : status === 'REQUESTED' ? requestedAt : reviewedAt,
        });
        const addReturnEvent = (type, title, at, actorId) => events.push({ orderId: order.id, actorId, type, title,
          message: `${title}. [DEMO] Quy trình mô phỏng; không phát sinh giao dịch thật.`,
          metadata: JSON.stringify({ demo: true, returnRequestId: request.id, amount: Number(request.amount) }), createdAt: at });
        addReturnEvent('RETURN_REQUESTED', 'Khách yêu cầu trả hàng', requestedAt, order.customerId);
        if (approved) addReturnEvent('RETURN_APPROVED', 'Đã duyệt yêu cầu trả hàng', reviewedAt, staff.id);
        if (status === 'REJECTED') addReturnEvent('RETURN_REJECTED', 'Đã từ chối yêu cầu trả hàng', reviewedAt, staff.id);
        if (shipped) addReturnEvent('RETURN_SHIPPED', 'Khách đã gửi hàng trả', shippedAt, order.customerId);
        if (received) {
          addReturnEvent('RETURN_RECEIVED', 'Kho nhận hàng trả, chờ hoàn tiền', receivedAt, staff.id);
          await bulk('InventoryAdjustment', order.lines.map(line => ({ productDetailSizeId: line.productId,
            orderId: order.id, returnRequestId: request.id, quantity: line.quantity,
            idempotencyKey: `return:${request.id}:variant:${line.productId}`, reason: 'CUSTOMER_RETURN', createdAt: receivedAt })));
        }
        if (status === 'REFUNDED') addReturnEvent('REFUND_MANUALLY_CONFIRMED', 'Đã ghi nhận hoàn tiền mô phỏng', refundedAt, admin.id);
        // The latest notification reflects the return state rather than the previous delivery.
        for (const notification of notifications.filter(row => row.orderId === order.id)) {
          const latest = events[events.length - 1];
          Object.assign(notification, { type: latest.type, title: latest.title, message: latest.message,
            createdAt: latest.createdAt, updatedAt: latest.createdAt, readAt: null });
        }
      }
      await bulk('OrderEvent', events);
      await bulk('Notification', notifications);
      await create('Allcode', { code: markerCode, type: 'DEMO-METADATA',
        value: JSON.stringify({ now: now.toISOString(), orders: orders.length, version: 2 }), createdAt: now, updatedAt: now });
      return { status: 'seeded', database: db.sequelize.config.database, counts,
        orderStatuses: Object.fromEntries(['S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10'].map(status => [status, orders.filter(order => order.statusId === status).length])),
        customers: customers.length, shippers: shippers.length, receiptIds,
        accounts: ['admin@demo.dacs.test', 'shipper1@demo.dacs.test', 'customer01@demo.dacs.test', 'customer25@demo.dacs.test'],
        message: 'Realistic demo activity committed. Existing rows and passwords preserved; no external services called.' };
    });
  } finally {
    try { if (acquired) await connection.promise().query('SELECT RELEASE_LOCK(?)', ['dacs-demo-activity-v2']); }
    finally { await db.sequelize.connectionManager.releaseConnection(connection); }
  }
}

module.exports = { seedDemoActivity, markerCode, orderPrefix };
if (require.main === module) seedDemoActivity().then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(error => { console.error(`Activity seed failed: ${error.original?.code || error.message}`); process.exitCode = 1; })
  .finally(() => db.sequelize.close());
