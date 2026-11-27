const express = require('express');
const messages = require('../messages');
const { requireAdmin } = require('../auth/session');
const { LIMITS, atLeast, cleanText, parseId, parsePage, cleanTags, cleanTag, cleanHandle } = require('../lib/rules');
const {
    SORTS, UNANSWERED, listQuestions, getQuestion, listAnswers, listComments, getAnswer, getComment,
    setTags, transaction
} = require('../lib/posts');
const { castVote, flag, clearFlags, handle, fail, requireActive } = require('../lib/moderation');
const { cleanContent } = require('../lib/html');

// Limits from Q2A v1.8.8 defaults (see docs/q2a-analysis.md).
const cleanTitle = (value) => cleanText(value, LIMITS.minTitle, LIMITS.maxTitle);
// Bodies are plain text (format '') or sanitized HTML from the rich text editor (format 'html').
const cleanBody = (value, format) => cleanContent(value, format, LIMITS.minBody, LIMITS.maxBody);
const cleanAnswer = (value, format) => cleanContent(value, format, LIMITS.minAnswer, LIMITS.maxAnswer);
const cleanComment = (value, format) => cleanContent(value, format, LIMITS.minComment, LIMITS.maxComment);

const escapeLike = (text) => text.replace(/[\\%_]/g, (match) => '\\' + match);

// Builds the WHERE clauses for GET /questions from the query string.
function listOptions(query, user) {
    const where = ['NOT q.hidden'];
    const params = [];
    const outer = [];
    const add = (value) => { params.push(value); return `$${params.length + 1}`; };
    let order;

    const sort = Object.hasOwn(SORTS, query.sort) ? query.sort : 'recent';
    if (typeof query.category === 'string' && query.category) {
        const slug = add(query.category);
        where.push(`(c.slug = ${slug} OR c.parent_id = (SELECT id FROM categories WHERE slug = ${slug}))`);
    }
    if (query.tag !== undefined) {
        const tag = cleanTag(query.tag);
        where.push(tag ? `EXISTS (SELECT 1 FROM question_tags t WHERE t.question_id = q.id AND t.tag = ${add(tag)})` : 'FALSE');
    }
    if (query.user !== undefined) {
        const handleValue = cleanHandle(query.user);
        where.push(handleValue ? `lower(qu.handle) = lower(${add(handleValue)})` : 'FALSE');
    }
    if (query.favorites === 'true') {
        where.push(`EXISTS (SELECT 1 FROM favorite_questions f WHERE f.question_id = q.id AND f.user_id = $1)`);
    }
    if (Object.hasOwn(UNANSWERED, query.unanswered)) {
        where.push('q.closed_at IS NULL');
        outer.push(UNANSWERED[query.unanswered]);
    }
    if (typeof query.q === 'string' && query.q.trim()) {
        const words = [...new Set(query.q.toLowerCase().split(/\s+/).filter(Boolean))].slice(0, 8);
        const scores = words.map((word) => {
            const pattern = add(`%${escapeLike(word.slice(0, 80))}%`);
            return { pattern, score: `((s.title ILIKE ${pattern})::int * 2 + (s.body ILIKE ${pattern})::int
                + (array_to_string(s.tags, ' ') ILIKE ${pattern})::int * 2)` };
        });
        outer.push(`(${scores.map(({ score }) => score).join(' + ')}) > 0`);
        order = `(${scores.map(({ score }) => score).join(' + ')}) DESC, created_at DESC, id DESC`;
    }
    return { viewerId: user.id, where, params, outer, sort, order, page: parsePage(query.page) };
}

async function questionCategory(db, value) {
    if (value === null || value === '') return { id: null };
    const id = parseId(value);
    if (!id) return null;
    const { rows } = await db.query('SELECT id FROM categories WHERE id = $1', [id]);
    return rows[0] ? { id } : null;
}

