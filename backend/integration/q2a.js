// PostgreSQL integration tests for the Question2Answer features.
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
const schema = `codebridge_q2a_${randomBytes(16).toString('hex')}`;
const password = randomBytes(24).toString('hex');
let control, pool, server, base, asker, answerer, voter, editor, admin;

before(async () => {
    const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    assert.ok(connectionString, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL tests.');
    const scopedUrl = new URL(connectionString);
    control = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
    await control.query(`CREATE SCHEMA "${schema}"`);
    scopedUrl.searchParams.set('options', `-c search_path=${schema}`);
    pool = new Pool({ connectionString: scopedUrl.href, connectionTimeoutMillis: 5000 });
    const ddl = await readFile(path.resolve(__dirname, '../db/schema.sql'), 'utf8');
    await pool.query(ddl);
    await pool.query(ddl); // The schema must be safe to apply twice.

    server = createApp({ pool, clientOrigin: origin, jwtSecret: randomBytes(32).toString('hex') }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
    asker = await account('asker');
    answerer = await account('answerer');
    voter = await account('voter');
    editor = await account('editor', 'editor');
    admin = await account('admin', 'admin');
});

after(async () => {
    try {
        if (server?.listening) await new Promise((resolve) => server.close(resolve));
        await pool?.end();
    } finally {
        await control?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await control?.end();
    }
});

async function request(route, { method = 'GET', cookie, body } = {}) {
    const headers = { Origin: origin };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + route, { method, headers, body: JSON.stringify(body) });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : undefined };
}

async function account(name, role = 'user') {
    const credentials = { email: `${name}@example.test`, password, handle: name };
    const registration = await request('/auth/register', { method: 'POST', body: credentials });
    assert.equal(registration.status, 201, JSON.stringify(registration.data));
    assert.equal(registration.data.user.handle, name);
    if (role !== 'user') await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, registration.data.user.id]);
    const login = await fetch(base + '/auth/login', {
        method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: name, password })
    });
    assert.equal(login.status, 200, 'username login');
    return { id: registration.data.user.id, handle: name, cookie: login.headers.get('set-cookie').split(';', 1)[0] };
}

const ask = async (body, actor = asker) => {
    const result = await request('/questions', { method: 'POST', cookie: actor.cookie, body });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data.question;
};
const points = async (actor) => (await request(`/users/${actor.handle}`, { cookie: actor.cookie })).data.user.points;

test('registration validates usernames and derives one when omitted', async () => {
    assert.equal((await request('/auth/register', { method: 'POST',
        body: { email: 'dup@example.test', password, handle: 'asker' } })).status, 409);
    assert.equal((await request('/auth/register', { method: 'POST',
        body: { email: 'bad@example.test', password, handle: 'no spaces allowed' } })).status, 400);
    const derived = await request('/auth/register', { method: 'POST', body: { email: 'asker@other.test', password } });
    assert.equal(derived.status, 201);
    assert.equal(derived.data.user.handle, `asker${derived.data.user.id}`);
});

test('questions carry tags and categories, and the tag and category pages count them', async () => {
    const created = await request('/admin/categories', { method: 'POST', cookie: admin.cookie,
        body: { title: 'Web Development', description: 'Front and back end' } });
    assert.equal(created.status, 201);
    assert.equal(created.data.category.slug, 'web-development');
    const child = await request('/admin/categories', { method: 'POST', cookie: admin.cookie,
        body: { title: 'React', parent_id: created.data.category.id } });
    assert.equal(child.status, 201);
    assert.equal((await request('/admin/categories', { method: 'POST', cookie: asker.cookie, body: { title: 'X' } })).status, 403);

    const question = await ask({ title: 'How do React effects clean up?', body: 'Details', tags: 'React hooks react',
        category_id: child.data.category.id });
    assert.deepEqual(question.tags, ['react', 'hooks']);
    assert.equal(question.category_slug, 'react');
    assert.equal(question.author_handle, 'asker');
    assert.equal((await request('/questions', { method: 'POST', cookie: asker.cookie,
        body: { title: 'Too many tags in this one', tags: 'a b c d e f' } })).status, 400);
    assert.equal((await request('/questions', { method: 'POST', cookie: asker.cookie,
        body: { title: 'Unknown category question', category_id: 999999 } })).status, 400);

    const byTag = await request('/questions?tag=hooks', { cookie: voter.cookie });
    assert.deepEqual(byTag.data.questions.map(({ id }) => id), [question.id]);
    const byParent = await request('/questions?category=web-development', { cookie: voter.cookie });
    assert.ok(byParent.data.questions.some(({ id }) => id === question.id));
    const tags = await request('/tags', { cookie: voter.cookie });
    assert.ok(tags.data.tags.some(({ tag, count }) => tag === 'react' && count === 1));
    const categories = await request('/categories', { cookie: voter.cookie });
    assert.equal(categories.data.categories.find(({ slug }) => slug === 'web-development').question_count, 1);

    const retag = await request(`/questions/${question.id}`, { method: 'PATCH', cookie: asker.cookie,
        body: { tags: ['effects'], category_id: null } });
    assert.equal(retag.status, 200);
    assert.deepEqual(retag.data.question.tags, ['effects']);
    assert.equal(retag.data.question.category_id, null);
});

