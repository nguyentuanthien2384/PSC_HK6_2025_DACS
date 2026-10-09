const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const babel = require('@babel/core');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Load source in isolation: no live database, mail server, or environment file.
function loadSource(relativePath, dependencies = {}) {
    const filename = path.resolve(__dirname, '../src', relativePath);
    const code = babel.transformFileSync(filename, {
        babelrc: false, configFile: false,
        presets: [[require.resolve('@babel/preset-env'), { targets: { node: 'current' } }]],
    }).code;
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    const originalRequire = loaded.require.bind(loaded);
    loaded.require = (name) => {
        if (name === 'dotenv') return { config: () => ({}) };
        if (Object.prototype.hasOwnProperty.call(dependencies, name)) return dependencies[name];
        return originalRequire(name);
    };
    loaded._compile(code, filename);
    return loaded.exports;
}

process.env.JWT_SECRET = 'automated-test-secret-that-is-never-used-in-production';
const utils = loadSource('utils/CommonUtils.js');
const passwordHash = bcrypt.hashSync('Secret123!', 4);
const actor = { id: 7, email: 'buyer@example.com', roleId: 'R2', statusId: 'S1' };
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } });
function serviceWith(db, email = { ensureConfigured() {}, async sendSimpleEmail() {} }) {
    return loadSource('services/userService.js', { '../models/index': db, './emailService': email, '../utils/CommonUtils': utils });
}

test('registration normalizes email, hashes password, and ignores a public elevated role', async () => {
    let created;
    const service = serviceWith({ User: { async findOne() { return null; }, async create(data) { created = data; } } });
    const result = await service.handleCreateNewUser({ email: ' Buyer@Example.com ', password: 'Secret123!', lastName: 'Buyer', roleId: 'R1', isActiveEmail: true });
    assert.equal(result.errCode, 0);
    assert.equal(created.email, actor.email);
    assert.equal(created.roleId, 'R2');
    assert.equal(created.isActiveEmail, false);
    assert.ok(await bcrypt.compare('Secret123!', created.password));
    assert.notEqual(created.password, 'Secret123!');
});

test('only a verified R1 actor can create staff or administrators', async () => {
    const roles = [];
    const service = serviceWith({ User: { async findOne() { return null; }, async create(data) { roles.push(data.roleId); } } });
    const data = { email: 'new@example.com', password: 'Secret123!', lastName: 'New', roleId: 'R4' };
    await service.handleCreateNewUser(data, { id: 1, roleId: 'R1' });
    await service.handleCreateNewUser(data, { id: 2, roleId: 'R4' });
    assert.deepEqual(roles, ['R4', 'R2']);
});

test('registration rejects missing, weak, and bcrypt-truncated passwords before querying', async () => {
    const service = serviceWith({ User: { findOne() { assert.fail('invalid input must not query'); } } });
    for (const password of [undefined, 'short', 'a'.repeat(73), 'ậ'.repeat(25)]) {
        assert.notEqual((await service.handleCreateNewUser({ email: 'new@example.com', lastName: 'New', password })).errCode, 0);
    }
});

test('login returns a safe user and a JWT with a real three-day expiry', async () => {
    const service = serviceWith({ User: { async findOne(query) {
        assert.equal(query.where.email, actor.email);
        assert.equal(query.where.statusId, 'S1');
        return { ...actor, password: passwordHash, usertoken: 'never-return-this', image: Buffer.from('data:image/png;base64,AAAA') };
    } } });
    const result = await service.handleLogin({ email: ' Buyer@example.com ', password: 'Secret123!' });
    assert.equal(result.errCode, 0);
    assert.equal(result.user.password, undefined);
    assert.equal(result.user.usertoken, undefined);
    assert.equal(result.user.image, 'data:image/png;base64,AAAA');
    const payload = jwt.verify(result.accessToken, process.env.JWT_SECRET, { issuer: utils.TOKEN_ISSUER });
    assert.equal(payload.exp - payload.iat, 3 * 24 * 3600);
    assert.ok(Math.abs(payload.iat - Math.floor(Date.now() / 1000)) < 3);
    assert.equal(payload.sub, '7');
});

