'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const db = require('../src/models');
const demo = require('./demo/catalog-data.cjs');
const { loadCatalog, sizesFor, imagesFor } = require('./catalog/catalog-format.cjs');
async function verify() {
  await db.sequelize.authenticate();
  const marker = await db.Allcode.findOne({ where: { code: 'SOURCED_CATALOG_V1' }, raw: true });
  assert.ok(marker && marker.value !== 'restored', 'Catalog has not been imported or was restored');
  let variants = 0, sizeCount = 0, images = 0;
  for (const item of loadCatalog()) {
    const mapping = await db.Allcode.findOne({ where: { code: `SOURCED_${item.demoKey.slice(5)}` }, raw: true });
    assert.ok(mapping, `Missing mapping ${item.demoKey}`);
    const [newId, oldId] = mapping.value.split(':');
    const current = await db.Product.findByPk(newId, { raw: true });
    const original = await db.Product.findByPk(oldId, { raw: true });
    assert.equal(current.name, item.name);
    assert.equal(current.statusId, 'S1');
    assert.equal(original.statusId, 'S2');
    assert.equal(original.name, `[DEMO] ${demo.products.find(p => p.key === item.demoKey).name}`);
    assert.ok(current.contentMarkdown.includes(item.source.url), `Missing source: ${item.name}`);
    assert.ok(current.contentMarkdown.includes(item.summary), `Missing description: ${item.name}`);
    const details = await db.ProductDetail.findAll({ where: { productId: newId }, raw: true });
    assert.equal(details.length, item.variants.length);
    for (const variant of item.variants) {
      const detail = details.find(d => d.nameDetail === variant.name);
      assert.ok(detail, `Missing color: ${variant.name}`);
      assert.equal(Number(detail.originalPrice), Number(detail.discountPrice), 'Unexpected invented discount');
      const options = await db.ProductDetailSize.findAll({ where: { productdetailId: detail.id }, raw: true });
      assert.equal(options.length, sizesFor(item).length);
      for (const option of options) {
        const code = await db.Allcode.findOne({ where: { code: option.sizeId, type: 'SIZE' }, raw: true });
        assert.ok(sizesFor(item).includes(code?.value), 'Size differs from source');
        assert.ok(!option.width && !option.height && !option.weight, 'Unverified size measurements');
      }
      const gallery = await db.ProductImage.findAll({ where: { productdetailId: detail.id }, raw: true });
      assert.equal(gallery.length, imagesFor(item, variant).length);
      for (const image of gallery) {
        const relative = Buffer.from(image.image).toString('utf8');
        assert.match(relative, /^\/catalog\/[a-f0-9]{24}\.(jpg|png|webp|gif)$/);
        assert.ok(fs.existsSync(path.resolve(__dirname, '../../frontend/public', relative.slice(1))), `Missing asset: ${relative}`);
      }
      variants++; sizeCount += options.length; images += gallery.length;
    }
  }
  return { status: 'verified', products: 40, variants, sizes: sizeCount, galleryImages: images, orders: await db.OrderProduct.count(), orderLines: await db.OrderDetail.count(), comments: await db.Comment.count(), message: 'Source descriptions, variants, sizes and local images match; original demo names and historical records remain.' };
}
verify().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.sequelize.close());
