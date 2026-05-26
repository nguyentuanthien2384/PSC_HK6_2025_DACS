'use strict';
const {
    Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class Allcode extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            if (models.User) {
                Allcode.hasMany(models.User, { foreignKey: 'genderId', as: 'genderData' })
                Allcode.hasMany(models.User, { foreignKey: 'roleId', as: 'roleData' })
            }
            if (models.Product) {
                Allcode.hasMany(models.Product, { foreignKey: 'categoryId', as: 'categoryData' })
                Allcode.hasMany(models.Product, { foreignKey: 'brandId', as: 'brandData' })
                Allcode.hasMany(models.Product, { foreignKey: 'statusId', as: 'statusData' })
            }
            if (models.Blog) {
                Allcode.hasMany(models.Blog, { foreignKey: 'subjectId', as: 'subjectData' })
            }
            if (models.TypeVoucher) {
                Allcode.hasMany(models.TypeVoucher, { foreignKey: 'typeVoucher', as: 'typeVoucherData' })
            }
            if (models.ProductDetailSize) {
                Allcode.hasMany(models.ProductDetailSize, { foreignKey: 'sizeId', as: 'sizeData' })
            }
            if (models.OrderProduct) {
                Allcode.hasMany(models.OrderProduct, { foreignKey: 'statusId', as: 'statusOrderData' })
            }
        }
    };
    Allcode.init({
        type: DataTypes.STRING,
        value: DataTypes.STRING,
        code: DataTypes.STRING
    }, {
        sequelize,
        modelName: 'Allcode',
    });
    return Allcode;
};