'use strict';

const {
    Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class CartItem extends Model {
        static associate(models) {
            if (models.Cart) {
                CartItem.belongsTo(models.Cart, { foreignKey: 'cartId', as: 'cartData' })
            }
            if (models.Product) {
                CartItem.belongsTo(models.Product, { foreignKey: 'productId', as: 'productData' })
            }
        }
    };
    CartItem.init({
        cartId: DataTypes.INTEGER,
        productId: DataTypes.INTEGER,
        quantity: DataTypes.INTEGER,
        price: DataTypes.DECIMAL(10, 2)
    }, {
        sequelize,
        modelName: 'CartItem',
    });
    return CartItem;
};
