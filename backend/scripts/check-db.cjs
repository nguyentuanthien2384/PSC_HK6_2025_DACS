require('../src/config/env');
const db = require('../src/models');
(async () => {
  try {
    await db.sequelize.authenticate();
    const tables = await db.sequelize.getQueryInterface().showAllTables();
    const normalized = tables.map(name => String(name).toLowerCase());
    const missing = Object.keys(db).filter(key => !['sequelize', 'Sequelize'].includes(key))
      .map(key => db[key].getTableName()).filter(name => !normalized.includes(String(name).toLowerCase()));
    console.log(JSON.stringify({ connection: 'ok', missingTables: missing }, null, 2));
    if (missing.length) { console.error('Run npm run db:migrate to create missing tables.'); process.exitCode = 1; }
  } catch (error) {
    const code = error.original?.code || error.name;
    console.error(`MySQL check failed (${code}). Check DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD and DB_DATABASE_NAME in backend/.env.`);
    process.exitCode = 1;
  } finally { await db.sequelize.close(); }
})();
