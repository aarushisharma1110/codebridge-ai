const assert = require('node:assert/strict');
const { test } = require('node:test');
const { cleanContent, cleanHtml } = require('../lib/html');

test('rich text keeps Q2A editor formatting and removes scripts, handlers and unsafe URLs', () => {
    const html = cleanHtml('<p style="text-align:center;position:fixed">Hi <b>bold</b> <span style="color:#e74c3c">red</span></p>' +
        '<script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(1)"><img src="https://example.test/a.png" alt="a">' +
        '<a href="javascript:alert(1)">x</a><a href="https://example.test">ok</a><iframe src="https://evil.test"></iframe>' +
        '<table><tbody><tr><td onclick="x()">cell</td></tr></tbody></table>');
    assert.match(html, /<p style="text-align:center">Hi <b>bold<\/b> <span style="color:#e74c3c">red<\/span><\/p>/);
    assert.doesNotMatch(html, /script|onerror|onclick|javascript:|iframe|position/i);
    assert.match(html, /<img src="https:\/\/example.test\/a.png" alt="a" \/>/);
    assert.match(html, /<a href="https:\/\/example.test" rel="nofollow noopener noreferrer" target="_blank">ok<\/a>/);
    assert.match(html, /<td>cell<\/td>/);
});

test('content length rules count visible text for minimums and stored HTML for maximums', () => {
    assert.deepEqual(cleanContent('  plain body  ', undefined, 0, 100), { body: 'plain body', format: '' });
    assert.deepEqual(cleanContent('<p><br></p>', 'html', 0, 100), { body: '', format: '' });
    assert.equal(cleanContent('<p><b>short</b></p>', 'html', 12, 12000), null);
    assert.equal(cleanContent('<p>long enough answer text</p>', 'html', 12, 12000).format, 'html');
    assert.equal(cleanContent(`<p>${'a'.repeat(11995)}</p>`, 'html', 0, 12000), null);
    assert.equal(cleanContent('<p>x</p>', 'markdown', 0, 100), null);
    assert.equal(cleanContent(null, 'html', 0, 100), null);
});
