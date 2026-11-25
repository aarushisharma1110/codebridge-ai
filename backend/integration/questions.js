const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { Pool } = require('pg');
const createApp = require('../app');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const origin = 'http://localhost:5173';
const schema = `codebridge_test_${randomBytes(16).toString('hex')}`;
const password = randomBytes(24).toString('hex');
const validTitle = 'How does the question API work?';
const missingId = 2147483647;
let control, pool, schemaCreated, server, base, owner, member, admin;

before(async () => {
    const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    assert.ok(connectionString, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL tests.');

    let scopedUrl;
    try {
        scopedUrl = new URL(connectionString);
        if (!['postgresql:', 'postgres:'].includes(scopedUrl.protocol)) throw new Error();
    } catch {
        throw new Error('Set TEST_DATABASE_URL or DATABASE_URL to a valid PostgreSQL URL.');
    }

    control = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
    await control.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;

    // Startup options apply to every application connection. There is no fallback to public.
    scopedUrl.searchParams.set('options', `-c search_path=${schema}`);
    pool = new Pool({ connectionString: scopedUrl.href, connectionTimeoutMillis: 5000 });
    const { rows: [scope] } = await pool.query('SELECT current_schemas(false)::text[] AS schemas');
    assert.deepEqual(scope.schemas, [schema]);
    const ddl = await readFile(path.resolve(__dirname, '../db/schema.sql'), 'utf8');
    await pool.query(ddl);

    server = createApp({ pool, clientOrigin: origin, jwtSecret: randomBytes(32).toString('hex') })
        .listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
    owner = await account('owner');
    member = await account('member');
    admin = await account('admin', 'admin');
});

after(async () => {
    try {
        if (server?.listening) {
            await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        }
    } finally {
        try {
            await pool?.end();
        } finally {
            try {
                if (schemaCreated) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
            } finally {
                await control?.end();
            }
        }
    }
});

async function request(route, { method = 'GET', cookie, body, requestOrigin = origin } = {}) {
    const headers = {};
    if (requestOrigin) headers.Origin = requestOrigin;
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + route, {
        method, headers, body: JSON.stringify(body), signal: AbortSignal.timeout(5000)
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, data: text ? (response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text) : undefined };
}

async function account(name, role = 'user') {
    const credentials = { email: `${name}@example.test`, password };
    const registration = await request('/auth/register', { method: 'POST', body: credentials });
    assert.equal(registration.status, 201);
    if (role === 'admin') {
        await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, registration.data.user.id]);
    }
    const login = await request('/auth/login', { method: 'POST', body: credentials });
    assert.equal(login.status, 200);
    assert.equal(login.data.user.id, registration.data.user.id);
    assert.equal(login.data.user.role, role);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /^codebridge_session=/);
    assert.match(cookie, /; HttpOnly/i);
    return { id: login.data.user.id, profile: login.data.user, cookie: cookie.split(';', 1)[0] };
}

async function savedQuestion(id) {
    const { rows: [row] } = await pool.query('SELECT * FROM questions WHERE id = $1', [id]);
    return row;
}

async function createQuestion(body = { title: validTitle, body: 'Original details.' }, actor = owner) {
    const result = await request('/questions', { method: 'POST', cookie: actor.cookie, body });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data.question;
}

test('allows only administrators to list registered users and returns only public profile fields', async () => {
    assert.equal((await request('/admin/users')).status, 401);
    assert.equal((await request('/admin/users', { cookie: member.cookie })).status, 403);

    const directory = await request('/admin/users', { cookie: admin.cookie });
    assert.equal(directory.status, 200);
    assert.equal(directory.headers.get('cache-control'), 'no-store');
    const profiles = [owner, member, admin].map(({ profile: { id, email, role, created_at } }) =>
        ({ id, email, role, created_at }));
    assert.deepEqual(directory.data, { users: profiles });

    const dashboard = await request('/admin/dashboard', { cookie: admin.cookie });
    assert.equal(dashboard.status, 200);
    assert.deepEqual(dashboard.data, { users: 2, admins: 1 });
});