test('answers, comments, votes, best answer selection and Q2A points', async () => {
    const question = await ask({ title: 'Why does my API return a 404 error?', tags: 'api' });
    assert.equal(await points(asker) >= 120, true);
    const askerBefore = await points(asker);
    const answererBefore = await points(answerer);

    assert.equal((await request(`/questions/${question.id}/answers`, { method: 'POST', cookie: answerer.cookie,
        body: { body: 'too short' } })).status, 400);
    const answer = await request(`/questions/${question.id}/answers`, { method: 'POST', cookie: answerer.cookie,
        body: { body: 'Check that the route prefix matches the request URL.' } });
    assert.equal(answer.status, 201);
    const answerId = answer.data.answer.id;
    assert.equal(await points(answerer), answererBefore + 40);

    const comment = await request(`/answers/${answerId}/comments`, { method: 'POST', cookie: asker.cookie,
        body: { body: 'Thanks, which prefix do you mean?' } });
    assert.equal(comment.status, 201);
    assert.equal(comment.data.comment.answer_id, answerId);
    const qComment = await request(`/questions/${question.id}/comments`, { method: 'POST', cookie: voter.cookie,
        body: { body: 'Which framework are you using?' } });
    assert.equal(qComment.status, 201);

    assert.equal((await request(`/questions/${question.id}/vote`, { method: 'POST', cookie: asker.cookie,
        body: { vote: 1 } })).status, 403);
    assert.equal((await request(`/questions/${question.id}/vote`, { method: 'POST', cookie: voter.cookie,
        body: { vote: 2 } })).status, 400);
    const upvote = await request(`/questions/${question.id}/vote`, { method: 'POST', cookie: voter.cookie, body: { vote: 1 } });
    assert.equal(upvote.status, 200);
    assert.equal(upvote.data.question.netvotes, 1);
    assert.equal(upvote.data.question.my_vote, 1);
    const down = await request(`/answers/${answerId}/vote`, { method: 'POST', cookie: voter.cookie, body: { vote: -1 } });
    assert.equal(down.data.answer.netvotes, -1);
    const changed = await request(`/answers/${answerId}/vote`, { method: 'POST', cookie: voter.cookie, body: { vote: 1 } });
    assert.equal(changed.data.answer.netvotes, 1);
    assert.equal(changed.data.answer.upvotes, 1);

    assert.equal((await request(`/questions/${question.id}/select`, { method: 'POST', cookie: answerer.cookie,
        body: { answer_id: answerId } })).status, 403);
    const selected = await request(`/questions/${question.id}/select`, { method: 'POST', cookie: asker.cookie,
        body: { answer_id: answerId } });
    assert.equal(selected.status, 200);
    assert.equal(selected.data.question.selected_answer_id, answerId);
    assert.equal(selected.data.answers[0].selected, true);
    // ask 2 + vote received 1 + select 3 = 60 points; answer 4 + selected 30 + vote received 2 = 360 points
    assert.equal(await points(asker), askerBefore + 10 + 30);
    assert.equal(await points(answerer), answererBefore + 40 + 300 + 20);

    const detail = await request(`/questions/${question.id}`, { cookie: voter.cookie });
    assert.equal(detail.status, 200);
    assert.equal(detail.data.answers.length, 1);
    assert.equal(detail.data.comments.length, 2);
    assert.equal(detail.data.question.answer_count, 1);
    assert.equal((await request(`/questions/${question.id}`, { cookie: voter.cookie })).data.question.views, 1);
    await request(`/questions/${question.id}`, { cookie: asker.cookie });
    assert.equal((await request(`/questions/${question.id}`, { cookie: voter.cookie })).data.question.views, 2);

    assert.equal((await request(`/questions/${question.id}`, { method: 'DELETE', cookie: asker.cookie })).status, 409);

    const activity = await request('/activity', { cookie: voter.cookie });
    const item = activity.data.questions.find(({ id }) => id === question.id);
    assert.equal(item.activity.what, 'commented');
});

