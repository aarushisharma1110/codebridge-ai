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

    return router;
}

module.exports = createQuestionsRouter;
