const express = require('express');
const messages = require('../messages');

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
            `SELECT id, user_id, title, body, created_at, updated_at, last_edited_by
             FROM questions
             ORDER BY created_at DESC, id DESC`
        );
        res.json({ questions: rows });
    });

    router.get('/:id', requireAuth, async (req, res) => {
        const id = parseId(req.params.id);
        if (!id) return res.status(404).json({ message: messages.questions.notFound });

        const { rows } = await pool.query(
            `SELECT id, user_id, title, body, created_at, updated_at, last_edited_by
             FROM questions
             WHERE id = $1`,
            [id]
        );
        if (!rows[0]) return res.status(404).json({ message: messages.questions.notFound });
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
             RETURNING id, user_id, title, body, created_at, updated_at, last_edited_by`,
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

        const existing = await pool.query('SELECT user_id FROM questions WHERE id = $1', [id]);
        if (!existing.rows[0]) return res.status(404).json({ message: messages.questions.notFound });
        const isOwner = existing.rows[0].user_id === req.user.id;
        const isAdmin = req.user.role === 'admin';
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ message: messages.questions.notOwner });
        }

        const { rows } = await pool.query(
            `UPDATE questions
             SET title = COALESCE($1, title),
                 body = COALESCE($2, body),
                 updated_at = CURRENT_TIMESTAMP,
                 last_edited_by = $4
             WHERE id = $3
             RETURNING id, user_id, title, body, created_at, updated_at, last_edited_by`,
            [title, body, id, req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ message: messages.questions.notFound });
        res.json({ question: rows[0] });
    });

    router.delete('/:id', requireAuth, async (req, res) => {
        const id = parseId(req.params.id);
        if (!id) return res.status(404).json({ message: messages.questions.notFound });

        const existing = await pool.query('SELECT user_id FROM questions WHERE id = $1', [id]);
        if (!existing.rows[0]) return res.status(404).json({ message: messages.questions.notFound });
        if (existing.rows[0].user_id !== req.user.id) {
            return res.status(403).json({ message: messages.questions.notOwner });
        }

        await pool.query('DELETE FROM questions WHERE id = $1 AND user_id = $2', [id, req.user.id]);
        res.status(204).end();
    });

    return router;
}

module.exports = createQuestionsRouter;
