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
    return event;
}
module.exports = { recordOrderEvent };
