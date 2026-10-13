'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = await queryInterface.showAllTables();
        for (const name of ['Productimages', 'Banners', 'Blogs']) {
            const table = tables.find(table => String(table).toLowerCase() === name.toLowerCase());
            if (!table) continue;
            const columns = await queryInterface.describeTable(table);
            if (!columns.imageVersion) await queryInterface.addColumn(table, 'imageVersion', { type: Sequelize.STRING(64), allowNull: true });
            await queryInterface.sequelize.query(`UPDATE \`${table}\` SET imageVersion = SHA2(image, 256) WHERE imageVersion IS NULL`);
        }
    },
    async down(queryInterface) {
        const tables = await queryInterface.showAllTables();
        for (const name of ['Productimages', 'Banners', 'Blogs']) {
            const table = tables.find(table => String(table).toLowerCase() === name.toLowerCase());
            if (table) await queryInterface.removeColumn(table, 'imageVersion');
        }
    }
};
