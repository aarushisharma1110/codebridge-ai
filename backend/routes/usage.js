const express = require('express');
function createUsageRouter(pool, requireAuth) {
    const router = express.Router();
    router.get('/', requireAuth, async (req, res) => {
        // A single statement provides a consistent total and breakdown snapshot.
        const { rows } = await pool.query(`
            SELECT method, route_template AS endpoint, COUNT(*)::int AS count,
                   COUNT(*) FILTER (WHERE status_code >= 400)::int AS "errorCount",
                   (SUM(COUNT(*)) OVER ())::int AS "totalUsage"
            FROM api_usage WHERE user_id = $1
            GROUP BY method, route_template ORDER BY method, route_template`, [req.user.id]);
        const totalUsage = rows[0]?.totalUsage || 0;
        res.json({ totalUsage, freeAllowance: 20, remainingCalls: Math.max(0, 20 - totalUsage),
            limitExceeded: totalUsage > 20, allowanceExhausted: totalUsage >= 20,
            total: totalUsage, threshold: 20,
            breakdown: rows.map(({ totalUsage, ...row }) => row) });
    });
    return router;
}
module.exports = createUsageRouter;