test('rich text answers are sanitized before storage and plain text stays the default', async () => {
    const question = await ask({ title: 'Question with formatted answers', body: '<p><b>Bold</b> details</p>', format: 'html' });
    assert.equal(question.format, 'html');
    const answer = await request(`/questions/${question.id}/answers`, { method: 'POST', cookie: answerer.cookie,
        body: { body: '<p onclick="x()">Use <a href="javascript:alert(1)">this</a> and <i>that</i> safely</p><script>alert(1)</script>', format: 'html' } });
    assert.equal(answer.status, 201);
    assert.equal(answer.data.answer.format, 'html');
    assert.doesNotMatch(answer.data.answer.body, /script|onclick|javascript/);
    assert.match(answer.data.answer.body, /<i>that<\/i>/);
    assert.equal((await request(`/questions/${question.id}/answers`, { method: 'POST', cookie: answerer.cookie,
        body: { body: '<p><br></p>', format: 'html' } })).status, 400);
    assert.equal((await request(`/questions/${question.id}/answers`, { method: 'POST', cookie: answerer.cookie,
        body: { body: 'A plain text answer is still fine.', format: 'markdown' } })).status, 400);
    const plain = await ask({ title: 'Question with a plain text body' });
    assert.equal(plain.format, '');
});

test('sorting, unanswered filters and search', async () => {
    const lonely = await ask({ title: 'Unanswered search target zebra question', body: 'needle text' });
    const unanswered = await request('/questions?unanswered=none', { cookie: voter.cookie });
    assert.ok(unanswered.data.questions.some(({ id }) => id === lonely.id));
    assert.ok(unanswered.data.questions.every(({ answer_count }) => answer_count === 0));
    const noSelected = await request('/questions?unanswered=selected', { cookie: voter.cookie });
    assert.ok(noSelected.data.questions.every(({ selected_answer_id }) => selected_answer_id === null));
    const search = await request('/questions?q=zebra%20needle', { cookie: voter.cookie });
    assert.equal(search.data.questions[0].id, lonely.id);
    assert.equal((await request('/questions?q=100%25', { cookie: voter.cookie })).status, 200);
    for (const sort of ['hot', 'votes', 'answers', 'views']) {
        const sorted = await request(`/questions?sort=${sort}`, { cookie: voter.cookie });
        assert.equal(sorted.status, 200);
        assert.equal(typeof sorted.data.total, 'number');
    }
    const votes = (await request('/questions?sort=votes', { cookie: voter.cookie })).data.questions;
    assert.ok(votes.every((row, index) => index === 0 || votes[index - 1].netvotes >= row.netvotes));
});

