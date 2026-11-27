const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { test } = require('node:test');
const createApp = require('../app');
const definition = require('../docs/openapi.json');
const noop = (req, res, next) => next();
const OPERATIONS = 70; // every explicit /api/v1 route and method, including /db-test
const pool = { async query() { throw new Error('Documentation must not query the database'); } };

// Socket-free HTTP injection keeps documentation checks runnable in restricted environments.
async function request(app, url) {
    const response = await require('light-my-request')(app, { method: 'GET', url });
    return { status: response.statusCode,
        headers: { get: name => response.headers[name.toLowerCase()] ?? null },
        text: async () => response.payload, json: async () => response.json() };
}

function operations(spec) {
    return Object.entries(spec.paths).flatMap(([url, methods]) => Object.keys(methods)
        .filter(method => ['get', 'post', 'patch', 'delete'].includes(method))
        .map(method => `${method.toUpperCase()} /api/v1${url}`)).sort();
}

test('OpenAPI validates and covers every explicit API route/method without invented account operations', async () => {
    const parser = require('@apidevtools/swagger-parser');
    await parser.validate(structuredClone(definition));
    const expected = [];
    const browse = require('../routes/browse');
    for (const [prefix, create, args] of [
        ['/auth', require('../routes/auth'), [pool, { requireAuth: noop }]],
        ['/questions', require('../routes/questions'), [pool, noop, noop]],
        ['/answers', require('../routes/posts'), ['answer', pool, noop, noop]],
        ['/comments', require('../routes/posts'), ['comment', pool, noop, noop]],
        ['', browse.createBrowseRouter, [pool, noop, noop]],
        ['/site', browse.createSiteRouter, [pool]],
        ['/ai', require('../routes/ai'), [noop, undefined, noop]],
        ['/admin', require('../routes/admin'), [pool, noop]],
        ['/usage', require('../routes/usage'), [pool, noop]]
    ]) {
        const router = create(...args);
        for (const layer of router.stack) {
            if (!layer.route) continue;
            const route = layer.route;
            const suffix = route.path === '/' ? '' : route.path.replace(/:([a-z_]+)/g, '{$1}');
            for (const method of Object.keys(route.methods)) expected.push(`${method.toUpperCase()} /api/v1${prefix}${suffix}`);
        }
    }
    const app = createApp({ pool, jwtSecret: randomBytes(32).toString('hex'), clientOrigin: 'http://localhost:5173' });
    for (const layer of app.router.stack) {
        if (typeof layer.route?.path === 'string' && layer.route.path.startsWith('/api/v1/')) {
            for (const method of Object.keys(layer.route.methods)) expected.push(`${method.toUpperCase()} ${layer.route.path}`);
        }
    }
    assert.deepEqual(operations(definition), expected.sort());
    assert.equal(expected.length, OPERATIONS);
    const ids = Object.values(definition.paths).flatMap(item => Object.values(item).map(op => op.operationId));
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(definition.components.securitySchemes.cookieAuth.in, 'cookie');
    assert.equal(definition.components.securitySchemes.cookieAuth.name, 'codebridge_session');
    assert.equal(Object.values(definition.components.securitySchemes).some(scheme => scheme.scheme === 'bearer'), false);
    for (const [route, item] of Object.entries(definition.paths)) {
        for (const operation of Object.values(item)) {
            assert.ok(operation.responses);
            for (const name of route.match(/[{]([a-z_]+)[}]/g) || []) {
                assert.ok(operation.parameters.some(p => `{${p.name}}` === name && p.required && p.in === 'path'), `${route} ${name}`);
            }
            if (route.startsWith('/admin/') || route === '/questions/hidden' || route.endsWith('/reshow') || route.endsWith('/flags')) {
                assert.ok(operation.responses['403']);
                assert.match(operation.description, /administrator/i);
            }
            for (const response of Object.values(operation.responses)) {
                if (response.content?.['application/json']) assert.ok(response.content['application/json'].example);
            }
        }
    }
});

for (const diagnostic of [true, false]) {
    test(`local /doc/ serves Swagger UI, assets and ${diagnostic ? OPERATIONS : OPERATIONS - 1} enabled operations without database/authentication`, async t => {
        const app = createApp({ pool, jwtSecret: randomBytes(32).toString('hex'), clientOrigin: 'http://localhost:5173', enableDatabaseDiagnostic: diagnostic });
        const redirect = await request(app, '/doc');
        assert.equal(redirect.status, 308);
        assert.equal(redirect.headers.get('location'), '/doc/');
        const page = await request(app, '/doc/');
        assert.equal(page.status, 200);
        assert.match(page.headers.get('content-type'), /text\/html/);
        assert.match(await page.text(), /swagger-ui/);
        const spec = await (await request(app, '/doc/openapi.json')).json();
        assert.equal(operations(spec).length, diagnostic ? OPERATIONS : OPERATIONS - 1);
        assert.equal(Boolean(spec.paths['/db-test']), diagnostic);
        for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-ui-standalone-preset.js', 'swagger-ui-init.js']) {
            const response = await request(app, '/doc/' + asset);
            assert.equal(response.status, 200, asset);
            if (asset === 'swagger-ui-init.js') {
                const config = await response.text();
                assert.match(config, /"withCredentials": true/);
                assert.match(config, /"validatorUrl": null/);
            }
        }
    });
}

test('published consumption examples match the backend JSON response contract', async () => {
    const inject = require('light-my-request');
    const secret = randomBytes(32).toString('hex');
    const example = definition.paths['/usage'].get.responses['200'].content['application/json'].example;
    const stats = definition.paths['/admin/usage'].get.responses['200'].content['application/json'].example;
    const fixturePool = { async query(sql, values) {
        if (sql.includes('FROM users WHERE id')) return { rows: [{ id: 1, email: 'member@example.test', role: 'admin' }] };
        if (sql.includes('SUM(COUNT(*))')) {
            assert.deepEqual(values, [1]);
            return { rows: example.breakdown.map(row => ({ ...row, totalUsage: example.totalUsage })) };
        }
        if (sql.includes('LEFT JOIN api_usage')) return { rows: stats.byUser };
        if (sql.includes('FROM api_usage GROUP BY')) return { rows: stats.byEndpoint };
        throw new Error('Unexpected documentation-fixture query');
    } };
    const session = require('../auth/session').createSessionAuth({ pool: fixturePool, secret, secure: false });
    let cookie;
    session.setCookie({ cookie(name, value) { cookie = `${name}=${value}`; } }, 1);
    const app = createApp({ pool: fixturePool, jwtSecret: secret, clientOrigin: 'http://localhost:5173' });
    for (const [url, expected] of [['/api/v1/usage', example], ['/api/v1/admin/usage', stats]]) {
        const response = await inject(app, { method: 'GET', url, headers: { cookie } });
        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.json(), expected);
    }
});