test('creates, trims and persists a question with the authenticated owner', async () => {
    const question = await createQuestion({
        title: `  ${validTitle}  `, body: '  Original details.  ', user_id: member.id
    });
    const stored = await savedQuestion(question.id);
    assert.equal(stored.title, validTitle);
    assert.equal(stored.body, 'Original details.');
    assert.equal(stored.user_id, owner.id);
    assert.equal(stored.last_edited_by, null);
    assert.equal(question.user_id, owner.id);
    assert.equal(question.created_at, stored.created_at.toISOString());
    assert.equal(question.updated_at, question.created_at);
});

test('accepts inclusive title and body boundaries and defaults an omitted body', async () => {
    const minimum = await createQuestion({ title: 'a'.repeat(12) });
    assert.equal((await savedQuestion(minimum.id)).body, '');
    const blank = await createQuestion({ title: validTitle, body: '' });
    assert.equal((await savedQuestion(blank.id)).body, '');
    const maximum = await createQuestion({ title: 'z'.repeat(120), body: 'b'.repeat(12000) });
    assert.equal((await savedQuestion(maximum.id)).title.length, 120);
    assert.equal((await savedQuestion(maximum.id)).body.length, 12000);
});

test('rejects malformed create fields and oversized JSON without inserting rows', async () => {
    const count = async () => (await pool.query('SELECT count(*)::int AS count FROM questions')).rows[0].count;
    const beforeCount = await count();
    for (const body of [
        {}, { title: 42 }, { title: 'a'.repeat(11) }, { title: 'a'.repeat(121) },
        { title: validTitle, body: null }, { title: validTitle, body: 'b'.repeat(12001) }
    ]) {
        assert.equal((await request('/questions', { method: 'POST', cookie: owner.cookie, body })).status, 400);
    }
    const oversized = await request('/questions', {
        method: 'POST', cookie: owner.cookie, body: { title: validTitle, body: 'é'.repeat(12000) }
    });
    assert.equal(oversized.status, 413);
    assert.equal(await count(), beforeCount);
});

test('lists questions from multiple owners and retrieves details for a signed-in reader', async () => {
    const earlier = await createQuestion();
    const later = await createQuestion({ title: 'How can I add integration tests?' }, member);
    await pool.query('UPDATE questions SET created_at = $1 WHERE id = $2', ['2000-01-01T00:00:00Z', earlier.id]);
    const list = await request('/questions', { cookie: member.cookie });
    assert.equal(list.status, 200);
    const pair = list.data.questions.filter(({ id }) => id === earlier.id || id === later.id);
    assert.deepEqual(pair.map(({ id, user_id }) => [id, user_id]), [[later.id, member.id], [earlier.id, owner.id]]);
    const detail = await request(`/questions/${earlier.id}`, { cookie: member.cookie });
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.data.question, pair[1]);
});

test('returns 404 for missing and invalid question IDs across read, edit, and delete', async () => {
    for (const id of [missingId, 'abc', '0', '01', '2147483648']) {
        for (const method of ['GET', 'PATCH', 'DELETE']) {
            const body = method === 'PATCH' ? { title: validTitle } : undefined;
            const result = await request(`/questions/${id}`, { method, cookie: owner.cookie, body });
            assert.equal(result.status, 404, `${method} question ID ${id}`);
        }
    }
});

test('allows owner and admin edits and preserves omitted fields and ownership', async () => {
    const question = await createQuestion();
    const route = `/questions/${question.id}`;
    const previousEdit = new Date('2000-01-01T00:00:00Z');
    await pool.query('UPDATE questions SET updated_at = $1 WHERE id = $2', [previousEdit, question.id]);
    const title = 'How do I update only the title?';
    const ownerEdit = await request(route, { method: 'PATCH', cookie: owner.cookie, body: { title } });
    assert.equal(ownerEdit.status, 200);
    const ownRow = await savedQuestion(question.id);
    assert.equal(ownRow.title, title);
    assert.equal(ownRow.body, question.body);
    assert.equal(ownRow.last_edited_by, owner.id);
    assert.ok(ownRow.updated_at > previousEdit);

    const adminEdit = await request(route, { method: 'PATCH', cookie: admin.cookie, body: { body: '' } });
    assert.equal(adminEdit.status, 200);
    const adminRow = await savedQuestion(question.id);
    assert.equal(adminRow.body, '');
    assert.equal(adminRow.title, title);
    assert.equal(adminRow.user_id, owner.id);
    assert.equal(adminRow.last_edited_by, admin.id);
    assert.equal(adminRow.created_at.toISOString(), question.created_at);
});

