'use strict';
module.exports = (sequelize, DataTypes) => sequelize.define('Shipment', {
    orderId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    provider: { type: DataTypes.STRING(20), allowNull: false },
    environment: { type: DataTypes.STRING(20), allowNull: false },
    clientOrderCode: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    trackingCode: { type: DataTypes.STRING(100), unique: true },
    status: { type: DataTypes.STRING(50), allowNull: false },
    fee: DataTypes.BIGINT,
    expectedDeliveryAt: DataTypes.DATE,
    requestData: { type: DataTypes.TEXT('long'), allowNull: false },
    lastError: DataTypes.STRING(1000),
    lastSyncedAt: DataTypes.DATE,
    leaseUntil: DataTypes.DATE,
});
