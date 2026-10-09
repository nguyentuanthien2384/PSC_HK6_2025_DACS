const db = require('../models');
module.exports = async function connectDB() {
  await db.sequelize.authenticate();
  console.log('MySQL connection established.');
};
