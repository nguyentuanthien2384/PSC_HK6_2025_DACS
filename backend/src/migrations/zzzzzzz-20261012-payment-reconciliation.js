'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = await queryInterface.showAllTables();
        const sessions = tables.find(name => String(name).toLowerCase() === 'paymentsessions') || 'PaymentSessions';
        const columns = await queryInterface.describeTable(sessions);
        const additions = {
            gatewayApiVersion: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'v1' },
            gatewayTransactionDate: Sequelize.STRING(14), gatewaySaleId: Sequelize.STRING(100),
            gatewayOutcome: Sequelize.TEXT('long'), paidAt: Sequelize.DATE,
            reviewReason: Sequelize.STRING(1000), lastError: Sequelize.STRING(1000), lastCheckedAt: Sequelize.DATE,
            reconcileAttempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }
        };
        for (const [name, definition] of Object.entries(additions)) if (!columns[name]) {
            await queryInterface.addColumn(sessions, name, definition.type ? definition : { type: definition, allowNull: true });
        }
        if (!tables.some(name => String(name).toLowerCase() === 'paymentrefunds')) {
            await queryInterface.createTable('PaymentRefunds', {
                id: { type: Sequelize.STRING(36), primaryKey: true, allowNull: false },
                sessionId: { type: Sequelize.STRING(36), allowNull: false }, orderId: Sequelize.INTEGER,
                refundKey: { type: Sequelize.STRING(100), unique: true, allowNull: false },
                provider: { type: Sequelize.STRING(20), allowNull: false }, status: { type: Sequelize.STRING(25), allowNull: false },
                amountVnd: { type: Sequelize.BIGINT, allowNull: false }, providerAmount: { type: Sequelize.STRING(30), allowNull: false },
                currency: { type: Sequelize.STRING(3), allowNull: false }, requestId: { type: Sequelize.STRING(36), allowNull: false },
                providerRefundId: { type: Sequelize.STRING(100), unique: true }, actorId: Sequelize.INTEGER, reason: Sequelize.STRING(1000),
                gatewayOutcome: Sequelize.TEXT('long'), requestData: Sequelize.TEXT('long'),
                attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }, lastError: Sequelize.STRING(1000),
                lastCheckedAt: Sequelize.DATE, completedAt: Sequelize.DATE, fulfillmentSyncedAt: Sequelize.DATE,
                createdAt: { type: Sequelize.DATE, allowNull: false }, updatedAt: { type: Sequelize.DATE, allowNull: false }
            });
            await queryInterface.addIndex('PaymentRefunds', ['sessionId', 'status']);
        }
        const indexes = await queryInterface.showIndex(sessions);
        if (!indexes.some(index => index.name === 'payment_sessions_order_unique')) {
            await queryInterface.addIndex(sessions, ['orderId'], { unique: true, name: 'payment_sessions_order_unique' });
        }
    },
    async down(queryInterface) {
        await queryInterface.dropTable('PaymentRefunds');
        await queryInterface.removeIndex('PaymentSessions', 'payment_sessions_order_unique');
        for (const name of ['gatewayApiVersion', 'gatewayTransactionDate', 'gatewaySaleId', 'gatewayOutcome', 'paidAt', 'reviewReason', 'lastError', 'lastCheckedAt', 'reconcileAttempts']) await queryInterface.removeColumn('PaymentSessions', name);
    }
};
