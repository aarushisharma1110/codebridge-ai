const express = require('express');
const messages = require('../messages');
const { requireAdmin } = require('../auth/session');

// Limits from Q2A v1.8.8 defaults (see docs/q2a-analysis.md).
const MIN_TITLE_LENGTH = 12;
const MAX_TITLE_LENGTH = 120;
const MIN_BODY_LENGTH = 0;
const MAX_BODY_LENGTH = 12000;
const LIMITS = {
    minTitle: MIN_TITLE_LENGTH,
    maxTitle: MAX_TITLE_LENGTH,
    minBody: MIN_BODY_LENGTH,
    maxBody: MAX_BODY_LENGTH
};

const MAX_ID = 2147483647; // largest value of the SERIAL id column
const QUESTION_COLUMNS = 'id, user_id, title, body, created_at, updated_at, last_edited_by, hidden';

// Returns the trimmed text, or null if it is not text or its length is out of range.
function cleanText(value, minLength, maxLength) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text.length >= minLength && text.length <= maxLength ? text : null;
}

const cleanTitle = (value) => cleanText(value, MIN_TITLE_LENGTH, MAX_TITLE_LENGTH);
const cleanBody = (value) => cleanText(value, MIN_BODY_LENGTH, MAX_BODY_LENGTH);

// Returns the id as a positive integer, or null if the URL value is not one.
function parseId(value) {
    if (!/^[1-9]\d{0,9}$/.test(value)) return null;
    const id = Number(value);
    return id <= MAX_ID ? id : null;
}

