'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        const columns = await queryInterface.describeTable('AddressUsers');
        if (columns.isDefault) return;
        await queryInterface.addColumn('AddressUsers', 'isDefault', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
        await queryInterface.sequelize.query('UPDATE AddressUsers AS address JOIN (SELECT userId, MAX(id) AS addressId FROM AddressUsers GROUP BY userId) AS chosen ON address.userId = chosen.userId SET address.isDefault = (address.id = chosen.addressId)');
    },
    async down(queryInterface) {
        const columns = await queryInterface.describeTable('AddressUsers');
        if (columns.isDefault) await queryInterface.removeColumn('AddressUsers', 'isDefault');
    },
};
