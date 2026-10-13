'use strict';
// Also upgrades databases where payment-reconciliation ran before Orders v2 was added.
module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = await queryInterface.showAllTables();
        const table = tables.find(name => String(name).toLowerCase() === 'paymentsessions') || 'PaymentSessions';
        const columns = await queryInterface.describeTable(table);
        if (!columns.gatewayApiVersion) await queryInterface.addColumn(table, 'gatewayApiVersion', {
            type: Sequelize.STRING(10), allowNull: false, defaultValue: 'v1'
        });
        const refunds = tables.find(name => String(name).toLowerCase() === 'paymentrefunds') || 'PaymentRefunds';
        const refundColumns = await queryInterface.describeTable(refunds);
        if (!refundColumns.fulfillmentSyncedAt) await queryInterface.addColumn(refunds, 'fulfillmentSyncedAt', { type: Sequelize.DATE, allowNull: true });
    },
    // The previous migration owns this column; retaining it preserves existing gateway versions.
    async down() {}
};
