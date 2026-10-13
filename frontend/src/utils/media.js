// JSON may reference backend-hosted media even when the storefront has a different origin.
export function resolveMediaImages(value, apiBaseUrl) {
    if (!value || typeof value !== 'object') return value;
    for (const [key, item] of Object.entries(value)) {
        if (key === 'image' && typeof item === 'string' && item.startsWith('/api/media/')) {
            value[key] = new URL(item, new URL(apiBaseUrl, window.location.origin)).href;
        } else if (item && typeof item === 'object') {
            resolveMediaImages(item, apiBaseUrl);
        }
    }
    return value;
}

export function productThumbnail(image) {
    return typeof image === 'string' && /\/api\/media\/product-images\/\d+\/(?:\d+|[a-f0-9]{64})\/detail$/.test(image)
        ? image.replace(/\/detail$/, '/card') : image;
}
