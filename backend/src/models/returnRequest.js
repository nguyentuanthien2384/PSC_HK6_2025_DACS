'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class ReturnRequest extends Model {}
    ReturnRequest.init({
        orderId: { type: DataTypes.INTEGER, allowNull: false },
        // Rejected cases free this slot; a completed refund retains it forever.
        activeOrderId: { type: DataTypes.INTEGER, allowNull: true, unique: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        kind: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'CUSTOMER_RETURN' },
        status: { type: DataTypes.STRING(30), allowNull: false },
        reason: { type: DataTypes.STRING(1000), allowNull: false },
        evidence: DataTypes.TEXT('long'),
        amount: { type: DataTypes.BIGINT, allowNull: false },
        carrier: DataTypes.STRING(100),
        trackingNumber: DataTypes.STRING(100),
        reviewNote: DataTypes.STRING(1000),
        inspectionNote: DataTypes.STRING(1000),
        resellable: DataTypes.BOOLEAN,
        requestedAt: DataTypes.DATE,
        approvedAt: DataTypes.DATE,
        rejectedAt: DataTypes.DATE,
        shippedAt: DataTypes.DATE,
        receivedAt: DataTypes.DATE,
        refundMethod: DataTypes.STRING(30),
        refundReference: DataTypes.STRING(150),
        refundProof: DataTypes.TEXT('long'),
        refundProviderStatus: DataTypes.STRING(30),
        refundedAt: DataTypes.DATE,
        reviewedById: DataTypes.INTEGER,
        receivedById: DataTypes.INTEGER,
        refundedById: DataTypes.INTEGER
    }, { sequelize, modelName: 'ReturnRequest', tableName: 'ReturnRequests' });
    return ReturnRequest;
};
