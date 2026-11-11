const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { createSessionAuth } = require('./auth/session');
const createAuthRouter = require('./routes/auth');
const createAdminRouter = require('./routes/admin');

function createApp({ pool, clientOrigin, jwtSecret, secureCookies = false }) {
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
    const session = createSessionAuth({ pool, secret: jwtSecret, secure: secureCookies });

    app.use(cors({
        origin: (requestOrigin, callback) => callback(null, requestOrigin === clientOrigin),
        credentials: true,
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type']
    }));
    app.use(cookieParser());

    app.use(['/api/v1/auth', '/api/v1/admin'], (req, res, next) => {
        res.set('Cache-Control', 'no-store');

        // Browsers control Origin. Require it for every write, including login and logout.
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('Origin') !== clientOrigin) {
            return res.status(403).json({ message: 'Request origin is not allowed' });
        }
        next();
    });
    app.use(express.json({ limit: '16kb' }));

    app.use('/api/v1/auth', createAuthRouter(pool, session));
    app.use('/api/v1/admin', createAdminRouter(pool, session.requireAuth));

    app.get('/api/v1/health', (req, res) => {
        res.json({ message: 'CodeBridge AI API is running' });
    });

    app.get('/api/v1/db-test', async (req, res) => {
        try {
            const result = await pool.query('SELECT current_database()');
            res.json({
                message: 'Database connected successfully',
                database: result.rows[0].current_database
            });
        } catch {
            console.error('Database connection check failed');
            res.status(500).json({ message: 'Database connection failed' });
        }
    });

    app.use((error, req, res, next) => {
        if (res.headersSent) return next(error);

        if (error.type === 'entity.too.large') {
            return res.status(413).json({ message: 'Request body is too large' });
        }
        if (error.type === 'entity.parse.failed') {
            return res.status(400).json({ message: 'Invalid JSON body' });
        }
        if (['encoding.unsupported', 'charset.unsupported'].includes(error.type)) {
            return res.status(415).json({ message: 'Unsupported request encoding' });
        }

        console.error('Request failed');
        res.status(500).json({ message: 'Internal server error' });
    });

    return app;
}

module.exports = createApp;
