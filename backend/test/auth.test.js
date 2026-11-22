const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const { test } = require('node:test');
const createApp = require('../app');

const jwtSecret = randomBytes(32).toString('hex');
const localOrigin = 'http://localhost:5173';
const netlifyOrigin = 'https://codebridge-ai.netlify.app';
const email = 'tester@example.test';
const password = 'local test passphrase';
const initialProfile = { id: 1, email, role: 'user', created_at: '2026-01-01T00:00:00Z' };

for (const config of [
    { name: 'local development', clientOrigin: localOrigin, secureCookies: false, attribute: 'Lax' },
    { name: 'same-site HTTPS', clientOrigin: 'https://app.example.test', secureCookies: true, attribute: 'Lax' },
    { name: 'cross-site HTTPS', clientOrigin: netlifyOrigin, secureCookies: true, sessionCookieSameSite: 'none', attribute: 'None' }
]) {
    test(`registers, logs in, verifies and clears a session for ${config.name}`, async (t) => {
        let passwordHash;
        let role = 'user';
        const pool = {
            async query(sql, values) {
                if (sql.includes('INSERT INTO users')) {
                    assert.equal(values[0], email);
                    assert.equal(values.length, 2);
                    passwordHash = values[1];
                    assert.match(passwordHash, /^\$2[aby]\$/);
                    return { rows: [initialProfile] };
                }
                if (sql.includes('WHERE email')) {
                    assert.deepEqual(values, [email]);
                    return { rows: [{ ...initialProfile, role, password_hash: passwordHash }] };
                }
                if (sql.includes('WHERE id')) {
                    assert.deepEqual(values, [initialProfile.id]);
                    return { rows: [{ ...initialProfile, role }] };
                }
                assert.match(sql, /COUNT\(\*\)/);
                return { rows: [{ users: 0, admins: 1 }] };
            }
        };
        const server = createApp({ ...config, pool, jwtSecret }).listen(0, '127.0.0.1');
        t.after(() => new Promise((resolve) => server.close(resolve)));
        await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}/api/v1`;
        const send = (path, { method = 'GET', cookie, body, origin = config.clientOrigin } = {}) => {
            const headers = origin ? { Origin: origin } : {};
            if (cookie) headers.Cookie = cookie;
            if (body) headers['Content-Type'] = 'application/json';
            return fetch(base + path, { method, headers, body: JSON.stringify(body) });
        };

        const preflight = await fetch(base + '/auth/login', {
            method: 'OPTIONS',
            headers: {
                Origin: config.clientOrigin,
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type'
            }
        });
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get('access-control-allow-origin'), config.clientOrigin);
        assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
        assert.match(preflight.headers.get('access-control-allow-headers'), /content-type/i);

        const credentials = { email, password };
        const register = await send('/auth/register', { method: 'POST', body: { ...credentials, role: 'admin' } });
        assert.equal(register.status, 201);
        assert.deepEqual(await register.json(), { user: initialProfile });
        assert.equal(register.headers.get('set-cookie'), null);
        const signedOut = await send('/auth/me');
        assert.equal(signedOut.status, 401);
        assert.deepEqual(await signedOut.json(), { message: 'Authentication required' });

        const invalid = await send('/auth/login', { method: 'POST', body: { email, password: 'wrong passphrase' } });
        assert.equal(invalid.status, 401);
        assert.notEqual((await invalid.json()).message, 'Authentication required');
        assert.equal(invalid.headers.get('set-cookie'), null);
        const login = await send('/auth/login', { method: 'POST', body: credentials });
        assert.equal(login.status, 200);
        assert.deepEqual(await login.json(), { user: initialProfile });
        assert.equal(login.headers.get('cache-control'), 'no-store');
        const issued = login.headers.get('set-cookie');
        const cookie = issued.split(';', 1)[0];
        assert.ok(cookie.startsWith('codebridge_session='));
        assert.match(issued, /; Max-Age=3600(?:;|$)/);
        checkCookieAttributes(issued, config);

        const session = await send('/auth/me', { cookie });
        assert.equal(session.status, 200);
        assert.deepEqual(await session.json(), { user: initialProfile });
        assert.equal((await send('/auth/me', { cookie: 'codebridge_session=invalid' })).status, 401);
        assert.equal((await send('/admin/dashboard', { cookie })).status, 403);
        role = 'admin';
        assert.equal((await send('/admin/dashboard', { cookie })).status, 200);

        const foreignOrigin = 'https://other.example.test';
        for (const origin of [foreignOrigin, null]) {
            const denied = await send('/auth/logout', { method: 'POST', origin, cookie });
            assert.equal(denied.status, 403);
            assert.equal(denied.headers.get('access-control-allow-origin'), null);
            assert.equal(denied.headers.get('set-cookie'), null);
        }
        const logout = await send('/auth/logout', { method: 'POST', cookie });
        assert.equal(logout.status, 204);
        const cleared = logout.headers.get('set-cookie');
        assert.ok(cleared.startsWith('codebridge_session=;'));
        assert.equal(Date.parse(/; Expires=([^;]+)/i.exec(cleared)[1]), 0);
        checkCookieAttributes(cleared, config);
        assert.equal((await send('/auth/me')).status, 401);
    });
}

function checkCookieAttributes(header, { secureCookies, attribute }) {
    assert.match(header, /; Path=\/api\/v1(?:;|$)/);
    assert.match(header, /; HttpOnly(?:;|$)/);
    assert.match(header, new RegExp(`; SameSite=${attribute}(?:;|$)`));
    assert.equal(/; Secure(?:;|$)/.test(header), secureCookies);
    assert.doesNotMatch(header, /; Domain=/i);
}

test('rejects unsafe or unsupported session cookie settings at startup', () => {
    assert.throws(() => createApp({
        jwtSecret, clientOrigin: localOrigin, sessionCookieSameSite: 'none'
    }), /requires secure production cookies/);
    assert.throws(() => createApp({
        jwtSecret, clientOrigin: localOrigin, secureCookies: true, sessionCookieSameSite: 'none'
    }), /HTTPS CLIENT_ORIGIN/);
    assert.throws(() => createApp({
        jwtSecret, clientOrigin: netlifyOrigin, secureCookies: true, sessionCookieSameSite: 'invalid'
    }), /SESSION_COOKIE_SAME_SITE/);
});

for (const enableDatabaseDiagnostic of [true, false]) {
    test(`keeps public health available with database diagnostics ${enableDatabaseDiagnostic ? 'enabled' : 'disabled'}`, async (t) => {
        const queries = [];
        const pool = {
            async query(sql) {
                queries.push(sql);
                return { rows: [{ current_database: 'test_database' }] };
            }
        };
        const server = createApp({ pool, jwtSecret, clientOrigin: localOrigin, enableDatabaseDiagnostic })
            .listen(0, '127.0.0.1');
        t.after(() => new Promise((resolve) => server.close(resolve)));
        await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}/api/v1`;

        const health = await fetch(base + '/health');
        assert.equal(health.status, 200);
        assert.equal((await health.json()).message, 'CodeBridge AI API is running');
        assert.deepEqual(queries, []);

        for (const path of ['/db-test', '/db-test/']) {
            const diagnostic = await fetch(base + path);
            assert.equal(diagnostic.status, enableDatabaseDiagnostic ? 200 : 404);
            if (enableDatabaseDiagnostic) {
                assert.equal((await diagnostic.json()).database, 'test_database');
            } else {
                assert.doesNotMatch(await diagnostic.text(), /test_database/);
            }
        }
        assert.deepEqual(queries, enableDatabaseDiagnostic ? ['SELECT current_database()', 'SELECT current_database()'] : []);
    });
}
