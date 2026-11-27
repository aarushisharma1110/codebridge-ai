const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { createSessionAuth } = require('./auth/session');
const createAuthRouter = require('./routes/auth');
const createAdminRouter = require('./routes/admin');
const createQuestionsRouter = require('./routes/questions');
const createAiRouter = require('./routes/ai');
const createPostRouter = require('./routes/posts');
const { createBrowseRouter, createSiteRouter } = require('./routes/browse');
const messages = require('../lang/message/en/messages.json');
const createApiUsageTracker = require('./middleware/apiUsage');

function createApp({
    pool, clientOrigin, jwtSecret, secureCookies = false, sessionCookieSameSite = 'lax',
    enableDatabaseDiagnostic = true, ai
}) {
    if (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32 || jwtSecret.startsWith('replace_with_')) {
        throw new Error('Set JWT_SECRET to a random secret of at least 32 bytes');
    }

    let origin;
    try {
        origin = new URL(clientOrigin);
    } catch {
        throw new Error('Set CLIENT_ORIGIN to the exact frontend origin');
    }
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== clientOrigin) {
        throw new Error('Set CLIENT_ORIGIN to the exact frontend origin without a trailing slash');
    }
    if (secureCookies && origin.protocol !== 'https:') {
        throw new Error('Secure cookie deployments require an HTTPS CLIENT_ORIGIN');
    }

    const app = express();
    const session = createSessionAuth({
        pool, secret: jwtSecret, secure: secureCookies, sameSite: sessionCookieSameSite
    });
    const trackApiUsage = createApiUsageTracker(pool);

    app.use(cors({
        origin: (requestOrigin, callback) => callback(null, requestOrigin === clientOrigin),
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type']
    }));
    app.use(cookieParser());

    app.use(['/api/v1/usage', '/api/v1/auth', '/api/v1/admin', '/api/v1/questions', '/api/v1/ai',
        '/api/v1/answers', '/api/v1/comments', '/api/v1/activity', '/api/v1/tags', '/api/v1/categories',
        '/api/v1/users', '/api/v1/favorites', '/api/v1/site'], (req, res, next) => {
        res.set('Cache-Control', 'no-store');

        // Browsers control Origin. Require it for every write, including login and logout.
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('Origin') !== clientOrigin) {
            return res.status(403).json({ message: messages.api.originDenied });
        }
        next();
    });
    app.use(express.json({ limit: '16kb' }));

    app.get(/^\/doc$/, (req, res) => res.redirect(308, '/doc/'));
    app.use('/doc', require('./routes/documentation')(enableDatabaseDiagnostic));

    app.use('/api/v1/auth', createAuthRouter(pool, session));
    app.use('/api/v1/admin', createAdminRouter(pool, session.requireAuth, trackApiUsage));
    app.use('/api/v1/questions', createQuestionsRouter(pool, session.requireAuth, trackApiUsage));
    app.use('/api/v1/answers', createPostRouter('answer', pool, session.requireAuth, trackApiUsage));
    app.use('/api/v1/comments', createPostRouter('comment', pool, session.requireAuth, trackApiUsage));
    app.use('/api/v1/site', createSiteRouter(pool));
    app.use('/api/v1', createBrowseRouter(pool, session.requireAuth, trackApiUsage));
    app.use('/api/v1/ai', createAiRouter(session.requireAuth, ai, trackApiUsage));
    app.use('/api/v1/usage', require('./routes/usage')(pool, session.requireAuth));

    app.get('/api/v1/health', (req, res) => {
        res.json({ message: messages.api.healthy });
    });

    if (enableDatabaseDiagnostic) {
        app.get('/api/v1/db-test', async (req, res) => {
            try {
                const result = await pool.query('SELECT current_database()');
                res.json({
                    message: messages.api.databaseConnected,
                    database: result.rows[0].current_database
                });
            } catch {
                console.error('Database connection check failed');
                res.status(500).json({ message: messages.api.databaseFailed });
            }
        });
    }

    app.use((error, req, res, next) => {
        if (res.headersSent) return next(error);

        if (error.type === 'entity.too.large') {
            return res.status(413).json({ message: messages.api.bodyTooLarge });
        }
        if (error.type === 'entity.parse.failed') {
            return res.status(400).json({ message: messages.api.invalidJson });
        }
        if (['encoding.unsupported', 'charset.unsupported'].includes(error.type)) {
            return res.status(415).json({ message: messages.api.unsupportedEncoding });
        }

        console.error('Request failed');
        res.status(500).json({ message: messages.api.internalError });
    });

    return app;
}

module.exports = createApp;
