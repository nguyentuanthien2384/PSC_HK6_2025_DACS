'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const db = require('../src/models');
const { voucherDiscount } = require('../src/utils/commerce');
const catalog = require('./demo/catalog-data.cjs');
const scenarios = require('./demo/scenarios.cjs');

const markerCode = 'DEMO_DACS_V1_SEEDED';
const day = 86400000;
const root = path.resolve(__dirname, '../..');
const imageCache = new Map();

function imageValue(descriptor) {
  if (typeof descriptor === 'string') return descriptor;
  if (!descriptor) throw new Error('Demo image descriptor is missing.');
  if (descriptor.imagePath) {
    const filename = path.resolve(root, descriptor.imagePath);
    if (!filename.startsWith(root + path.sep)) throw new Error('Demo images must be inside the workspace.');
    if (!imageCache.has(filename)) {
      const bytes = fs.readFileSync(filename);
      // Some template .jpg assets contain PNG bytes. Use the actual image format.
      const signature = bytes.subarray(0, 8).toString('hex');
      const mime = signature === '89504e470d0a1a0a' ? 'image/png'
        : signature.startsWith('ffd8') ? 'image/jpeg'
          : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp'
            : ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString()) ? 'image/gif'
              : /<svg[\s>]/.test(bytes.toString('utf8', 0, 1000)) ? 'image/svg+xml' : null;
      if (!mime) throw new Error(`Unsupported demo image: ${descriptor.imagePath}`);
      imageCache.set(filename, `data:${mime};base64,${bytes.toString('base64')}`);
    }
    return imageCache.get(filename);
  }
  if (/^https:\/\//.test(descriptor.imageUrl || '')) return descriptor.imageUrl;
  throw new Error('Demo image must have a local path or HTTPS URL.');
}

const referenceValues = [
  ['R1', 'Quản trị viên', 'ROLE'], ['R2', 'Khách hàng', 'ROLE'], ['R3', 'Người giao hàng', 'ROLE'], ['R4', 'Nhân viên', 'ROLE'],
  ['M', 'Nam', 'GENDER'], ['F', 'Nữ', 'GENDER'], ['O', 'Khác', 'GENDER'],
  ['S1', 'Đang hoạt động', 'STATUS'], ['S2', 'Ngừng hoạt động', 'STATUS'],
  ['S3', 'Chờ xác nhận', 'STATUS-ORDER'], ['S4', 'Chờ lấy hàng', 'STATUS-ORDER'],
  ['S5', 'Đang giao hàng', 'STATUS-ORDER'], ['S6', 'Đã giao hàng', 'STATUS-ORDER'], ['S7', 'Đã hủy', 'STATUS-ORDER'],
  ['percent', 'Giảm theo phần trăm', 'DISCOUNT'], ['money', 'Giảm tiền trực tiếp', 'DISCOUNT'],
];