test('closing, flagging, hiding answers and moderator deletion', async () => {
    const question = await ask({ title: 'A question that will be closed soon' });
    assert.equal((await request(`/questions/${question.id}/close`, { method: 'POST', cookie: voter.cookie,
        body: { reason: 'Off topic' } })).status, 403);
    const closed = await request(`/questions/${question.id}/close`, { method: 'POST', cookie: asker.cookie,
        body: { reason: 'Solved elsewhere' } });
    assert.equal(closed.data.question.closed, true);
    assert.equal((await request(`/questions/${question.id}/answers`, { method: 'POST', cookie: answerer.cookie,
        body: { body: 'An answer to a closed question.' } })).status, 409);
    assert.equal((await request(`/questions/${question.id}/reopen`, { method: 'POST', cookie: editor.cookie })).status, 200);

    const answer = (await request(`/questions/${question.id}/answers`, { method: 'POST', cookie: answerer.cookie,
        body: { body: 'This answer will be flagged.' } })).data.answer;
    const flagged = await request(`/answers/${answer.id}/flag`, { method: 'POST', cookie: voter.cookie });
    assert.equal(flagged.data.answer.flag_count, 1);
    assert.equal(flagged.data.answer.my_flag, true);
    assert.equal((await request(`/answers/${answer.id}/flag`, { method: 'POST', cookie: answerer.cookie })).status, 403);
    const queue = await request('/admin/flagged', { cookie: editor.cookie });
    assert.equal(queue.status, 403);
    const adminQueue = await request('/admin/flagged', { cookie: admin.cookie });
    assert.ok(adminQueue.data.answers.some(({ id }) => id === answer.id));

    assert.equal((await request(`/answers/${answer.id}/hide`, { method: 'POST', cookie: voter.cookie })).status, 403);
    const hidden = await request(`/answers/${answer.id}/hide`, { method: 'POST', cookie: answerer.cookie });
    assert.equal(hidden.data.answer.hidden, true);
    const memberView = await request(`/questions/${question.id}`, { cookie: voter.cookie });
    assert.equal(memberView.data.answers.length, 0);
    const editorView = await request(`/questions/${question.id}`, { cookie: editor.cookie });
    assert.equal(editorView.data.answers[0].hidden, true);
    assert.equal((await request(`/answers/${answer.id}`, { method: 'DELETE', cookie: editor.cookie })).status, 403);
    assert.equal((await request(`/answers/${answer.id}/reshow`, { method: 'POST', cookie: editor.cookie })).status, 200);
    assert.equal((await request(`/answers/${answer.id}`, { method: 'DELETE', cookie: admin.cookie })).status, 409);
    await request(`/answers/${answer.id}/hide`, { method: 'POST', cookie: editor.cookie });
    const hiddenList = await request('/admin/hidden', { cookie: admin.cookie });
    assert.ok(hiddenList.data.answers.some(({ id }) => id === answer.id));
    assert.equal((await request(`/answers/${answer.id}`, { method: 'DELETE', cookie: admin.cookie })).status, 204);

    // Editors can edit others' posts and hide questions; reshow is editor-level.
    const edit = await request(`/questions/${question.id}`, { method: 'PATCH', cookie: editor.cookie,
        body: { title: 'A question edited by an editor' } });
    assert.equal(edit.data.question.last_edited_by, editor.id);
    assert.equal((await request(`/questions/${question.id}/hide`, { method: 'POST', cookie: editor.cookie })).status, 200);
    assert.equal((await request(`/questions/${question.id}/reshow`, { method: 'POST', cookie: editor.cookie })).status, 200);

    // Five flags hide a post automatically.
    const target = await ask({ title: 'Question that collects many flags' });
    const flaggers = [voter, answerer, editor, admin, await account('flagger')];
    for (const actor of flaggers) await request(`/questions/${target.id}/flag`, { method: 'POST', cookie: actor.cookie });
    const { rows: [row] } = await pool.query('SELECT hidden FROM questions WHERE id = $1', [target.id]);
    assert.equal(row.hidden, true);
});

