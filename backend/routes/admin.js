const express = require('express');
const { requireAdmin } = require('../auth/session');
const messages = require('../messages');
const { LEVELS, atLeast, parseId, cleanText, slugify } = require('../lib/rules');
const { questionColumns, questionFrom, answerColumns, answerFrom, commentColumns, commentFrom } = require('../lib/posts');
const { handle, fail } = require('../lib/moderation');
const { readOptions, cleanOptions, writeOptions } = require('../lib/options');

function requireModerator(req, res, next) {
    if (!atLeast(req.user, 'moderator')) return res.status(403).json({ message: messages.posts.permission });
    next();
}

function createAdminRouter(pool, requireAuth, trackApiUsage = (req, res, next) => next()) {
    const router = express.Router();

    router.get('/dashboard', requireAuth, requireAdmin, async (req, res) => {
        const { rows } = await pool.query(
            `SELECT COUNT(*) FILTER (WHERE role = 'user')::int AS users,
                    COUNT(*) FILTER (WHERE role = 'admin')::int AS admins
             FROM users`
        );
        res.json(rows[0]);
    });

    router.get('/users', requireAuth, requireAdmin, async (req, res) => {
        const { rows } = await pool.query(
            'SELECT id, email, role, created_at FROM users ORDER BY id'
        );
        res.json({ users: rows });
    });

    router.get('/usage', requireAuth, requireAdmin, async (req, res) => {
        const { rows: byUser } = await pool.query(`
            SELECT u.id AS user_id, u.email, COUNT(a.id)::int AS count
            FROM users u LEFT JOIN api_usage a ON a.user_id = u.id
            GROUP BY u.id, u.email ORDER BY u.id`);
        const { rows: byEndpoint } = await pool.query(`
            SELECT method, route_template AS endpoint, COUNT(*)::int AS count,
                   COUNT(*) FILTER (WHERE status_code >= 400)::int AS "errorCount"
            FROM api_usage GROUP BY method, route_template ORDER BY method, route_template`);
        res.json({ byUser, byEndpoint });
    });

    // Admin > Stats: Q2A database statistics.
    router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
        const { rows: [stats] } = await pool.query(`
            SELECT (SELECT COUNT(*) FROM questions WHERE NOT hidden)::int AS questions,
                   (SELECT COUNT(*) FROM questions q WHERE NOT hidden AND EXISTS
                       (SELECT 1 FROM answers a WHERE a.question_id = q.id AND NOT a.hidden))::int AS answered_questions,
                   (SELECT COUNT(*) FROM questions WHERE selected_answer_id IS NOT NULL AND NOT hidden)::int AS selected_questions,
                   (SELECT COUNT(*) FROM questions WHERE closed_at IS NOT NULL)::int AS closed_questions,
                   (SELECT COUNT(*) FROM answers WHERE NOT hidden)::int AS answers,
                   (SELECT COUNT(*) FROM comments WHERE NOT hidden)::int AS comments,
                   ((SELECT COUNT(*) FROM questions WHERE hidden) + (SELECT COUNT(*) FROM answers WHERE hidden)
                     + (SELECT COUNT(*) FROM comments WHERE hidden))::int AS hidden_posts,
                   (SELECT COUNT(*) FROM users)::int AS users,
                   (SELECT COUNT(*) FROM users WHERE blocked)::int AS blocked_users,
                   ((SELECT COUNT(*) FROM question_votes) + (SELECT COUNT(*) FROM answer_votes))::int AS votes,
                   ((SELECT COUNT(*) FROM question_flags) + (SELECT COUNT(*) FROM answer_flags)
                     + (SELECT COUNT(*) FROM comment_flags))::int AS flags,
                   (SELECT COUNT(DISTINCT tag) FROM question_tags)::int AS tags,
                   (SELECT COUNT(*) FROM categories)::int AS categories,
                   (SELECT COUNT(*) FROM api_usage)::int AS api_calls`);
        res.json({ stats });
    });

    // Change a user's level or blocked state (Q2A user profile, administrator section).
    router.patch('/users/:id', requireAuth, trackApiUsage, requireAdmin, handle(async (req, res) => {
        const id = parseId(req.params.id);
        if (!id) fail(404, messages.users.notFound);
        const input = req.body || {};
        const roleSent = input.role !== undefined;
        const blockedSent = input.blocked !== undefined;
        if ((!roleSent && !blockedSent) || (roleSent && !LEVELS.includes(input.role)) ||
            (blockedSent && typeof input.blocked !== 'boolean')) {
            fail(400, messages.users.invalidRole);
        }
        if (id === req.user.id) fail(403, messages.users.selfChange);
        const { rows: [user] } = await pool.query(
            `UPDATE users SET role = COALESCE($2, role), blocked = COALESCE($3, blocked) WHERE id = $1
             RETURNING id, handle, email, role, blocked, created_at`,
            [id, roleSent ? input.role : null, blockedSent ? input.blocked : null]);
        if (!user) fail(404, messages.users.notFound);
        res.json({ user });
    }));

    // Admin > Flagged: visible posts that have flags.
    router.get('/flagged', requireAuth, trackApiUsage, requireModerator, async (req, res) => {
        const [questions, answers, comments] = await Promise.all([
            pool.query(`SELECT * FROM (SELECT ${questionColumns('$1')} FROM ${questionFrom} WHERE NOT q.hidden) s
                        WHERE flag_count > 0 ORDER BY flag_count DESC, id DESC`, [req.user.id]),
            pool.query(`SELECT * FROM (SELECT ${answerColumns('$1')}, q.title AS question_title FROM ${answerFrom}
                        WHERE NOT a.hidden) s WHERE flag_count > 0 ORDER BY flag_count DESC, id DESC`, [req.user.id]),
            pool.query(`SELECT * FROM (SELECT ${commentColumns('$1')},
                        (SELECT title FROM questions WHERE id = c.question_id) AS question_title FROM ${commentFrom}
                        WHERE NOT c.hidden) s WHERE flag_count > 0 ORDER BY flag_count DESC, id DESC`, [req.user.id])
        ]);
        res.json({ questions: questions.rows, answers: answers.rows, comments: comments.rows });
    });

    // Admin > Hidden: hidden questions, answers and comments.
    router.get('/hidden', requireAuth, trackApiUsage, requireModerator, async (req, res) => {
        const [questions, answers, comments] = await Promise.all([
            pool.query(`SELECT ${questionColumns('$1')} FROM ${questionFrom} WHERE q.hidden ORDER BY q.updated_at DESC`,
                [req.user.id]),
            pool.query(`SELECT ${answerColumns('$1')}, q.title AS question_title FROM ${answerFrom}
                        WHERE a.hidden ORDER BY a.updated_at DESC`, [req.user.id]),
            pool.query(`SELECT ${commentColumns('$1')},
                        (SELECT title FROM questions WHERE id = c.question_id) AS question_title FROM ${commentFrom}
                        WHERE c.hidden ORDER BY c.updated_at DESC`, [req.user.id])
        ]);
        res.json({ questions: questions.rows, answers: answers.rows, comments: comments.rows });
    });

    // Admin > Categories.
    async function cleanCategory(input, id) {
        const title = cleanText(input.title, 1, 80);
        const description = input.description === undefined ? '' : cleanText(input.description, 0, 800);
        const slug = slugify(typeof input.slug === 'string' && input.slug.trim() ? input.slug : (title || ''));
        if (title === null || description === null || !slug) fail(400, messages.categories.invalid);
        let parentId = null;
        if (input.parent_id !== undefined && input.parent_id !== null && input.parent_id !== '') {
            parentId = parseId(input.parent_id);
            const { rows } = parentId && parentId !== id
                ? await pool.query('SELECT id FROM categories WHERE id = $1 AND parent_id IS NULL', [parentId])
                : { rows: [] };
            if (!rows[0]) fail(400, messages.categories.invalidParent);
            if (id) {
                const { rows: children } = await pool.query('SELECT 1 FROM categories WHERE parent_id = $1', [id]);
                if (children.length) fail(400, messages.categories.invalidParent);
            }
        }
        const position = Number.isInteger(input.position) ? input.position : 0;
        return { title, description, slug, parentId, position };
    }

    const saveCategory = (sql, values) => pool.query(sql, values).catch((error) => {
        if (error.code === '23505') fail(409, messages.categories.slugTaken);
        throw error;
    });

    router.post('/categories', requireAuth, trackApiUsage, requireAdmin, handle(async (req, res) => {
        const category = await cleanCategory(req.body || {});
        const { rows: [row] } = await saveCategory(
            `INSERT INTO categories (title, description, slug, parent_id, position) VALUES ($1, $2, $3, $4, $5)
             RETURNING *`, [category.title, category.description, category.slug, category.parentId, category.position]);
        res.status(201).json({ category: row });
    }));

    router.patch('/categories/:id', requireAuth, trackApiUsage, requireAdmin, handle(async (req, res) => {
        const id = parseId(req.params.id);
        if (!id) fail(404, messages.categories.notFound);
        const category = await cleanCategory(req.body || {}, id);
        const { rows: [row] } = await saveCategory(
            `UPDATE categories SET title = $2, description = $3, slug = $4, parent_id = $5, position = $6
             WHERE id = $1 RETURNING *`,
            [id, category.title, category.description, category.slug, category.parentId, category.position]);
        if (!row) fail(404, messages.categories.notFound);
        res.json({ category: row });
    }));

    // Questions in a deleted category become uncategorized; subcategories are removed.
    router.delete('/categories/:id', requireAuth, trackApiUsage, requireAdmin, handle(async (req, res) => {
        const id = parseId(req.params.id);
        const { rowCount } = id ? await pool.query('DELETE FROM categories WHERE id = $1', [id]) : { rowCount: 0 };
        if (!rowCount) fail(404, messages.categories.notFound);
        res.status(204).end();
    }));

    // Admin > General.
    router.get('/options', requireAuth, trackApiUsage, requireAdmin, async (req, res) => {
        res.json({ options: await readOptions(pool) });
    });

    router.patch('/options', requireAuth, trackApiUsage, requireAdmin, handle(async (req, res) => {
        const changes = cleanOptions(req.body);
        if (!changes) fail(400, messages.options.invalid);
        res.json({ options: await writeOptions(pool, changes) });
    }));

    return router;
}

module.exports = createAdminRouter;
