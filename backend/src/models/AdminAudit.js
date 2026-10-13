'use strict';
module.exports = (sequelize, DataTypes) => sequelize.define('AdminAudit', {
    actorId: { type: DataTypes.INTEGER, allowNull: false },
    actorName: { type: DataTypes.STRING(180), allowNull: false },
    actorRole: { type: DataTypes.STRING(10), allowNull: false },
    entityType: { type: DataTypes.STRING(30), allowNull: false },
    entityId: { type: DataTypes.STRING(80), allowNull: false },
    action: { type: DataTypes.STRING(64), allowNull: false },
    summary: { type: DataTypes.STRING(500), allowNull: false },
    beforeData: DataTypes.TEXT, afterData: DataTypes.TEXT,
    sourceEventId: { type: DataTypes.INTEGER, unique: true }
}, { tableName: 'AdminAudits', updatedAt: false });
