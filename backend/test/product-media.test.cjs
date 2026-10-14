const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const express = require('express');
const { createProductMediaService } = require('../src/services/productMediaService');
const { createMediaHandler } = require('../src/controllers/productMediaController');
const { productImageUrl, contentImageUrl, imageDigest, versionedImageHooks } = require('../src/utils/productImage');

async function fixture(run, overrides = {}) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dacs-media-test-'));
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    const source = await sharp({ create: { width: 1024, height: 800, channels: 3, background: '#447f16' } }).jpeg().toBuffer();
    const image = `data:image/jpeg;base64,${source.toString('base64')}`;
    const row = { id: 1, image: Buffer.from(image), imageVersion: imageDigest(image), updatedAt: new Date() };
    const calls = [];
    const db = Object.fromEntries(['ProductImage', 'Banner', 'Blog'].map(model => [model, { async findOne(query) { calls.push({ model, query }); return Number(query.where.id) === row.id ? { ...row } : null; } }]));
    const options = { cacheDir: path.join(root, 'cache'), publicDir: path.join(root, 'public'), ...overrides };
    try { await run({ root, row, calls, source, db, options, service: createProductMediaService(db, options) }); }
    finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('cards resize to bounded WebP, deduplicate simultaneous requests and serve warm disk cache without reading image blobs', async () => fixture(async f => {
    const results = await Promise.all(Array.from({ length: 6 }, () => f.service.get(1, f.row.imageVersion, 'card')));
    assert.equal(f.calls.length, 1); assert.ok(results.every(result => result.etag === results[0].etag));
    const metadata = await sharp(results[0].body).metadata();
    assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 480); assert.ok(metadata.height <= 600);
    assert.ok(results[0].body.length < f.source.length);
    const restarted = createProductMediaService(f.db, f.options);
    assert.deepEqual((await restarted.get(1, f.row.imageVersion, 'card')).body, results[0].body);
    assert.equal(f.calls.length, 1);
}));

test('warm disk thumbnails remain available while both cold image encoder slots are occupied', async () => fixture(async f => {
    const cached = await f.service.get(1, f.row.imageVersion, 'card');
    let releaseEncoders, signalStarted, started = 0;
    const gate = new Promise(resolve => { releaseEncoders = resolve; });
    const encodersStarted = new Promise(resolve => { signalStarted = resolve; });
    const service = createProductMediaService(f.db, { ...f.options, encode: async () => {
        if (++started === 2) signalStarted();
        await gate;
        return cached.body;
    } });
    const cold = ['detail', 'banner'].map(variant => service.get(1, f.row.imageVersion, variant));
    let timeout;
    try {
        await encodersStarted;
        const hits = await Promise.race([
            Promise.all(Array.from({ length: 6 }, () => service.get(1, f.row.imageVersion, 'card'))),
            new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Disk thumbnails waited for encoder work')), 1000); }),
        ]);
        assert.ok(hits.every(hit => hit.etag === cached.etag));
        assert.equal(f.calls.length, 3, 'cached thumbnail skips the source database even under cold image load');
        assert.equal(started, 2);
    } finally {
        clearTimeout(timeout);
        releaseEncoders();
        await Promise.allSettled(cold);
    }
}));

test('versioned source edits generate a new URL and stale uncached URLs redirect without serving changed pixels under immutable URLs', async () => fixture(async f => {
    const first = productImageUrl(f.row);
    const old = f.row.imageVersion;
    const next = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#ffffff' } }).png().toBuffer();
    f.row.image = next; f.row.imageVersion = imageDigest(next);
    assert.notEqual(productImageUrl(f.row), first);
    assert.deepEqual(await f.service.get(1, old, 'card'), { redirect: productImageUrl(f.row) });
    const metadata = await sharp((await f.service.get(1, f.row.imageVersion, 'detail')).body).metadata();
    assert.equal(metadata.width, 32, 'small images are not enlarged');
}));

