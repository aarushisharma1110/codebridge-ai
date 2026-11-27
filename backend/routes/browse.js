// Q2A browsing pages: activity, tags, categories, users, user profiles, favorites and site information.
const express = require('express');
const messages = require('../messages');
const { LIMITS, LEVEL_TITLES, atLeast, parsePage, cleanTag, cleanHandle } = require('../lib/rules');
const { questionColumns, questionFrom, stripTotal } = require('../lib/posts');
const { handle, fail } = require('../lib/moderation');
const { readOptions } = require('../lib/options');

// Recent events per question, as on the Q2A home page ("Recent questions and answers").
function eventsSql(whoFilter = '') {
    return `WITH events AS (
        SELECT q.id AS question_id, 'asked' AS what, q.created_at AS at, q.user_id AS who FROM questions q WHERE NOT q.hidden
        UNION ALL
        SELECT a.question_id, 'answered', a.created_at, a.user_id FROM answers a WHERE NOT a.hidden
        UNION ALL
        SELECT c.question_id, 'commented', c.created_at, c.user_id FROM comments c WHERE NOT c.hidden
        UNION ALL
        SELECT q.id, 'edited', q.updated_at, q.last_edited_by FROM questions q
        WHERE NOT q.hidden AND q.last_edited_by IS NOT NULL AND q.updated_at > q.created_at + interval '1 second'
    ), latest AS (
        SELECT DISTINCT ON (question_id) question_id, what, at, who FROM events
        ${whoFilter}
        ORDER BY question_id, at DESC
    )`;
}

async function activity(pool, viewerId, page, whoId) {
    const pageSize = LIMITS.pageSize;
    const params = [viewerId, pageSize, (page - 1) * pageSize];
    let filter = '';
    if (whoId) {
        params.push(whoId);
        filter = `WHERE who = $${params.length}`;
    }
    const { rows } = await pool.query(
        `${eventsSql(filter)}
         SELECT s.*, l.what AS activity_what, l.at AS activity_at, lu.handle AS activity_handle,
                (SELECT p.points FROM user_points p WHERE p.user_id = l.who) AS activity_points,
                COUNT(*) OVER ()::int AS total_count
         FROM latest l
         JOIN (SELECT ${questionColumns('$1')} FROM ${questionFrom} WHERE NOT q.hidden) s ON s.id = l.question_id
         LEFT JOIN users lu ON lu.id = l.who
         ORDER BY l.at DESC, s.id DESC
         LIMIT $2 OFFSET $3`, params);
    return {
        questions: stripTotal(rows).map(({ activity_what, activity_at, activity_handle, activity_points, ...question }) => ({
            ...question,
            activity: { what: activity_what, at: activity_at, handle: activity_handle, points: activity_points }
        })),
        total: rows[0]?.total_count || 0, page, pageSize
    };
}

const publicUserColumns = `u.id, u.handle, u.role, u.created_at, u.blocked, u.full_name, u.location, u.website, u.about`;

