'use strict';

const {
    Model
} = require('sequelize');
const { versionedImageHooks } = require('../utils/productImage');
module.exports = (sequelize, DataTypes) => {
    class ProductImage extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            ProductImage.belongsTo(models.ProductDetail, { foreignKey: 'productdetailId', targetKey: 'id', as: 'productImageData' })
        }
    };
    ProductImage.init({
        caption: DataTypes.STRING,
        productdetailId: DataTypes.INTEGER,
        image: DataTypes.BLOB('long'),
        imageVersion: DataTypes.STRING(64)
    }, {
        sequelize,
        modelName: 'ProductImage',
        tableName: 'Productimages',
        hooks: versionedImageHooks()
    });
    return ProductImage;
};
