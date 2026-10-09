'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('../src/models');
const demo = require('./demo/catalog-data.cjs');
const { loadCatalog, sizesFor, description, imagesFor, sellingPrice } = require('./catalog/catalog-format.cjs');
const markerCode = 'SOURCED_CATALOG_V1';
const markerFor = key => `SOURCED_${key.slice(5)}`;
const journalPath = path.resolve(__dirname, '../../.tmp/sourced-catalog-v1.json');
const assetDirectory = path.resolve(__dirname, '../../frontend/public');

async function reference(type, value, transaction) {
  const existing = await db.Allcode.findOne({ where: { type, value }, transaction });
  if (existing) return existing.code;
  const code = `CATALOG_${type}_${crypto.createHash('sha256').update(value).digest('hex').slice(0, 14)}`;
  await db.Allcode.create({ type, value, code }, { transaction });
  return code;
}
async function withLock(work) {
  await db.sequelize.authenticate();
  const connection = await db.sequelize.connectionManager.getConnection({ type: 'WRITE' });
  let acquired = false;
  try {
    const [[row]] = await connection.promise().query('SELECT GET_LOCK(?, 10) AS acquired', ['dacs-sourced-catalog-v1']);
    if (Number(row.acquired) !== 1) throw new Error('Another catalog import is running.');
    acquired = true;
    return await work();
  } finally {
    if (acquired) await connection.promise().query('SELECT RELEASE_LOCK(?)', ['dacs-sourced-catalog-v1']);
    await db.sequelize.connectionManager.releaseConnection(connection);
  }
}
async function importCatalog({ dryRun = false, fixtureInventory = false } = {}) {
  if (fixtureInventory && process.env.NODE_ENV === 'production') throw new Error('Fixture inventory is disabled in production.');
  const catalog = loadCatalog();
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog/assets.json'), 'utf8'));
  const asset = url => {
    const relative = manifest[url];
    if (!/^\/catalog\/[a-f0-9]{24}\.(jpg|png|webp|gif)$/.test(relative || '') || !fs.existsSync(path.join(assetDirectory, relative.slice(1)))) throw new Error(`Missing prepared image: ${url}`);
    return relative;
  };
  for (const item of catalog) for (const variant of item.variants) for (const image of imagesFor(item, variant)) asset(image.url);
  return withLock(async () => {
    const marker = await db.Allcode.findOne({ where: { code: markerCode }, raw: true });
    if (marker) return { status: marker.value === 'restored' ? 'already-restored' : 'already-imported', message: 'Existing catalog was preserved; nothing changed.' };
    const plan = [];
    for (const item of catalog) {
      const fixture = demo.products.find(p => p.key === item.demoKey);
      if (!fixture) throw new Error(`Missing demo mapping: ${item.demoKey}`);
      const old = await db.Product.findAll({ where: { name: `[DEMO] ${fixture.name}` }, raw: true });
      if (old.length !== 1) throw new Error(`Expected exactly one original demo product for ${item.demoKey}; found ${old.length}. No data changed.`);
      if (!await db.Allcode.findOne({ where: { code: fixture.categoryId, type: 'CATEGORY' } })) throw new Error(`Missing category: ${fixture.categoryId}`);
      plan.push({ item, fixture, old: old[0], price: sellingPrice(item, fixture) });
    }
    if (dryRun) return { status: 'ready', products: plan.length, variants: plan.reduce((sum, p) => sum + p.item.variants.length, 0), images: Object.keys(manifest).length, fixtureInventory, message: 'Validated source records, assets and original demo mappings. No data changed.' };
    const admin = fixtureInventory ? await db.User.findOne({ where: { roleId: 'R1' }, raw: true }) : null;
    if (fixtureInventory && !admin) throw new Error('Fixture receipts need an existing administrator.');
    fs.mkdirSync(path.dirname(journalPath), { recursive: true });
    return db.sequelize.transaction(async transaction => {
      const journal = { importedAt: new Date().toISOString(), fixtureInventory, pricePolicy: 'Verified VND source price when available; otherwise existing project selling price. No USD conversion and no invented discounts.', products: [] };
      let receipt;
      if (fixtureInventory) {
        const supplier = await db.Supplier.create({ name: '[Test] Tồn kho danh mục có nguồn', address: 'Dữ liệu kiểm thử nội bộ; không phải nhà phân phối của hãng', phonenumber: '', email: '' }, { transaction });
        receipt = await db.Receipt.create({ userId: admin.id, supplierId: supplier.id }, { transaction });
      }
      let variants = 0, sizes = 0;
      for (const { item, fixture, old, price } of plan) {
        const brandId = await reference('BRAND', item.brand, transaction);
        const product = await db.Product.create({ name: item.name, ...description(item), statusId: 'S1', categoryId: fixture.categoryId, brandId, view: 0, material: item.material, madeby: item.madeby || '' }, { transaction });
        for (const variant of item.variants) {
          const detail = await db.ProductDetail.create({ productId: product.id, nameDetail: variant.name, originalPrice: price, discountPrice: price, description: item.summary }, { transaction });
          variants++;
          for (const image of imagesFor(item, variant)) await db.ProductImage.create({ productdetailId: detail.id, image: asset(image.url), caption: image.caption }, { transaction });
          for (const label of sizesFor(item)) {
            const sizeId = await reference('SIZE', label, transaction);
            const size = await db.ProductDetailSize.create({ productdetailId: detail.id, sizeId, width: '', height: '', weight: '' }, { transaction });
            sizes++;
            // Explicit local test stock, never presented as manufacturer stock.
            const quantity = fixture.stockScenario === 'out-of-stock' ? 0 : fixture.stockScenario === 'low-stock' ? 2 : 12;
            if (receipt && quantity > 0) await db.ReceiptDetail.create({ receiptId: receipt.id, productDetailSizeId: size.id, quantity, price: 0 }, { transaction });
          }
        }
        await db.Product.update({ statusId: 'S2' }, { where: { id: old.id }, transaction });
        await db.Allcode.create({ code: markerFor(item.demoKey), type: 'CATALOG-METADATA', value: `${product.id}:${old.id}:${old.statusId}` }, { transaction });
        journal.products.push({ key: item.demoKey, sourceUrl: item.source.url, oldId: old.id, oldStatus: old.statusId, newId: product.id, name: item.name, price, priceSource: item.sourceCurrency === 'VND' ? 'verified-source' : 'project-configuration' });
      }
      await db.Allcode.create({ code: markerCode, type: 'CATALOG-METADATA', value: journal.importedAt }, { transaction });
      // Keep the mapping before commit; the database marker remains the authority.
      fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n');
      return { status: 'imported', products: plan.length, variants, sizes, archivedDemoProducts: plan.length, fixtureInventory, journalPath };
    });
  });
}
async function restoreCatalog() {
  return withLock(() => db.sequelize.transaction(async transaction => {
    const marker = await db.Allcode.findOne({ where: { code: markerCode }, transaction });
    if (!marker || marker.value === 'restored') return { status: 'nothing-to-restore' };
    const mappings = await db.Allcode.findAll({ where: { type: 'CATALOG-METADATA' }, transaction });
    const entries = mappings.filter(row => /^SOURCED_P\d{3}$/.test(row.code));
    if (entries.length !== 40) throw new Error('Incomplete catalog mapping; restore aborted.');
    for (const row of entries) {
      const [newId, oldId, oldStatus] = row.value.split(':');
      const current = await db.Product.findByPk(newId, { transaction });
      const original = await db.Product.findByPk(oldId, { transaction });
      if (!current || !original || !original.name.startsWith('[DEMO] ') || !['S1', 'S2'].includes(oldStatus)) throw new Error(`Invalid restore mapping: ${row.code}`);
      await current.update({ statusId: 'S2' }, { transaction });
      await original.update({ statusId: oldStatus }, { transaction });
    }
    await marker.update({ value: 'restored' }, { transaction });
    return { status: 'restored', products: entries.length, message: 'Original catalog statuses restored. Orders, reviews and new catalog records retained.' };
  }));
}
if (require.main === module) {
  const args = process.argv.slice(2);
  const work = args.includes('--restore') ? restoreCatalog() : importCatalog({ dryRun: args.includes('--dry-run'), fixtureInventory: args.includes('--fixture-inventory') });
  work.then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.sequelize.close());
}
module.exports = { importCatalog, restoreCatalog };
