"use strict";

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    "User",
    {
      email: DataTypes.STRING,
      password: DataTypes.STRING,
      firstName: DataTypes.STRING,
      lastName: DataTypes.STRING,
      address: DataTypes.STRING,
      phonenumber: DataTypes.STRING,
      genderId: DataTypes.STRING,
      roleId: DataTypes.STRING,
      image: DataTypes.TEXT("long"),
      statusId: DataTypes.STRING,
      dob: DataTypes.DATEONLY,
      isActiveEmail: DataTypes.BOOLEAN,
      usertoken: DataTypes.STRING,
    },
    {
      tableName: "users",
    },
  );

  User.associate = function (models) {
    // add association here later
  };
  ("use strict");
  const { Model } = require("sequelize");
  module.exports = (sequelize, DataTypes) => {
    class User extends Model {
      static associate(models) {
        // User.belongsTo(models.Allcode, { foreignKey: 'genderId', targetKey: 'code', as: 'genderData' })
        // User.belongsTo(models.Allcode, { foreignKey: 'roleId', targetKey: 'code', as: 'roleData' })
      }
    }
    User.init(
      {
        email: DataTypes.STRING,
        password: DataTypes.STRING,
        firstName: DataTypes.STRING,
        lastName: DataTypes.STRING,
        address: DataTypes.STRING,
        genderId: DataTypes.STRING,
        phonenumber: DataTypes.STRING,
        image: DataTypes.BLOB("long"),
        dob: DataTypes.STRING,
        isActiveEmail: DataTypes.BOOLEAN,
        roleId: DataTypes.STRING,
        statusId: DataTypes.STRING,
        usertoken: DataTypes.STRING,
      },
      {
        sequelize,
        modelName: "User",
      },
    );
    return User;
  };

  return User;
};
