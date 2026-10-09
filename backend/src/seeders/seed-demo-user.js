"use strict";
require('../config/env');
const bcrypt = require('bcryptjs');
module.exports = {
  async up(queryInterface) {
    const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!email || !password || password.length < 8 || Buffer.byteLength(password) > 72) {
      throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (8+ characters, maximum 72 bytes) before seeding an administrator.');
    }
    const existing = await queryInterface.sequelize.query('SELECT id FROM Users WHERE email = :email LIMIT 1', { replacements: { email }, type: 'SELECT' });
    if (existing.length) return;
    await queryInterface.bulkInsert('Users', [{
      email, password: await bcrypt.hash(password, 10), firstName: 'Admin', lastName: 'Shop',
      address: '', phonenumber: '', genderId: null, roleId: 'R1', image: null, statusId: 'S1',
      dob: null, isActiveEmail: false, usertoken: '', createdAt: new Date(), updatedAt: new Date(),
    }]);
  },
  async down() { throw new Error('Administrator seed rollback is disabled to preserve account history.'); },
};