test('middleware rejects malformed, expired, legacy, deleted-user, and password-revoked credentials', async () => {
    let current = { ...actor, password: passwordHash };
    const middleware = loadSource('middlewares/jwtVerify.js', {
        '../models/index': { User: { async findOne(query) { assert.equal(query.where.statusId, 'S1'); return current; } } },
        '../utils/CommonUtils': utils,
    });
    const valid = utils.encodeToken(actor.id, passwordHash);
    const expired = jwt.sign({ ver: utils.passwordVersion(passwordHash) }, process.env.JWT_SECRET, { subject: '7', issuer: utils.TOKEN_ISSUER, expiresIn: -1 });
    const legacy = jwt.sign({ sub: 7, exp: Date.now() + 10000000 }, process.env.JWT_SECRET);
    for (const authorization of [undefined, 'Basic abc', 'Bearer', `Bearer ${expired}`, `Bearer ${legacy}`]) {
        const res = response();
        await middleware.verifyTokenUser({ headers: { authorization } }, res, () => assert.fail('invalid request passed'));
        assert.equal(res.statusCode, 401);
    }
    for (const user of [null, { ...actor, password: 'changed-password-hash' }]) {
        current = user;
        const res = response();
        await middleware.verifyTokenUser({ headers: { authorization: `Bearer ${valid}` } }, res, () => assert.fail('revoked request passed'));
        assert.equal(res.statusCode, 401);
    }
});

test('middleware derives identity and role from the database and strips secrets', async () => {
    const middleware = loadSource('middlewares/jwtVerify.js', {
        '../models/index': { User: { async findOne() { return { ...actor, password: passwordHash, usertoken: 'private' }; } } },
        '../utils/CommonUtils': utils,
    });
    const req = { headers: { authorization: `Bearer ${utils.encodeToken(actor.id, passwordHash)}` } };
    let calls = 0;
    await middleware.verifyTokenUser(req, response(), () => { calls++; });
    assert.equal(calls, 1);
    assert.deepEqual(req.user, actor);
    assert.equal(req.auth.sub, '7');
    const denied = response();
    await middleware.verifyTokenAdmin(req, denied, () => assert.fail('customer gained admin access'));
    assert.equal(denied.statusCode, 403);
    const anonymous = { headers: {} };
    await middleware.optionalTokenUser(anonymous, response(), () => { calls++; });
    assert.equal(anonymous.user, undefined);
    assert.equal(calls, 2);
});

test('middleware sends database failures to Express instead of rejecting an async callback', async () => {
    const error = new Error('database unavailable');
    const middleware = loadSource('middlewares/jwtVerify.js', {
        '../models/index': { User: { async findOne() { throw error; } } }, '../utils/CommonUtils': utils,
    });
    let forwarded;
    await middleware.verifyTokenUser({ headers: { authorization: `Bearer ${utils.encodeToken(actor.id, passwordHash)}` } }, response(), (received) => { forwarded = received; });
    assert.equal(forwarded, error);
});

test('profile edits reject cross-user writes and customer role escalation', async () => {
    let saves = 0;
    const user = { ...actor, async save() { saves++; } };
    const service = serviceWith({ User: { async findOne() { return user; } } });
    assert.equal((await service.updateUserData({ id: 7, lastName: 'Attack' }, { ...actor, id: 8 })).errCode, 403);
    assert.equal((await service.updateUserData({ id: 7, roleId: 'R1' }, actor)).errCode, 403);
    assert.equal(saves, 0);
    assert.equal((await service.updateUserData({ id: 7, lastName: 'Updated', roleId: 'R2' }, actor)).errCode, 0);
    assert.equal(user.lastName, 'Updated');
    assert.equal(saves, 1);
});

