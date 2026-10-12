'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = await queryInterface.showAllTables();
        const orderTable = tables.find(name => String(name).toLowerCase() === 'orderproducts') || 'Orderproducts';
        const columns = await queryInterface.describeTable(orderTable);
        for (const name of ['assignedAt', 'deliveredAt', 'cancelledAt']) {
            if (!columns[name]) await queryInterface.addColumn(orderTable, name, { type: Sequelize.DATE, allowNull: true });
        }
        if (!columns.cancellationReason) await queryInterface.addColumn(orderTable, 'cancellationReason', { type: Sequelize.STRING(1000), allowNull: true });
        if (!tables.some(name => String(name).toLowerCase() === 'shipperratings')) {
            await queryInterface.createTable('ShipperRatings', {
                id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
                orderId: { type: Sequelize.INTEGER, allowNull: false, unique: true },
                userId: { type: Sequelize.INTEGER, allowNull: false },
                shipperId: { type: Sequelize.INTEGER, allowNull: false },
                rating: { type: Sequelize.INTEGER, allowNull: false },
                comment: { type: Sequelize.STRING(1000), allowNull: false, defaultValue: '' },
                createdAt: { type: Sequelize.DATE, allowNull: false },
                updatedAt: { type: Sequelize.DATE, allowNull: false }
            });
            await queryInterface.addIndex('ShipperRatings', ['shipperId', 'createdAt'], { name: 'shipper_ratings_history' });
        }
        const indexes = await queryInterface.showIndex(orderTable);
        if (!indexes.some(index => index.name === 'orders_delivery_queue')) await queryInterface.addIndex(orderTable, ['statusId', 'shipperId'], { name: 'orders_delivery_queue' });
    },
    async down(queryInterface) {
        await queryInterface.dropTable('ShipperRatings');
        const tables = await queryInterface.showAllTables();
        const orderTable = tables.find(name => String(name).toLowerCase() === 'orderproducts') || 'Orderproducts';
        await queryInterface.removeIndex(orderTable, 'orders_delivery_queue');
        for (const name of ['assignedAt', 'deliveredAt', 'cancelledAt', 'cancellationReason']) await queryInterface.removeColumn(orderTable, name);
    }
};
