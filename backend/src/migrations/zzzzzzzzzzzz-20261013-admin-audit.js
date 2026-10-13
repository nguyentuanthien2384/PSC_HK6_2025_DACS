'use strict';
module.exports = {
    async up(q, S) {
        if ((await q.showAllTables()).some(name => String(name).toLowerCase() === 'adminaudits')) return;
        await q.createTable('AdminAudits', {
            id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
            actorId: { type: S.INTEGER, allowNull: false }, actorName: { type: S.STRING(180), allowNull: false }, actorRole: { type: S.STRING(10), allowNull: false },
            entityType: { type: S.STRING(30), allowNull: false }, entityId: { type: S.STRING(80), allowNull: false },
            action: { type: S.STRING(64), allowNull: false }, summary: { type: S.STRING(500), allowNull: false },
            beforeData: S.TEXT, afterData: S.TEXT, sourceEventId: { type: S.INTEGER, unique: true },
            createdAt: { type: S.DATE, allowNull: false }
        });
        await q.addIndex('AdminAudits', ['createdAt', 'id'], { name: 'admin_audit_timeline' });
        await q.addIndex('AdminAudits', ['entityType', 'entityId', 'id'], { name: 'admin_audit_entity' });
    },
    async down(q) { await q.dropTable('AdminAudits'); }
};
