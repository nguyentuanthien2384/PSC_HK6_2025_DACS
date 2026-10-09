import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: false, linkify: false, breaks: true });
const allowedTags = new Set(['P', 'BR', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'BLOCKQUOTE', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'A', 'CODE', 'PRE']);
const blockedTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'TEMPLATE', 'NOSCRIPT']);

export function sanitizeProductHtml(value) {
    const document = new DOMParser().parseFromString(String(value || ''), 'text/html');
    const clean = (parent) => {
        Array.from(parent.childNodes).forEach((node) => {
            if (node.nodeType === 8) { node.remove(); return; }
            if (node.nodeType !== 1) return;
            const tagName = node.tagName.toUpperCase();
            if (blockedTags.has(tagName)) { node.remove(); return; }
            clean(node);
            if (!allowedTags.has(tagName)) {
                node.replaceWith(...Array.from(node.childNodes));
                return;
            }
            const href = tagName === 'A' ? node.getAttribute('href')?.trim() : null;
            Array.from(node.attributes).forEach((attribute) => node.removeAttribute(attribute.name));
            if (href && /^(https?:\/\/|#)/i.test(href.trim())) {
                node.setAttribute('href', href.trim());
                if (!href.startsWith('#')) {
                    node.setAttribute('target', '_blank');
                    node.setAttribute('rel', 'noopener noreferrer');
                }
            }
        });
    };
    clean(document.body);
    return document.body.innerHTML;
}

export function renderProductDescription({ markdown: contentMarkdown, html } = {}) {
    return sanitizeProductHtml(contentMarkdown?.trim() ? markdown.render(contentMarkdown) : html);
}