function createBrowseRouter(pool, requireAuth, trackApiUsage) {
    const router = express.Router();
    const tracked = [requireAuth, trackApiUsage];

    async function findUser(handleValue) {
        const value = cleanHandle(handleValue);
        if (!value) fail(404, messages.users.notFound);
        const { rows: [user] } = await pool.query(
            `SELECT ${publicUserColumns}, u.email FROM users u WHERE lower(u.handle) = lower($1)`, [value]);
        if (!user) fail(404, messages.users.notFound);
        return user;
    }

    router.get('/activity', ...tracked, handle(async (req, res) => {
        res.json(await activity(pool, req.user.id, parsePage(req.query.page)));
    }));

    router.get('/tags', ...tracked, handle(async (req, res) => {
        const page = parsePage(req.query.page);
        const pageSize = LIMITS.tagPageSize;
        const { rows } = await pool.query(
            `SELECT t.tag, COUNT(*)::int AS count, COUNT(*) OVER ()::int AS total_count,
                    EXISTS (SELECT 1 FROM favorite_tags f WHERE f.tag = t.tag AND f.user_id = $3) AS favorited
             FROM question_tags t JOIN questions q ON q.id = t.question_id AND NOT q.hidden
             GROUP BY t.tag ORDER BY count DESC, t.tag LIMIT $1 OFFSET $2`,
            [pageSize, (page - 1) * pageSize, req.user.id]);
        res.json({ tags: stripTotal(rows), total: rows[0]?.total_count || 0, page, pageSize });
    }));

    for (const [method, add] of [['post', true], ['delete', false]]) {
        router[method]('/tags/:tag/favorite', ...tracked, handle(async (req, res) => {
            const tag = cleanTag(req.params.tag);
            if (!tag) fail(404, messages.questions.invalidTags);
            await pool.query(add
                ? 'INSERT INTO favorite_tags (user_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING'
                : 'DELETE FROM favorite_tags WHERE user_id = $1 AND tag = $2', [req.user.id, tag]);
            res.json({ tag, favorited: add });
        }));
    }

    router.get('/categories', ...tracked, handle(async (req, res) => {
        const { rows } = await pool.query(
            `SELECT c.id, c.parent_id, c.title, c.slug, c.description, c.position,
                    (SELECT COUNT(*) FROM questions q WHERE q.category_id = c.id AND NOT q.hidden)::int AS question_count
             FROM categories c ORDER BY c.position, c.title`);
        // A parent's count includes its subcategories, as in Q2A.
        const categories = rows.map((row) => ({
            ...row,
            question_count: row.question_count + rows.filter((child) => child.parent_id === row.id)
                .reduce((sum, child) => sum + child.question_count, 0)
        }));
        res.json({ categories });
    }));

    router.get('/users', ...tracked, handle(async (req, res) => {
        const page = parsePage(req.query.page);
        const pageSize = LIMITS.userPageSize;
        const sorts = { points: 'p.points DESC, u.id', newest: 'u.created_at DESC, u.id DESC' };
        const where = [];
        if (req.query.sort === 'special') where.push(`u.role <> 'user'`);
        if (req.query.sort === 'blocked') {
            if (!atLeast(req.user, 'moderator')) fail(403, messages.posts.permission);
            where.push('u.blocked');
        }
        const { rows } = await pool.query(
            `SELECT u.id, u.handle, u.role, u.created_at, u.blocked, p.points, COUNT(*) OVER ()::int AS total_count
             FROM users u JOIN user_points p ON p.user_id = u.id
             ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
             ORDER BY ${sorts[req.query.sort] || sorts.points} LIMIT $1 OFFSET $2`,
            [pageSize, (page - 1) * pageSize]);
        res.json({ users: stripTotal(rows), total: rows[0]?.total_count || 0, page, pageSize });
    }));

    router.get('/users/:handle', ...tracked, handle(async (req, res) => {
        const user = await findUser(req.params.handle);
        const { rows: [points] } = await pool.query('SELECT * FROM user_points WHERE user_id = $1', [user.id]);
        const { rows: [{ rank }] } = await pool.query(
            'SELECT (COUNT(*) + 1)::int AS rank FROM user_points WHERE points > $1', [points.points]);
        const { rows: [{ favorited }] } = await pool.query(
            'SELECT EXISTS (SELECT 1 FROM favorite_users WHERE user_id = $1 AND target_user_id = $2) AS favorited',
            [req.user.id, user.id]);
        const { email, ...profile } = user;
        const { user_id, ...stats } = points;
        const canSeeEmail = req.user.id === user.id || req.user.role === 'admin';
        res.json({
            user: {
                ...profile, ...(canSeeEmail ? { email } : {}),
                title: LEVEL_TITLES[user.role], points: points.points, rank, favorited, stats
            }
        });
    }));

    router.get('/users/:handle/activity', ...tracked, handle(async (req, res) => {
        const user = await findUser(req.params.handle);
        res.json(await activity(pool, req.user.id, parsePage(req.query.page), user.id));
    }));

    router.get('/users/:handle/answers', ...tracked, handle(async (req, res) => {
        const user = await findUser(req.params.handle);
        const page = parsePage(req.query.page);
        const pageSize = LIMITS.pageSize;
        const { rows } = await pool.query(
            `SELECT a.id, a.question_id, q.title AS question_title, a.body, a.created_at,
                    (q.selected_answer_id IS NOT DISTINCT FROM a.id) AS selected,
                    COALESCE((SELECT SUM(v.vote) FROM answer_votes v WHERE v.answer_id = a.id), 0)::int AS netvotes,
                    COUNT(*) OVER ()::int AS total_count
             FROM answers a JOIN questions q ON q.id = a.question_id
             WHERE a.user_id = $1 AND NOT a.hidden AND NOT q.hidden
             ORDER BY a.created_at DESC, a.id DESC LIMIT $2 OFFSET $3`,
            [user.id, pageSize, (page - 1) * pageSize]);
        res.json({ answers: stripTotal(rows), total: rows[0]?.total_count || 0, page, pageSize });
    }));

    for (const [method, add] of [['post', true], ['delete', false]]) {
        router[method]('/users/:handle/favorite', ...tracked, handle(async (req, res) => {
            const user = await findUser(req.params.handle);
            if (user.id === req.user.id) fail(400, messages.posts.permission);
            await pool.query(add
                ? 'INSERT INTO favorite_users (user_id, target_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING'
                : 'DELETE FROM favorite_users WHERE user_id = $1 AND target_user_id = $2', [req.user.id, user.id]);
            res.json({ handle: user.handle, favorited: add });
        }));
    }

    router.get('/favorites', ...tracked, handle(async (req, res) => {
        const [questions, users, tags] = await Promise.all([
            pool.query(`SELECT ${questionColumns('$1')} FROM ${questionFrom}
                        JOIN favorite_questions f ON f.question_id = q.id AND f.user_id = $1
                        WHERE NOT q.hidden ORDER BY f.created_at DESC`, [req.user.id]),
            pool.query(`SELECT u.id, u.handle, u.role, p.points FROM favorite_users f
                        JOIN users u ON u.id = f.target_user_id JOIN user_points p ON p.user_id = u.id
                        WHERE f.user_id = $1 ORDER BY u.handle`, [req.user.id]),
            pool.query(`SELECT f.tag, (SELECT COUNT(*) FROM question_tags t JOIN questions q ON q.id = t.question_id
                        WHERE t.tag = f.tag AND NOT q.hidden)::int AS count
                        FROM favorite_tags f WHERE f.user_id = $1 ORDER BY f.tag`, [req.user.id])
        ]);
        res.json({ questions: questions.rows, users: users.rows, tags: tags.rows });
    }));

    return router;
}

// Public site information for the page layout (no question content, so no session is required).
function createSiteRouter(pool) {
    const router = express.Router();
    router.get('/', async (req, res) => {
        const [options, { rows: [counts] }] = await Promise.all([readOptions(pool), pool.query(
            `SELECT (SELECT COUNT(*) FROM questions WHERE NOT hidden)::int AS questions,
                    (SELECT COUNT(*) FROM answers WHERE NOT hidden)::int AS answers,
                    (SELECT COUNT(*) FROM comments WHERE NOT hidden)::int AS comments,
                    (SELECT COUNT(*) FROM users)::int AS users`)]);
        res.json({ site: { ...options, counts } });
    });
    return router;
}

module.exports = { createBrowseRouter, createSiteRouter, activity };
