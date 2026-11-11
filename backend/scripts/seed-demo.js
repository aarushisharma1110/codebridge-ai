const bcrypt = require('bcrypt');
const { BCRYPT_ROUNDS } = require('../auth/credentials');

async function seedDemoAccounts(db) {
    // Course demo fixtures only. Use a disposable database for demonstrations.
    const accounts = [
        { email: 'john@john.com', password: '123', role: 'user' },
        { email: 'admin@admin.com', password: '111', role: 'admin' }
    ];

    await db.query('BEGIN');
    try {
        for (const { email, password, role } of accounts) {
            const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
            await db.query(
                `INSERT INTO users (email, password_hash, role)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (email) DO NOTHING`,
                [email, passwordHash, role]
            );

            const { rows: [account] } = await db.query(
                'SELECT password_hash, role FROM users WHERE email = $1',
                [email]
            );
            if (!account || account.role !== role || !await bcrypt.compare(password, account.password_hash)) {
                throw new Error(`Existing account conflicts with the demo fixture for ${email}`);
            }
        }
        await db.query('COMMIT');
    } catch (error) {
        await db.query('ROLLBACK');
        throw error;
    }
}

async function main() {
    require('dotenv').config({
        path: require('node:path').resolve(__dirname, '../../.env'),
        quiet: true
    });
    if (process.env.NODE_ENV === 'production' || !process.env.DATABASE_URL) {
        throw new Error('Seeding requires a local or demo DATABASE_URL and a non-production NODE_ENV');
    }

    const pool = require('../db');
    try {
        const client = await pool.connect();
        try {
            await seedDemoAccounts(client);
        } finally {
            client.release();
        }
        console.log('Demo accounts are ready');
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    main().catch((error) => {
        // Avoid printing connection details or raw database errors.
        if (error.message.startsWith('Existing account conflicts') ||
            error.message.startsWith('Seeding requires')) {
            console.error(error.message);
        } else {
            console.error('Could not seed demo accounts. Check your database connection and schema.');
        }
        process.exitCode = 1;
    });
}

module.exports = seedDemoAccounts;
