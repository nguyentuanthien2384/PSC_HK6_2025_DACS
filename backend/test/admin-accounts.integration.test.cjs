const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
if (process.env.RUN_DB_TESTS !== 'true') {
    test('admin accounts MySQL integration (isolated TEST_DB_* opt in)', { skip: true }, () => {});
} else {
    const required = ['TEST_DB_HOST', 'TEST_DB_PORT', 'TEST_DB_DATABASE_NAME', 'TEST_DB_USERNAME', 'TEST_DB_PASSWORD'];
    if (process.env.NODE_ENV !== 'test' || !/test|integration/i.test(process.env.TEST_DB_DATABASE_NAME || '') || required.some(key => process.env[key] === undefined)) {
        throw new Error('Admin account tests require an explicitly configured isolated integration database.');
    }
    process.env.JWT_SECRET = 'admin-account-integration-only-secret-32-characters';
    require('@babel/register')({ cache: false });
    const db = require('../src/models');
    const { createApp } = require('../src/app');
    const utils = require('../src/utils/CommonUtils');
    const { createAdminAccountService } = require('../src/services/adminAccountService');
    const { safeSnapshot } = require('../src/services/adminAuditService');
    const service = createAdminAccountService(db);
    let server, base, io;
    const users = [], orders = [];
    before(async () => {
        await db.sequelize.authenticate();
        server = createApp().listen(0, '127.0.0.1');
        io = require('socket.io')(server);
        require('../src/socket').configureSocket(io);
        await new Promise(resolve => server.once('listening', resolve));
        base = `http://127.0.0.1:${server.address().port}`;
    });
    after(async () => {
        if (io) await new Promise(resolve => io.close(resolve));
        if (server?.listening) await new Promise(resolve => server.close(resolve));
        const { Op } = require('sequelize');
        if (orders.length) await db.OrderProduct.destroy({ where: { id: { [Op.in]: orders } } });
        if (users.length) {
            await db.AdminAudit.destroy({ where: { actorId: { [Op.in]: users.map(user => user.id) } } });
            await db.User.destroy({ where: { id: { [Op.in]: users.map(user => user.id) } } });
        }
        await db.sequelize.close();
    });
    async function user(roleId = 'R1') {
        const row = await db.User.create({ email: `${crypto.randomUUID()}@admin-account.test`, firstName: 'Account', lastName: 'Test',
            roleId, statusId: 'S1', password: 'account-test-password-hash', authVersion: 0, usertoken: '' });
        users.push(row);
        return { id: row.id, roleId, firstName: row.firstName, lastName: row.lastName, token: utils.encodeToken(row.id, row.password) };
    }
    async function call(path, actor, body, method = body ? 'POST' : 'GET') {
        const response = await fetch(base + path, { method, headers: { ...(actor ? { authorization: `Bearer ${actor.token}` } : {}),
            ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { httpStatus: response.status, ...await response.json() };
    }
    const okay = result => { assert.equal(result.errCode, 0, result.errMessage); return result; };
    test('admin APIs enforce the owner/operations boundary including legacy catalog and user mutation paths', async () => {
        const staff = await user('R4'), buyer = await user('R2'), owner = await user();
        for (const path of ['/api/admin/accounts', '/api/admin/audit', '/api/admin/catalog', '/api/get-all-user', '/api/get-statistic-profit']) {
            assert.equal((await call(path, staff)).httpStatus, 403, path);
        }
        assert.equal((await call('/api/admin/inventory', buyer)).httpStatus, 403);
        assert.equal((await call('/api/admin/accounts/change', staff, { id: buyer.id, statusId: 'S2', reason: 'Test lock' })).httpStatus, 403);
        assert.equal((await call('/api/delete-user', staff, { id: buyer.id }, 'DELETE')).httpStatus, 403);
        assert.equal((await call('/api/unactive-product', staff, { id: 1 })).httpStatus, 403);
        const result = okay(await call(`/api/admin/accounts?keyword=${encodeURIComponent('admin-account.test')}`, owner));
        assert.ok(result.data.length);
        assert.ok(result.data.every(row => !('password' in row) && !('usertoken' in row) && !('image' in row)));
        assert.equal((await call('/api/admin/audit')).httpStatus, 401);
    });
    test('locking then restoring keeps old JWT revoked, records both changes, and fresh login version works', async () => {
        const owner = await user(), target = await user('R4');
        okay(await call('/api/admin/accounts/change', owner, { id: target.id, statusId: 'S2', reason: 'Tạm khóa nhân viên' }));
        assert.equal((await call('/api/admin/operations/orders', target)).httpStatus, 401);
        assert.equal(okay(await call(`/api/get-detail-user-by-id?id=${target.id}`, owner)).data.statusId, 'S2');
        okay(await call('/api/update-user', owner, { id: target.id, lastName: 'Updated while locked' }, 'PUT'));
        assert.equal((await db.User.findByPk(target.id)).statusId, 'S2');
        assert.equal((await call('/api/admin/operations/orders', target)).httpStatus, 401);
        okay(await call('/api/admin/accounts/change', owner, { id: target.id, statusId: 'S1', reason: 'Mở lại nhân viên' }));
        assert.equal((await call('/api/admin/operations/orders', target)).httpStatus, 401);
        const current = await db.User.findByPk(target.id);
        assert.equal(current.authVersion, 2);
        const fresh = { ...target, token: utils.encodeToken(current.id, current.password, current.authVersion) };
        okay(await call('/api/admin/operations/orders?pageSize=1', fresh));
        const audit = okay(await call(`/api/admin/audit?entityType=USER&keyword=${target.id}`, owner));
        const targetRows = audit.data.filter(row => row.entityId === String(target.id));
        assert.deepEqual(targetRows.map(row => row.action), ['USER_RESTORED', 'USER_DISABLED']);
        assert.ok(targetRows.every(row => row.actorId === owner.id && !('beforeData' in row)));
        assert.deepEqual(targetRows[0].before, { roleId: 'R4', statusId: 'S2' });
        assert.equal((await call('/api/admin/audit?from=2026-02-30', owner)).errCode, 1);
    });
    test('self changes, forged profile role changes and active courier lock are blocked with no audit', async () => {
        const owner = await user(), courier = await user('R3');
        const order = await db.OrderProduct.create({ shipperId: courier.id, statusId: 'S5' }); orders.push(order.id);
        assert.notEqual((await service.change({ id: owner.id, roleId: 'R2', reason: 'Self role change' }, owner)).errCode, 0);
        assert.notEqual((await service.change({ id: courier.id, statusId: 'S2', reason: 'Shipper still delivering' }, owner)).errCode, 0);
        const result = await call('/api/update-user', owner, { id: courier.id, roleId: 'R1' }, 'PUT');
        assert.notEqual(result.errCode, 0);
        const current = await db.User.findByPk(courier.id);
        assert.equal(current.roleId, 'R3'); assert.equal(current.statusId, 'S1'); assert.equal(current.authVersion, 0);
        assert.equal(await db.AdminAudit.count({ where: { actorId: owner.id } }), 0);
    });
    test('failed audit rolls back account changes and snapshot redaction strips nested credentials', async () => {
        const owner = await user(), target = await user('R2');
        const fault = createAdminAccountService({ ...db, AdminAudit: { async create() { throw new Error('audit unavailable'); } } });
        await assert.rejects(fault.change({ id: target.id, roleId: 'R4', reason: 'Promote employee' }, owner), /audit unavailable/);
        const current = await db.User.findByPk(target.id);
        assert.equal(current.roleId, 'R2'); assert.equal(current.authVersion, 0);
        assert.deepEqual(safeSnapshot({ roleId: 'R4', password: 'secret', nested: { token: 'secret', phone: 'private', quantity: 1 } }), { roleId: 'R4', nested: { quantity: 1 } });
    });
    test('concurrent owners cannot both remove each other; a repeated committed change does not create another audit', async () => {
        const first = await user(), second = await user();
        const results = await Promise.all([
            service.change({ id: second.id, roleId: 'R4', reason: 'Điều chỉnh quyền quản trị thứ hai' }, first),
            service.change({ id: first.id, roleId: 'R4', reason: 'Điều chỉnh quyền quản trị thứ nhất' }, second),
        ]);
        assert.deepEqual(results.map(result => result.errCode).sort((a, b) => a - b), [0, 403]);
        const winner = results[0].errCode === 0 ? first : second;
        const target = winner.id === first.id ? second : first;
        const repeated = okay(await service.change({ id: target.id, roleId: 'R4', reason: 'Xác nhận lại vai trò' }, winner));
        assert.equal(repeated.unchanged, true);
        assert.equal((await db.User.findByPk(target.id)).authVersion, 1);
        assert.equal(await db.AdminAudit.count({ where: { actorId: winner.id } }), 1);
    });
    test('admin-created staff has an atomic audit with business metadata and no registration credentials', async () => {
        const owner = await user(), email = `${crypto.randomUUID()}@admin-account.test`;
        okay(await call('/api/create-new-user', owner, { email, lastName: 'New staff', password: 'StaffTest@123', roleId: 'R4' }));
        const created = await db.User.findOne({ where: { email } }); users.push(created);
        assert.equal(created.roleId, 'R4');
        const audit = await db.AdminAudit.findOne({ where: { actorId: owner.id, action: 'USER_CREATED', entityId: String(created.id) } });
        assert.ok(audit); assert.deepEqual(JSON.parse(audit.afterData), { roleId: 'R4', statusId: 'S1' });
        assert.ok(!JSON.stringify(audit).includes('StaffTest@123') && !JSON.stringify(audit).includes(email));
    });
    test('committed role/status changes disconnect live staff sockets; a rolled-back audit leaves them connected', async t => {
        const owner = await user(), staff = await user('R4');
        const socket = require('../../frontend/node_modules/socket.io-client').io(base, { transports: ['websocket'], auth: { token: staff.token }, reconnection: false });
        t.after(() => socket.close());
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Staff socket connection timed out')), 4000);
            socket.once('connect', () => { clearTimeout(timeout); resolve(); });
            socket.once('connect_error', error => { clearTimeout(timeout); reject(error); });
        });
        assert.equal(io.sockets.adapter.rooms.get('support:admins').has(socket.id), true);
        const fault = createAdminAccountService({ ...db, AdminAudit: { async create() { throw new Error('audit unavailable'); } } });
        await assert.rejects(fault.change({ id: staff.id, statusId: 'S2', reason: 'Disable test staff' }, owner), /audit unavailable/);
        assert.equal(socket.connected, true);
        const disconnected = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Revoked staff socket was retained')), 4000);
            socket.once('disconnect', reason => { clearTimeout(timeout); resolve(reason); });
        });
        okay(await call('/api/admin/accounts/change', owner, { id: staff.id, statusId: 'S2', reason: 'Disable test staff' }));
        assert.equal(await disconnected, 'io server disconnect');
        assert.equal(socket.connected, false);
    });
}
