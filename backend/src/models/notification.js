'use strict';
module.exports = (sequelize, DataTypes) => sequelize.define('Notification', {
    userId: { type: DataTypes.INTEGER, allowNull: false },
    orderId: DataTypes.INTEGER,
    type: { type: DataTypes.STRING(80), allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    message: { type: DataTypes.STRING(1000), allowNull: false },
    link: { type: DataTypes.STRING(255), allowNull: false },
    dedupeKey: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    readAt: DataTypes.DATE,
});
