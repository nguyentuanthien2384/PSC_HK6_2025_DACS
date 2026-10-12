'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class InventoryAdjustment extends Model {}
    InventoryAdjustment.init({
        productDetailSizeId: { type: DataTypes.INTEGER, allowNull: false },
        orderId: { type: DataTypes.INTEGER, allowNull: false },
        returnRequestId: DataTypes.INTEGER,
        quantity: { type: DataTypes.INTEGER, allowNull: false },
        idempotencyKey: { type: DataTypes.STRING(150), allowNull: false, unique: true },
        reason: { type: DataTypes.STRING(50), allowNull: false }
    }, { sequelize, modelName: 'InventoryAdjustment', tableName: 'InventoryAdjustments', updatedAt: false });
    return InventoryAdjustment;
};
