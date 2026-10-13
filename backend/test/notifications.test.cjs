const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNotificationService, setNotificationEmitter } = require('../src/services/notificationService');
function fixture() {
    const rows = []; const emitted = [];
    const matches = (row, where) => Object.entries(where).every(([key, value]) => String(row[key]) === String(value));
    const db = { AddressUser: { findOne: async () => ({ userId: 2 }) }, User: { findAll: async () => [{ id: 1, roleId: 'R1' }] }, Notification: {
        async bulkCreate(values) { for (const row of values) if (!rows.some(existing => existing.dedupeKey === row.dedupeKey)) rows.push({ id: rows.length + 1, ...row }); },
        async findAndCountAll(options) { assert.equal(options.attributes.exclude.includes('dedupeKey'), true); const owned = rows.filter(row => matches(row, options.where)); return { rows: owned.slice(options.offset, options.offset + options.limit), count: owned.length }; },
        async findOne(options) { return rows.find(row => matches(row, options.where)) || null; },
        async count(options) { return rows.filter(row => matches(row, options.where)).length; },
        async update(values, options) { rows.filter(row => matches(row, options.where)).forEach(row => Object.assign(row, values)); },
    } };
    setNotificationEmitter({ to(room) { return { emit(name, payload) { emitted.push({ room, name, payload }); } }; } });
    return { rows, emitted, service: createNotificationService(db) };
}
test('order notifications persist for authorized recipients and emit only after commit, deduplicated per event', async () => {
    const f = fixture(); let commit;
    const tx = { afterCommit(callback) { commit = callback; } };
    const order = { id: 10, addressUserId: 20, shipperId: 3 };
    const event = { id: 50, type: 'ORDER_DELIVERED', title: 'Giao hàng thành công', message: 'Đơn #10 đã được giao.' };
    await f.service.forOrderEvent(order, event, tx);
    assert.equal(f.rows.length, 3); assert.equal(f.emitted.length, 0);
    assert.equal(f.rows.find(row => row.userId === 2).link, '/user/order/2');
    assert.equal(f.rows.find(row => row.userId === 3).link, '/shipper');
    assert.equal(f.rows.find(row => row.userId === 1).link, '/system/home/order-detail/10');
    commit(); assert.equal(f.emitted.length, 3);
    await f.service.forOrderEvent(order, event, tx); assert.equal(f.rows.length, 3);
});
test('notification list and read actions always scope to JWT owner and preserve first read time', async () => {
    const f = fixture();
    await f.service.forOrderEvent({ id: 10, addressUserId: 20 }, { id: 50, type: 'CREATED', title: 'Đã đặt', message: 'Đã tạo đơn.' });
    const list = await f.service.list({ userId: 1 }, { id: 2 });
    assert.equal(list.data.length, 1); assert.equal(list.unreadCount, 1);
    const notification = f.rows.find(row => row.userId === 2);
    assert.equal((await f.service.read({ id: notification.id }, { id: 1 })).errCode, 2);
    assert.equal(notification.readAt, null);
    assert.equal((await f.service.read({ id: notification.id, userId: 1 }, { id: 2 })).errCode, 0);
    const readAt = notification.readAt;
    await f.service.read({ id: notification.id }, { id: 2 }); assert.equal(notification.readAt, readAt);
    assert.equal((await f.service.list({}, { id: 2 })).unreadCount, 0);
    assert.equal(f.rows.find(row => row.userId === 1).readAt, null);
});
test('mark all affects only own unread notifications; invalid pagination and anonymous callers fail', async () => {
    const f = fixture(); await f.service.forOrderEvent({ id: 10, addressUserId: 20 }, { id: 50, type: 'CREATED', title: 'Đã đặt', message: 'Đã tạo đơn.' });
    assert.equal((await f.service.list({}, null)).errCode, 401);
    assert.equal((await f.service.list({ limit: 1000 }, { id: 2 })).errCode, 1);
    await f.service.readAll({ userId: 1 }, { id: 2 });
    assert.equal((await f.service.list({}, { id: 1 })).unreadCount, 1);
    assert.equal((await f.service.list({}, { id: 2 })).unreadCount, 0);
    setNotificationEmitter(null);
});
