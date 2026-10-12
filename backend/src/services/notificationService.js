const { Op } = require('sequelize');
const { fail, positiveInteger, resultOf } = require('../utils/commerce');
let emitter;
function setNotificationEmitter(io) { emitter = io; }
function createNotificationService(db) {
    const userId = actor => {
        if (!actor || !positiveInteger(actor.id)) fail('Vui lòng đăng nhập.', 401);
        return Number(actor.id);
    };
    async function forOrderEvent(order, event, transaction) {
        if (!db.Notification) return []; // Injectable services can omit notifications in isolated tests.
        const address = await db.AddressUser.findOne({ where: { id: order.addressUserId }, transaction, raw: true });
        const admins = await db.User.findAll({ where: { roleId: { [Op.in]: ['R1', 'R4'] }, statusId: 'S1' }, attributes: ['id', 'roleId'], transaction, raw: true });
        const recipients = new Map(admins.map(admin => [Number(admin.id), `/system/home/order-detail/${order.id}`]));
        if (positiveInteger(order.shipperId)) recipients.set(Number(order.shipperId), '/shipper');
        if (positiveInteger(address?.userId)) recipients.set(Number(address.userId), `/user/order/${address.userId}`);
        const rows = [...recipients].map(([id, link]) => ({ userId: id, orderId: order.id,
            type: String(event.type).slice(0, 80), title: String(event.title || 'Cập nhật đơn hàng').slice(0, 255),
            message: String(event.message || `Đơn hàng #${order.id} đã được cập nhật.`).slice(0, 1000),
            link, dedupeKey: `order-event:${event.id}:user:${id}`, readAt: null,
        }));
        if (!rows.length) return [];
        await db.Notification.bulkCreate(rows, { transaction, ignoreDuplicates: true });
        const emit = () => {
            try { if (emitter) for (const row of rows) emitter.to(`user:${row.userId}`).emit('notification', { orderId: order.id }); }
            catch { /* Persistence is authoritative; clients also reload unread notifications. */ }
        };
        if (transaction?.afterCommit) transaction.afterCommit(emit); else emit();
        return rows;
    }
    const list = (query = {}, actor) => resultOf(async () => {
        const id = userId(actor);
        const limit = query.limit === undefined ? 20 : Number(query.limit);
        const offset = query.offset === undefined ? 0 : Number(query.offset);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) fail('Phân trang không hợp lệ.');
        const [{ rows, count }, unreadCount] = await Promise.all([
            db.Notification.findAndCountAll({ where: { userId: id }, attributes: { exclude: ['dedupeKey', 'updatedAt', 'userId'] }, order: [['id', 'DESC']], limit, offset, raw: true }),
            db.Notification.count({ where: { userId: id, readAt: null } }),
        ]);
        return { errCode: 0, data: rows, count, unreadCount };
    });
    const read = (data = {}, actor) => resultOf(async () => {
        const id = userId(actor);
        if (!positiveInteger(data.id)) fail('Thông báo không hợp lệ.');
        const notification = await db.Notification.findOne({ where: { id: Number(data.id), userId: id }, raw: true });
        if (!notification) fail('Không tìm thấy thông báo.', 2);
        await db.Notification.update({ readAt: new Date() }, { where: { id: notification.id, userId: id, readAt: null } });
        return { errCode: 0, errMessage: 'Đã đọc thông báo.' };
    });
    const readAll = (data, actor) => resultOf(async () => {
        const id = userId(actor);
        await db.Notification.update({ readAt: new Date() }, { where: { userId: id, readAt: null } });
        return { errCode: 0, errMessage: 'Đã đọc tất cả thông báo.' };
    });
    return { forOrderEvent, list, read, readAll };
}
module.exports = { createNotificationService, setNotificationEmitter };
