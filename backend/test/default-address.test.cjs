const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

function load(relativePath, mocks) {
    const filename = path.resolve(__dirname, '../src', relativePath);
    const code = babel.transformFileSync(filename, { babelrc: false, configFile: false,
        presets: [[require.resolve('@babel/preset-env'), { targets: { node: 'current' } }]],
    }).code;
    const loaded = new Module(filename, module);
    loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    const original = loaded.require.bind(loaded);
    loaded.require = name => Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : original(name);
    loaded._compile(code, filename);
    return loaded.exports;
}
const values = { shipName: 'Người nhận', shipAdress: '123 Đường A', shipEmail: 'buyer@example.com', shipPhonenumber: '0901234567' };
const address = (id, userId, isDefault = false) => ({ id, userId, isDefault, ...values });

function fixture(initial = [], usedIds = []) {
    const rows = initial.map(row => ({ ...row }));
    const locks = [];
    const mutations = [];
    const addressReads = [];
    const matches = (row, where) => Object.entries(where).every(([key, value]) => String(row[key]) === String(value));
    const db = {
        User: { async findByPk(id, options) { locks.push(options); return Number(id) === 1 || Number(id) === 2 ? { id } : null; } },
        AddressUser: {
            async findAll({ where }) { return rows.filter(row => matches(row, where)).sort((a, b) => b.id - a.id).map(row => ({ ...row })); },
            async findOne(options) {
                addressReads.push(options);
                const row = rows.find(row => matches(row, options.where));
                if (!row) return null;
                const result = { ...row };
                if (options.raw !== true) result.save = async () => Object.assign(row, result);
                return result;
            },
            async create(data, options) { mutations.push(options); const row = { id: Math.max(0, ...rows.map(row => row.id)) + 1, ...data }; rows.push(row); return row; },
            async update(data, options) { mutations.push(options); for (const row of rows.filter(row => matches(row, options.where))) Object.assign(row, data); },
            async destroy(options) { mutations.push(options); const index = rows.findIndex(row => matches(row, options.where)); if (index >= 0) rows.splice(index, 1); },
        },
        OrderProduct: { async findOne({ where }) { return usedIds.includes(Number(where.addressUserId)) ? { id: 9 } : null; } },
        PaymentSession: { async findAll() { return []; } },
    };
    let queue = Promise.resolve();
    db.sequelize = { async transaction(work) {
        const previous = queue; let release;
        queue = new Promise(resolve => { release = resolve; }); await previous;
        try { return await work({ LOCK: { UPDATE: 'UPDATE' } }); } finally { release(); }
    } };
    return { service: load('services/addressUserService.js', { '../models/index': db }), rows, locks, mutations, addressReads };
}

test('first address becomes default; later ordinary addresses preserve the preference', async () => {
    const f = fixture();
    const first = await f.service.createNewAddressUser({ ...values, userId: 1 });
    const second = await f.service.createNewAddressUser({ ...values, userId: 1 });
    assert.equal(first.errCode, 0); assert.equal(second.errCode, 0);
    assert.deepEqual(f.rows.map(row => row.isDefault), [true, false]);
    assert.equal((await f.service.getAllAddressUserByUserId(1)).data[0].id, first.data.id);
    const third = await f.service.createNewAddressUser({ ...values, userId: 1, isDefault: true });
    assert.equal((await f.service.getAllAddressUserByUserId(1)).data[0].id, third.data.id);
    assert.equal(f.rows.filter(row => row.isDefault).length, 1);
});

test('legacy addresses use newest id deterministically and empty lists stay empty', async () => {
    const f = fixture([address(4, 1), address(5, 1), address(6, 2, true)]);
    const result = await f.service.getAllAddressUserByUserId(1);
    assert.deepEqual(result.data.map(row => [row.id, row.isDefault]), [[5, true], [4, false]]);
    assert.equal(f.rows.find(row => row.id === 5).isDefault, false);
    assert.deepEqual((await f.service.getAllAddressUserByUserId(3)).data, []);
});

test('default preference changes enforce ownership and preserve historical address contents', async () => {
    const f = fixture([address(4, 1), address(5, 1, true), address(6, 2, true)], [4]);
    const before = { ...f.rows[0] };
    assert.notEqual((await f.service.setDefaultAddressUser({ id: 6, userId: 1 })).errCode, 0);
    assert.equal((await f.service.setDefaultAddressUser({ id: 4, userId: 1 })).errCode, 0);
    assert.deepEqual(f.rows[0], { ...before, isDefault: true });
    assert.equal(f.rows.find(row => row.id === 6).isDefault, true);
    assert.notEqual((await f.service.editAddressUser({ ...values, id: 4, userId: 1, shipName: 'Changed' })).errCode, 0);
    assert.notEqual((await f.service.deleteAddressUser({ id: 4, userId: 1 })).errCode, 0);
    assert.ok(f.addressReads.slice(-2).every(options => options.lock === 'UPDATE' && options.transaction));
});

test('deleting unused default promotes another owned address and handles the final address', async () => {
    const f = fixture([address(4, 1, true), address(5, 1), address(6, 2, true)]);
    assert.equal((await f.service.deleteAddressUser({ id: 4, userId: 1 })).defaultAddressId, 5);
    assert.equal(f.rows.find(row => row.id === 5).isDefault, true);
    assert.equal((await f.service.deleteAddressUser({ id: 5, userId: 1 })).defaultAddressId, null);
    assert.equal(f.rows.find(row => row.id === 6).isDefault, true);
});

test('concurrent creates/default changes lock their owner and leave exactly one preference', async () => {
    const f = fixture([address(4, 1, true)]);
    const results = await Promise.all([
        f.service.createNewAddressUser({ ...values, userId: 1, isDefault: true }),
        f.service.createNewAddressUser({ ...values, userId: 1, isDefault: true }),
        f.service.setDefaultAddressUser({ id: 4, userId: 1 }),
    ]);
    assert.ok(results.every(result => result.errCode === 0));
    assert.equal(f.rows.filter(row => row.isDefault).length, 1);
    assert.equal(f.locks.length, 3);
    assert.ok(f.locks.every(options => options.lock === 'UPDATE' && options.transaction));
    assert.ok(f.mutations.every(options => options.transaction));
});

test('default address controller gets user identity from JWT instead of request body', async () => {
    let received;
    const controller = load('controllers/addressUserController.js', { '../services/addressUserService': {
        async setDefaultAddressUser(data) { received = data; return { errCode: 0 }; },
    } });
    const res = { status() { return this; }, json() {} };
    await controller.setDefaultAddressUser({ user: { id: 1 }, body: { id: 4, userId: 2 } }, res);
    assert.deepEqual(received, { id: 4, userId: 1 });
});

test('default-address migration adds metadata and preserves an already-migrated preference', async () => {
    const migration = require('../src/migrations/zzzzz-20261012-default-address.js');
    const calls = [];
    const query = { async describeTable() { return {}; }, async addColumn(...args) { calls.push(args); }, sequelize: { async query(sql) { calls.push(sql); } } };
    await migration.up(query, { BOOLEAN: 'BOOLEAN' });
    assert.equal(calls[0][1], 'isDefault');
    assert.match(calls[1], /MAX\(id\)/);
    calls.length = 0; query.describeTable = async () => ({ isDefault: {} });
    await migration.up(query, { BOOLEAN: 'BOOLEAN' });
    assert.equal(calls.length, 0);
});
