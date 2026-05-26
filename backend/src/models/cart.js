'use strict';

const {
    Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class Cart extends Model {
        static associate(models) {
            if (models.User) {
                Cart.belongsTo(models.User, { foreignKey: 'userId', as: 'userData' })
            }
            if (models.CartItem) {
                Cart.hasMany(models.CartItem, { foreignKey: 'cartId', as: 'cartItemData' })
            }
        }
    };
    Cart.init({
        userId: DataTypes.INTEGER,
        status: DataTypes.STRING
    }, {
        sequelize,
        modelName: 'Cart',
    });
    return Cart;
};
