'use strict';
const {
    Model
} = require('sequelize');
const { versionedImageHooks } = require('../utils/productImage');
module.exports = (sequelize, DataTypes) => {
    class Banner extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {

        }
    };
    Banner.init({
        description: DataTypes.STRING,
        name: DataTypes.STRING,
        statusId: DataTypes.STRING,
        image: DataTypes.BLOB('long'),
        imageVersion: { type: DataTypes.STRING(64), allowNull: true },
    }, {
        sequelize,
        modelName: 'Banner',
        hooks: versionedImageHooks(),
    });
    return Banner;
};