test('private user detail requires ownership and no longer crashes for a missing user', async () => {
    let queries = 0;
    const service = serviceWith({ User: { async findOne() { queries++; return null; } } });
    assert.equal((await service.getDetailUserById(8, actor)).errCode, 403);
    assert.equal(queries, 0);
    assert.equal((await service.getDetailUserById(7, actor)).errCode, 2);
    assert.equal((await service.getDetailUserByEmail('other@example.com', actor)).errCode, 403);
});

test('password changes use authenticated identity and return a replacement token', async () => {
    const user = { ...actor, password: passwordHash, usertoken: 'old-reset', async save() {} };
    const service = serviceWith({ User: { async findOne(query) { assert.equal(query.where.id, actor.id); return user; } } });
    const result = await service.handleChangePassword({ id: 999, password: 'Changed123!', oldpassword: 'Secret123!' }, actor);
    assert.equal(result.errCode, 0);
    assert.ok(await bcrypt.compare('Changed123!', user.password));
    assert.equal(user.usertoken, '');
    assert.equal(jwt.decode(result.accessToken).ver, utils.passwordVersion(user.password));
    assert.notEqual(jwt.decode(result.accessToken).ver, utils.passwordVersion(passwordHash));
});

function emailFixture() {
    let sent;
    const user = { ...actor, password: passwordHash, usertoken: '', isActiveEmail: false, async save() {} };
    const db = { User: {
        async findOne() { return user; },
        async update(values, query) {
            if (String(query.where.id) !== String(user.id) || query.where.usertoken !== user.usertoken) return [0];
            Object.assign(user, values);
            return [1];
        },
    } };
    const service = serviceWith(db, { ensureConfigured() {}, async sendSimpleEmail(data) { sent = data; } });
    return { user, service, sent: () => sent, db };
}

test('verification tokens are hashed, purpose-bound, and atomically single-use without login', async () => {
    const fixture = emailFixture();
    assert.equal((await fixture.service.handleSendVerifyEmailUser({ id: 999 }, actor)).errCode, 0);
    const token = new URL(fixture.sent().redirectLink).searchParams.get('token');
    assert.equal(fixture.user.usertoken, createHash('sha256').update(token).digest('hex'));
    assert.notEqual(fixture.user.usertoken, token);
    assert.equal((await fixture.service.handleForgotPassword({ id: actor.id, token, password: 'Attack123!' })).errCode, 2);
    const results = await Promise.all([
        fixture.service.handleVerifyEmailUser({ id: actor.id, token }),
        fixture.service.handleVerifyEmailUser({ id: actor.id, token }),
    ]);
    assert.deepEqual(results.map((item) => item.errCode).sort(), [0, 2]);
    assert.equal(fixture.user.isActiveEmail, true);
    assert.equal(fixture.user.usertoken, '');
});

test('password reset rejects wrong-purpose, expired, and replayed tokens', async () => {
    const fixture = emailFixture();
    await fixture.service.handleSendEmailForgotPassword(actor.email);
    const token = new URL(fixture.sent().redirectLink).searchParams.get('token');
    assert.equal((await fixture.service.handleVerifyEmailUser({ id: actor.id, token })).errCode, 2);
    const expired = `reset.${Math.floor(Date.now() / 1000) - 1}.${'a'.repeat(64)}`;
    assert.equal((await fixture.service.handleForgotPassword({ id: actor.id, token: expired, password: 'Changed123!' })).errCode, 2);
    assert.equal((await fixture.service.handleForgotPassword({ id: actor.id, token, password: 'Changed123!' })).errCode, 0);
    assert.ok(await bcrypt.compare('Changed123!', fixture.user.password));
    assert.equal((await fixture.service.handleForgotPassword({ id: actor.id, token, password: 'Attack123!' })).errCode, 2);
});

