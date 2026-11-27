// HTML post content from the rich text editor (Q2A stores such posts with format "html").
// Only an allowlist of formatting survives; scripts, event handlers, styles other than
// text alignment and colour, and non-http(s) URLs are removed before anything is stored.
const sanitizeHtml = require('sanitize-html');

const ALIGN = [/^(left|right|center|justify)$/];
const COLOR = [/^#[0-9a-f]{3,6}$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i];

const OPTIONS = {
    allowedTags: ['p', 'br', 'div', 'h2', 'h3', 'h4', 'pre', 'code', 'blockquote', 'b', 'strong', 'i', 'em', 'u', 's',
        'strike', 'sub', 'sup', 'span', 'font', 'ul', 'ol', 'li', 'a', 'img', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    allowedAttributes: {
        a: ['href', 'title'],
        img: ['src', 'alt', 'width', 'height'],
        font: ['color'],
        td: ['colspan', 'rowspan'],
        th: ['colspan', 'rowspan'],
        '*': ['style']
    },
    allowedStyles: { '*': { 'text-align': ALIGN, color: COLOR } },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    transformTags: {
        a: sanitizeHtml.simpleTransform('a', { rel: 'nofollow noopener noreferrer', target: '_blank' }),
        div: 'p'
    }
};
OPTIONS.allowedAttributes.a.push('rel', 'target');

// Returns safe HTML, or '' when the content has no visible text or image.
function cleanHtml(value) {
    if (typeof value !== 'string') return null;
    const html = sanitizeHtml(value, OPTIONS).trim();
    const visible = sanitizeHtml(html, { allowedTags: ['img', 'hr'], allowedAttributes: { img: ['src'] } })
        .replace(/&nbsp;|\s/g, '');
    return visible ? html : '';
}

const FORMATS = ['', 'html'];

module.exports = { cleanHtml, FORMATS };

// Validates post content in either format. Minimum length counts visible text; the maximum counts stored HTML.
function cleanContent(body, format, min, max) {
    const kind = format === undefined || format === null ? '' : format;
    if (!FORMATS.includes(kind) || typeof body !== 'string') return null;
    if (kind === '') {
        const text = body.trim();
        return text.length >= min && text.length <= max ? { body: text, format: '' } : null;
    }
    const html = cleanHtml(body);
    if (html === null) return null;
    const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/g, ' ').trim();
    const hasImage = /<img\b/i.test(html);
    if ((text.length < min && !(hasImage && min === 0)) || html.length > max) return null;
    return { body: html, format: html ? 'html' : '' };
}

module.exports.cleanContent = cleanContent;
