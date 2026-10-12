'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = await queryInterface.showAllTables();
        const hasTable = name => tables.some(table => String(table).toLowerCase() === name.toLowerCase());
        const orderTable = tables.find(table => String(table).toLowerCase() === 'orderproducts') || 'Orderproducts';
        const columns = await queryInterface.describeTable(orderTable);
        const additions = {
            deliveryProvider: { type: Sequelize.STRING(20), allowNull: true, defaultValue: 'internal' },
            deliveryAttempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
            failedDeliveryAt: { type: Sequelize.DATE, allowNull: true },
            lastDeliveryFailureReason: { type: Sequelize.STRING(1000), allowNull: true },
            returnStartedAt: { type: Sequelize.DATE, allowNull: true },
            warehouseReceivedAt: { type: Sequelize.DATE, allowNull: true },
            returnResellable: { type: Sequelize.BOOLEAN, allowNull: true }
        };
        for (const [name, definition] of Object.entries(additions)) {
            if (!columns[name]) await queryInterface.addColumn(orderTable, name, definition);
        }
        if (!hasTable('OrderEvents')) {
            await queryInterface.createTable('OrderEvents', {
                id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
                orderId: { type: Sequelize.INTEGER, allowNull: false }, actorId: Sequelize.INTEGER,
                type: { type: Sequelize.STRING(60), allowNull: false },
                title: { type: Sequelize.STRING(200), allowNull: false },
                message: { type: Sequelize.STRING(1000), allowNull: false }, metadata: Sequelize.TEXT,
                createdAt: { type: Sequelize.DATE, allowNull: false }
            });
            await queryInterface.addIndex('OrderEvents', ['orderId', 'id'], { name: 'order_events_timeline' });
        }
        if (!hasTable('ReturnRequests')) {
            const date = { type: Sequelize.DATE, allowNull: true };
            await queryInterface.createTable('ReturnRequests', {
                id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
                orderId: { type: Sequelize.INTEGER, allowNull: false },
                activeOrderId: { type: Sequelize.INTEGER, allowNull: true, unique: true },
                userId: { type: Sequelize.INTEGER, allowNull: false },
                kind: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'CUSTOMER_RETURN' },
                status: { type: Sequelize.STRING(30), allowNull: false },
                reason: { type: Sequelize.STRING(1000), allowNull: false }, evidence: Sequelize.TEXT('long'),
                amount: { type: Sequelize.BIGINT, allowNull: false }, carrier: Sequelize.STRING(100), trackingNumber: Sequelize.STRING(100),
                reviewNote: Sequelize.STRING(1000), inspectionNote: Sequelize.STRING(1000), resellable: Sequelize.BOOLEAN,
                requestedAt: date, approvedAt: date, rejectedAt: date, shippedAt: date, receivedAt: date,
                refundMethod: Sequelize.STRING(30), refundReference: Sequelize.STRING(150), refundProof: Sequelize.TEXT('long'),
                refundProviderStatus: Sequelize.STRING(30), refundedAt: date,
                reviewedById: Sequelize.INTEGER, receivedById: Sequelize.INTEGER, refundedById: Sequelize.INTEGER,
                createdAt: { type: Sequelize.DATE, allowNull: false }, updatedAt: { type: Sequelize.DATE, allowNull: false }
            });
            await queryInterface.addIndex('ReturnRequests', ['orderId', 'id'], { name: 'returns_order_history' });
            await queryInterface.addIndex('ReturnRequests', ['status', 'createdAt'], { name: 'returns_work_queue' });
        }
        if (!hasTable('InventoryAdjustments')) {
            await queryInterface.createTable('InventoryAdjustments', {
                id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
                productDetailSizeId: { type: Sequelize.INTEGER, allowNull: false },
                orderId: { type: Sequelize.INTEGER, allowNull: false }, returnRequestId: Sequelize.INTEGER,
                quantity: { type: Sequelize.INTEGER, allowNull: false },
                idempotencyKey: { type: Sequelize.STRING(150), allowNull: false, unique: true },
                reason: { type: Sequelize.STRING(50), allowNull: false },
                createdAt: { type: Sequelize.DATE, allowNull: false }
            });
            await queryInterface.addIndex('InventoryAdjustments', ['productDetailSizeId'], { name: 'inventory_return_credits' });
        }
        const codeTable = tables.find(table => String(table).toLowerCase() === 'allcodes') || 'Allcodes';
        const statuses = [['S8', 'Giao hàng thất bại'], ['S9', 'Đang hoàn về kho'], ['S10', 'Đã hoàn về kho']];
        for (const [code, value] of statuses) {
            const [rows] = await queryInterface.sequelize.query(`SELECT id FROM \`${codeTable}\` WHERE code = :code`, { replacements: { code } });
            if (!rows.length) await queryInterface.bulkInsert(codeTable, [{ code, value, type: 'STATUS-ORDER', createdAt: new Date(), updatedAt: new Date() }]);
        }
    },
    async down(queryInterface) {
        for (const table of ['InventoryAdjustments', 'ReturnRequests', 'OrderEvents']) await queryInterface.dropTable(table);
        const tables = await queryInterface.showAllTables();
        const orderTable = tables.find(table => String(table).toLowerCase() === 'orderproducts') || 'Orderproducts';
        for (const name of ['deliveryProvider', 'deliveryAttempts', 'failedDeliveryAt', 'lastDeliveryFailureReason', 'returnStartedAt', 'warehouseReceivedAt', 'returnResellable']) await queryInterface.removeColumn(orderTable, name);
    }
};
