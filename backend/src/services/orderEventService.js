// Events and their notifications commit or roll back with the order mutation.
async function recordOrderEvent(db, { order, type, title, message, actorId, metadata = {} }, transaction) {
    // Older factory fixtures intentionally omit this additive model.
    if (!db.OrderEvent) return null;
    const event = await db.OrderEvent.create({ orderId: order.id, actorId: actorId || null,
        type, title, message, metadata: JSON.stringify(metadata) }, { transaction });
    if (db.Notification) {
        const { createNotificationService } = require('./notificationService');
        await createNotificationService(db).forOrderEvent(order, event, transaction);
    }
    if (db.AdminAudit && actorId && transaction) {
        const actor = await db.User.findOne({ where: { id: actorId }, attributes: ['id', 'roleId', 'firstName', 'lastName'], raw: true, transaction });
        if (actor && ['R1', 'R4'].includes(actor.roleId)) await require('./adminAuditService').recordAdminAudit(db, {
            actor, entityType: 'ORDER', entityId: order.id, action: type, summary: title,
            before: metadata.fromStatus ? { statusId: metadata.fromStatus } : undefined,
            after: { statusId: order.statusId, ...metadata }, sourceEventId: event.id
        }, transaction);
    }
    return event;
}
module.exports = { recordOrderEvent };
