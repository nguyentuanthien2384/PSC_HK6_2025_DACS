'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = await queryInterface.showAllTables();
        const orderTable = tables.find(name => String(name).toLowerCase() === 'orderproducts') || 'OrderProducts';
        const existing = await queryInterface.describeTable(orderTable);
        for (const name of ['subtotal', 'shippingFee', 'discountAmount', 'totalPrice']) {
            if (!existing[name]) await queryInterface.addColumn(orderTable, name, { type: Sequelize.BIGINT, allowNull: true });
        }
        if (!tables.includes('PaymentSessions')) {
            await queryInterface.createTable('PaymentSessions', {
                id: { type: Sequelize.STRING(36), primaryKey: true, allowNull: false },
                userId: { type: Sequelize.INTEGER, allowNull: false },
                provider: { type: Sequelize.STRING(20), allowNull: false },
                providerPaymentId: { type: Sequelize.STRING(100), unique: true },
                orderId: Sequelize.INTEGER,
                status: { type: Sequelize.STRING(20), allowNull: false },
                totalPrice: { type: Sequelize.BIGINT, allowNull: false },
                providerAmount: { type: Sequelize.STRING(30), allowNull: false },
                currency: { type: Sequelize.STRING(3), allowNull: false },
                checkoutData: { type: Sequelize.TEXT('long'), allowNull: false },
                expiresAt: { type: Sequelize.DATE, allowNull: false },
                createdAt: { type: Sequelize.DATE, allowNull: false },
                updatedAt: { type: Sequelize.DATE, allowNull: false }
            });
            await queryInterface.addIndex('PaymentSessions', ['status', 'expiresAt']);
        }
    },
    async down(queryInterface) {
        await queryInterface.dropTable('PaymentSessions');
        const tables = await queryInterface.showAllTables();
        const orderTable = tables.find(name => String(name).toLowerCase() === 'orderproducts') || 'OrderProducts';
        for (const name of ['subtotal', 'shippingFee', 'discountAmount', 'totalPrice']) await queryInterface.removeColumn(orderTable, name);
    }
};
