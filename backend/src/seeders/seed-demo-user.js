"use strict";

const bcrypt = require("bcryptjs");

module.exports = {
  async up(queryInterface, Sequelize) {
    const hashPassword = bcrypt.hashSync("123456", 10);

    await queryInterface.bulkInsert("users", [
      {
        email: "admin@gmail.com",
        password: hashPassword,
        firstName: "Admin",
        lastName: "Demo",
        address: "HCM",
        phonenumber: "0900000000",
        genderId: "M",
        roleId: "R1",
        image: null,
        statusId: "S1",
        dob: "2000-01-01",
        isActiveEmail: true,
        usertoken: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("users", { email: "admin@gmail.com" }, {});
  },
};
