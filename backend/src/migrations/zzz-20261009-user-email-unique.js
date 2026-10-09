'use strict';
module.exports = {
  async up(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const table = tables.find(name => String(name).toLowerCase() === 'users') || 'Users';
    const duplicates = await queryInterface.sequelize.query(`SELECT LOWER(TRIM(email)) AS normalizedEmail, COUNT(*) AS total FROM \`${table}\` WHERE email IS NOT NULL AND TRIM(email) <> '' GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1 LIMIT 1`, { type: 'SELECT' });
    if (duplicates.length) throw new Error('Cannot add unique user email constraint: duplicate emails exist. Review and resolve duplicates while preserving account/order history, then rerun migration.');
    const indexes = await queryInterface.showIndex(table);
    if (!indexes.some(index => index.unique && index.fields.length === 1 && index.fields[0].attribute === 'email')) {
      await queryInterface.addIndex(table, ['email'], { unique: true, name: 'users_email_unique' });
    }
  },
  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const table = tables.find(name => String(name).toLowerCase() === 'users') || 'Users';
    await queryInterface.removeIndex(table, 'users_email_unique');
  },
};