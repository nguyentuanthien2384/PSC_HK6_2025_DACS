'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  loadCatalog, validateCatalog, sizesFor, assetKey, description, imagesFor, sellingPrice,
} = require('../scripts/catalog/catalog-format.cjs');
const { extension } = require('../scripts/prepare-catalog-assets.cjs');
const { products: fixtures } = require('../scripts/demo/catalog-data.cjs');

const catalog = loadCatalog();
const copy = value => structuredClone(value);
const validHttps = value => {
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.ok(url.hostname.includes('.'));
  assert.equal(url.username, '');
  assert.equal(url.password, '');
};

test('the 40 replacement records retain the correct category mapping for every fixture', () => {
  assert.equal(catalog.length, 40);
  assert.deepEqual(catalog.map(item => item.demoKey), fixtures.map(item => item.key));
  const counts = {};
  for (const item of catalog) {
    const fixture = fixtures.find(row => row.key === item.demoKey);
    assert.equal(item.categoryKey, fixture.categoryId.replace('DEMO_CAT_', ''), item.demoKey);
    assert.ok(!/\[DEMO\]/i.test(item.name), item.demoKey);
    assert.ok(!/^DEMO_/i.test(item.model), item.demoKey);
    assert.ok(item.summary.split(/\s+/).length >= 60, item.demoKey);
    counts[item.categoryKey] = (counts[item.categoryKey] || 0) + 1;
  }
  assert.deepEqual(counts, { TSHIRT: 5, SHIRT: 3, DENIM: 5, PANTS: 5, SHOES: 6, BAGS: 6, WATCH: 6, SPORT: 4 });
  assert.equal(new Set(catalog.map(item => `${item.brand}:${item.model}`)).size, 40);
});

test('every product retains a dated official source and valid supplemental references', () => {
  const officialHosts = new Set(['www.uniqlo.com', 'www.adidas.com.vn', 'www.converse.com', 'www.nike.com', 'juno.vn', 'www.vascara.com', 'www.casio.com']);
  for (const item of catalog) {
    assert.ok(officialHosts.has(new URL(item.source.url).hostname), item.demoKey);
    for (const source of [item.source, item.imageSource, item.sizeSource].filter(Boolean)) {
      validHttps(source.url);
      assert.ok(source.title?.trim(), item.demoKey);
      assert.equal(new Date(source.checkedAt).toISOString().slice(0, 10), source.checkedAt);
    }
    for (const image of item.images) validHttps(image.url);
  }
});

test('source sizes use real clothing, inch, footwear systems, and accessory labels', () => {
  for (const item of catalog) {
    const labels = sizesFor(item);
    assert.ok(Array.isArray(labels), item.demoKey);
    assert.equal(labels.length, new Set(labels).size, item.demoKey);
    assert.ok(labels.every(label => typeof label === 'string' && label.trim()), item.demoKey);
    if (item.categoryKey === 'DENIM' || item.demoKey === 'DEMO_P014') {
      assert.ok(labels.every(label => /^\d+inch$/.test(label)), item.demoKey);
    } else if (['SHOES', 'SPORT'].includes(item.categoryKey)) {
      assert.ok(labels.every(label => /^(UK|EU|US nam) \d+(\.5)?$/.test(label)), item.demoKey);
    } else if (['BAGS', 'WATCH'].includes(item.categoryKey)) {
      assert.deepEqual(labels, ['Freesize'], item.demoKey);
    } else {
      assert.ok(labels.every(label => /^(XXS|XS|S|M|L|XL|XXL|3XL)$/.test(label)), item.demoKey);
    }
  }
  assert.deepEqual(sizesFor({ sourceSizes: ['UK 7'], sizes: ['S'] }), ['UK 7']);
  assert.deepEqual(sizesFor({ sizes: ['Freesize'] }), ['Freesize']);
});

test('each variant keeps its matching color image without images from other selectable colors', () => {
  for (const item of catalog) {
    assert.deepEqual(item.variants.map(variant => variant.name), item.colors, item.demoKey);
    for (const variant of item.variants) {
      validHttps(variant.imageUrl);
      assert.ok(item.images.some(image => image.url === variant.imageUrl), `${item.demoKey}: ${variant.name}`);
      const images = imagesFor(item, variant);
      assert.equal(images[0].url, variant.imageUrl, `${item.demoKey}: ${variant.name}`);
      assert.equal(new Set(images.map(image => image.url)).size, images.length);
      if (item.variants.length > 1) assert.deepEqual(images.map(image => image.url), [variant.imageUrl]);
      else assert.deepEqual(new Set(images.map(image => image.url)), new Set(item.images.map(image => image.url)));
    }
  }
  const item = catalog.find(row => row.demoKey === 'DEMO_P001');
  const extra = { name: 'Màu bổ sung', imageUrl: 'https://example.com/verified-extra.jpg' };
  assert.equal(imagesFor(item, extra)[0].url, extra.imageUrl);
});

test('UNIQLO color variants and sizes match the metadata extracted from the source page', () => {
  const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, '../scripts/catalog/sourced-apparel-metadata.json'), 'utf8'));
  for (const source of metadata) {
    const item = catalog.find(row => row.demoKey === source.demoKey);
    assert.equal(item.model, source.model);
    assert.deepEqual(sizesFor(item), source.sourceSizes);
    for (const variant of item.variants) {
      assert.ok(source.colors.some(color => color.code === variant.sourceColorCode && color.name === variant.sourceColorName));
      assert.ok(source.images.some(image => image.sourceColorCode === variant.sourceColorCode && image.url === variant.imageUrl));
    }
  }
});

