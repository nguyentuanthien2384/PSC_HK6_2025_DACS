import { productThumbnail, resolveMediaImages } from './media';

test('backend media images work across storefront and API origins throughout catalog and order data', () => {
    const value = { data: [{ productDetail: [{ productImage: [{ image: '/api/media/product-images/1/version/card' }] }] }], avatar: '/api/media/private', image: '/api/media/banner-images/2/version/banner' };
    expect(resolveMediaImages(value, 'http://localhost:6969')).toEqual({ data: [{ productDetail: [{ productImage: [{ image: 'http://localhost:6969/api/media/product-images/1/version/card' }] }] }], avatar: '/api/media/private', image: 'http://localhost:6969/api/media/banner-images/2/version/banner' });
});

test('only versioned product gallery images use smaller thumbnails while main and other media sources are retained', () => {
    expect(productThumbnail('http://localhost:6969/api/media/product-images/1/123456/detail')).toBe('http://localhost:6969/api/media/product-images/1/123456/card');
    expect(productThumbnail(`/api/media/product-images/1/${'a'.repeat(64)}/detail`)).toBe(`/api/media/product-images/1/${'a'.repeat(64)}/card`);
    for (const image of ['https://example.com/detail', '/api/media/blog-images/1/123/detail', 'data:image/png;base64,AA==', null]) expect(productThumbnail(image)).toBe(image);
});

test('existing data, external and normal local image URLs retain their original value', () => {
    for (const image of ['data:image/png;base64,AA==', 'https://images.example/a.png', '/resources/logo.png', '//untrusted/api/media/file', null]) {
        expect(resolveMediaImages({ image }, 'http://localhost:6969')).toEqual({ image });
    }
    expect(resolveMediaImages(undefined, 'http://localhost:6969')).toBeUndefined();
});

test('seller image previews resolve to the API origin while original editor image data is preserved', () => {
    const value = { data: [{ image: '/api/media/product-images/2/version/card', previewImage: '/api/media/product-images/2/version/detail' }], editor: { image: 'data:image/png;base64,AA==' } };
    resolveMediaImages(value, 'http://localhost:6969');
    expect(value.data[0].previewImage).toBe('http://localhost:6969/api/media/product-images/2/version/detail');
    expect(value.data[0].image).toBe('http://localhost:6969/api/media/product-images/2/version/card');
    expect(value.editor.image).toBe('data:image/png;base64,AA==');
});
