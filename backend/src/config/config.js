require('./env');
function databaseConfig(prefix = '') {
  const value = (name, fallback) => process.env[`${prefix}${name}`] ?? process.env[name] ?? fallback;
  return {
    username: value('DB_USERNAME', 'root'),
    password: value('DB_PASSWORD', ''),
    database: value('DB_DATABASE_NAME', 'dacs_ecommerce'),
    host: value('DB_HOST', '127.0.0.1'),
    port: Number(value('DB_PORT', 3306)) || 3306,
    dialect: 'mysql',
    dialectOptions: value('DB_SSL', 'false') === 'true' ? {
      ssl: { require: true, rejectUnauthorized: value('DB_SSL_REJECT_UNAUTHORIZED', 'true') !== 'false' },
    } : {},
    logging: false,
    query: { raw: true },
    timezone: '+07:00',
    pool: { max: 10, min: 0, acquire: 10000, idle: 10000 },
    retry: { max: 0 },
  };
}
module.exports = { development: databaseConfig(), test: databaseConfig('TEST_'), production: databaseConfig() };
