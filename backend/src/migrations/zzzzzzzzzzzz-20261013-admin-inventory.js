'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = await queryInterface.showAllTables();
        if (tables.some(table => String(table).toLowerCase() === 'stockmovements')) return;
        const variantTable = tables.find(table => String(table).toLowerCase() === 'productdetailsizes') || 'ProductDetailSizes';
        await queryInterface.createTable('StockMovements', {
            id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
            productDetailSizeId: { type: Sequelize.INTEGER, allowNull: false,
                references: { model: variantTable, key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
            actorId: { type: Sequelize.INTEGER, allowNull: false },
            quantity: { type: Sequelize.INTEGER, allowNull: false },
            onHandBefore: { type: Sequelize.INTEGER, allowNull: false },
            onHandAfter: { type: Sequelize.INTEGER, allowNull: false },
            reservedAtCount: { type: Sequelize.INTEGER, allowNull: false },
            reason: { type: Sequelize.STRING(1000), allowNull: false },
            idempotencyKey: { type: Sequelize.STRING(64), allowNull: false, unique: true },
            createdAt: { type: Sequelize.DATE, allowNull: false }
        });
        await queryInterface.addIndex('StockMovements', ['productDetailSizeId', 'id'], { name: 'stock_movement_variant_history' });
        await queryInterface.addIndex('StockMovements', ['actorId', 'createdAt'], { name: 'stock_movement_actor_history' });
    },
    async down(queryInterface) { await queryInterface.dropTable('StockMovements'); }
};
