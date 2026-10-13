'use strict';
module.exports = (sequelize, DataTypes) => sequelize.define('PaymentRefund', {
    id: { type: DataTypes.STRING(36), primaryKey: true },
    sessionId: { type: DataTypes.STRING(36), allowNull: false },
    orderId: DataTypes.INTEGER,
    refundKey: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    provider: { type: DataTypes.STRING(20), allowNull: false },
    status: { type: DataTypes.STRING(25), allowNull: false },
    amountVnd: { type: DataTypes.BIGINT, allowNull: false },
    providerAmount: { type: DataTypes.STRING(30), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    requestId: { type: DataTypes.STRING(36), allowNull: false },
    providerRefundId: { type: DataTypes.STRING(100), unique: true },
    actorId: DataTypes.INTEGER,
    reason: DataTypes.STRING(1000),
    gatewayOutcome: DataTypes.TEXT('long'),
    requestData: DataTypes.TEXT('long'),
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastError: DataTypes.STRING(1000),
    lastCheckedAt: DataTypes.DATE,
    fulfillmentSyncedAt: DataTypes.DATE,
    completedAt: DataTypes.DATE
});
