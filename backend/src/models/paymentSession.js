'use strict';
module.exports = (sequelize, DataTypes) => sequelize.define('PaymentSession', {
    id: { type: DataTypes.STRING(36), primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    provider: { type: DataTypes.STRING(20), allowNull: false },
    providerPaymentId: { type: DataTypes.STRING(100), unique: true },
    orderId: DataTypes.INTEGER,
    status: { type: DataTypes.STRING(20), allowNull: false },
    totalPrice: { type: DataTypes.BIGINT, allowNull: false },
    providerAmount: { type: DataTypes.STRING(30), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    checkoutData: { type: DataTypes.TEXT('long'), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false }
});
