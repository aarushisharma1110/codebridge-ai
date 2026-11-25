const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { test, before, after } = require('node:test');
const { once } = require('node:events');
const createApp = require('../app');
const { createSessionAuth } = require('../auth/session');

const origin = 'http://localhost:5173';
const secret = randomBytes(32).toString('hex');
const user = { id: 7, email: 'tester@example.test', role: 'user' };
const pool = {
    async query(_sql, ids) {
        if (_sql.includes('INSERT INTO api_usage')) return { rows: [] };
        assert.deepEqual(ids, [user.id]);
        return { rows: [user] };
    }
};
const completion = (content, finishReason = 'stop') => Response.json({
    choices: [{ message: { content }, finish_reason: finishReason }]
});
const rewrite = 'Why is my API returning a 404, and what should I check to identify the cause?';
let cookie;
let server;
let endpoint;
let calls;
let modelResponse;

before(async () => {
    const session = createSessionAuth({ pool, secret, secure: false });
    session.setCookie({ cookie: (name, token) => { cookie = `${name}=${token}`; } }, user.id);
    const app = createApp({
        pool, clientOrigin: origin, jwtSecret: secret,
        ai: {
            timeoutMs: 100,
            async fetchImpl(url, options) {
                calls.push({ url: url.href, options, body: JSON.parse(options.body) });
                return modelResponse(options.signal);
            }
        }
    });
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    endpoint = `http://127.0.0.1:${server.address().port}/api/v1/ai/improve-question`;
});

after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
});

function arrange(response = () => completion(rewrite)) {
    calls = [];
    modelResponse = response;
}

async function send(body, { requestOrigin = origin, authenticated = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (requestOrigin) headers.Origin = requestOrigin;
    if (authenticated) headers.Cookie = cookie;
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    return { response, data: await response.json() };
}

test('rewrites a question with the configured model and the few-shot chat prompt', async () => {
    arrange(() => completion(`  ${rewrite}\n`));
    const { response, data } = await send({ question: ' why my api returns 404 ' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    assert.deepEqual(data, { improvedQuestion: rewrite });
    assert.equal(calls.length, 1);
    const [call] = calls;
    assert.equal(call.url, 'http://127.0.0.1:8080/v1/chat/completions');
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.body.model, 'Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M');
    assert.equal(call.body.temperature, 0.2);
    assert.equal(call.body.max_tokens, 256);
    assert.equal(call.body.stream, false);
    assert.deepEqual(call.body.messages.map((entry) => entry.role),
        ['system', 'user', 'assistant', 'user', 'assistant', 'user']);
    assert.match(call.body.messages[0].content, /Return only the improved question/);
    assert.equal(call.body.messages[1].content, 'why my api slow');
    assert.equal(call.body.messages[3].content, 'react state not updating');
    assert.equal(call.body.messages[5].content, 'why my api returns 404');
});

test('rejects missing, whitespace-only, non-string and oversized input before inference', async () => {
    arrange();
    for (const body of [{}, { question: '' }, { question: '  \n  ' }, { question: 42 }, { question: 'x'.repeat(2001) }]) {
        const { response } = await send(body);
        assert.equal(response.status, 400);
    }
    assert.equal(calls.length, 0);
});

test('requires authentication and an allowed Origin before inference', async () => {
    arrange();
    const body = { question: 'why my api returns 404' };
    assert.equal((await send(body, { authenticated: false })).response.status, 401);
    for (const requestOrigin of ['', 'http://other.example.test']) {
        const { response } = await send(body, { requestOrigin });
        assert.equal(response.status, 403);
        assert.equal(response.headers.get('access-control-allow-origin'), null);
    }
    assert.equal(calls.length, 0);
});

test('returns a safe 503 when the model is unreachable or rejects the request', async () => {
    for (const response of [
        () => { throw new TypeError('Network error at http://internal-model'); },
        () => new Response('internal inference error', { status: 500 })
    ]) {
        arrange(response);
        const result = await send({ question: 'why my api returns 404' });
        assert.equal(result.response.status, 503);
        assert.deepEqual(result.data, { message: 'AI improvement is temporarily unavailable. Please try again.' });
    }
});

test('aborts a slow request and returns a safe 504', async () => {
    arrange((signal) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const { response, data } = await send({ question: 'why my api returns 404' });
    assert.equal(calls[0].options.signal.aborted, true);
    assert.equal(response.status, 504);
    assert.match(data.message, /took too long/);
});

test('returns 502 for invalid JSON, missing content, empty content and truncated output', async () => {
    for (const response of [
        () => new Response('not JSON'),
        () => Response.json({ choices: [] }),
        () => completion(' \n '),
        () => completion(rewrite, 'length')
    ]) {
        arrange(response);
        const result = await send({ question: 'why my api returns 404' });
        assert.equal(result.response.status, 502);
        assert.match(result.data.message, /invalid or incomplete suggestion/);
    }
});
