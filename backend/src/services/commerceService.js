const { Op, Transaction } = require('sequelize');
const { fail, positiveInteger, money, normalizeLines, voucherDiscount, voucherIsActive } = require('../utils/commerce');

// Inventory is receipts minus non-cancelled orders and unexpired payment reservations.
function createCommerceService(db) {
    const transaction = work => db.sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, work);
    const options = tx => tx ? { transaction: tx } : {};
    const lockOptions = tx => tx ? { transaction: tx, lock: tx.LOCK.UPDATE } : {};

    async function activeSessions(tx, excludeSessionId) {
        const rows = await db.PaymentSession.findAll({
            where: { status: 'PENDING', expiresAt: { [Op.gt]: new Date() } }, ...options(tx), raw: true
        });
        return rows.filter(row => row.id !== excludeSessionId).map(row => ({ ...row, checkout: JSON.parse(row.checkoutData) }));
    }

    async function availableStock(productId, tx, excludeSessionId) {
        const received = Number(await db.ReceiptDetail.sum('quantity', { where: { productDetailSizeId: productId }, ...options(tx) })) || 0;
        const lines = await db.OrderDetail.findAll({ where: { productId }, ...options(tx), raw: true });
        const orderIds = [...new Set(lines.map(line => line.orderId))];
        const orders = orderIds.length ? await db.OrderProduct.findAll({
            where: { id: { [Op.in]: orderIds }, statusId: { [Op.ne]: 'S7' } }, attributes: ['id'], ...options(tx), raw: true
        }) : [];
        const activeOrderIds = new Set(orders.map(order => Number(order.id)));
        const sold = lines.reduce((total, line) => total + (activeOrderIds.has(Number(line.orderId)) ? Number(line.quantity) : 0), 0);
        const reservations = await activeSessions(tx, excludeSessionId);
        const reserved = reservations.reduce((total, session) => total + session.checkout.lines.reduce((sum, line) => sum + (Number(line.productId) === Number(productId) ? Number(line.quantity) : 0), 0), 0);
        return Math.max(0, received - sold - reserved);
    }

    async function lockVariants(lines, tx) {
        for (const line of [...lines].sort((a, b) => a.productId - b.productId)) {
            const variant = await db.ProductDetailSize.findOne({ where: { id: line.productId }, ...lockOptions(tx), raw: false });
            if (!variant) fail('Sản phẩm không còn tồn tại.', 2);
        }
    }

    async function checkStock(lines, tx, excludeSessionId) {
        await lockVariants(lines, tx);
        for (const line of lines) {
            const stock = await availableStock(line.productId, tx, excludeSessionId);
            if (line.quantity > stock) fail(`Chỉ còn ${stock} sản phẩm. Vui lòng cập nhật giỏ hàng.`, 2, { productId: line.productId, quantity: stock });
        }
    }

    async function checkVoucher(voucherId, userId, subtotal, tx, excludeSessionId) {
        if (!voucherId) return { voucherId: null, discountAmount: 0 };
        if (!positiveInteger(voucherId)) fail('Voucher không hợp lệ.');
        const voucher = await db.Voucher.findOne({ where: { id: voucherId }, ...lockOptions(tx), raw: false });
        if (!voucher || !voucherIsActive(voucher)) fail('Voucher chưa có hiệu lực hoặc đã hết hạn.', 2);
        const saved = await db.VoucherUsed.findOne({ where: { voucherId, userId, status: 0 }, ...lockOptions(tx), raw: false });
        if (!saved) fail('Voucher chưa được lưu hoặc đã sử dụng.', 2);
        const sessions = await activeSessions(tx, excludeSessionId);
        const reserved = sessions.filter(session => Number(session.checkout.voucherId) === Number(voucherId));
        if (reserved.some(session => Number(session.userId) === Number(userId))) fail('Voucher đang được sử dụng trong một giao dịch thanh toán khác.', 2);
        const used = await db.VoucherUsed.count({ where: { voucherId, status: 1 }, ...options(tx) });
        if (used + reserved.length >= Number(voucher.amount)) fail('Voucher đã hết lượt sử dụng.', 2);
        const type = await db.TypeVoucher.findOne({ where: { id: voucher.typeVoucherId }, ...options(tx), raw: true });
        if (!type) fail('Loại voucher không hợp lệ.', 2);
        return { voucherId: Number(voucherId), discountAmount: voucherDiscount(type, subtotal) };
    }

    async function quote(data, tx) {
        if (!positiveInteger(data.userId) || !positiveInteger(data.addressUserId) || !positiveInteger(data.typeShipId)) fail('Vui lòng chọn địa chỉ và phương thức vận chuyển.');
        const lines = normalizeLines(data.arrDataShopCart || data.result);
        await lockVariants(lines, tx);
        const address = await db.AddressUser.findOne({ where: { id: data.addressUserId, userId: data.userId }, ...options(tx), raw: true });
        if (!address) fail('Địa chỉ giao hàng không thuộc tài khoản của bạn.', 403);
        const shipping = await db.TypeShip.findOne({ where: { id: data.typeShipId }, ...options(tx), raw: true });
        if (!shipping) fail('Phương thức vận chuyển không tồn tại.', 2);
        let subtotal = 0;
        for (const line of lines) {
            const variant = await db.ProductDetailSize.findOne({ where: { id: line.productId }, ...options(tx), raw: true });
            const detail = await db.ProductDetail.findOne({ where: { id: variant.productdetailId }, ...options(tx), raw: true });
            const product = detail && await db.Product.findOne({ where: { id: detail.productId, statusId: 'S1' }, ...options(tx), raw: true });
            if (!product) fail('Sản phẩm đã ngừng kinh doanh.', 2);
            line.realPrice = money(detail.discountPrice);
            line.name = `${product.name} - ${detail.nameDetail}`;
            subtotal += line.realPrice * line.quantity;
            if (!Number.isSafeInteger(subtotal)) fail('Giá trị đơn hàng vượt giới hạn.');
        }
        await checkStock(lines, tx);
        const voucher = await checkVoucher(data.voucherId, data.userId, subtotal, tx);
        const shippingFee = money(shipping.price);
        const totalPrice = subtotal - voucher.discountAmount + shippingFee;
        if (!Number.isSafeInteger(totalPrice)) fail('Giá trị đơn hàng không hợp lệ.');
        return {
            userId: Number(data.userId), addressUserId: Number(data.addressUserId), typeShipId: Number(data.typeShipId),
            voucherId: voucher.voucherId, note: String(data.note || '').slice(0, 255), lines,
            subtotal, shippingFee, discountAmount: voucher.discountAmount, totalPrice
        };
    }

    async function persistOrder(checkout, tx, paid = false) {
        const { userId, lines, ...orderData } = checkout;
        const order = await db.OrderProduct.create({ ...orderData, isPaymentOnlien: paid ? 1 : 0, statusId: 'S3' }, options(tx));
        await db.OrderDetail.bulkCreate(lines.map(({ productId, quantity, realPrice }) => ({ orderId: order.id, productId, quantity, realPrice })), options(tx));
        // Remove only purchased quantities, retaining unrelated or newly added items.
        for (const line of lines) {
            const cartRows = await db.ShopCart.findAll({ where: { userId, productdetailsizeId: line.productId, statusId: 0 }, ...lockOptions(tx), raw: false, order: [['id', 'ASC']] });
            let remaining = line.quantity;
            for (const cart of cartRows) {
                const consumed = Math.min(Number(cart.quantity), remaining);
                if (!consumed) continue;
                remaining -= consumed;
                if (Number(cart.quantity) === consumed) await cart.destroy(options(tx));
                else { cart.quantity = Number(cart.quantity) - consumed; await cart.save(options(tx)); }
            }
        }
        if (checkout.voucherId) await db.VoucherUsed.update({ status: 1 }, { where: { userId, voucherId: checkout.voucherId, status: 0 }, ...options(tx) });
        return { errCode: 0, errMessage: 'Đặt hàng thành công.', orderId: order.id, data: order.get ? order.get({ plain: true }) : order };
    }

    return { transaction, options, lockOptions, activeSessions, availableStock, lockVariants, checkStock, checkVoucher, quote, persistOrder };
}

module.exports = { createCommerceService };
