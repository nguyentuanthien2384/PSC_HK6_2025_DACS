'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class ShipperRating extends Model {}
    ShipperRating.init({
        orderId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        shipperId: { type: DataTypes.INTEGER, allowNull: false },
        rating: { type: DataTypes.INTEGER, allowNull: false, validate: { isInt: true, min: 1, max: 5 } },
        comment: { type: DataTypes.STRING(1000), allowNull: false, defaultValue: '' }
    }, { sequelize, modelName: 'ShipperRating', tableName: 'ShipperRatings' });
    return ShipperRating;
};
