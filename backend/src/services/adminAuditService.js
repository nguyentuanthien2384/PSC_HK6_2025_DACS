const { Op } = require('sequelize');
const { fail, resultOf } = require('../utils/commerce');
const forbidden = /password|secret|token|authorization|cookie|image|proof|evidence|checkout|gateway|email|phone|address/i;
function safeSnapshot(value, depth = 0) {
    if (depth > 4) return null;
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return value.slice(0, 500);
    if (Array.isArray(value)) return value.slice(0, 50).map(item => safeSnapshot(item, depth + 1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !forbidden.test(key)).slice(0, 30).map(([key, item]) => [key, safeSnapshot(item, depth + 1)]));
    return null;
}
async function recordAdminAudit(db, event, transaction) {
    const { actor, entityType, entityId, action, summary, before, after, sourceEventId } = event;
    if (!transaction || !db.AdminAudit || !actor || !['R1', 'R4'].includes(actor.roleId)) throw new Error('An authorized actor and transaction are required for admin audit.');
    return db.AdminAudit.create({ actorId: actor.id, actorName: [actor.firstName, actor.lastName].filter(Boolean).join(' ').slice(0, 180) || `Tài khoản #${actor.id}`,
        actorRole: actor.roleId, entityType: String(entityType).slice(0, 30), entityId: String(entityId).slice(0, 80), action: String(action).slice(0, 64),
        summary: String(summary).slice(0, 500), beforeData: before === undefined ? null : JSON.stringify(safeSnapshot(before)),
        afterData: after === undefined ? null : JSON.stringify(safeSnapshot(after)), sourceEventId: sourceEventId || null
    }, { transaction });
}
function createAdminAuditService(db) {
    const list = (query = {}, actor) => resultOf(async () => {
        if (actor?.roleId !== 'R1') fail('Chỉ quản trị viên được xem nhật ký toàn hệ thống.', 403);
        const where = {};
        if (query.entityType && query.entityType !== 'ALL') {
            if (!/^[A-Z_]{2,30}$/.test(query.entityType)) fail('Loại nhật ký không hợp lệ.');
            where.entityType = query.entityType;
        }
        if (query.keyword) {
            if (typeof query.keyword !== 'string' || query.keyword.length > 100) fail('Từ khóa không hợp lệ.');
            where[Op.or] = ['summary', 'entityId', 'actorName'].map(key => ({ [key]: { [Op.substring]: query.keyword.trim() } }));
        }
        const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
        const offset = Math.max(0, Number(query.offset) || 0);
        if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset)) fail('Phân trang không hợp lệ.');
        const result = await db.AdminAudit.findAndCountAll({ where, limit, offset, order: [['id', 'DESC']], raw: true });
        return { errCode: 0, count: result.count, data: result.rows.map(row => ({ ...row, before: row.beforeData ? JSON.parse(row.beforeData) : null,
            after: row.afterData ? JSON.parse(row.afterData) : null, beforeData: undefined, afterData: undefined })) };
    });
    return { list };
}
module.exports = { recordAdminAudit, createAdminAuditService, safeSnapshot };