test('rejects invalid and unauthorized edits without changing the stored row', async () => {
    const question = await createQuestion();
    const route = `/questions/${question.id}`;
    const stored = await savedQuestion(question.id);
    const denied = await request(route, { method: 'PATCH', cookie: member.cookie, body: { title: 'Unauthorized edit' } });
    assert.equal(denied.status, 403);
    for (const body of [{}, { body: null }, { title: 'short', body: 'Would change details.' }]) {
        assert.equal((await request(route, { method: 'PATCH', cookie: owner.cookie, body })).status, 400);
    }
    assert.deepEqual(await savedQuestion(question.id), stored);
});

test('permits only the owner to delete a visible question and removes the PostgreSQL row', async () => {
    const question = await createQuestion();
    const route = `/questions/${question.id}`;
    const stored = await savedQuestion(question.id);
    for (const actor of [member, admin]) {
        assert.equal((await request(route, { method: 'DELETE', cookie: actor.cookie })).status, 403);
        assert.deepEqual(await savedQuestion(question.id), stored);
    }
    const deleted = await request(route, { method: 'DELETE', cookie: owner.cookie });
    assert.equal(deleted.status, 204);
    assert.equal(deleted.data, undefined);
    assert.equal(await savedQuestion(question.id), undefined);
    assert.equal((await request(route, { cookie: owner.cookie })).status, 404);
});

test('restricts hidden questions to administrators, including after an owner hides a question', async () => {
    const question = await createQuestion();
    const route = `/questions/${question.id}`;
    assert.equal((await request(`${route}/hide`, { method: 'POST', cookie: member.cookie })).status, 403);
    const hidden = await request(`${route}/hide`, { method: 'POST', cookie: owner.cookie });
    assert.equal(hidden.status, 204);
    assert.equal(hidden.data, undefined);
    const stored = await savedQuestion(question.id);
    assert.equal(stored.hidden, true);
    assert.equal(stored.last_edited_by, owner.id);

    for (const actor of [owner, member, admin]) {
        const list = await request('/questions', { cookie: actor.cookie });
        assert.equal(list.status, 200);
        assert.ok(list.data.questions.every((item) => item.id !== question.id && item.hidden === false));
    }
    for (const actor of [owner, member]) {
        for (const [method, target, body] of [
            ['GET', '/questions/hidden'], ['GET', route],
            ['PATCH', route, { title: 'Cannot edit this hidden question' }], ['DELETE', route],
            ['POST', `${route}/hide`], ['POST', `${route}/reshow`]
        ]) {
            const denied = await request(target, { method, cookie: actor.cookie, body });
            assert.equal(denied.status, 403, `${method} ${target}`);
            assert.deepEqual(Object.keys(denied.data), ['message']);
        }
    }
    assert.deepEqual(await savedQuestion(question.id), stored);

    const detail = await request(route, { cookie: admin.cookie });
    assert.equal(detail.status, 200);
    assert.equal(detail.data.question.hidden, true);
    assert.equal(detail.data.question.body, question.body);
    const list = await request('/questions/hidden', { cookie: admin.cookie });
    assert.equal(list.status, 200);
    assert.ok(list.data.questions.every((item) => item.hidden === true));
    assert.deepEqual(list.data.questions.find(({ id }) => id === question.id), detail.data.question);

    const adminEdit = await request(route, { method: 'PATCH', cookie: admin.cookie, body: { title: validTitle } });
    assert.equal(adminEdit.status, 409);
    assert.deepEqual(await savedQuestion(question.id), stored);
    const reshown = await request(`${route}/reshow`, { method: 'POST', cookie: admin.cookie });
    assert.equal(reshown.status, 200);
    assert.equal(reshown.data.question.hidden, false);
    assert.equal(reshown.data.question.last_edited_by, admin.id);
    assert.equal((await request(route, { cookie: member.cookie })).status, 200);
    assert.deepEqual((await request('/questions/hidden', { cookie: admin.cookie })).data.questions, []);

    const hiddenByAdmin = await request(`${route}/hide`, { method: 'POST', cookie: admin.cookie });
    assert.equal(hiddenByAdmin.status, 200);
    assert.equal(hiddenByAdmin.data.question.hidden, true);
    assert.equal(hiddenByAdmin.data.question.last_edited_by, admin.id);
    const deleted = await request(route, { method: 'DELETE', cookie: admin.cookie });
    assert.equal(deleted.status, 204);
    assert.equal(await savedQuestion(question.id), undefined);
});

