'use strict';
// An earlier Orders-v2 migration can already be applied without this additive
// refund field. Repair existing installations without changing ledger contents.
module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = await queryInterface.showAllTables();
        const table = tables.find(name => String(name).toLowerCase() === 'paymentrefunds') || 'PaymentRefunds';
        const columns = await queryInterface.describeTable(table);
        if (!columns.fulfillmentSyncedAt) await queryInterface.addColumn(table, 'fulfillmentSyncedAt', {
            type: Sequelize.DATE, allowNull: true
        });
    },
    // Keep the settlement synchronization audit on rollback; its original
    // schema owner may still be installed and models continue to read it.
    async down() {}
};
