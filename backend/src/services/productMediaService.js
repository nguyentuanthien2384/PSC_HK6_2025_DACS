const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const sharp = require('sharp');
const { productImageUrl, contentImageUrl, imageVersion, imageDigest } = require('../utils/productImage');

sharp.concurrency(1);
sharp.cache({ memory: 32, files: 0, items: 32 });
const variants = { card: { width: 480, height: 600, quality: 78 }, detail: { width: 1280, height: 1600, quality: 84 }, banner: { width: 1600, height: 900, quality: 82 } };
const models = { 'product-images': 'ProductImage', 'banner-images': 'Banner', 'blog-images': 'Blog' };
const filePattern = /^(?:product|banner|blog)-images-\d+-(?:[a-f0-9]{64}|\d{1,16})-(?:card|detail|banner)-v1\.webp$/;
const mediaError = (status, message) => Object.assign(new Error(message), { status });

function createProductMediaService(db, options = {}) {
    const publicDir = path.resolve(options.publicDir || path.join(__dirname, '../../../frontend/public'));
    const cacheDir = path.resolve(options.cacheDir || path.join(__dirname, '../../.cache/product-media'));
    const memory = new Map(), pending = new Map(), queue = [];
    const encode = options.encode || (async (source, variant) => sharp(source, { limitInputPixels: 40_000_000, failOn: 'error' })
        .rotate().resize({ width: variants[variant].width, height: variants[variant].height, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: variants[variant].quality, effort: 3 }).timeout({ seconds: 10 }).toBuffer());
    let memoryBytes = 0, active = 0, pruneTimer;
    const memoryLimit = 16 * 1024 * 1024;
    function remember(key, value) {
        if (memory.has(key)) memoryBytes -= memory.get(key).body.length;
        memory.delete(key); memory.set(key, value); memoryBytes += value.body.length;
        while (memoryBytes > memoryLimit || memory.size > 128) {
            const oldest = memory.keys().next().value;
            memoryBytes -= memory.get(oldest).body.length; memory.delete(oldest);
        }
        return value;
    }
    async function limited(work) {
        if (active >= 2) {
            if (queue.length >= 30) throw mediaError(503, 'Ảnh đang được xử lý. Vui lòng tải lại.');
            await new Promise(resolve => queue.push(resolve));
        } else active++;
        try { return await work(); }
        finally { if (queue.length) queue.shift()(); else active--; }
    }
    async function sourceBuffer(value) {
        const stored = Buffer.isBuffer(value) ? value : Buffer.from(value || '');
        if (!stored.length || stored.length > 24 * 1024 * 1024) throw mediaError(404, 'Ảnh không khả dụng.');
        const prefix = stored.subarray(0, 64).toString('utf8');
        if (prefix.startsWith('data:')) {
            const match = /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,([a-z\d+/=\r\n]+)$/i.exec(stored.toString('utf8'));
            if (!match) throw mediaError(404, 'Ảnh không hợp lệ.');
            return Buffer.from(match[1], 'base64');
        }
        if (prefix.startsWith('/')) {
            const asset = stored.toString('utf8');
            if (!/^\/(?:catalog|resources)\/[a-z\d/_.-]+\.(?:png|jpe?g|webp|gif|avif)$/i.test(asset)) throw mediaError(404, 'Ảnh không khả dụng.');
            const source = path.resolve(publicDir, '.' + asset);
            if (!source.startsWith(publicDir + path.sep)) throw mediaError(404, 'Ảnh không khả dụng.');
            const info = await fs.stat(source).catch(() => null);
            if (!info?.isFile() || info.size > 24 * 1024 * 1024) throw mediaError(404, 'Ảnh không khả dụng.');
            return fs.readFile(source);
        }
        // Binary uploads are supported too. Never fetch URLs from stored image data.
        return stored;
    }
    async function prune() {
        const entries = await fs.readdir(cacheDir).catch(() => []);
        const files = await Promise.all(entries.filter(name => filePattern.test(name)).map(async name => {
            const info = await fs.stat(path.join(cacheDir, name)).catch(() => null);
            return info?.isFile() ? { name, size: info.size, time: info.mtimeMs } : null;
        }));
        const sorted = files.filter(Boolean).sort((a, b) => b.time - a.time);
        let bytes = 0;
        for (let index = 0; index < sorted.length; index++) {
            bytes += sorted[index].size;
            if (index >= 1000 || bytes > 128 * 1024 * 1024) await fs.unlink(path.join(cacheDir, sorted[index].name)).catch(() => {});
        }
    }
    function schedulePrune() {
        if (pruneTimer) return;
        pruneTimer = setTimeout(() => { pruneTimer = null; prune().catch(() => {}); }, 3000);
        pruneTimer.unref();
    }
    async function load(id, version, variant, type) {
        const filename = `${type}-${id}-${version}-${variant}-v1.webp`;
        if (memory.has(filename)) {
            const cached = memory.get(filename); memory.delete(filename); memory.set(filename, cached); return cached;
        }
        if (pending.has(filename)) return pending.get(filename);
        const task = limited(async () => {
            let body = await fs.readFile(path.join(cacheDir, filename)).catch(() => null);
            if (!body) {
                const row = await db[models[type]].findOne({ where: { id }, attributes: ['id', 'image', 'imageVersion', 'updatedAt'], raw: true });
                if (!row) throw mediaError(404, 'Không tìm thấy ảnh.');
                if (imageVersion(row) !== version) return { redirect: type === 'product-images' ? productImageUrl(row, variant) : contentImageUrl(row, type.replace('-images', ''), variant) };
                const source = await sourceBuffer(row.image);
                try { body = await encode(source, variant); }
                catch { throw mediaError(404, 'Ảnh không hợp lệ.'); }
                // An unwritable cache must not stop the product image from loading.
                try {
                    await fs.mkdir(cacheDir, { recursive: true });
                    const temporary = path.join(cacheDir, `${filename}.${randomUUID()}.tmp`);
                    try {
                        await fs.writeFile(temporary, body, { flag: 'wx' });
                        await fs.rename(temporary, path.join(cacheDir, filename));
                    } finally { await fs.unlink(temporary).catch(() => {}); }
                    schedulePrune();
                } catch (_) { /* Memory/browser cache still works. */ }
            }
            return remember(filename, { body, etag: `"${imageDigest(body)}"`, contentType: 'image/webp' });
        });
        pending.set(filename, task);
        try { return await task; } finally { pending.delete(filename); }
    }
    async function get(id, version, variant, type = 'product-images') {
        if (!Object.hasOwn(models, type) || !/^\d{1,10}$/.test(String(id)) || Number(id) <= 0 || !/^(?:[a-f0-9]{64}|\d{1,16})$/.test(String(version)) || !Object.hasOwn(variants, variant)) {
            throw mediaError(404, 'Không tìm thấy ảnh.');
        }
        return load(Number(id), String(version), variant, type);
    }
    return { get };
}
module.exports = { createProductMediaService };