test('requires a session on all question routes and enforces the write origin', async () => {
    const question = await createQuestion();
    const route = `/questions/${question.id}`;
    const stored = await savedQuestion(question.id);
    for (const [method, target, body] of [
        ['GET', '/questions'], ['GET', '/questions/hidden'], ['GET', route],
        ['POST', '/questions', { title: validTitle }], ['PATCH', route, { title: validTitle }],
        ['POST', `${route}/hide`], ['POST', `${route}/reshow`], ['DELETE', route]
    ]) {
        assert.equal((await request(target, { method, body })).status, 401);
        if (method !== 'GET') {
            for (const requestOrigin of [null, 'http://other.example.test']) {
                assert.equal((await request(target, { method, body, cookie: owner.cookie, requestOrigin })).status, 403);
            }
        }
    }
    assert.deepEqual(await savedQuestion(question.id), stored);
});

test('tracks usage in PostgreSQL with immediate reads, exclusions, thresholds, independent users and sessions', async () => {
    const actor = await account('usage-owner');
    const other = await account('usage-other');
    const usage = async (who = actor) => {
        const response = await request('/usage', { cookie: who.cookie });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        return response.data;
    };
    assert.equal((await request('/usage')).status, 401);
    assert.deepEqual(await usage(), { totalUsage: 0, freeAllowance: 20, remainingCalls: 20,
        limitExceeded: false, allowanceExhausted: false, total: 0, threshold: 20, breakdown: [] });
    for (const target of ['/health', '/db-test', '/auth/me', '/usage', '/admin/usage', '/docs']) {
        await request(target, { cookie: actor.cookie });
    }
    await request('/questions', { method: 'HEAD', cookie: actor.cookie });
    await request('/questions', { method: 'OPTIONS', cookie: actor.cookie });
    await request('/questions');
    assert.equal((await usage()).totalUsage, 0);
    const question = await createQuestion({ title: validTitle }, actor);
    assert.equal((await usage()).totalUsage, 1);
    await request(`/questions/${question.id}`, { cookie: actor.cookie });
    await request(`/questions/${question.id}`, { method: 'PATCH', cookie: actor.cookie, body: { title: validTitle } });
    await request(`/questions/${question.id}/hide`, { method: 'POST', cookie: actor.cookie });
    assert.equal((await request(`/questions/${question.id}/reshow`, { method: 'POST', cookie: actor.cookie })).status, 403);
    // Invalid AI input is a counted functional failure, without invoking a model.
    assert.equal((await request('/ai/improve-question', { method: 'POST', cookie: actor.cookie, body: {} })).status, 400);
    assert.equal((await request('/questions/no-id', { cookie: actor.cookie })).status, 404);
    assert.equal((await usage()).totalUsage, 7);
    assert.equal((await usage(other)).totalUsage, 0);
    const concurrent = await Promise.all(Array.from({ length: 13 }, () => request('/questions', { cookie: actor.cookie })));
    assert.ok(concurrent.every(row => row.status === 200));
    const exhausted = await usage();
    assert.equal(exhausted.totalUsage, 20);
    assert.equal(exhausted.remainingCalls, 0);
    assert.equal(exhausted.allowanceExhausted, true);
    assert.equal(exhausted.limitExceeded, false);
    assert.equal((await request('/questions', { cookie: actor.cookie })).status, 200);
    assert.equal((await usage()).totalUsage, 21);
    assert.equal((await usage()).limitExceeded, true);
    assert.equal((await request('/admin/usage', { cookie: actor.cookie })).status, 403);
    const stats = await request('/admin/usage', { cookie: admin.cookie });
    assert.equal(stats.status, 200);
    assert.equal(stats.data.byUser.find(row => row.user_id === actor.id).count, 21);
    assert.ok(stats.data.byEndpoint.some(row => row.endpoint === '/api/v1/questions/:id' && row.method === 'GET'));
    const { rows } = await pool.query('SELECT * FROM api_usage WHERE user_id = $1', [actor.id]);
    assert.equal(rows.length, 21);
    assert.ok(rows.every(row => !/\/questions\/\d+(?:\/|$)/.test(row.route_template)));
    assert.ok(rows.some(row => row.status_code === 403));
    assert.ok(rows.some(row => row.status_code === 400 && row.route_template === '/api/v1/ai/improve-question'));
    await request('/auth/logout', { method: 'POST', cookie: actor.cookie });
    const login = await request('/auth/login', { method: 'POST', body: { email: actor.profile.email, password } });
    actor.cookie = login.headers.get('set-cookie').split(';', 1)[0];
    assert.equal((await usage()).totalUsage, 21);
    await request(`/questions/${question.id}/reshow`, { method: 'POST', cookie: admin.cookie });
    const deleted = await request(`/questions/${question.id}`, { method: 'DELETE', cookie: actor.cookie });
    assert.equal(deleted.status, 204);
    assert.equal((await usage()).totalUsage, 22);
});

