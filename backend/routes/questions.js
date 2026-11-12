const express = require('express');
const messages = require('../messages');

// Provisional limits: the title limit matches the database column; both will be
// aligned with the pinned Q2A rules during the migration comparison.
const MAX_TITLE_LENGTH = 255;
const MAX_BODY_LENGTH = 10000;

// Returns the trimmed text, or null if it is missing, empty or too long.
function cleanText(value, maxLength) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text.length >= 1 && text.length <= maxLength ? text : null;
}

const MAX_ID = 2147483647; // largest value of the SERIAL id column

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
            `SELECT id, user_id, title, body, created_at, updated_at
             FROM questions
             ORDER BY created_at DESC, id DESC`
        );
        res.json({ questions: rows });
    });

    router.get('/:id', requireAuth, async (req, res) => {
        const id = parseId(req.params.id);
        if (!id) return res.status(404).json({ message: messages.questions.notFound });

        const { rows } = await pool.query(
            `SELECT id, user_id, title, body, created_at, updated_at
             FROM questions
             WHERE id = $1`,
            [id]
        );
        if (!rows[0]) return res.status(404).json({ message: messages.questions.notFound });
        res.json({ question: rows[0] });
    });

    router.post('/', requireAuth, async (req, res) => {
        const { title, body } = req.body || {};
        const cleanTitle = cleanText(title, MAX_TITLE_LENGTH);
        const cleanBody = cleanText(body, MAX_BODY_LENGTH);
        if (!cleanTitle || !cleanBody) {
            return res.status(400).json({
                message: messages.questions.invalidInput(MAX_TITLE_LENGTH, MAX_BODY_LENGTH)
            });
        }

        const { rows } = await pool.query(
            `INSERT INTO questions (user_id, title, body)
             VALUES ($1, $2, $3)
             RETURNING id, user_id, title, body, created_at, updated_at`,
            [req.user.id, cleanTitle, cleanBody]
        );
        res.status(201).json({ question: rows[0] });
    });

    router.patch('/:id', requireAuth, async (req, res) => {
        const id = parseId(req.params.id);
        if (!id) return res.status(404).json({ message: messages.questions.notFound });

        const { title, body } = req.body || {};
        const cleanTitle = title === undefined ? null : cleanText(title, MAX_TITLE_LENGTH);
        const cleanBody = body === undefined ? null : cleanText(body, MAX_BODY_LENGTH);
        const nothingToChange = title === undefined && body === undefined;
        const invalidField = (title !== undefined && !cleanTitle) || (body !== undefined && !cleanBody);
        if (nothingToChange || invalidField) {
            return res.status(400).json({
                message: messages.questions.invalidUpdate(MAX_TITLE_LENGTH, MAX_BODY_LENGTH)
            });
        }

        const existing = await pool.query('SELECT user_id FROM questions WHERE id = $1', [id]);
        if (!existing.rows[0]) return res.status(404).json({ message: messages.questions.notFound });
        if (existing.rows[0].user_id !== req.user.id) {
            return res.status(403).json({ message: messages.questions.notOwner });
        }

        const { rows } = await pool.query(
            `UPDATE questions
             SET title = COALESCE($1, title),
                 body = COALESCE($2, body),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3 AND user_id = $4
             RETURNING id, user_id, title, body, created_at, updated_at`,
            [cleanTitle, cleanBody, id, req.user.id]
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
