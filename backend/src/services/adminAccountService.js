const { Op, Transaction } = require('sequelize');
const { fail, resultOf } = require('../utils/commerce');
const { recordAdminAudit } = require('./adminAuditService');
const idOf = value => ['number', 'string'].includes(typeof value) && /^\d+$/.test(String(value)) && Number.isSafeInteger(+value) && +value > 0;
function createAdminAccountService(db) {
    const requireOwner = actor => { if (actor?.roleId !== 'R1') fail('Chỉ quản trị viên được quản lý tài khoản.', 403); };
    const list = (query = {}, actor) => resultOf(async () => {
        requireOwner(actor);
        const where = {};
        if (query.roleId && query.roleId !== 'ALL') {
            if (!['R1', 'R2', 'R3', 'R4'].includes(query.roleId)) fail('Vai trò không hợp lệ.');
            where.roleId = query.roleId;
        }
        if (query.statusId && query.statusId !== 'ALL') {
            if (!['S1', 'S2'].includes(query.statusId)) fail('Trạng thái không hợp lệ.');
            where.statusId = query.statusId;
        }
        if (query.keyword) {
            if (typeof query.keyword !== 'string' || query.keyword.length > 100) fail('Từ khóa không hợp lệ.');
            where[Op.or] = ['email', 'firstName', 'lastName', 'phonenumber'].map(key => ({ [key]: { [Op.substring]: query.keyword.trim() } }));
        }
        const limit = Math.min(100, Math.max(1, Number(query.limit) || 25)), offset = Math.max(0, Number(query.offset) || 0);
        if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset)) fail('Phân trang không hợp lệ.');
        const result = await db.User.findAndCountAll({ where, attributes: ['id', 'email', 'firstName', 'lastName', 'phonenumber', 'roleId', 'statusId', 'isActiveEmail', 'createdAt'],
            limit, offset, order: [['id', 'DESC']], raw: true });
        return { errCode: 0, count: result.count, data: result.rows };
    });
    const change = (data = {}, actor) => resultOf(async () => {
        requireOwner(actor);
        if (!idOf(data.id) || (data.statusId !== undefined && !['S1', 'S2'].includes(data.statusId)) ||
            (data.roleId !== undefined && !['R1', 'R2', 'R3', 'R4'].includes(data.roleId)) || (!data.statusId && !data.roleId)) fail('Yêu cầu tài khoản không hợp lệ.');
        if (Number(data.id) === Number(actor.id)) fail('Không thể khóa hoặc đổi vai trò của tài khoản đang đăng nhập.', 2);
        if (typeof data.reason !== 'string' || data.reason.trim().length < 3 || data.reason.trim().length > 500) fail('Vui lòng nhập lý do từ 3 đến 500 ký tự.');
        return db.sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async tx => {
            // Lock all owners in the same order so two concurrent requests cannot remove the last owner.
            const owners = await db.User.findAll({ where: { roleId: 'R1', statusId: 'S1' }, attributes: ['id'], order: [['id', 'ASC']], transaction: tx, lock: tx.LOCK.UPDATE, raw: true });
            if (!owners.some(user => Number(user.id) === Number(actor.id))) fail('Tài khoản quản trị không còn đủ quyền.', 403);
            const user = await db.User.findByPk(Number(data.id), { transaction: tx, lock: tx.LOCK.UPDATE });
            if (!user) fail('Không tìm thấy tài khoản.', 2);
            const before = { roleId: user.roleId, statusId: user.statusId };
            const after = { roleId: data.roleId || user.roleId, statusId: data.statusId || user.statusId };
            if (before.roleId === after.roleId && before.statusId === after.statusId) return { errCode: 0, unchanged: true, errMessage: 'Tài khoản đã có trạng thái này.' };
            if (before.roleId === 'R1' && before.statusId === 'S1' && (after.roleId !== 'R1' || after.statusId !== 'S1') && owners.length <= 1) fail('Phải giữ ít nhất một quản trị viên đang hoạt động.', 2);
            if (before.roleId === 'R3' && (after.roleId !== 'R3' || after.statusId !== 'S1') && await db.OrderProduct.count({ where: { shipperId: user.id, statusId: { [Op.in]: ['S5', 'S8', 'S9'] } }, transaction: tx })) {
                fail('Shipper còn đơn đang giao/hoàn kho. Cần xử lý các đơn đó trước khi khóa hoặc đổi vai trò.', 2);
            }
            Object.assign(user, after); user.authVersion = Number(user.authVersion || 0) + 1; user.usertoken = '';
            await user.save({ transaction: tx });
            await recordAdminAudit(db, { actor, entityType: 'USER', entityId: user.id, action: data.roleId ? 'USER_ROLE_CHANGED' : after.statusId === 'S2' ? 'USER_DISABLED' : 'USER_RESTORED', summary: data.reason.trim(), before, after }, tx);
            return { errCode: 0, errMessage: 'Đã cập nhật tài khoản và thu hồi các phiên đăng nhập cũ.' };
        });
    });
    return { list, change };
}
module.exports = { createAdminAccountService };
