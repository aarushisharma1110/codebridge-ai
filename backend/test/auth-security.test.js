const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const { before, after, test } = require('node:test');
const jwt = require('jsonwebtoken');
const createApp = require('../app');

const secret = randomBytes(32).toString('hex');
const origin = 'http://localhost:5173';
let server, base, lookups = 0;
const sign = (payload = {}, options = {}, key = secret) => jwt.sign(payload, key, {
    algorithm: 'HS256', issuer: 'codebridge-ai', subject: '1', expiresIn: 3600, ...options
});
before(async () => {
    server = createApp({ jwtSecret: secret, clientOrigin: origin, pool: {
        async query(sql, values) {
            lookups++;
            assert.match(sql, /^SELECT id, handle, email, role, blocked, created_at, [a-z_, ]+ FROM users WHERE id = \$1$/);
            return { rows: values[0] === 1 ? [{ id: 1, email: 'test@example.test', role: 'user' }] : [] };
        }
    } }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

for (const [name, token] of [
    ['missing', null], ['malformed', 'invalid'],
    ['tampered subject', (() => { const parts = sign().split('.'); parts[1] = Buffer.from(JSON.stringify({ sub: '2' })).toString('base64url'); return parts.join('.'); })()],
    ['expired', sign({}, { expiresIn: -1 })],
    ['incorrect secret', sign({}, {}, randomBytes(32).toString('hex'))],
    ['incorrect issuer', sign({}, { issuer: 'another-app' })],
    ['unapproved algorithm', sign({}, { algorithm: 'HS384' })],
    ['invalid subject', sign({}, { subject: '01' })],
    ['missing expiry', jwt.sign({}, secret, { algorithm: 'HS256', issuer: 'codebridge-ai', subject: '1' })],
    ['future not-before', sign({}, { notBefore: 60 })]
]) {
    test(`protected API rejects ${name} JWT before database access`, async () => {
        const beforeCount = lookups;
        for (const endpoint of ['/auth/me', '/questions', '/usage', '/admin/usage']) {
            const response = await fetch(base + endpoint, { headers: token ? { Cookie: `codebridge_session=${token}` } : {} });
            assert.equal(response.status, 401);
            assert.deepEqual(Object.keys(await response.json()), ['message']);
            assert.equal(response.headers.get('set-cookie'), null);
        }
        assert.equal(lookups, beforeCount);
    });
}

test('deleted accounts are rejected even with a correctly signed unexpired JWT', async () => {
    const response = await fetch(base + '/auth/me', { headers: { Cookie: `codebridge_session=${sign({}, { subject: '2' })}` } });
    assert.equal(response.status, 401);
});

test('logout expires the browser cookie but does not revoke an already copied JWT', async () => {
    const token = sign();
    const headers = { Cookie: `codebridge_session=${token}`, Origin: origin };
    const logout = await fetch(base + '/auth/logout', { method: 'POST', headers });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
    assert.equal((await fetch(base + '/auth/me')).status, 401);
    assert.equal((await fetch(base + '/auth/me', { headers })).status, 200);
    const claims = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'codebridge-ai' });
    assert.equal(claims.exp - claims.iat, 3600);
});

test('missing, short and example signing keys are rejected at startup', () => {
    for (const jwtSecret of [undefined, '', 'short', 'replace_with_a_long_random_secret']) {
        assert.throws(() => createApp({ jwtSecret, clientOrigin: origin }), /JWT_SECRET/);
    }
});

test('foreign-origin reads get no CORS permission and foreign-origin preflight is not authorized', async () => {
    for (const method of ['GET', 'OPTIONS']) {
        const response = await fetch(base + '/auth/me', { method, headers: {
            Origin: 'https://untrusted.example',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type'
        } });
        assert.equal(response.headers.get('access-control-allow-origin'), null);
        if (method === 'GET') assert.equal(response.status, 401);
    }
});
