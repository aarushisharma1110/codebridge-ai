require('dotenv').config({
    path: require('node:path').resolve(__dirname, '../.env'),
    quiet: true
});

const createApp = require('./app');
const pool = require('./db');

const app = createApp({
    pool,
    clientOrigin: process.env.CLIENT_ORIGIN,
    jwtSecret: process.env.JWT_SECRET,
    secureCookies: process.env.NODE_ENV === 'production',
    ai: {
        serviceUrl: process.env.AI_SERVICE_URL,
        model: process.env.AI_MODEL,
        timeoutMs: process.env.AI_TIMEOUT_MS
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
