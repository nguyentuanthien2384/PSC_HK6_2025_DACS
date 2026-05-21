'use strict';

const {
    Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class Category extends Model {

        static associate(models) {
            if (models.Product) {
                Category.hasMany(models.Product, { foreignKey: 'categoryId', sourceKey: 'code', as: 'productData' })
            }
        }
    };
    Category.init({
        name: DataTypes.STRING,
        code: DataTypes.STRING,
        description: DataTypes.TEXT('long'),
        statusId: DataTypes.STRING
    }, {
        sequelize,
        modelName: 'Category',
    });
    return Category;
};