test('existing local catalog files are supported; arbitrary paths, invalid images and remote URLs are never fetched', async () => fixture(async f => {
    await fs.mkdir(path.join(f.options.publicDir, 'catalog'), { recursive: true });
    await fs.writeFile(path.join(f.options.publicDir, 'catalog', 'fixture.jpg'), f.source);
    f.row.image = '/catalog/fixture.jpg'; f.row.imageVersion = imageDigest(f.row.image);
    assert.equal((await sharp((await f.service.get(1, f.row.imageVersion, 'detail')).body).metadata()).format, 'webp');
    for (const value of ['/catalog/../../outside.jpg', '/catalog/missing.jpg', 'https://private.test/photo.jpg', 'data:image/svg+xml;base64,AAAA']) {
        f.row.image = value; f.row.imageVersion = imageDigest(value);
        await assert.rejects(f.service.get(1, f.row.imageVersion, 'card'), error => error.status === 404);
    }
}));

test('banner and blog cache keys are separate from product IDs and resize without distorting original aspect ratios', async () => fixture(async f => {
    const product = await f.service.get(1, f.row.imageVersion, 'card');
    const banner = await f.service.get(1, f.row.imageVersion, 'banner', 'banner-images');
    const blog = await f.service.get(1, f.row.imageVersion, 'card', 'blog-images');
    assert.deepEqual(f.calls.map(call => call.model), ['ProductImage', 'Banner', 'Blog']);
    assert.equal((await sharp(banner.body).metadata()).width, 1024);
    assert.equal((await sharp(blog.body).metadata()).width, 480);
    assert.ok(contentImageUrl(f.row, 'banner').endsWith('/banner')); assert.ok(product.body.length > 0);
}));

test('HTTP image responses have immutable caching, conditional ETag 304, safe MIME and uncached 404s', async () => fixture(async f => {
    const app = express(); app.get('/api/media/:type/:id/:version/:variant', createMediaHandler(f.service));
    app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const first = await fetch(base + productImageUrl(f.row)); assert.equal(first.status, 200);
        assert.equal(first.headers.get('content-type'), 'image/webp'); assert.ok(first.headers.get('cache-control').includes('immutable'));
        assert.equal(first.headers.get('x-content-type-options'), 'nosniff'); await first.arrayBuffer();
        const second = await fetch(base + productImageUrl(f.row), { headers: { 'If-None-Match': first.headers.get('etag'), 'Cache-Control': 'max-age=0' } });
        assert.equal(second.status, 304); assert.equal(await second.text(), '');
        const missing = await fetch(`${base}/api/media/product-images/999/${f.row.imageVersion}/card`);
        assert.equal(missing.status, 404); assert.equal(missing.headers.get('cache-control'), 'no-store');
        const stale = await fetch(`${base}/api/media/product-images/1/0/card`, { redirect: 'manual' });
        assert.equal(stale.status, 302); assert.equal(stale.headers.get('location'), productImageUrl(f.row)); assert.equal(stale.headers.get('cache-control'), 'no-store');
    } finally { await new Promise(resolve => server.close(resolve)); }
}));

test('invalid identifiers and formats reject before touching database or disk', async () => fixture(async f => {
    for (const args of [[true, '0', 'card'], [-1, '0', 'card'], [1, '../file', 'card'], [1, '0', 'original'], [1, '0', 'card', 'private-users']]) {
        await assert.rejects(f.service.get(...args), error => error.status === 404);
    }
    assert.equal(f.calls.length, 0);
}));

test('all ORM image mutation methods update the content version even when updatedAt stays in the same second', () => {
    const hooks = versionedImageHooks();
    const first = { image: 'first', changed: key => key === 'image' }; hooks.beforeSave(first);
    const second = { image: 'second', changed: key => key === 'image' }; hooks.beforeSave(second);
    assert.notEqual(first.imageVersion, second.imageVersion);
    const bulk = [{ image: 'a' }, { image: 'b' }]; hooks.beforeBulkCreate(bulk); assert.equal(bulk[0].imageVersion, imageDigest('a'));
    const options = { attributes: { image: Buffer.from('new') } }; hooks.beforeBulkUpdate(options); assert.equal(options.attributes.imageVersion, imageDigest('new'));
    const upsert = { image: 'upsert' }; hooks.beforeUpsert(upsert); assert.equal(upsert.imageVersion, imageDigest('upsert'));
    const unchanged = { attributes: { caption: 'caption' } }; hooks.beforeBulkUpdate(unchanged); assert.equal(unchanged.attributes.imageVersion, undefined);
});
