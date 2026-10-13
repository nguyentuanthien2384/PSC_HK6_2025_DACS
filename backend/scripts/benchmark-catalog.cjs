// Read-only listing requests. Image bytes are measured separately from lightweight JSON.
const { performance } = require('node:perf_hooks');
const zlib = require('node:zlib');
const base = (process.env.BENCHMARK_API_URL || 'http://127.0.0.1:6969').replace(/\/$/, '');
const endpoints = [
    ['shop6', '/api/get-all-product-user?limit=6&offset=0'],
    ['shop12', '/api/get-all-product-user?limit=12&offset=0'],
    ['featured6', '/api/get-product-feature?limit=6'],
    ['new8', '/api/get-product-new?limit=8'],
    ['banner6', '/api/get-all-banner?limit=6&offset=0'],
    ['blog3', '/api/get-new-blog?limit=3'],
];
function images(value, found = new Set()) {
    if (!value || typeof value !== 'object') return found;
    for (const [key, item] of Object.entries(value)) {
        if (key === 'image' && typeof item === 'string' && item.startsWith('/api/media/')) found.add(item);
        else if (item && typeof item === 'object') images(item, found);
    }
    return found;
}
(async () => {
    for (const [name, endpoint] of endpoints) {
        const start = performance.now();
        const response = await fetch(base + endpoint);
        const buffer = Buffer.from(await response.arrayBuffer());
        const elapsed = performance.now() - start;
        const body = JSON.parse(buffer);
        if (!response.ok || body.errCode !== 0) throw new Error(`${name} failed: HTTP ${response.status}`);
        let imageBytes = 0, imageCount = 0, notModified = 0;
        for (const image of images(body)) {
            const imageResponse = await fetch(new URL(image, base));
            if (!imageResponse.ok) throw new Error(`${name} image failed: HTTP ${imageResponse.status}`);
            imageBytes += (await imageResponse.arrayBuffer()).byteLength; imageCount++;
            const cached = await fetch(new URL(image, base), { headers: { 'If-None-Match': imageResponse.headers.get('etag'), 'Cache-Control': 'max-age=0' } });
            if (cached.status === 304) notModified++;
        }
        console.log(JSON.stringify({ name, jsonBytes: buffer.length, jsonGzipBytes: zlib.gzipSync(buffer).length,
            apiMs: Number(elapsed.toFixed(1)), uniqueImages: imageCount, coldImageBytes: imageBytes, cached304: notModified }));
    }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
