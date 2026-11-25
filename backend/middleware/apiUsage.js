function createApiUsageTracker(pool) {
    return function trackApiUsage(req, res, next) {
        if (!req.user || ['OPTIONS', 'HEAD'].includes(req.method) || res.locals.usageTracked) return next();
        res.locals.usageTracked = true;
        const values = [req.user.id, req.method, (req.baseUrl + req.route.path).replace(/\/$/, '')];
        const end = res.end;
        let ending = false;
        // Buffered JSON/empty responses complete only after the usage insert commits.
        res.end = function (...args) {
            if (ending) return res;
            ending = true;
            pool.query(`INSERT INTO api_usage (user_id, method, route_template, status_code)
                        VALUES ($1, $2, $3, $4)`, [...values, res.statusCode])
                .catch(() => console.error('Failed to record API usage'))
                .finally(() => { res.end = end; end.apply(res, args); });
            return res;
        };
        next();
    };
}
module.exports = createApiUsageTracker;