test('failed email delivery restores the previous token instead of leaving a broken link', async () => {
    const fixture = emailFixture();
    fixture.user.usertoken = 'previous-token';
    const error = new Error('mail unavailable');
    const service = serviceWith(fixture.db, { ensureConfigured() {}, async sendSimpleEmail() { throw error; } });
    await assert.rejects(service.handleSendVerifyEmailUser({}, actor), error);
    assert.equal(fixture.user.usertoken, 'previous-token');
});

test('forgot-password success does not disclose whether an account exists', async () => {
    const service = serviceWith({ User: { async findOne() { return null; } } });
    const missing = await service.handleSendEmailForgotPassword('missing@example.com');
    const fixture = emailFixture();
    const existing = await fixture.service.handleSendEmailForgotPassword(actor.email);
    assert.deepEqual(missing, existing);
});

test('address service scopes edit, delete, and detail queries to their owner', async () => {
    const queries = [];
    const service = loadSource('services/addressUserService.js', { '../models/index': { AddressUser: {
        async findOne(query) { queries.push(query.where); return null; },
        async destroy(query) { queries.push(query.where); return 0; },
    } } });
    assert.equal((await service.editAddressUser({ id: 20, userId: 7, shipName: 'Buyer', shipAdress: 'Street', shipEmail: actor.email, shipPhonenumber: '0901234567' })).errCode, 2);
    assert.equal((await service.deleteAddressUser({ id: 20, userId: 7 })).errCode, 2);
    assert.equal((await service.getDetailAddressUserById(20, 7)).errCode, 2);
    assert.deepEqual(queries, [{ id: 20, userId: 7 }, { id: 20, userId: 7 }, { id: 20, userId: 7 }]);
});

test('address controller overwrites forged user identity on create/list/edit/delete/detail', async () => {
    const seen = [];
    const controller = loadSource('controllers/addressUserController.js', { '../services/addressUserService': {
        async createNewAddressUser(data) { seen.push(data.userId); return { errCode: 0 }; },
        async getAllAddressUserByUserId(id) { seen.push(id); return { errCode: 0 }; },
        async editAddressUser(data) { seen.push(data.userId); return { errCode: 0 }; },
        async deleteAddressUser(data) { seen.push(data.userId); return { errCode: 0 }; },
        async getDetailAddressUserById(id, userId) { seen.push(userId); return { errCode: 0 }; },
    } });
    const req = { user: actor, body: { id: 20, userId: 999 }, query: { id: 20, userId: 999 } };
    for (const operation of Object.values(controller)) await operation(req, response());
    assert.deepEqual(seen, [7, 7, 7, 7, 7]);
});

test('email delivery uses configured sender and escapes user-controlled HTML', async () => {
    const oldUser = process.env.SMTP_USER;
    const oldPassword = process.env.SMTP_PASSWORD;
    const oldFrom = process.env.EMAIL_FROM;
    process.env.SMTP_USER = 'sender@example.com';
    process.env.SMTP_PASSWORD = 'test-only';
    delete process.env.EMAIL_FROM;
    let mail;
    const email = loadSource('services/emailService.js', { nodemailer: { createTransport() { return { async sendMail(data) { mail = data; return { messageId: 'test' }; }, close() {} }; } } });
    try {
        await email.sendSimpleEmail({ type: 'verifyEmail', email: actor.email, firstName: '<img src=x>', lastName: 'Buyer', redirectLink: 'https://shop.example/verify-email?token=abc&userId=7' });
        assert.match(mail.from, /sender@example\.com/);
        assert.ok(mail.html.includes('&lt;img src=x&gt;'));
        assert.ok(!mail.html.includes('<img src=x>'));
        assert.ok(mail.html.includes('&amp;userId=7'));
        assert.ok(mail.text.includes('https://shop.example/verify-email'));
    } finally {
        for (const [key, value] of [['SMTP_USER', oldUser], ['SMTP_PASSWORD', oldPassword], ['EMAIL_FROM', oldFrom]]) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    }
});
