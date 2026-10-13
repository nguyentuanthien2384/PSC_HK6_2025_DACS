const crypto = require('crypto');

function imageVersion(row) {
    if (/^[a-f0-9]{64}$/.test(row?.imageVersion || '')) return row.imageVersion;
    const timestamp = new Date(row?.updatedAt || 0).getTime();
    return String(Number.isFinite(timestamp) ? timestamp : 0);
}
function productImageUrl(row, variant = 'card') {
    if (!row || !Number.isSafeInteger(Number(row.id)) || Number(row.id) <= 0) return '';
    if (!['card', 'detail'].includes(variant)) throw new Error('Unsupported product image variant');
    return `/api/media/product-images/${row.id}/${imageVersion(row)}/${variant}`;
}
function imageDigest(value) {
    return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : Buffer.from(value || '')).digest('hex');
}
function contentImageUrl(row, type, variant = type === 'banner' ? 'banner' : 'card') {
    if (!['banner', 'blog'].includes(type) || !row || !Number.isSafeInteger(Number(row.id)) || Number(row.id) <= 0) return '';
    return `/api/media/${type}-images/${row.id}/${imageVersion(row)}/${variant}`;
}
function versionedImageHooks() {
    return {
        beforeSave(instance) { if (instance.changed('image')) instance.imageVersion = imageDigest(instance.image); },
        beforeBulkCreate(instances) { for (const instance of instances) instance.imageVersion = imageDigest(instance.image); },
        beforeBulkUpdate(options) {
            if (Object.prototype.hasOwnProperty.call(options.attributes, 'image')) options.attributes.imageVersion = imageDigest(options.attributes.image);
        },
        beforeUpsert(values) {
            if (Object.prototype.hasOwnProperty.call(values, 'image')) values.imageVersion = imageDigest(values.image);
        }
    };
}
module.exports = { productImageUrl, contentImageUrl, imageVersion, imageDigest, versionedImageHooks };