test('auth edge cases use real bcrypt storage, normalized unique email and safe responses', async () => {
    const bcrypt = require('bcrypt');
    const credentials = { email: ' Security-Edges@Example.Test ', password: 'test-only strong passphrase' };
    const registered = await request('/auth/register', { method: 'POST', body: { ...credentials, role: 'admin', id: admin.id } });
    assert.equal(registered.status, 201);
    assert.equal(registered.data.user.email, 'security-edges@example.test');
    assert.equal(registered.data.user.role, 'user');
    assert.deepEqual(Object.keys(registered.data.user).sort(), ['created_at', 'email', 'id', 'role']);
    const { rows: [stored] } = await pool.query('SELECT * FROM users WHERE id = $1', [registered.data.user.id]);
    assert.equal(stored.role, 'user');
    assert.notEqual(stored.password_hash, credentials.password);
    assert.equal(bcrypt.getRounds(stored.password_hash), 12);
    assert.equal(await bcrypt.compare(credentials.password, stored.password_hash), true);
    const duplicate = await request('/auth/register', { method: 'POST', body: { ...credentials, email: 'security-edges@example.test' } });
    assert.equal(duplicate.status, 409);
    assert.deepEqual(Object.keys(duplicate.data), ['message']);
    const countUsers = async () => (await pool.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count;
    const countBefore = await countUsers();
    for (const body of [
        {}, { email: null, password: credentials.password },
        { email: 'invalid', password: credentials.password },
        { email: 'a..b@example.test', password: credentials.password },
        { email: 'a@-invalid.test', password: credentials.password },
        { email: 'valid@example.test', password: 'short' },
        { email: 'valid@example.test', password: 12345678 },
        { email: 'valid@example.test', password: 'x'.repeat(73) },
        { email: 'valid@example.test', password: '\u00e9'.repeat(37) }
    ]) {
        const denied = await request('/auth/register', { method: 'POST', body });
        assert.equal(denied.status, 400);
        assert.deepEqual(Object.keys(denied.data), ['message']);
        assert.equal(denied.headers.get('set-cookie'), null);
    }
    assert.equal(await countUsers(), countBefore);
    const responses = [];
    for (const body of [
        { ...credentials, password: 'wrong password' },
        { ...credentials, email: 'does-not-exist@example.test' },
        { email: 'invalid', password: credentials.password },
        { email: credentials.email, password: '' }
    ]) {
        const denied = await request('/auth/login', { method: 'POST', body });
        assert.equal(denied.status, 401);
        assert.equal(denied.headers.get('set-cookie'), null);
        assert.deepEqual(Object.keys(denied.data), ['message']);
        responses.push(denied.data);
    }
    assert.ok(responses.every(data => JSON.stringify(data) === JSON.stringify(responses[0])));
    const accepted = await request('/auth/login', { method: 'POST', body: credentials });
    assert.equal(accepted.status, 200);
    assert.deepEqual(Object.keys(accepted.data.user).sort(), ['created_at', 'email', 'id', 'role']);
    const cookie = accepted.headers.get('set-cookie').split(';', 1)[0];
    const me = await request(`/auth/me?user_id=${admin.id}&id=${admin.id}`, { cookie });
    assert.equal(me.data.user.id, registered.data.user.id);
    // There is no account-update API: users cannot escalate through invented routes.
    for (const target of ['/auth/me', `/users/${registered.data.user.id}`, `/admin/users/${registered.data.user.id}`]) {
        const denied = await request(target, { method: 'PATCH', cookie, body: { role: 'admin' } });
        assert.equal(denied.status, 404);
    }
    assert.equal((await pool.query('SELECT role FROM users WHERE id = $1', [registered.data.user.id])).rows[0].role, 'user');
});

test('direct API requests isolate account data and usage, reject identity injection and enforce every admin route', async () => {
    const a = await account('isolation-a');
    const b = await account('isolation-b');
    const question = await createQuestion({ title: validTitle, user_id: b.id, role: 'admin' }, a);
    assert.equal(question.user_id, a.id);
    const before = await savedQuestion(question.id);
    for (const method of ['PATCH', 'DELETE']) {
        const denied = await request(`/questions/${question.id}?user_id=${a.id}`, { method, cookie: b.cookie,
            body: method === 'PATCH' ? { title: 'Unauthorized change attempt', user_id: a.id } : undefined });
        assert.equal(denied.status, 403);
    }
    assert.deepEqual(await savedQuestion(question.id), before);
    const publicRead = await request(`/questions/${question.id}`, { cookie: b.cookie });
    assert.equal(publicRead.status, 200); // Shared visible questions are intentionally readable to signed-in users.
    for (const target of ['/admin/dashboard', '/admin/users', '/admin/usage']) {
        assert.equal((await request(target)).status, 401);
        assert.equal((await request(target, { cookie: b.cookie })).status, 403);
        assert.equal((await request(target, { cookie: admin.cookie })).status, 200);
    }
    assert.equal((await request(`/auth/me?id=${a.id}`, { cookie: b.cookie })).data.user.id, b.id);
    const ownUsage = await request('/usage', { cookie: b.cookie });
    const injectedUsage = await request(`/usage?user_id=${a.id}&id=${a.id}`, { cookie: b.cookie });
    assert.deepEqual(injectedUsage.data, ownUsage.data);
    assert.equal((await request(`/usage/${a.id}`, { cookie: b.cookie })).status, 404);
    assert.equal((await request(`/auth/users/${a.id}`, { cookie: b.cookie })).status, 404);
    const { rows: [count] } = await pool.query('SELECT COUNT(*)::int AS count FROM api_usage WHERE user_id = $1', [b.id]);
    assert.equal(ownUsage.data.totalUsage, count.count);
    const selfUpdate = await request(`/questions/${question.id}`, { method: 'PATCH', cookie: a.cookie,
        body: { title: validTitle, user_id: b.id } });
    assert.equal(selfUpdate.status, 200);
    assert.equal(selfUpdate.data.question.user_id, a.id);
    const logout = await request('/auth/logout', { method: 'POST', cookie: b.cookie });
    assert.equal(logout.status, 204);
    // Model browser deletion: the next request has no session cookie.
    assert.equal((await request('/auth/me')).status, 401);
    assert.equal((await request('/questions')).status, 401);
});
