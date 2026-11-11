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

    return router;
}

module.exports = createAdminRouter;
