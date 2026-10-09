'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function loadCatalog() {
  const entries = ['apparel', 'footwear', 'accessories'].flatMap(group => JSON.parse(fs.readFileSync(path.join(__dirname, `sourced-${group}.json`), 'utf8')));
  validateCatalog(entries);
  return entries.sort((a, b) => a.demoKey.localeCompare(b.demoKey));
}
const httpsUrl = value => typeof value === 'string' && /^https:\/\//.test(value) && !/[\s<>"\\]/.test(value);
const sizesFor = item => item.sourceSizes || item.sizes;
function validateCatalog(entries) {
  if (entries.length !== 40) throw new Error('Expected 40 sourced products.');
  const keys = new Set();
  for (const item of entries) {
    if (!/^DEMO_P0(?:0[1-9]|[1-3][0-9]|40)$/.test(item.demoKey) || keys.has(item.demoKey)) throw new Error(`Invalid or duplicate key: ${item.demoKey}`);
    keys.add(item.demoKey);
    for (const field of ['name', 'brand', 'model', 'summary', 'material', 'categoryKey']) {
      if (typeof item[field] !== 'string' || !item[field].trim()) throw new Error(`${item.demoKey}: missing ${field}`);
    }
    if (!httpsUrl(item.source?.url) || !/^\d{4}-\d{2}-\d{2}$/.test(item.source?.checkedAt)) throw new Error(`${item.demoKey}: invalid source`);
    if (!Array.isArray(item.variants) || !item.variants.length || item.variants.some(v => !v.name || !httpsUrl(v.imageUrl))) throw new Error(`${item.demoKey}: invalid variants`);
    const labels = sizesFor(item);
    if (!Array.isArray(labels) || !labels.length || labels.some(label => typeof label !== 'string' || !label.trim() || label.length > 255) || new Set(labels).size !== labels.length) throw new Error(`${item.demoKey}: invalid sizes`);
    if (!Array.isArray(item.images) || !item.images.length || item.images.some(i => !httpsUrl(i.url))) throw new Error(`${item.demoKey}: invalid images`);
    if (item.material.length > 255 || (item.madeby || '').length > 255 || item.name.length > 255) throw new Error(`${item.demoKey}: field exceeds database limit`);
  }
  return entries;
}
const assetKey = url => crypto.createHash('sha256').update(url).digest('hex').slice(0, 24);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const escapeMarkdown = value => String(value ?? '').replace(/([\\`*_{}\[\]<>])/g, '\\$1').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
function description(item) {
  const specs = [{ label: 'Thương hiệu', value: item.brand }, { label: 'Mã mẫu', value: item.model }, ...(item.specs || []).filter(s => !/^(Mã mẫu|Mã sản phẩm)$/.test(s.label))];
  const sources = [{ ...item.source, label: 'Thông tin sản phẩm' }, ...(item.imageSource ? [{ ...item.imageSource, label: 'Ảnh sản phẩm' }] : []), ...(item.sizeSource ? [{ ...item.sizeSource, label: 'Kích cỡ' }] : [])];
  const markdown = [`## Giới thiệu sản phẩm`, escapeMarkdown(item.summary), `## Đặc điểm nổi bật`, (item.features || []).map(f => `- ${escapeMarkdown(f)}`).join('\n'), `## Chất liệu`, escapeMarkdown(item.material), `## Thông số sản phẩm`, ['| Thông tin | Chi tiết |', '| --- | --- |', ...specs.map(s => `| ${escapeMarkdown(s.label)} | ${escapeMarkdown(s.value)} |`)].join('\n'), ...(item.madeby ? [`Xuất xứ được hãng công bố: ${escapeMarkdown(item.madeby)}.`] : []), ...(item.care?.length ? ['## Hướng dẫn chăm sóc', item.care.map(c => `- ${escapeMarkdown(c)}`).join('\n')] : []), '## Nguồn tham khảo', sources.map(s => `- ${s.label}: [${escapeMarkdown(s.title || s.label)}](${s.url})`).join('\n'), `Thông tin được đối chiếu ngày ${item.source.checkedAt.split('-').reverse().join('/')}.`, `[catalog-key]: # "${item.demoKey}"`].join('\n\n');
  const list = values => `<ul>${values.map(v => `<li>${escapeHtml(v)}</li>`).join('')}</ul>`;
  const html = `<h2>Giới thiệu sản phẩm</h2><p>${escapeHtml(item.summary)}</p><h2>Đặc điểm nổi bật</h2>${list(item.features || [])}<h2>Chất liệu</h2><p>${escapeHtml(item.material)}</p><h2>Thông số sản phẩm</h2><table><thead><tr><th>Thông tin</th><th>Chi tiết</th></tr></thead><tbody>${specs.map(s => `<tr><td>${escapeHtml(s.label)}</td><td>${escapeHtml(s.value)}</td></tr>`).join('')}</tbody></table>${item.madeby ? `<p>Xuất xứ được hãng công bố: ${escapeHtml(item.madeby)}.</p>` : ''}${item.care?.length ? `<h2>Hướng dẫn chăm sóc</h2>${list(item.care)}` : ''}<h2>Nguồn tham khảo</h2><ul>${sources.map(s => `<li>${s.label}: <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title || s.label)}</a></li>`).join('')}</ul><p>Thông tin được đối chiếu ngày ${item.source.checkedAt.split('-').reverse().join('/')}.</p>`;
  return { contentMarkdown: markdown, contentHTML: html };
}
function imagesFor(item, variant) {
  const primary = item.images.find(i => i.url === variant.imageUrl) || { url: variant.imageUrl, caption: `${item.name} — ${variant.name}` };
  return item.variants.length === 1 ? [primary, ...item.images.filter(i => i.url !== primary.url)] : [primary];
}
function sellingPrice(item, demo) {
  const amount = item.sourceCurrency === 'VND' ? item.sourcePrice : demo.variants[0].discountPrice;
  if (!Number.isSafeInteger(Number(amount)) || Number(amount) <= 0) throw new Error(`Invalid VND selling price: ${item.demoKey}`);
  return Number(amount);
}
module.exports = { loadCatalog, validateCatalog, sizesFor, assetKey, description, imagesFor, sellingPrice };
