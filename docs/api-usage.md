# API consumption tracking (Milestone 2)

## Counting policy

Only authenticated requests that reach an explicitly tracked functional route count. This includes question listing/detail/search reads, create/edit/delete, hidden-list reads, hide/reshow, voting, flagging, favorites, closing, best-answer selection, answers, comments, activity, tags, categories, user directory and profile reads, administrator moderation, category and option writes, and AI improvement. Each request inserts one row, including validation errors, authorization denials after authentication, missing resources, inference failures and server errors. The final HTTP status is saved.

Registration, login, logout, session lookup, profile and password changes under `/auth`, the public `GET /site` layout information, documentation, preflight OPTIONS, HEAD, health checks, database diagnostics, user usage reads, and administrator dashboard/directory/usage/statistics reads do not count. The Q2A interface makes several counted reads per page (for example the page list plus the sidebar categories), so the 20-call notice appears sooner than in Milestone 1; it remains a non-blocking warning. Unknown routes and unsupported methods do not count. Origin rejection and JSON parsing/size failures happen before tracked route authentication and do not count. Unauthenticated requests never count.

## Storage and response ordering

The existing api_usage schema stores user_id, method, normalized route_template (for example /api/v1/questions/:id), status_code and timestamp. No IDs are embedded in endpoint groups. PostgreSQL COUNT and grouped COUNT queries provide the authoritative values; new accounts need no usage rows and start at zero used and 20 remaining.

The tracker wraps response completion for the existing buffered JSON/empty routes. It captures the final status and awaits the INSERT before calling the original res.end. Unlike a finish listener, this commits usage before the client receives the completed functional response and performs its usage read. A per-response guard prevents duplicate tracking. Independent INSERTs preserve concurrent requests without a read-modify-write counter. This wrapper is intended for these buffered routes, not streaming responses.

If a usage INSERT fails, the backend logs "Failed to record API usage" and preserves the original functional response. That request cannot be guaranteed recorded during a database outage. There is no automatic retry (which could duplicate an ambiguously committed insert), billing or request blocking.

GET /api/v1/usage requires the existing session and returns totalUsage, freeAllowance (20), remainingCalls (minimum zero), allowanceExhausted (total >= 20), limitExceeded (total > 20), and breakdown grouped by method and endpoint, including errorCount. total and threshold aliases retain the earlier frontend contract. A single PostgreSQL statement produces a consistent total and breakdown snapshot. Responses are no-store.

GET /api/v1/admin/usage uses the existing requireAuth and requireAdmin middleware. byUser includes accounts with zero requests; byEndpoint groups by normalized endpoint and HTTP method. No password fields are selected.

## Threshold and frontend

At 20 calls the free allowance is exhausted; at 21 calls limitExceeded becomes true. Calls 21 and later still execute normally. There are no resets or enforcement gates.

After login or session restoration, the authenticated layout requests backend consumption. After question/AI responses (including failures and 204), the API service emits a refresh event. The layout retrieves fresh backend values and discards stale refresh results. The usage page loads the detailed breakdown on entry/reload. It uses the same display styles and localized warning:

"You have used all 20 free API calls. Your service will continue, but your free allowance has been exhausted."

## Automated local checks

Use the existing README setup, apply backend/db/schema.sql to the local database, and install the locked backend/frontend dependencies. Start PostgreSQL. TEST_DATABASE_URL (or DATABASE_URL in the root .env) must point to a disposable database whose user can create schemas. The integration suite creates a unique schema, uses it exclusively and removes it afterward; do not point tests at production.

```sh
npm --prefix backend test
npm --prefix backend run test:postgres
npm --prefix frontend test
npm --prefix frontend run build
```

The tracker tests run without sockets and verify response ordering, duplicate protection, failures, exclusions and concurrency. Existing HTTP AI tests stub inference. PostgreSQL integration covers registration, exclusions, question operations, AI validation failure, immediate reads, independent users, concurrent inserts, threshold boundaries, administrator access and logout/login persistence. Frontend tests use mocked HTTP responses, including warning appearance at 20 and continued AI use at 21. These tests do not prove real model inference or deployed behavior.

## Manual local and deployment verification

1. Start PostgreSQL, Express, Vite and llama.cpp using the existing setup instructions. Register a fresh account. In browser Network, confirm the first GET /usage after login reports zero used and 20 remaining. The questions page itself makes a counted list request, so the visible total can immediately become one.
2. Perform question create, read, edit, hide and delete; use an administrator for reshow. Confirm each functional response is followed by an uncounted GET /usage, with one additional call and a normalized endpoint group. Check both successful and denied/invalid operations.
3. Use AI improvement with real inference. Confirm one additional call whether it succeeds or returns a model error. Invalid AI input also counts after authentication.
4. Read health, diagnostics (local only), auth/me, usage and administrator statistics; verify the total stays unchanged. Test unauthenticated requests, HEAD and preflight the same way.
5. Reach 19 calls, then complete call 20. Confirm remainingCalls is zero, allowanceExhausted true, limitExceeded false and the exact warning is visible. Complete call 21; confirm the operation succeeds, total becomes 21 and limitExceeded is true.
6. Reload and log out/in: verify the same persisted total (allowing for counted question reads on page entry). Log in as another user and verify independent consumption.
7. As a regular user, GET /admin/usage must return 403 (401 without a session). As an administrator, check byUser and byEndpoint against database counts and the existing analytics tables.
8. After a separately authorized deployment, repeat these checks using the actual separate HTTPS frontend/API origins. Verify cookies, credentialed CORS, no-store responses, immediate post-response reads and the real AI service. Do not run the integration suite against production. Check server logs for recording failures and verify persistence after an API restart.