test('favorites, users, profiles and administrator user management', async () => {
    const question = await ask({ title: 'A question worth adding to favorites', tags: 'favorites' });
    assert.equal((await request(`/questions/${question.id}/favorite`, { method: 'POST', cookie: voter.cookie })).data.question.favorited, true);
    assert.equal((await request(`/users/asker/favorite`, { method: 'POST', cookie: voter.cookie })).status, 200);
    assert.equal((await request(`/tags/favorites/favorite`, { method: 'POST', cookie: voter.cookie })).status, 200);
    const favorites = await request('/favorites', { cookie: voter.cookie });
    assert.ok(favorites.data.questions.some(({ id }) => id === question.id));
    assert.deepEqual(favorites.data.users.map(({ handle }) => handle), ['asker']);
    assert.deepEqual(favorites.data.tags.map(({ tag }) => tag), ['favorites']);

    const users = await request('/users', { cookie: voter.cookie });
    assert.ok(users.data.users.every((row, index) => index === 0 || users.data.users[index - 1].points >= row.points));
    assert.ok(users.data.users.every((row) => row.email === undefined));
    const special = await request('/users?sort=special', { cookie: voter.cookie });
    assert.deepEqual(special.data.users.map(({ handle }) => handle).sort(), ['admin', 'editor']);

    const profile = await request('/users/asker', { cookie: voter.cookie });
    assert.equal(profile.data.user.email, undefined);
    assert.equal(profile.data.user.title, 'Registered user');
    assert.ok(profile.data.user.rank >= 1);
    assert.equal(profile.data.user.favorited, true);
    assert.equal((await request('/users/asker', { cookie: admin.cookie })).data.user.email, 'asker@example.test');
    assert.equal((await request('/users/nobody-here', { cookie: voter.cookie })).status, 404);
    const answers = await request('/users/answerer/answers', { cookie: voter.cookie });
    assert.ok(answers.data.answers.length >= 1);

    assert.equal((await request(`/admin/users/${voter.id}`, { method: 'PATCH', cookie: editor.cookie, body: { role: 'admin' } })).status, 403);
    assert.equal((await request(`/admin/users/${admin.id}`, { method: 'PATCH', cookie: admin.cookie, body: { blocked: true } })).status, 403);
    const blocked = await request(`/admin/users/${voter.id}`, { method: 'PATCH', cookie: admin.cookie, body: { blocked: true } });
    assert.equal(blocked.data.user.blocked, true);
    assert.equal((await request('/questions', { method: 'POST', cookie: voter.cookie, body: { title: 'Blocked users cannot ask' } })).status, 403);
    assert.equal((await request(`/questions/${question.id}/vote`, { method: 'POST', cookie: voter.cookie, body: { vote: 1 } })).status, 403);
    assert.equal((await request('/users?sort=blocked', { cookie: admin.cookie })).data.users[0].handle, 'voter');
    await request(`/admin/users/${voter.id}`, { method: 'PATCH', cookie: admin.cookie, body: { blocked: false, role: 'expert' } });
    assert.equal((await request('/users/voter', { cookie: voter.cookie })).data.user.title, 'Expert');
});

test('site options, statistics, profile and password changes', async () => {
    const site = await fetch(base + '/site');
    assert.equal(site.status, 200);
    assert.equal((await site.json()).site.site_title, 'CodeBridge AI');
    assert.equal((await request('/admin/options', { method: 'PATCH', cookie: admin.cookie, body: { unknown: 'x' } })).status, 400);
    const options = await request('/admin/options', { method: 'PATCH', cookie: admin.cookie, body: { site_title: 'Test Q&A' } });
    assert.equal(options.data.options.site_title, 'Test Q&A');
    const stats = await request('/admin/stats', { cookie: admin.cookie });
    assert.ok(stats.data.stats.questions > 0);
    assert.equal((await request('/admin/stats', { cookie: editor.cookie })).status, 403);

    const profile = await request('/auth/me', { method: 'PATCH', cookie: answerer.cookie,
        body: { full_name: 'Ann Answerer', website: 'https://example.test', about: 'I answer questions.' } });
    assert.equal(profile.status, 200);
    assert.equal(profile.data.user.full_name, 'Ann Answerer');
    assert.equal((await request('/auth/me', { method: 'PATCH', cookie: answerer.cookie, body: { website: 'javascript:alert(1)' } })).status, 400);
    assert.equal((await request('/auth/me', { method: 'PATCH', cookie: answerer.cookie, body: { handle: 'asker' } })).status, 409);
    assert.equal((await request('/auth/password', { method: 'POST', cookie: answerer.cookie,
        body: { currentPassword: 'wrong', newPassword: 'another strong passphrase' } })).status, 403);
    assert.equal((await request('/auth/password', { method: 'POST', cookie: answerer.cookie,
        body: { currentPassword: password, newPassword: 'another strong passphrase' } })).status, 204);
    const login = await request('/auth/login', { method: 'POST', body: { email: 'answerer', password: 'another strong passphrase' } });
    assert.equal(login.status, 200);
});
