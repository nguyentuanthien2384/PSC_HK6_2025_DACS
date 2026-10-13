'use strict';
module.exports = (sequelize, DataTypes) => sequelize.define('StockMovement', {
    productDetailSizeId: { type: DataTypes.INTEGER, allowNull: false },
    actorId: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    onHandBefore: { type: DataTypes.INTEGER, allowNull: false },
    onHandAfter: { type: DataTypes.INTEGER, allowNull: false },
    reservedAtCount: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.STRING(1000), allowNull: false },
    idempotencyKey: { type: DataTypes.STRING(64), allowNull: false, unique: true }
}, { tableName: 'StockMovements', updatedAt: false });
