'use strict';
module.exports = {
    async up(q, S) {
        const tables = (await q.showAllTables()).map(String);
        if (!tables.includes('Notifications')) {
            await q.createTable('Notifications', {
                id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
                userId: { type: S.INTEGER, allowNull: false }, orderId: S.INTEGER,
                type: { type: S.STRING(80), allowNull: false }, title: { type: S.STRING(255), allowNull: false },
                message: { type: S.STRING(1000), allowNull: false }, link: { type: S.STRING(255), allowNull: false },
                dedupeKey: { type: S.STRING(150), allowNull: false, unique: true }, readAt: S.DATE,
                createdAt: { type: S.DATE, allowNull: false }, updatedAt: { type: S.DATE, allowNull: false },
            });
            await q.addIndex('Notifications', ['userId', 'readAt', 'id']);
        }
        if (!tables.includes('Shipments')) {
            await q.createTable('Shipments', {
                id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
                orderId: { type: S.INTEGER, allowNull: false, unique: true }, provider: { type: S.STRING(20), allowNull: false },
                environment: { type: S.STRING(20), allowNull: false }, clientOrderCode: { type: S.STRING(50), allowNull: false, unique: true },
                trackingCode: { type: S.STRING(100), unique: true }, status: { type: S.STRING(50), allowNull: false },
                fee: S.BIGINT, expectedDeliveryAt: S.DATE, requestData: { type: S.TEXT('long'), allowNull: false },
                lastError: S.STRING(1000), lastSyncedAt: S.DATE, leaseUntil: S.DATE,
                createdAt: { type: S.DATE, allowNull: false }, updatedAt: { type: S.DATE, allowNull: false },
            });
            await q.addIndex('Shipments', ['status', 'lastSyncedAt']);
        }
    },
    async down(q) { await q.dropTable('Shipments'); await q.dropTable('Notifications'); },
};
