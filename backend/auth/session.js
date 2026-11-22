const jwt = require('jsonwebtoken');
const messages = require('../../lang/message/en/messages.json');

const COOKIE_NAME = 'codebridge_session';
const SESSION_SECONDS = 60 * 60;
const ISSUER = 'codebridge-ai';

function createSessionAuth({ pool, secret, secure, sameSite = 'lax' }) {
    if (!['lax', 'none'].includes(sameSite)) {
        throw new Error('Set SESSION_COOKIE_SAME_SITE to lax or none');
    }
    if (sameSite === 'none' && !secure) {
        throw new Error('SESSION_COOKIE_SAME_SITE=none requires secure production cookies');
    }
    const cookieOptions = { httpOnly: true, secure, sameSite, path: '/api/v1' };

    function setCookie(res, userId) {
        const token = jwt.sign({}, secret, {
            algorithm: 'HS256',
            issuer: ISSUER,
            subject: String(userId),
            expiresIn: SESSION_SECONDS
        });
        res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_SECONDS * 1000 });
    }

    function clearCookie(res) {
        res.clearCookie(COOKIE_NAME, cookieOptions);
    }

    async function requireAuth(req, res, next) {
        const token = req.cookies[COOKIE_NAME];
        if (!token) return res.status(401).json({ message: messages.api.authenticationRequired });

        let userId;
        try {
            const claims = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: ISSUER });
            userId = Number(claims.sub);
            if (!Number.isInteger(userId) || userId < 1 || userId > 2147483647 ||
                String(userId) !== claims.sub || !Number.isInteger(claims.exp)) {
                return res.status(401).json({ message: messages.api.invalidSession });
            }
        } catch {
            return res.status(401).json({ message: messages.api.invalidSession });
        }

        const result = await pool.query(
            'SELECT id, email, role, created_at FROM users WHERE id = $1',
            [userId]
        );
        if (!result.rows[0]) return res.status(401).json({ message: messages.api.invalidSession });

        req.user = result.rows[0];
        next();
    }

    return { setCookie, clearCookie, requireAuth };
}

function requireAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ message: messages.api.authenticationRequired });
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: messages.common.adminRequired });
    }
    next();
}

module.exports = { createSessionAuth, requireAdmin };
