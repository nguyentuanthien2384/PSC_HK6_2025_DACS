const { Op, Transaction, fn, col } = require('sequelize');
const { fail, positiveInteger, resultOf, canTransitionOrder } = require('../utils/commerce');

const isAdmin = actor => !!actor && ['R1', 'R4'].includes(actor.roleId);
const validId = value => ['number', 'string'].includes(typeof value) && positiveInteger(value);
const sameId = (left, right) => validId(left) && validId(right) && Number(left) === Number(right);
const safeShipperFields = ['id', 'firstName', 'lastName', 'phonenumber', 'roleId', 'statusId'];

function validateImage(image) {
    if (typeof image !== 'string' || image.length > 8 * 1024 * 1024 ||
        !/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z\d+/=\r\n]+$/i.test(image)) {
        fail('Ảnh giao hàng phải là ảnh PNG, JPEG, WebP hoặc GIF, tối đa 6 MB.');
    }
    return image;
}

// Every mutation locks the order first. A concurrent claim, completion or review
// rechecks its eligibility after the preceding transaction commits.
function createDeliveryService(db) {
    const transaction = work => db.sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, work);
    const locked = tx => ({ transaction: tx, lock: tx.LOCK.UPDATE });
    const orderResult = (order, message) => ({ errCode: 0, errMessage: message, orderId: order.id,
        data: order.get ? order.get({ plain: true }) : { ...order } });
    const canManage = (order, address, actor, status) => {
        if (isAdmin(actor)) return true;
        if (!actor) return false;
        if (status === 'S7') return sameId(address && address.userId, actor.id) && Number(order.isPaymentOnlien) === 0;
        return status === 'S6' && validId(order.shipperId) &&
            (sameId(address && address.userId, actor.id) || (actor.roleId === 'R3' && sameId(order.shipperId, actor.id)));
    };

    const confirmOrder = (data, actor) => resultOf(async () => {
        if (!actor || (!isAdmin(actor) && actor.roleId !== 'R3')) fail('Bạn không có quyền nhận giao hàng.', 403);
        if (!validId(data.orderId) || data.statusId !== 'S5') fail('Yêu cầu nhận giao hàng không hợp lệ.');
        const shipperId = isAdmin(actor) ? data.shipperId : actor.id;
        if (!validId(shipperId)) fail('Vui lòng chọn người giao hàng.');
        return transaction(async tx => {
            const order = await db.OrderProduct.findOne({ where: { id: Number(data.orderId) }, ...locked(tx), raw: false });
            if (!order) fail('Không tìm thấy đơn hàng.', 2);
            // A retry by the assigned courier has no additional effect.
            if (sameId(order.shipperId, shipperId) && ['S5', 'S6'].includes(order.statusId)) {
                return orderResult(order, 'Đơn hàng đã được nhận giao.');
            }
            if (order.statusId !== 'S4' || validId(order.shipperId)) fail('Đơn hàng chưa sẵn sàng hoặc đã có người nhận giao.', 2);
            const shipper = await db.User.findOne({ where: { id: Number(shipperId), roleId: 'R3', statusId: 'S1' }, ...locked(tx), raw: true });
            if (!shipper) fail('Người giao hàng không hợp lệ hoặc đã ngừng hoạt động.', 2);
            const address = await db.AddressUser.findOne({ where: { id: order.addressUserId }, transaction: tx, raw: true });
            if (!address) fail('Đơn hàng không còn địa chỉ giao hàng hợp lệ.', 2);
            order.shipperId = Number(shipperId);
            order.statusId = 'S5';
            order.assignedAt = new Date();
            await order.save({ transaction: tx });
            return orderResult(order, 'Nhận giao hàng thành công.');
        });
    });

    const updateStatusOrder = (data, actor) => resultOf(async () => {
        if (!validId(data.id) || !['S4', 'S5', 'S6', 'S7'].includes(data.statusId)) fail('Mã đơn hàng hoặc trạng thái không hợp lệ.');
        // Assignment always goes through confirmOrder, which checks the courier.
        if (data.statusId === 'S5') fail('Vui lòng chọn người giao hàng và nhận đơn trước khi bắt đầu giao.');
        if (data.image !== undefined && data.statusId !== 'S6') fail('Chỉ được gửi ảnh khi hoàn tất giao hàng.');
        const image = data.image === undefined ? undefined : validateImage(data.image);
        const reason = data.cancelReason === undefined ? '' : data.cancelReason;
        if (typeof reason !== 'string' || reason.trim().length > 1000) fail('Lý do hủy đơn không hợp lệ hoặc dài quá 1000 ký tự.');
        return transaction(async tx => {
            const order = await db.OrderProduct.findOne({ where: { id: Number(data.id) }, ...locked(tx), raw: false });
            if (!order) fail('Không tìm thấy đơn hàng.', 2);
            const address = await db.AddressUser.findOne({ where: { id: order.addressUserId }, transaction: tx, raw: true });
            if (order.statusId === data.statusId) {
                if (!canManage(order, address, actor, data.statusId)) fail('Bạn không có quyền thay đổi đơn hàng này.', 403);
                return orderResult(order, 'Trạng thái đơn hàng đã được cập nhật.');
            }
            if (data.statusId === 'S7' && Number(order.isPaymentOnlien) === 1 &&
                (isAdmin(actor) || sameId(address && address.userId, actor && actor.id))) {
                fail('Đơn hàng đã thanh toán trực tuyến cần được đối soát và xử lý hoàn tiền trước khi hủy.', 2);
            }
            if (!canTransitionOrder(order, address, actor, data.statusId)) fail('Bạn không có quyền thay đổi hoặc trạng thái đơn hàng không hợp lệ.', 403);
            if (data.statusId === 'S6' && !validId(order.shipperId)) fail('Đơn hàng chưa được giao cho người vận chuyển.', 2);
            if (data.statusId === 'S7' && validId(order.shipperId)) fail('Đơn hàng đã được nhận giao, không thể hủy.', 2);
            order.statusId = data.statusId;
            if (data.statusId === 'S6') {
                order.deliveredAt = new Date();
                if (image !== undefined) order.image = image;
            }
            if (data.statusId === 'S7') {
                order.cancelledAt = new Date();
                order.cancellationReason = reason.trim() || null;
            }
            await order.save({ transaction: tx });
            return orderResult(order, 'Cập nhật đơn hàng thành công.');
        });
    });

    const updateImageOrder = (data, actor) => resultOf(async () => {
        if (!validId(data.id)) fail('Mã đơn hàng không hợp lệ.');
        const image = validateImage(data.image);
        return transaction(async tx => {
            const order = await db.OrderProduct.findOne({ where: { id: Number(data.id) }, ...locked(tx), raw: false });
            if (!order) fail('Không tìm thấy đơn hàng.', 2);
            if (!isAdmin(actor) && !(actor && actor.roleId === 'R3' && sameId(order.shipperId, actor.id))) fail('Bạn không có quyền cập nhật ảnh đơn hàng.', 403);
            if (order.statusId !== 'S5' || !validId(order.shipperId)) fail('Chỉ được cập nhật ảnh cho đơn hàng đang giao.', 2);
            order.image = image;
            await order.save({ transaction: tx });
            return { errCode: 0, errMessage: 'Đã cập nhật ảnh giao hàng.' };
        });
    });

    const rateShipper = (data, actor) => resultOf(async () => {
        if (!actor || !validId(actor.id)) fail('Vui lòng đăng nhập.', 403);
        if (!validId(data.orderId) || !['number', 'string'].includes(typeof data.rating) ||
            !Number.isInteger(Number(data.rating)) || Number(data.rating) < 1 || Number(data.rating) > 5) fail('Vui lòng đánh giá từ 1 đến 5 sao.');
        const comment = data.comment === undefined ? '' : data.comment;
        if (typeof comment !== 'string' || comment.trim().length > 1000) fail('Nhận xét không hợp lệ hoặc dài quá 1000 ký tự.');
        return transaction(async tx => {
            const order = await db.OrderProduct.findOne({ where: { id: Number(data.orderId) }, ...locked(tx), raw: false });
            if (!order) fail('Không tìm thấy đơn hàng.', 2);
            const address = await db.AddressUser.findOne({ where: { id: order.addressUserId }, transaction: tx, raw: true });
            if (!sameId(address && address.userId, actor.id) || sameId(order.shipperId, actor.id)) fail('Chỉ người mua đơn hàng mới được đánh giá người giao hàng.', 403);
            if (order.statusId !== 'S6' || !validId(order.shipperId)) fail('Chỉ được đánh giá sau khi đơn hàng đã được giao.', 2);
            const existing = await db.ShipperRating.findOne({ where: { orderId: order.id }, transaction: tx, raw: true });
            if (existing) fail('Bạn đã đánh giá người giao hàng cho đơn này.', 2, { data: existing });
            const rating = await db.ShipperRating.create({ orderId: order.id, userId: Number(actor.id), shipperId: Number(order.shipperId), rating: Number(data.rating), comment: comment.trim() }, { transaction: tx });
            return { errCode: 0, errMessage: 'Cảm ơn bạn đã đánh giá người giao hàng.', data: rating.get ? rating.get({ plain: true }) : rating };
        });
    });

    async function ratingSummary(shipperId) {
        if (!validId(shipperId)) return { ratingCount: 0, ratingAverage: 0 };
        const where = { shipperId: Number(shipperId) };
        // A single aggregate sees one consistent set of reviews. Separate count
        // and sum queries could briefly report more than five stars during a write.
        const summary = await db.ShipperRating.findOne({ where, raw: true, attributes: [
            [fn('COUNT', col('id')), 'ratingCount'], [fn('AVG', col('rating')), 'ratingAverage']
        ] });
        return { ratingCount: Number(summary && summary.ratingCount) || 0,
            ratingAverage: Math.round((Number(summary && summary.ratingAverage) || 0) * 100) / 100 };
    }

    async function shipperSummary(shipperId) {
        const [working, done, ratings] = await Promise.all([
            db.OrderProduct.count({ where: { shipperId: Number(shipperId), statusId: 'S5' } }),
            db.OrderProduct.count({ where: { shipperId: Number(shipperId), statusId: 'S6' } }),
            ratingSummary(shipperId)
        ]);
        return { working, done, ...ratings };
    }

    const getActiveShippers = (data, actor) => resultOf(async () => {
        if (!isAdmin(actor)) fail('Bạn không có quyền chọn người giao hàng.', 403);
        const rows = await db.User.findAll({ where: { roleId: 'R3', statusId: 'S1' }, attributes: safeShipperFields, order: [['firstName', 'ASC'], ['id', 'ASC']], raw: true });
        for (const row of rows) Object.assign(row, await ratingSummary(row.id));
        return { errCode: 0, data: rows };
    });

    const availableWhere = () => ({ statusId: 'S4', [Op.or]: [{ shipperId: null }, { shipperId: 0 }] });
    return { confirmOrder, updateStatusOrder, updateImageOrder, rateShipper, ratingSummary, shipperSummary, getActiveShippers, availableWhere };
}

module.exports = { createDeliveryService };
