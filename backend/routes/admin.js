const express = require('express');
const { requireAdmin } = require('../auth/session');

function createAdminRouter(pool, requireAuth) {
    const router = express.Router();

    router.get('/dashboard', requireAuth, requireAdmin, async (req,
                                                               res) => {
        const { rows } = await pool.query(
            `SELECT COUNT(*) FILTER (WHERE role = 'user')::int AS users,
                    COUNT(*) FILTER (WHERE role = 'admin')::int AS admins
             FROM users`
        );
        res.json(rows[0]);
    });

    router.get('/users', requireAuth, requireAdmin, async (req, res) => {
        const { rows } = await pool.query(
            'SELECT id, email, role, created_at FROM users ORDER BY id'
        );
        res.json({ users: rows });
    });

    router.get('/usage', requireAuth, requireAdmin, async (req, res) => {
        const { rows: byUser } = await pool.query(`
            SELECT u.id AS user_id, u.email, COUNT(a.id)::int AS count
            FROM users u LEFT JOIN api_usage a ON a.user_id = u.id
            GROUP BY u.id, u.email ORDER BY u.id`);
        const { rows: byEndpoint } = await pool.query(`
            SELECT method, route_template AS endpoint, COUNT(*)::int AS count,
                   COUNT(*) FILTER (WHERE status_code >= 400)::int AS "errorCount"
            FROM api_usage GROUP BY method, route_template ORDER BY method, route_template`);
        res.json({ byUser, byEndpoint });
    });

    return router;
}

module.exports = createAdminRouter;