async function seedDemoData({ now = new Date(), password = process.env.SEED_DEMO_PASSWORD || scenarios.demoPassword } = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo data is disabled in NODE_ENV=production.');
  if (password.length < 8 || Buffer.byteLength(password) > 72) throw new Error('SEED_DEMO_PASSWORD must be 8+ characters and at most 72 bytes.');
  await db.sequelize.authenticate();
  const qi = db.sequelize.getQueryInterface();
  // Validate the schema before writing any data; never sync/reset existing tables.
  for (const model of Object.values(db).filter(value => value.rawAttributes)) {
    const columns = await qi.describeTable(model.getTableName());
    for (const name of Object.keys(model.rawAttributes)) {
      if (!columns[name]) throw new Error(`Missing ${model.getTableName()}.${name}; run db:migrate before seeding.`);
    }
  }
  const counts = {};
  const passwordHash = await bcrypt.hash(password, 10);
  const oldDate = new Date(now.getTime() - 210 * day);
  const date = days => new Date(now.getTime() - days * day);
  // A dedicated connection holds the advisory lock until the transaction commits.
  const lockConnection = await db.sequelize.connectionManager.getConnection({ type: 'WRITE' });
  let acquired = false;
  try {
    const [[lock]] = await lockConnection.promise().query('SELECT GET_LOCK(?, 10) AS acquired', ['dacs-demo-data-v1']);
    if (Number(lock.acquired) !== 1) throw new Error('Another demo seeder is running. Try again after it finishes.');
    acquired = true;
    return await db.sequelize.transaction(async transaction => {
      const opts = { transaction };
      if (await db.Allcode.findOne({ where: { code: markerCode }, ...opts })) {
        return { status: 'already-seeded', message: 'Demo data already exists; user changes and passwords are preserved.' };
      }
      const create = async (name, values) => {
        const record = await db[name].create({ createdAt: oldDate, updatedAt: oldDate, ...values }, opts);
        counts[name] = (counts[name] || 0) + 1;
        return record.get({ plain: true });
      };
      for (const [code, value, type] of referenceValues) {
        const existing = await db.Allcode.findOne({ where: { code }, ...opts, raw: true });
        if (!existing) await create('Allcode', { code, value, type });
        else if (existing.type !== type) throw new Error(`Allcode ${code} has type ${existing.type}; expected ${type}.`);
      }
      for (const [type, values] of [['CATEGORY', catalog.categories], ['BRAND', catalog.brands], ['SIZE', catalog.sizes], ['SUBJECT', catalog.subjects]]) {
        for (const value of values) {
          const existing = await db.Allcode.findOne({ where: { code: value.code }, ...opts, raw: true });
          if (existing) {
            if (!value.code.startsWith('DEMO_') && existing.type === type) continue;
            throw new Error(`Demo reference ${value.code} already exists without seed marker.`);
          }
          await create('Allcode', { ...value, type });
        }
      }
      const users = [];
      const avatar = imageValue({ imagePath: 'frontend/public/resources/img/logo.png' });
      for (const { key, ...values } of scenarios.buildUsers(now)) {
        if (await db.User.findOne({ where: { email: values.email }, ...opts })) throw new Error(`Demo account ${values.email} already exists without seed marker; no account was overwritten.`);
        users.push({ ...await create('User', { ...values, password: passwordHash, image: avatar, usertoken: '' }), key });
      }
      const admin = users.find(user => user.roleId === 'R1');
      const staff = users.filter(user => user.roleId === 'R4');
      const shippers = users.filter(user => user.roleId === 'R3' && user.statusId === 'S1');
      const customers = users.filter(user => user.roleId === 'R2' && user.statusId === 'S1' && user.isActiveEmail);
      const addresses = [];
      for (const user of users.filter(user => user.roleId === 'R2')) {
        for (const suffix of ['Nhà riêng', 'Văn phòng']) {
          addresses.push(await create('AddressUser', {
            userId: user.id, shipName: `${user.firstName} ${user.lastName}`, shipAdress: `${suffix}: ${user.address}`,
            shipEmail: user.email, shipPhonenumber: user.phonenumber,
          }));
        }
      }
      const suppliers = [];
      for (const { key, ...values } of catalog.suppliers) suppliers.push({ ...await create('Supplier', values), key });
      const shippingMethods = [];
      for (const { key, ...values } of catalog.shippingMethods) shippingMethods.push({ ...await create('TypeShip', values), key });
      const products = [], variants = [];
      for (const descriptor of catalog.products) {
        const { key, ageDays, supplierKey, stockScenario, variants: details, ...values } = descriptor;
        const product = await create('Product', { ...values, name: values.name.startsWith('[DEMO] ') ? values.name : `[DEMO] ${values.name}`,
          createdAt: oldDate, updatedAt: date(ageDays) });
        products.push(product);
        for (const detailDescriptor of details) {
          const { key: detailKey, images, sizes, ...detailValues } = detailDescriptor;
          const detail = await create('ProductDetail', { ...detailValues, productId: product.id });
          for (const image of images) await create('ProductImage', { caption: image.caption, productdetailId: detail.id, image: imageValue(image) });
          for (const size of sizes) {
            const { key: sizeKey, initialStock, costPrice, stockMode, ...sizeValues } = size;
            const variant = await create('ProductDetailSize', { ...sizeValues, productdetailId: detail.id });
            variants.push({ ...variant, productId: product.id, name: `${product.name} - ${detail.nameDetail}`, price: Number(detail.discountPrice),
              costPrice: Number(costPrice), initialStock: Number(initialStock), stockMode: stockMode || stockScenario, statusId: product.statusId,
              supplierIndex: suppliers.findIndex(supplier => supplier.key === supplierKey) });
          }
        }
      }
      const voucherDescriptors = scenarios.buildVouchers(now);
      const types = new Map();
      for (const { key, ...values } of voucherDescriptors.types) types.set(key, await create('TypeVoucher', values));
      const vouchers = [];
      for (const { key, typeKey, state, ...values } of voucherDescriptors.vouchers) {
        const type = types.get(typeKey);
        if (await db.Voucher.findOne({ where: { codeVoucher: values.codeVoucher }, ...opts })) throw new Error(`Demo voucher ${values.codeVoucher} already exists without seed marker.`);
        vouchers.push({ ...await create('Voucher', { ...values, typeVoucherId: type.id }), key, state, typeVoucherOfVoucherData: type });
      }
      const orderDescriptors = scenarios.buildOrders({ now, customers, addresses, shippingMethods, vouchers, variants, shippers });
      const sold = new Map();
      for (const order of orderDescriptors) {
        if (order.statusId !== 'S7') for (const line of order.lines) sold.set(line.productId, (sold.get(line.productId) || 0) + line.quantity);
      }
      // The first batch covers all historic sales; the second batch adds remaining stock.
      for (const [supplierIndex, supplier] of suppliers.entries()) {
        const batches = [await create('Receipt', { supplierId: supplier.id, userId: admin.id }),
          await create('Receipt', { supplierId: supplier.id, userId: staff[supplierIndex % staff.length].id, createdAt: date(30), updatedAt: date(30) })];
        for (const variant of variants.filter(item => item.supplierIndex === supplierIndex)) {
          const first = (sold.get(variant.id) || 0) + Math.ceil(variant.initialStock * 0.65);
          const second = variant.initialStock - Math.ceil(variant.initialStock * 0.65);
          for (const [index, quantity] of [first, second].entries()) {
            if (!quantity) continue;
            await create('ReceiptDetail', { receiptId: batches[index].id, productDetailSizeId: variant.id, quantity,
              price: index ? Math.round(variant.costPrice * 1.04 / 1000) * 1000 : variant.costPrice,
              createdAt: batches[index].createdAt, updatedAt: batches[index].updatedAt });
          }
        }
      }
      const used = new Map();
      for (const descriptor of orderDescriptors) {
        const { key, customerId, lines, ...values } = descriptor;
        const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.realPrice, 0);
        const voucher = vouchers.find(item => item.id === values.voucherId);
        const discountAmount = voucher ? voucherDiscount(voucher.typeVoucherOfVoucherData, subtotal) : 0;
        const shippingFee = Number(shippingMethods.find(item => item.id === values.typeShipId).price);
        const order = await create('OrderProduct', { ...values, subtotal, shippingFee, discountAmount, totalPrice: subtotal - discountAmount + shippingFee, image: null });
        for (const line of lines) await create('OrderDetail', { ...line, orderId: order.id, createdAt: order.createdAt, updatedAt: order.createdAt });
        if (voucher) {
          const pair = `${customerId}:${voucher.id}`;
          if (used.has(pair)) throw new Error('Demo scenario reused a voucher for the same customer.');
          used.set(pair, order.createdAt);
        }
        if (order.isPaymentOnlien === 1) {
          const provider = key % 2 ? 'vnpay' : 'paypal';
          await create('PaymentSession', {
            id: crypto.randomUUID(), userId: customerId, provider, providerPaymentId: `DEMO-${provider}-${order.id}`,
            orderId: order.id, status: 'COMPLETED', totalPrice: order.totalPrice,
            providerAmount: provider === 'vnpay' ? String(order.totalPrice * 100) : (order.totalPrice / (Number(process.env.USD_EXCHANGE_RATE) || 24300)).toFixed(2),
            currency: provider === 'vnpay' ? 'VND' : 'USD',
            checkoutData: JSON.stringify({ userId: customerId, addressUserId: order.addressUserId, typeShipId: order.typeShipId, voucherId: order.voucherId,
              note: order.note, lines, subtotal, shippingFee, discountAmount, totalPrice: order.totalPrice }),
            expiresAt: new Date(order.createdAt.getTime() + 30 * 60000), createdAt: order.createdAt, updatedAt: order.createdAt,
          });
        }
      }
      for (const voucher of vouchers) {
        for (const [index, user] of customers.entries()) {
          const usedAt = used.get(`${user.id}:${voucher.id}`);
          const status = usedAt ? 1 : 0;
          if (voucher.state === 'exhausted') {
            if (!usedAt) continue;
          } else if (status === 0 && index >= 12) continue;
          const savedAt = voucher.state === 'expired' ? new Date(Number(voucher.toDate) - day) : date(2);
          await create('VoucherUsed', { userId: user.id, voucherId: voucher.id, status,
            createdAt: usedAt ? new Date(usedAt.getTime() - 3600000) : savedAt, updatedAt: usedAt || savedAt });
        }
      }
      const inStock = variants.filter(item => item.statusId === 'S1' && item.initialStock >= 10);
      for (const [index, user] of customers.slice(0, 18).entries()) {
        for (let line = 0; line < 2 + index % 3; line++) {
          const variant = inStock[(index * 13 + line * 7) % inStock.length];
          await create('ShopCart', { userId: user.id, productdetailsizeId: variant.id, quantity: 1 + line % 2, statusId: '0', createdAt: date(1), updatedAt: date(1) });
        }
      }
      const banners = [];
      for (const { key, image, imagePath, imageUrl, ...values } of catalog.banners) {
        banners.push(await create('Banner', { ...values, image: imageValue(image || { imagePath, imageUrl }) }));
      }
      const blogs = [];
      for (const [index, descriptor] of catalog.blogs.entries()) {
        const { key, ageDays, authorRole, image, imagePath, imageUrl, ...values } = descriptor;
        blogs.push(await create('Blog', { ...values, userId: authorRole === 'R1' ? admin.id : staff[index % staff.length].id,
          image: imageValue(image || { imagePath, imageUrl }), createdAt: date(ageDays), updatedAt: date(ageDays) }));
      }
      const reviewTexts = ['Chất vải mềm, mặc thoáng và đúng form. Giao hàng nhanh.', 'Màu thực tế đẹp, đường may chắc chắn. Tôi sẽ mua thêm màu khác.',
        'Sản phẩm đúng mô tả, đóng gói cẩn thận. Size vừa người.', 'Form hơi rộng so với mong đợi, nên xem bảng kích thước trước khi mua.',
        'Giá hợp lý, phù hợp sử dụng hằng ngày. Nhân viên tư vấn nhiệt tình.'];
      for (const [index, product] of products.entries()) {
        for (let review = 0; review < 3; review++) {
          const comment = await create('Comment', { productId: product.id, blogId: null, parentId: null,
            userId: customers[(index + review) % customers.length].id, content: reviewTexts[(index + review) % reviewTexts.length],
            star: [5, 4, 3][review], image: null, createdAt: date(10 + review), updatedAt: date(10 + review) });
          if (review === 0) await create('Comment', { productId: product.id, blogId: null, parentId: comment.id, userId: staff[index % staff.length].id,
            content: 'Cảm ơn bạn đã chia sẻ trải nghiệm. Shop luôn sẵn sàng hỗ trợ về kích thước và cách bảo quản sản phẩm.', star: null, image: null, createdAt: date(9), updatedAt: date(9) });
        }
      }
      for (const [index, blog] of blogs.entries()) {
        const commentDate = new Date(Math.max(blog.createdAt.getTime() + day, date(8).getTime()));
        const replyDate = new Date(commentDate.getTime() + day);
        for (let j = 0; j < 3; j++) {
          const comment = await create('Comment', { blogId: blog.id, productId: null, parentId: null, userId: customers[(index + j) % customers.length].id,
            content: ['Bài viết hữu ích, tôi đã chọn được cách phối đồ phù hợp.', 'Shop có thể gợi ý thêm trang phục cho ngày mưa không?', 'Mong shop có thêm hướng dẫn chọn size và bảo quản chất liệu.'][j],
            star: null, image: null, createdAt: commentDate, updatedAt: commentDate });
          if (j === 1) await create('Comment', { blogId: blog.id, productId: null, parentId: comment.id, userId: staff[index % staff.length].id,
            content: 'Bạn có thể xem bộ sưu tập áo khoác nhẹ và giày thể thao trong danh mục sản phẩm của shop nhé.', star: null, image: null, createdAt: replyDate, updatedAt: replyDate });
        }
      }
      const conversations = [
        ['Shop tư vấn giúp mình chọn size áo được không?', 'Bạn cho shop biết chiều cao và cân nặng để tư vấn size phù hợp nhé.', 'Mình cao 170 cm, nặng 65 kg.', 'Bạn tham khảo size L, nếu thích form vừa thì có thể chọn M nhé.', 'Cảm ơn shop, mình sẽ đặt size L.'],
        ['Đơn hàng của mình đang ở trạng thái nào vậy shop?', 'Shop đã xác nhận và đang chuẩn bị hàng cho bạn.', 'Khoảng mấy ngày mình nhận được hàng?', 'Giao tiêu chuẩn khoảng 2–4 ngày. Bạn có thể theo dõi ở lịch sử đơn hàng.', 'Mình muốn đổi số điện thoại nhận hàng, nhờ shop hỗ trợ.'],
        ['Mã giảm giá của mình chưa áp dụng được.', 'Bạn kiểm tra giá trị đơn tối thiểu và thời gian hiệu lực của voucher nhé.', 'Đơn của mình khoảng 500.000 đồng.', 'Bạn thử mã DEMO-CHAO10 trong danh sách voucher đã lưu nhé.', 'Mình áp dụng được rồi, cảm ơn shop.'],
      ];
      for (const [index, user] of customers.slice(0, 12).entries()) {
        const support = staff[index % staff.length];
        const room = await create('RoomMessage', { userOne: user.id, userTwo: support.id, createdAt: date(3), updatedAt: date(index % 3) });
        const messages = conversations[index % conversations.length];
        for (const [j, text] of messages.entries()) {
          const timestamp = new Date(room.updatedAt.getTime() - (messages.length - j) * 60000);
          await create('Message', { roomId: room.id, userId: j % 2 ? support.id : user.id, text,
            unRead: index % 3 === 0 && j === messages.length - 1, createdAt: timestamp, updatedAt: timestamp });
        }
      }
      await create('Allcode', { code: markerCode, type: 'DEMO-METADATA', value: now.toISOString(), createdAt: now, updatedAt: now });
      return { status: 'seeded', database: db.sequelize.config.database, counts,
        accounts: ['admin@demo.dacs.test', 'staff1@demo.dacs.test', 'shipper1@demo.dacs.test', 'customer01@demo.dacs.test'],
        message: 'Demo data committed. No pre-existing records were deleted or overwritten.' };
    });
  } finally {
    try {
      if (acquired) await lockConnection.promise().query('SELECT RELEASE_LOCK(?)', ['dacs-demo-data-v1']);
    } finally {
      await db.sequelize.connectionManager.releaseConnection(lockConnection);
    }
  }
}

if (require.main === module) {
  seedDemoData().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(`Demo seed failed: ${error.original?.code || error.message}`);
    process.exitCode = 1;
  }).finally(() => db.sequelize.close());
}

module.exports = { seedDemoData, markerCode, imageValue };