function createQuestionsRouter(pool, requireAuth) {
    const router = express.Router();

    router.get('/', requireAuth, async (req, res) => {
        const { rows } = await pool.query(
            `SELECT ${QUESTION_COLUMNS}
             FROM questions
             WHERE hidden = FALSE
             ORDER BY created_at DESC, id DESC`
        );
        res.json({ questions: rows });
    });

    router.get('/hidden', requireAuth, requireAdmin, async (req, res) => {
        const { rows } = await pool.query(
            `SELECT ${QUESTION_COLUMNS}
             FROM questions
             WHERE hidden = TRUE
             ORDER BY created_at DESC, id DESC`
        );
        res.json({ questions: rows });
    });

    router.get('/:id', requireAuth, async (req, res) => {
        const id = parseId(req.params.id);
        if (!id) return res.status(404).json({ message: messages.questions.notFound });

        const { rows } = await pool.query(
            `SELECT ${QUESTION_COLUMNS}
             FROM questions
             WHERE id = $1`,
            [id]
        );
        if (!rows[0]) return res.status(404).json({ message: messages.questions.notFound });
        if (rows[0].hidden && req.user.role !== 'admin') {
            return res.status(403).json({ message: messages.questions.hidden });
        }
        res.json({ question: rows[0] });
    });

    router.post('/', requireAuth, async (req, res) => {
        const input = req.body || {};
        const title = cleanTitle(input.title);
        const body = cleanBody(input.body === undefined ? '' : input.body);
        if (title === null || body === null) {
            return res.status(400).json({ message: messages.questions.invalidInput(LIMITS) });
        }

        const { rows } = await pool.query(
            `INSERT INTO questions (user_id, title, body)
             VALUES ($1, $2, $3)
             RETURNING ${QUESTION_COLUMNS}`,
            [req.user.id, title, body]
        );
        res.status(201).json({ question: rows[0] });
    });

    router.patch('/:id', requireAuth, async (req, res) => {
        const id = parseId(req.params.id);
        if (!id) return res.status(404).json({ message: messages.questions.notFound });

        // A field that is not sent is left unchanged (null means "keep the current value").
        const input = req.body || {};
        const titleSent = input.title !== undefined;
        const bodySent = input.body !== undefined;
        const title = titleSent ? cleanTitle(input.title) : null;
        const body = bodySent ? cleanBody(input.body) : null;
        const nothingToChange = !titleSent && !bodySent;
        const invalidField = (titleSent && title === null) || (bodySent && body === null);
        if (nothingToChange || invalidField) {
            return res.status(400).json({ message: messages.questions.invalidUpdate(LIMITS) });
        }

        const { rows: [question] } = await pool.query('SELECT user_id, hidden FROM questions WHERE id = $1', [id]);
        if (!question) return res.status(404).json({ message: messages.questions.notFound });
        const isOwner = question.user_id === req.user.id;
        const isAdmin = req.user.role === 'admin';
        if (question.hidden) {
            return isAdmin ? res.status(409).json({ message: messages.questions.editHidden })
                : res.status(403).json({ message: messages.questions.hidden });
        }
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ message: messages.questions.notOwner });
        }

        const { rows } = await pool.query(
            `UPDATE questions
             SET title = COALESCE($1, title),
                 body = COALESCE($2, body),
                 updated_at = CURRENT_TIMESTAMP,
                 last_edited_by = $4
             WHERE id = $3 AND hidden = FALSE
             RETURNING ${QUESTION_COLUMNS}`,
            [title, body, id, req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ message: messages.questions.notFound });
        res.json({ question: rows[0] });
    });

    router.post('/:id/hide', requireAuth, async (req, res) => {
        const id = parseId(req.params.id);
        if (!id) return res.status(404).json({ message: messages.questions.notFound });

        const { rows: [question] } = await pool.query('SELECT user_id, hidden FROM questions WHERE id = $1', [id]);
        if (!question) return res.status(404).json({ message: messages.questions.notFound });
        const isAdmin = req.user.role === 'admin';
        if (question.hidden && !isAdmin) return res.status(403).json({ message: messages.questions.hidden });
        if (!isAdmin && question.user_id !== req.user.id) {
            return res.status(403).json({ message: messages.questions.notOwner });
        }
        if (question.hidden) return res.status(409).json({ message: messages.questions.alreadyHidden });

        const result = await pool.query(
            `UPDATE questions
             SET hidden = TRUE, updated_at = CURRENT_TIMESTAMP, last_edited_by = $2
             WHERE id = $1 AND hidden = FALSE
             RETURNING ${isAdmin ? QUESTION_COLUMNS : 'id'}`,
            [id, req.user.id]
        );
        if (!result.rowCount) return res.status(409).json({ message: messages.questions.alreadyHidden });
        if (!isAdmin) return res.status(204).end();
        res.json({ question: result.rows[0] });
    });

    router.post('/:id/reshow', requireAuth, requireAdmin, async (req, res) => {
        const id = parseId(req.params.id);
        if (!id) return res.status(404).json({ message: messages.questions.notFound });

        const { rows: [question] } = await pool.query(
            `UPDATE questions
             SET hidden = FALSE, updated_at = CURRENT_TIMESTAMP, last_edited_by = $2
             WHERE id = $1 AND hidden = TRUE
             RETURNING ${QUESTION_COLUMNS}`,
            [id, req.user.id]
        );
        if (!question) {
            const result = await pool.query('SELECT 1 FROM questions WHERE id = $1', [id]);
            if (!result.rowCount) return res.status(404).json({ message: messages.questions.notFound });
            return res.status(409).json({ message: messages.questions.notHidden });
        }
        res.json({ question });
    });

    router.delete('/:id', requireAuth, async (req, res) => {
        const id = parseId(req.params.id);
        if (!id) return res.status(404).json({ message: messages.questions.notFound });

        const { rows: [question] } = await pool.query('SELECT user_id, hidden FROM questions WHERE id = $1', [id]);
        if (!question) return res.status(404).json({ message: messages.questions.notFound });
        if (question.hidden && req.user.role !== 'admin') {
            return res.status(403).json({ message: messages.questions.hidden });
        }
        if (!question.hidden && question.user_id !== req.user.id) {
            return res.status(403).json({ message: messages.questions.notOwner });
        }

        const result = await pool.query(
            'DELETE FROM questions WHERE id = $1 AND hidden = $2 AND (hidden OR user_id = $3)',
            [id, question.hidden, req.user.id]
        );
        if (!result.rowCount) return res.status(404).json({ message: messages.questions.notFound });
        res.status(204).end();
    });

    return router;
}

module.exports = createQuestionsRouter;
