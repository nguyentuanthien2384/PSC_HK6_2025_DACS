'use strict';
const {
    Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class OrderProduct extends Model {
        static associate(models) {
            if (models.TypeShip) {
                OrderProduct.belongsTo(models.TypeShip, { foreignKey: 'typeShipId', targetKey: 'id', as: 'typeShipData' })
            }
            if (models.Voucher) {
                OrderProduct.belongsTo(models.Voucher, { foreignKey: 'voucherId', targetKey: 'id', as: 'voucherData' })
            }
            if (models.Allcode) {
                OrderProduct.belongsTo(models.Allcode, { foreignKey: 'statusId', targetKey: 'code', as: 'statusOrderData' })
            }
        }
    };
    OrderProduct.init({
        addressUserId: DataTypes.INTEGER,
        statusId: DataTypes.STRING,
        typeShipId: DataTypes.INTEGER,
        voucherId: DataTypes.INTEGER,
        note: DataTypes.STRING,
        isPaymentOnlien: DataTypes.INTEGER,
        subtotal: DataTypes.BIGINT,
        shippingFee: DataTypes.BIGINT,
        discountAmount: DataTypes.BIGINT,
        totalPrice: DataTypes.BIGINT,
        shipperId: DataTypes.INTEGER,
        deliveryProvider: { type: DataTypes.STRING(20), defaultValue: 'internal' },
        assignedAt: DataTypes.DATE,
        deliveredAt: DataTypes.DATE,
        cancelledAt: DataTypes.DATE,
        cancellationReason: DataTypes.STRING(1000),
        deliveryAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        failedDeliveryAt: DataTypes.DATE,
        lastDeliveryFailureReason: DataTypes.STRING(1000),
        returnStartedAt: DataTypes.DATE,
        warehouseReceivedAt: DataTypes.DATE,
        returnResellable: DataTypes.BOOLEAN,
        image: DataTypes.BLOB('long')
    }, {
        sequelize,
        modelName: 'OrderProduct',
        tableName: 'Orderproducts',
    });
    return OrderProduct;
};
