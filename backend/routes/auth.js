const express = require('express');
const bcrypt = require('bcrypt');
const { BCRYPT_ROUNDS, normalizeEmail, validPassword } = require('../auth/credentials');

// Match the bcrypt work for an unrecognized email to the work for a wrong password.
const dummyHash = bcrypt.hashSync(require('node:crypto').randomBytes(32).toString('hex'), BCRYPT_ROUNDS);

function createAuthRouter(pool, session) {
    const router = express.Router();

    router.post('/register', async (req, res) => {
        const { email, password } = req.body || {};
        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail || !validPassword(password)) {
            return res.status(400).json({
                message: 'Use a valid email and a password with at least 8 characters and at most 72 UTF-8 bytes'
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
            return res.status(409).json({ message: 'Email already registered' });
        }
        res.status(201).json({ user: result.rows[0] });
    });

    router.post('/login', async (req, res) => {
        const { email, password } = req.body || {};
        const normalizedEmail = normalizeEmail(email);
        const invalidCredentials = { message: 'Invalid email or password' };
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
