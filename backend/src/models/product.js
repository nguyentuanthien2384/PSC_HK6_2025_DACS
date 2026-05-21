'use strict';

const {
    Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class Product extends Model {

        static associate(models) {
            // Keep old-project associations, but guard missing models during incremental setup days.
            if (models.Allcode) {
                Product.belongsTo(models.Allcode, { foreignKey: 'categoryId', targetKey: 'code', as: 'categoryData' })
                Product.belongsTo(models.Allcode, { foreignKey: 'brandId', targetKey: 'code', as: 'brandData' })
                Product.belongsTo(models.Allcode, { foreignKey: 'statusId', targetKey: 'code', as: 'statusData' })
            }
            if (models.Category) {
                Product.belongsTo(models.Category, { foreignKey: 'categoryId', targetKey: 'code', as: 'categoryModelData' })
            }
            if (models.ProductDetail) {
                Product.hasMany(models.ProductDetail, { foreignKey: 'productId', as: 'productDetailData' })
            }
        }
    };
    Product.init({
        name: DataTypes.STRING,
        contentHTML: DataTypes.TEXT('long'),
        contentMarkdown: DataTypes.TEXT('long'),
        statusId: DataTypes.STRING,
        categoryId: DataTypes.STRING,
        view: DataTypes.INTEGER,

        madeby: DataTypes.STRING,
        material: DataTypes.STRING,
        brandId: DataTypes.STRING
    }, {
        sequelize,
        modelName: 'Product',
    });
    return Product;
};