function createQuestionsRouter(pool, requireAuth, trackApiUsage) {
    const router = express.Router();
    const tracked = [requireAuth, trackApiUsage];

    async function loadForChange(id, user) {
        const { rows: [question] } = await pool.query(
            'SELECT id, user_id, hidden, (closed_at IS NOT NULL) AS closed FROM questions WHERE id = $1', [id]);
        if (!question) fail(404, messages.questions.notFound);
        return question;
    }

    const idParam = (req) => {
        const id = parseId(req.params.id);
        if (!id) fail(404, messages.questions.notFound);
        return id;
    };

    router.get('/', ...tracked, async (req, res) => {
        res.json(await listQuestions(pool, listOptions(req.query, req.user)));
    });

    router.get('/hidden', ...tracked, requireAdmin, async (req, res) => {
        const result = await listQuestions(pool, {
            viewerId: req.user.id, where: ['q.hidden'], page: parsePage(req.query.page), pageSize: 100
        });
        res.json(result);
    });

    router.get('/:id', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        const question = await getQuestion(pool, id, req.user.id);
        if (!question) fail(404, messages.questions.notFound);
        const editor = atLeast(req.user, 'editor');
        if (question.hidden && !editor) fail(403, messages.questions.hidden);

        const [answers, comments, related] = await Promise.all([
            listAnswers(pool, id, req.user.id, editor),
            listComments(pool, id, req.user.id, editor),
            pool.query(
                `SELECT q.id, q.title, COUNT(*)::int AS score,
                        (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.id AND NOT a.hidden)::int AS answer_count
                 FROM question_tags t
                 JOIN question_tags t2 ON t2.tag = t.tag AND t2.question_id <> t.question_id
                 JOIN questions q ON q.id = t2.question_id
                 WHERE t.question_id = $1 AND NOT q.hidden
                 GROUP BY q.id ORDER BY score DESC, q.created_at DESC LIMIT 5`, [id]).then((result) => result.rows)
        ]);
        // Q2A counts a view when someone other than the author opens a visible question.
        if (!question.hidden && question.user_id !== req.user.id) {
            await pool.query('UPDATE questions SET views = views + 1 WHERE id = $1', [id]);
        }
        res.json({ question, answers, comments, related });
    }));

    router.post('/', ...tracked, handle(async (req, res) => {
        requireActive(req.user);
        const input = req.body || {};
        const title = cleanTitle(input.title);
        const body = cleanBody(input.body === undefined ? '' : input.body, input.format);
        if (title === null || body === null) {
            return res.status(400).json({ message: messages.questions.invalidInput(LIMITS) });
        }
        const tags = cleanTags(input.tags);
        if (tags === null) fail(400, messages.questions.invalidTags);
        const category = input.category_id === undefined ? { id: null } : await questionCategory(pool, input.category_id);
        if (!category) fail(400, messages.questions.invalidCategory);

        const id = await transaction(pool, async (db) => {
            const { rows: [row] } = await db.query(
                `INSERT INTO questions (user_id, title, body, format, category_id)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id`,
                [req.user.id, title, body.body, body.format, category.id]);
            await setTags(db, row.id, tags);
            return row.id;
        });
        res.status(201).json({ question: await getQuestion(pool, id, req.user.id) });
    }));

    router.patch('/:id', ...tracked, handle(async (req, res) => {
        const id = idParam(req);

        // A field that is not sent is left unchanged.
        const input = req.body || {};
        const titleSent = input.title !== undefined;
        const bodySent = input.body !== undefined;
        const tagsSent = input.tags !== undefined;
        const categorySent = input.category_id !== undefined;
        const title = titleSent ? cleanTitle(input.title) : null;
        const body = bodySent ? cleanBody(input.body, input.format) : null;
        const tags = tagsSent ? cleanTags(input.tags) : null;
        const nothingToChange = !titleSent && !bodySent && !tagsSent && !categorySent;
        const invalidField = (titleSent && title === null) || (bodySent && body === null);
        if (nothingToChange || invalidField) {
            return res.status(400).json({ message: messages.questions.invalidUpdate(LIMITS) });
        }
        if (tagsSent && tags === null) fail(400, messages.questions.invalidTags);
        const category = categorySent ? await questionCategory(pool, input.category_id) : null;
        if (categorySent && !category) fail(400, messages.questions.invalidCategory);

        const question = await loadForChange(id, req.user);
        const isOwner = question.user_id === req.user.id;
        const isEditor = atLeast(req.user, 'editor');
        if (question.hidden) {
            return isEditor ? res.status(409).json({ message: messages.questions.editHidden })
                : res.status(403).json({ message: messages.questions.hidden });
        }
        if (!isOwner && !isEditor) {
            return res.status(403).json({ message: messages.questions.notOwner });
        }
        requireActive(req.user);

        const updated = await transaction(pool, async (db) => {
            const { rowCount } = await db.query(
                `UPDATE questions
                 SET title = COALESCE($1, title),
                     body = COALESCE($2, body),
                     format = COALESCE($7, format),
                     category_id = CASE WHEN $5 THEN $6::int ELSE category_id END,
                     updated_at = CURRENT_TIMESTAMP,
                     last_edited_by = $4
                 WHERE id = $3 AND hidden = FALSE`,
                [title, body?.body ?? null, id, req.user.id, categorySent, category?.id ?? null, body?.format ?? null]);
            if (rowCount && tagsSent) await setTags(db, id, tags);
            return rowCount;
        });
        if (!updated) fail(404, messages.questions.notFound);
        res.json({ question: await getQuestion(pool, id, req.user.id) });
    }));

    router.post('/:id/hide', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        const question = await loadForChange(id, req.user);
        const isEditor = atLeast(req.user, 'editor');
        if (question.hidden && !isEditor) fail(403, messages.questions.hidden);
        if (!isEditor && question.user_id !== req.user.id) fail(403, messages.questions.notOwner);
        if (question.hidden) fail(409, messages.questions.alreadyHidden);

        const result = await pool.query(
            `UPDATE questions
             SET hidden = TRUE, updated_at = CURRENT_TIMESTAMP, last_edited_by = $2
             WHERE id = $1 AND hidden = FALSE`,
            [id, req.user.id]);
        if (!result.rowCount) fail(409, messages.questions.alreadyHidden);
        if (!isEditor) return res.status(204).end();
        res.json({ question: await getQuestion(pool, id, req.user.id) });
    }));

    router.post('/:id/reshow', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        if (!atLeast(req.user, 'editor')) fail(403, messages.posts.permission);
        const { rowCount } = await pool.query(
            `UPDATE questions
             SET hidden = FALSE, updated_at = CURRENT_TIMESTAMP, last_edited_by = $2
             WHERE id = $1 AND hidden = TRUE`,
            [id, req.user.id]);
        if (!rowCount) {
            const result = await pool.query('SELECT 1 FROM questions WHERE id = $1', [id]);
            if (!result.rowCount) fail(404, messages.questions.notFound);
            fail(409, messages.questions.notHidden);
        }
        res.json({ question: await getQuestion(pool, id, req.user.id) });
    }));

    router.delete('/:id', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        const question = await loadForChange(id, req.user);
        const isModerator = atLeast(req.user, 'moderator');
        if (question.hidden && !isModerator) fail(403, messages.questions.hidden);
        if (!question.hidden && question.user_id !== req.user.id) fail(403, messages.questions.notOwner);
        if (!question.hidden) {
            // Owners may delete a visible question only before others have responded to it.
            const { rows: [{ responses }] } = await pool.query(
                `SELECT ((SELECT COUNT(*) FROM answers WHERE question_id = $1)
                       + (SELECT COUNT(*) FROM comments WHERE question_id = $1))::int AS responses`, [id]);
            if (responses) fail(409, messages.questions.hasAnswers);
        }
        const result = await pool.query(
            'DELETE FROM questions WHERE id = $1 AND hidden = $2 AND (hidden OR user_id = $3)',
            [id, question.hidden, req.user.id]);
        if (!result.rowCount) fail(404, messages.questions.notFound);
        res.status(204).end();
    }));

    router.post('/:id/vote', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        await castVote(pool, 'question', id, req.user, req.body?.vote);
        res.json({ question: await getQuestion(pool, id, req.user.id) });
    }));

    router.post('/:id/flag', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        await flag(pool, 'question', id, req.user, true);
        res.json({ question: await getQuestion(pool, id, req.user.id) });
    }));

    router.delete('/:id/flag', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        await flag(pool, 'question', id, req.user, false);
        res.json({ question: await getQuestion(pool, id, req.user.id) });
    }));

    router.delete('/:id/flags', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        await clearFlags(pool, 'question', id, req.user);
        res.json({ question: await getQuestion(pool, id, req.user.id) });
    }));

    router.post('/:id/favorite', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        const question = await loadForChange(id, req.user);
        if (question.hidden) fail(403, messages.questions.hidden);
        await pool.query('INSERT INTO favorite_questions (user_id, question_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [req.user.id, id]);
        res.json({ question: await getQuestion(pool, id, req.user.id) });
    }));

    router.delete('/:id/favorite', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        await loadForChange(id, req.user);
        await pool.query('DELETE FROM favorite_questions WHERE user_id = $1 AND question_id = $2', [req.user.id, id]);
        res.json({ question: await getQuestion(pool, id, req.user.id) });
    }));

    router.post('/:id/close', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        const question = await loadForChange(id, req.user);
        if (question.hidden) fail(403, messages.questions.hidden);
        if (question.user_id !== req.user.id && !atLeast(req.user, 'editor')) fail(403, messages.questions.notOwner);
        requireActive(req.user);
        if (question.closed) fail(409, messages.questions.alreadyClosed);
        const input = req.body || {};
        let duplicateOf = null;
        let reason = null;
        if (input.duplicate_of !== undefined && input.duplicate_of !== null && input.duplicate_of !== '') {
            duplicateOf = parseId(input.duplicate_of);
            const { rows } = duplicateOf && duplicateOf !== id
                ? await pool.query('SELECT id FROM questions WHERE id = $1 AND NOT hidden', [duplicateOf]) : { rows: [] };
            if (!rows[0]) fail(400, messages.questions.invalidClose);
        } else {
            reason = cleanText(input.reason, 1, 800);
            if (reason === null) fail(400, messages.questions.invalidClose);
        }
        await pool.query(
            `UPDATE questions SET closed_at = CURRENT_TIMESTAMP, closed_by = $2, close_reason = $3, duplicate_of = $4
             WHERE id = $1`, [id, req.user.id, reason, duplicateOf]);
        res.json({ question: await getQuestion(pool, id, req.user.id) });
    }));

    router.post('/:id/reopen', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        const question = await loadForChange(id, req.user);
        if (question.hidden) fail(403, messages.questions.hidden);
        if (question.user_id !== req.user.id && !atLeast(req.user, 'editor')) fail(403, messages.questions.notOwner);
        if (!question.closed) fail(409, messages.questions.notClosed);
        await pool.query(
            `UPDATE questions SET closed_at = NULL, closed_by = NULL, close_reason = NULL, duplicate_of = NULL
             WHERE id = $1`, [id]);
        res.json({ question: await getQuestion(pool, id, req.user.id) });
    }));

    // Select or clear the best answer. Q2A allows the asker and editors and above.
    router.post('/:id/select', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        const question = await loadForChange(id, req.user);
        if (question.hidden) fail(403, messages.questions.hidden);
        if (question.user_id !== req.user.id && !atLeast(req.user, 'editor')) fail(403, messages.questions.notOwner);
        requireActive(req.user);
        const raw = req.body?.answer_id;
        let answerId = null;
        if (raw !== null && raw !== undefined) {
            answerId = parseId(raw);
            const { rows } = answerId ? await pool.query(
                'SELECT id FROM answers WHERE id = $1 AND question_id = $2 AND NOT hidden', [answerId, id]) : { rows: [] };
            if (!rows[0]) fail(400, messages.questions.invalidSelection);
        }
        await pool.query('UPDATE questions SET selected_answer_id = $2 WHERE id = $1', [id, answerId]);
        res.json({
            question: await getQuestion(pool, id, req.user.id),
            answers: await listAnswers(pool, id, req.user.id, atLeast(req.user, 'editor'))
        });
    }));

    router.post('/:id/answers', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        const question = await loadForChange(id, req.user);
        if (question.hidden) fail(403, messages.questions.hidden);
        if (question.closed) fail(409, messages.questions.closed);
        requireActive(req.user);
        const body = cleanAnswer(req.body?.body, req.body?.format);
        if (body === null) fail(400, messages.answers.invalidInput(LIMITS));
        const { rows: [row] } = await pool.query(
            'INSERT INTO answers (question_id, user_id, body, format) VALUES ($1, $2, $3, $4) RETURNING id',
            [id, req.user.id, body.body, body.format]);
        res.status(201).json({ answer: await getAnswer(pool, row.id, req.user.id) });
    }));

    router.post('/:id/comments', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        const question = await loadForChange(id, req.user);
        if (question.hidden) fail(403, messages.questions.hidden);
        if (question.closed) fail(409, messages.questions.closed);
        requireActive(req.user);
        const body = cleanComment(req.body?.body, req.body?.format);
        if (body === null) fail(400, messages.comments.invalidInput(LIMITS));
        const { rows: [row] } = await pool.query(
            'INSERT INTO comments (question_id, user_id, body, format) VALUES ($1, $2, $3, $4) RETURNING id',
            [id, req.user.id, body.body, body.format]);
        res.status(201).json({ comment: await getComment(pool, row.id, req.user.id) });
    }));

    return router;
}

module.exports = createQuestionsRouter;
