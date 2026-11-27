const assert = require('node:assert/strict');
const { test } = require('node:test');
const tracker = require('../middleware/apiUsage');

test('persists exactly once before completing a response, with normalized route and final failure status', async () => {
    let commit;
    const inserts = [];
    const pool = { query(sql, values) { inserts.push(values); return new Promise(resolve => { commit = resolve; }); } };
    let ends = 0;
    const res = { locals: {}, statusCode: 403, end() { ends++; } };
    const req = { user: { id: 3 }, method: 'POST', baseUrl: '/api/v1/questions', route: { path: '/:id/reshow' } };
    const middleware = tracker(pool);
    middleware(req, res, () => {});
    middleware(req, res, () => {});
    res.end(); res.end();
    assert.equal(ends, 0);
    assert.deepEqual(inserts, [[3, 'POST', '/api/v1/questions/:id/reshow', 403]]);
    commit();
    await new Promise(setImmediate);
    assert.equal(ends, 1);
});

test('skips unauthenticated, HEAD and OPTIONS requests', () => {
    const middleware = tracker({ query() { assert.fail('must not write'); } });
    for (const req of [{ method: 'GET' }, { method: 'HEAD', user: { id: 1 } }, { method: 'OPTIONS', user: { id: 1 } }]) {
        const end = () => {};
        const res = { locals: {}, end };
        let next = false;
        middleware(req, res, () => { next = true; });
        assert.equal(next, true);
        assert.equal(res.end, end);
    }
});

test('concurrent requests each persist independently', async () => {
    const inserts = [];
    const middleware = tracker({ async query(sql, values) { await new Promise(setImmediate); inserts.push(values); } });
    await Promise.all(Array.from({ length: 30 }, (_, index) => new Promise(resolve => {
        const res = { locals: {}, statusCode: 200, end: resolve };
        middleware({ user: { id: index % 2 + 1 }, method: 'GET', baseUrl: '/api/v1/questions', route: { path: '/' } }, res, () => res.end());
    })));
    assert.equal(inserts.length, 30);
    assert.equal(inserts.filter(row => row[0] === 1).length, 15);
});

test('a database recording failure preserves the functional response and is logged', async () => {
    const original = console.error;
    let logged = false;
    console.error = () => { logged = true; };
    try {
        await new Promise(resolve => {
            const res = { locals: {}, statusCode: 201, end() { assert.equal(this.statusCode, 201); resolve(); } };
            tracker({ async query() { throw new Error('offline'); } })({ user: { id: 1 }, method: 'POST', baseUrl: '/api/v1/questions', route: { path: '/' } }, res, () => res.end());
        });
        assert.equal(logged, true);
    } finally { console.error = original; }
});

for (const totalUsage of [0, 19, 20, 21]) {
    test(`usage endpoint returns backend allowance fields at ${totalUsage} calls`, async () => {
        const createUsageRouter = require('../routes/usage');
        let result;
        const router = createUsageRouter({ async query(sql, values) {
            assert.deepEqual(values, [7]);
            assert.match(sql, /WHERE user_id = \$1/);
            return { rows: totalUsage ? [{ method: 'GET', endpoint: '/api/v1/questions', count: totalUsage, errorCount: 0, totalUsage }] : [] };
        } }, () => {});
        const handler = router.stack[0].route.stack.at(-1).handle;
        await handler({ user: { id: 7 } }, { json(data) { result = data; } });
        assert.equal(result.totalUsage, totalUsage);
        assert.equal(result.freeAllowance, 20);
        assert.equal(result.remainingCalls, Math.max(0, 20 - totalUsage));
        assert.equal(result.allowanceExhausted, totalUsage >= 20);
        assert.equal(result.limitExceeded, totalUsage > 20);
        assert.equal(result.breakdown.length, totalUsage ? 1 : 0);
    });
}
