import { renderProductDescription, sanitizeProductHtml } from './productDescription';

const parse = (html) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    return container;
};

test('legacy descriptions keep readable content while removing active embedded content', () => {
    const html = sanitizeProductHtml(`
        <div class="old-editor"><h3>Thông tin sản phẩm</h3>
            <p>Chất liệu <strong>canvas</strong>.</p>
            <script>alert('script')</script><style>body { display: none; }</style>
            <iframe src="https://example.com">iframe content</iframe>
            <object data="payload">object content</object><embed src="payload">
            <svg><a href="javascript:alert(1)"><text>svg content</text></a></svg>
            <math><mtext>math content</mtext></math>
            <form><input autofocus onfocus="alert(1)"><button>Submit</button></form>
            <template><p>template content</p></template><!-- hidden comment -->
        </div>`);
    const result = parse(html);

    expect(result.querySelector('h3')).toHaveTextContent('Thông tin sản phẩm');
    expect(result.querySelector('strong')).toHaveTextContent('canvas');
    expect(result.textContent).not.toMatch(/script|iframe content|object content|svg content|math content|Submit|template content/);
    expect(result.querySelector('script, style, iframe, object, embed, svg, math, form, input, button, template')).toBeNull();
    expect(html).not.toContain('<!--');
});

test('event handlers, styling and untrusted attributes cannot survive on retained elements', () => {
    const result = parse(sanitizeProductHtml(`
        <p id="x" class="editor" style="background:url(javascript:alert(1))" onclick="alert(1)">
            <strong onmouseover="alert(1)" data-html="payload">Mô tả</strong>
            <img src="broken" onerror="alert(1)">
            <a href="https://juno.vn/products/example" onclick="alert(1)"
               target="_self" rel="opener" download="file">Nguồn hãng</a>
        </p>`));

    expect(result.querySelector('p').attributes).toHaveLength(0);
    expect(result.querySelector('strong').attributes).toHaveLength(0);
    expect(result.querySelector('img')).toBeNull();
    const link = result.querySelector('a');
    expect(link.getAttribute('href')).toBe('https://juno.vn/products/example');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(Array.from(link.attributes, ({ name }) => name).sort()).toEqual(['href', 'rel', 'target']);
});

test.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)',
    'java&#x73;cript:alert(1)',
    'java&#x09;script:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '//example.com/payload',
])('unsafe link destination %s loses its href without losing the link label', (destination) => {
    const result = parse(sanitizeProductHtml(`<a href="${destination}">Xem nguồn</a>`));
    const link = result.querySelector('a');

    expect(link).toHaveTextContent('Xem nguồn');
    expect(link.hasAttribute('href')).toBe(false);
    expect(link.hasAttribute('target')).toBe(false);
});

test('official HTTPS source links are retained with protections and fragment links stay local', () => {
    const source = 'https://www.casio.com/intl/watches/casio/product.F-91W-1/';
    const result = parse(sanitizeProductHtml(`
        <p><a href="  ${source}  ">Casio</a><a href="#thong-so">Thông số</a></p>`));
    const [officialLink, fragmentLink] = result.querySelectorAll('a');

    expect(officialLink.getAttribute('href')).toBe(source);
    expect(officialLink.getAttribute('target')).toBe('_blank');
    expect(officialLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(fragmentLink.getAttribute('href')).toBe('#thong-so');
    expect(fragmentLink.hasAttribute('target')).toBe(false);
});

test('surrounding whitespace does not turn a local section link into a new-tab link', () => {
    const result = parse(sanitizeProductHtml('<a href="  #thong-so  ">Thông số</a>'));
    const link = result.querySelector('a');

    expect(link.getAttribute('href')).toBe('#thong-so');
    expect(link.hasAttribute('target')).toBe(false);
    expect(link.hasAttribute('rel')).toBe(false);
});

test('Markdown product details render headings, lists, specifications and attributed source links', () => {
    const result = parse(renderProductDescription({ markdown: `
## Thông tin sản phẩm

Túi **canvas** có khóa kéo.

- Một ngăn lớn
- Một ngăn nhỏ

| Thông số | Giá trị |
| --- | --- |
| Kích thước | 37 × 14,7 × 25,2 cm |

[Vascara](https://www.vascara.com/tui-xach-lon/tui-canvas-hoa-tiet-bong-chay-tot-0168-mau-be)
` }));

    expect(result.querySelector('h2')).toHaveTextContent('Thông tin sản phẩm');
    expect(result.querySelector('strong')).toHaveTextContent('canvas');
    expect(result.querySelectorAll('li')).toHaveLength(2);
    expect(result.querySelector('table')).toHaveTextContent('37 × 14,7 × 25,2 cm');
    const source = result.querySelector('a');
    expect(source).toHaveTextContent('Vascara');
    expect(source.getAttribute('href')).toContain('https://www.vascara.com/');
    expect(source.getAttribute('rel')).toBe('noopener noreferrer');
});

test('raw HTML inside Markdown remains literal text rather than executable markup', () => {
    const result = parse(renderProductDescription({
        markdown: '<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n<strong>Raw HTML</strong>',
    }));

    expect(result.querySelector('script, img, strong')).toBeNull();
    expect(result.textContent).toContain('<script>alert(1)</script>');
    expect(result.textContent).toContain('<img src="x" onerror="alert(1)">');
    expect(result.textContent).toContain('<strong>Raw HTML</strong>');
});

test('unsafe Markdown links cannot introduce an executable anchor', () => {
    const result = parse(renderProductDescription({
        markdown: '[Tên sản phẩm](javascript:alert(1))\n\n[Payload](data:text/html;base64,PHNjcmlwdD4=)',
    }));

    expect(result.querySelector('a')).toBeNull();
    expect(result.textContent).toContain('Tên sản phẩm');
});

test('Markdown takes precedence and a blank Markdown value falls back to sanitized legacy HTML', () => {
    const legacyHtml = '<div><h3>Chi tiết cũ</h3><p><b>Da tổng hợp</b></p><script>alert(1)</script></div>';
    const preferred = parse(renderProductDescription({ markdown: '## Chi tiết mới', html: legacyHtml }));
    expect(preferred.querySelector('h2')).toHaveTextContent('Chi tiết mới');
    expect(preferred.textContent).not.toContain('Chi tiết cũ');

    const fallback = parse(renderProductDescription({ markdown: ' \n\t ', html: legacyHtml }));
    expect(fallback.querySelector('h3')).toHaveTextContent('Chi tiết cũ');
    expect(fallback.querySelector('b')).toHaveTextContent('Da tổng hợp');
    expect(fallback.querySelector('div, script')).toBeNull();
});

test('products with no description render an empty string', () => {
    expect(renderProductDescription()).toBe('');
    expect(renderProductDescription({ markdown: '', html: null })).toBe('');
    expect(sanitizeProductHtml(undefined)).toBe('');
});
