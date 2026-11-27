const express = require('express');
const bcrypt = require('bcrypt');
const { BCRYPT_ROUNDS, normalizeEmail, validPassword } = require('../auth/credentials');
const { cleanHandle, cleanText } = require('../lib/rules');
const backendMessages = require('../messages');
const messages = require('../../lang/message/en/messages.json');

// Match the bcrypt work for an unrecognized email to the work for a wrong password.
const dummyHash = bcrypt.hashSync(require('node:crypto').randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
const PROFILE_COLUMNS = 'id, handle, email, role, blocked, created_at, full_name, location, website, about';

function createAuthRouter(pool, session, trackApiUsage = (req, res, next) => next()) {
    const router = express.Router();

    router.post('/register', async (req, res) => {
        const { email, password, handle } = req.body || {};
        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail || !validPassword(password)) {
            return res.status(400).json({
                message: messages.api.invalidRegistration
            });
        }
        // Q2A asks for a username; when it is omitted one is derived from the email address.
        const username = handle === undefined || handle === null || handle === '' ? null : cleanHandle(handle);
        if (username === null && handle !== undefined && handle !== null && handle !== '') {
            return res.status(400).json({ message: backendMessages.users.invalidHandle });
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        let result;
        try {
            result = await pool.query(
                `INSERT INTO users (email, password_hash, handle)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (email) DO NOTHING
                 RETURNING id, handle, email, role, created_at`,
                [normalizedEmail, passwordHash, username]
            );
        } catch (error) {
            if (error.code === '23505') return res.status(409).json({ message: backendMessages.users.handleTaken });
            throw error;
        }
        if (!result.rows[0]) {
            return res.status(409).json({ message: messages.api.emailRegistered });
        }
        res.status(201).json({ user: result.rows[0] });
    });

    // Q2A accepts an email address or a username in the login field.
    router.post('/login', async (req, res) => {
        const { email, password } = req.body || {};
        const normalizedEmail = normalizeEmail(email);
        const username = !normalizedEmail && typeof email === 'string' && !email.includes('@') ? cleanHandle(email) : null;
        const invalidCredentials = { message: messages.api.invalidCredentials };
        if ((!normalizedEmail && !username) || !validPassword(password, 1)) {
            return res.status(401).json(invalidCredentials);
        }

        const result = normalizedEmail
            ? await pool.query(
                'SELECT id, handle, email, role, created_at, password_hash FROM users WHERE email = $1',
                [normalizedEmail])
            : await pool.query(
                'SELECT id, handle, email, role, created_at, password_hash FROM users WHERE lower(handle) = lower($1)',
                [username]);
        const account = result.rows[0];
        const matches = await bcrypt.compare(password, account?.password_hash ?? dummyHash);
        if (!account || !matches) return res.status(401).json(invalidCredentials);

        const { id, handle, role, created_at } = account;
        session.setCookie(res, id);
        res.json({ user: { id, handle, email: account.email, role, created_at } });
    });

    router.get('/me', session.requireAuth, (req, res) => {
        res.json({ user: req.user });
    });

    // Q2A "My account": profile fields only. Email, level and blocked state cannot change here.
    router.patch('/me', session.requireAuth, trackApiUsage, async (req, res) => {
        const input = req.body || {};
        const fields = { full_name: 100, location: 100, website: 200, about: 12000 };
        const changes = {};
        for (const [name, max] of Object.entries(fields)) {
            if (input[name] === undefined) continue;
            const value = cleanText(input[name], 0, max);
            if (value === null) return res.status(400).json({ message: backendMessages.users.invalidProfile });
            changes[name] = value;
        }
        if (input.handle !== undefined) {
            const username = cleanHandle(input.handle);
            if (!username) return res.status(400).json({ message: backendMessages.users.invalidHandle });
            changes.handle = username;
        }
        if (changes.website && !/^https?:\/\/\S+$/i.test(changes.website)) {
            return res.status(400).json({ message: backendMessages.users.invalidProfile });
        }
        const names = Object.keys(changes);
        if (!names.length) return res.status(400).json({ message: backendMessages.users.invalidProfile });
        try {
            const { rows: [user] } = await pool.query(
                `UPDATE users SET ${names.map((name, index) => `${name} = $${index + 2}`).join(', ')}
                 WHERE id = $1 RETURNING ${PROFILE_COLUMNS}`,
                [req.user.id, ...names.map((name) => changes[name])]);
            res.json({ user });
        } catch (error) {
            if (error.code === '23505') return res.status(409).json({ message: backendMessages.users.handleTaken });
            throw error;
        }
    });

    router.post('/password', session.requireAuth, trackApiUsage, async (req, res) => {
        const { currentPassword, newPassword } = req.body || {};
        if (!validPassword(newPassword)) return res.status(400).json({ message: backendMessages.users.invalidPassword });
        const { rows: [account] } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
        const matches = typeof currentPassword === 'string' && Buffer.byteLength(currentPassword, 'utf8') <= 72 &&
            await bcrypt.compare(currentPassword, account?.password_hash ?? dummyHash);
        if (!account || !matches) return res.status(403).json({ message: backendMessages.users.wrongPassword });
        await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1',
            [req.user.id, await bcrypt.hash(newPassword, BCRYPT_ROUNDS)]);
        res.status(204).end();
    });

    router.post('/logout', (req, res) => {
        session.clearCookie(res);
        res.status(204).end();
    });

    return router;
}

module.exports = createAuthRouter;