test('catalog validation refuses incomplete, duplicated, unsafe, or oversized records', () => {
  assert.throws(() => validateCatalog(catalog.slice(1)), /Expected 40/);
  const invalid = mutation => {
    const entries = copy(catalog);
    mutation(entries);
    return () => validateCatalog(entries);
  };
  assert.throws(invalid(entries => { entries[1].demoKey = entries[0].demoKey; }), /duplicate key/);
  assert.throws(invalid(entries => { entries[0].name = ''; }), /missing name/);
  assert.throws(invalid(entries => { entries[0].source.url = 'http://example.com/product'; }), /invalid source/);
  assert.throws(invalid(entries => { entries[0].variants[0].imageUrl = 'https://example.com/"unsafe'; }), /invalid variants/);
  assert.throws(invalid(entries => { entries[0].sourceSizes = ['S', 'S']; }), /invalid sizes/);
  assert.throws(invalid(entries => { entries[0].sourceSizes = []; }), /invalid sizes/);
  assert.throws(invalid(entries => { entries[0].sourceSizes = 'XL'; }), /invalid sizes/);
  assert.throws(invalid(entries => { entries[0].sourceSizes = [null]; }), /invalid sizes/);
  assert.throws(invalid(entries => { entries[0].sourceSizes = [' ']; }), /invalid sizes/);
  assert.throws(invalid(entries => { entries[0].material = 'x'.repeat(256); }), /database limit/);
});

test('descriptions escape HTML text and attributes while retaining source provenance', () => {
  const item = copy(catalog[0]);
  item.summary = '<img src=x onerror="alert(1)"> & \'quoted\'';
  item.features = ['<script>bad()</script>'];
  item.material = 'Cotton & "linen"';
  item.brand = '<unsafe brand>';
  item.specs = [{ label: '<label>', value: 'A & B' }];
  item.care = ['Do not use <bleach>'];
  item.source = { ...item.source, title: 'Official <page>', url: 'https://example.com/product?a=1&b=2' };
  const { contentHTML: html, contentMarkdown: markdown } = description(item);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quoted&#39;'));
  assert.ok(html.includes('Cotton &amp; &quot;linen&quot;'));
  assert.ok(html.includes('<td>&lt;label&gt;</td><td>A &amp; B</td>'));
  assert.ok(html.includes('href="https://example.com/product?a=1&amp;b=2"'));
  assert.ok(html.includes('target="_blank" rel="noopener noreferrer"'));
  assert.ok(markdown.includes('[catalog-key]: # "DEMO_P001"'));
  assert.ok(markdown.includes('09/10/2026'));
});

test('Markdown specification rows remain contiguous and escape pipes and multiline values', () => {
  const item = copy(catalog[0]);
  item.specs = [{ label: 'Label|extra', value: 'A|B\nC' }, { label: 'Mã mẫu', value: 'duplicate' }];
  const { contentMarkdown: markdown } = description(item);
  const block = markdown.split('## Thông số sản phẩm\n\n')[1].split('\n\n')[0];
  assert.deepEqual(block.split('\n'), [
    '| Thông tin | Chi tiết |', '| --- | --- |', '| Thương hiệu | UNIQLO |',
    '| Mã mẫu | E455365-000 |', '| Label\\|extra | A\\|B C |',
  ]);
  assert.ok(!markdown.includes('duplicate'));
});

test('selling prices use verified VND amounts and preserve project prices for USD or absent currency', () => {
  const fixture = fixtures.find(item => item.key === 'DEMO_P020');
  const usdItem = catalog.find(item => item.demoKey === 'DEMO_P020');
  assert.equal(usdItem.sourceCurrency, 'USD');
  assert.equal(sellingPrice(usdItem, fixture), fixture.variants[0].discountPrice);
  assert.notEqual(sellingPrice(usdItem, fixture), usdItem.sourcePrice);
  assert.equal(sellingPrice({ demoKey: 'test', sourceCurrency: 'VND', sourcePrice: 2600000 }, fixture), 2600000);
  assert.equal(sellingPrice({ demoKey: 'test' }, fixture), fixture.variants[0].discountPrice);
  for (const sourcePrice of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined]) {
    assert.throws(() => sellingPrice({ demoKey: 'test', sourceCurrency: 'VND', sourcePrice }, fixture), /Invalid VND selling price/);
  }
  for (const item of catalog) {
    const demo = fixtures.find(row => row.key === item.demoKey);
    assert.equal(sellingPrice(item, demo), item.sourceCurrency === 'VND' ? item.sourcePrice : demo.variants[0].discountPrice);
  }
});

test('asset names are stable per source URL and image extensions use magic bytes', () => {
  const a = assetKey('https://example.com/product-red.jpg');
  assert.match(a, /^[a-f0-9]{24}$/);
  assert.equal(assetKey('https://example.com/product-red.jpg'), a);
  assert.notEqual(assetKey('https://example.com/product-blue.jpg'), a);
  assert.equal(extension(Buffer.from('ffd8ffe000104a46494600', 'hex')), 'jpg');
  assert.equal(extension(Buffer.from('89504e470d0a1a0a0000000d', 'hex')), 'png');
  assert.equal(extension(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])), 'webp');
  assert.equal(extension(Buffer.from('GIF87a')), 'gif');
  assert.equal(extension(Buffer.from('GIF89a')), 'gif');
  for (const bytes of [Buffer.alloc(0), Buffer.from('<html>Access denied</html>'), Buffer.from('<svg></svg>'), Buffer.from('RIFF0000WAVE')]) {
    assert.throws(() => extension(bytes), /Unsupported image bytes/);
  }
});
