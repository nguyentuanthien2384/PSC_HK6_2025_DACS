'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class OrderEvent extends Model {}
    const immutable = () => { throw new Error('Order events are immutable. Append a new event instead.'); };
    OrderEvent.init({
        orderId: { type: DataTypes.INTEGER, allowNull: false },
        actorId: DataTypes.INTEGER,
        type: { type: DataTypes.STRING(60), allowNull: false },
        title: { type: DataTypes.STRING(200), allowNull: false },
        message: { type: DataTypes.STRING(1000), allowNull: false },
        metadata: { type: DataTypes.TEXT, get() {
            const value = this.getDataValue('metadata');
            try { return value ? JSON.parse(value) : {}; } catch (_) { return {}; }
        } }
    }, { sequelize, modelName: 'OrderEvent', tableName: 'OrderEvents', updatedAt: false,
        hooks: { beforeUpdate: immutable, beforeBulkUpdate: immutable, beforeDestroy: immutable, beforeBulkDestroy: immutable } });
    return OrderEvent;
};
