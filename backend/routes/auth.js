const express = require('express');
const bcrypt = require('bcrypt');
const { BCRYPT_ROUNDS, normalizeEmail, validPassword } = require('../auth/credentials');
const messages = require('../../lang/message/en/messages.json');

// Match the bcrypt work for an unrecognized email to the work for a wrong password.
const dummyHash = bcrypt.hashSync(require('node:crypto').randomBytes(32).toString('hex'), BCRYPT_ROUNDS);

function createAuthRouter(pool, session) {
    const router = express.Router();

    router.post('/register', async (req, res) => {
        const { email, password } = req.body || {};
        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail || !validPassword(password)) {
            return res.status(400).json({
                message: messages.api.invalidRegistration
            });
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const result = await pool.query(
            `INSERT INTO users (email, password_hash)
             VALUES ($1, $2)
             ON CONFLICT (email) DO NOTHING
             RETURNING id, email, role, created_at`,
            [normalizedEmail, passwordHash]
        );
        if (!result.rows[0]) {
            return res.status(409).json({ message: messages.api.emailRegistered });
        }
        res.status(201).json({ user: result.rows[0] });
    });

    router.post('/login', async (req, res) => {
        const { email, password } = req.body || {};
        const normalizedEmail = normalizeEmail(email);
        const invalidCredentials = { message: messages.api.invalidCredentials };
        if (!normalizedEmail || !validPassword(password, 1)) {
            return res.status(401).json(invalidCredentials);
        }

        const result = await pool.query(
            'SELECT id, email, role, created_at, password_hash FROM users WHERE email = $1',
            [normalizedEmail]
        );
        const account = result.rows[0];
        const matches = await bcrypt.compare(password, account?.password_hash ?? dummyHash);
        if (!account || !matches) return res.status(401).json(invalidCredentials);

        const { id, role, created_at } = account;
        session.setCookie(res, id);
        res.json({ user: { id, email: account.email, role, created_at } });
    });

    router.get('/me', session.requireAuth, (req, res) => {
        res.json({ user: req.user });
    });

    router.post('/logout', (req, res) => {
        session.clearCookie(res);
        res.status(204).end();
    });

    return router;
}

module.exports = createAuthRouter;
