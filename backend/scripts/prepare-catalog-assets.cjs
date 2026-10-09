'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { loadCatalog, assetKey } = require('./catalog/catalog-format.cjs');
const directory = path.resolve(__dirname, '../../frontend/public/catalog');
const manifestPath = path.join(__dirname, 'catalog/assets.json');
function extension(bytes) {
  if (bytes.subarray(0, 3).toString('hex') === 'ffd8ff') return 'jpg';
  if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'png';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'webp';
  if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())) return 'gif';
  throw new Error('Unsupported image bytes');
}
async function prepare() {
  fs.mkdirSync(directory, { recursive: true });
  const urls = [...new Set(loadCatalog().flatMap(item => [...item.images.map(i => i.url), ...item.variants.map(v => v.imageUrl)]))];
  const old = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  const manifest = {};
  let index = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (index < urls.length) {
      const url = urls[index++];
      const previous = old[url];
      if (previous && /^\/catalog\/[a-f0-9]{24}\.(jpg|png|webp|gif)$/.test(previous)) {
        const file = path.join(directory, path.basename(previous));
        if (fs.existsSync(file)) { extension(fs.readFileSync(file)); manifest[url] = previous; continue; }
      }
      let lastError;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`HTTP ${response.status}: not an image`);
          const bytes = Buffer.from(await response.arrayBuffer());
          if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('Image size outside limit');
          const filename = `${assetKey(url)}.${extension(bytes)}`;
          fs.writeFileSync(path.join(directory, filename), bytes);
          manifest[url] = `/catalog/${filename}`;
          lastError = null;
          break;
        } catch (error) { lastError = error; }
      }
      if (lastError) throw new Error(`Could not prepare ${url}: ${lastError.message}`);
    }
  }));
  fs.writeFileSync(manifestPath, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 2) + '\n');
  console.log(JSON.stringify({ status: 'prepared', images: urls.length, directory }));
}
if (require.main === module) prepare().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { extension };
