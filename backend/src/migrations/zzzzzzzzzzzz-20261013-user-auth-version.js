'use strict';
module.exports = {
    async up(q, S) {
        const table = (await q.showAllTables()).find(name => String(name).toLowerCase() === 'users') || 'Users';
        if (!(await q.describeTable(table)).authVersion) await q.addColumn(table, 'authVersion', { type: S.INTEGER, allowNull: false, defaultValue: 0 });
    },
    async down(q) { const table = (await q.showAllTables()).find(name => String(name).toLowerCase() === 'users') || 'Users'; await q.removeColumn(table, 'authVersion'); }
};
