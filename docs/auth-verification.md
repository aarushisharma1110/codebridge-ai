# Authentication and authorization verification

Date: November 24, 2026. Scope: COMP 4537 Milestone 2, current working tree.

## Assessment

The local authentication and authorization implementation passed the executed checks. It cannot yet be marked fully complete because real-browser authentication between the deployed Netlify frontend and DuckDNS API remains unverified. No application implementation, dependencies, production data, commits, pushes or deployments were changed by this verification. Existing working-tree changes were preserved.

## Mandatory requirements

Statuses refer to the evidence explicitly described, not a claim that the deployed application passed.

| # | Requirement | Implementation location | Test performed and actual result | Status |
| --- | --- | --- | --- | --- |
| 1 | Register/login using email and password | backend/routes/auth.js; backend/auth/credentials.js | Existing HTTP auth tests pass in three configurations. Isolated PostgreSQL registration/login, normalized email and duplicate checks pass. | Passed |
| 2 | Bcrypt, no plaintext password storage | backend/auth/credentials.js; backend/routes/auth.js; backend/db/schema.sql | Real stored password_hash differs from password, bcrypt.compare succeeds, cost is 12; responses contain only public fields. Registration SQL sends a hash. | Passed |
| 3 | Signed JWT on successful authentication | backend/auth/session.js; backend/routes/auth.js | Successful login issues a session cookie accepted by protected endpoints. HS256 verification is enforced; tampering and wrong secrets return 401. | Passed |
| 4 | HttpOnly cookie with appropriate attributes | backend/auth/session.js; backend/server.js | Local HTTP tests verify HttpOnly, Path=/api/v1, Max-Age=3600, host-only cookie, development Lax, production Secure/Lax and Secure/None. Deployed browser acceptance is untested. | Not Verified |
| 5 | Protected endpoints reject missing/invalid/tampered/expired JWTs | backend/auth/session.js | New HTTP tests check auth/me, questions, usage and admin/usage: each returns 401 for missing, malformed, tampered, expired, wrong-secret, wrong-issuer, unapproved-algorithm, invalid-subject, missing-expiry and future-not-before tokens before DB access. Deleted account also returns 401. | Passed |
| 6 | Logout and expiration | backend/routes/auth.js; backend/auth/session.js; frontend/src/context/AuthContext.jsx | Logout returns 204 and matching cookie-deletion attributes; requests without a cookie return 401; expired token returns 401. Copied valid token still works after logout, as expected for stateless JWTs. | Passed |
| 7 | Administrator and regular roles | backend/db/schema.sql; backend/auth/session.js | Two regular accounts and an administrator used in isolated PostgreSQL tests. Registration cannot assign admin; DB has default user and role CHECK constraint. | Passed |
| 8 | Backend role authorization | backend/auth/session.js; backend/routes/admin.js; backend/routes/questions.js | Direct requests to every admin endpoint: 401 without session, 403 for regular member, 200 for admin. Admin hidden-list, reshow and deletion operations pass. Changing role in database is respected on the next request in existing auth tests. | Passed |
| 9 | Record ownership/private-data isolation | backend/routes/questions.js; backend/routes/auth.js; backend/routes/usage.js | User A creates/edits/deletes own questions; B's edits/deletes denied and stored record unchanged. Injected user_id does not alter ownership. /auth/me and /usage query-ID injection cannot change the account returned; invented account/usage-ID routes return 404. | Passed |
| 10 | No external authentication service | backend/package.json; backend/auth/*; backend/routes/auth.js; frontend/src/context/AuthContext.jsx | Source/dependency inspection finds local bcrypt, jsonwebtoken and PostgreSQL authentication, no third-party auth SDK/service. This result is inspection evidence. | Passed |

Requirement 4 is implemented and passes server-level cookie tests; its Not Verified status preserves the outstanding deployed-browser requirement.

## Test execution

| Command | Passed | Failed | Skipped | Notes |
| --- | ---: | ---: | ---: | --- |
| node --test backend/test/auth.test.js | 6 | 0 | 0 | Initial existing authentication suite, before test additions |
| npm --prefix backend run test:postgres (initial) | 11 | 1 | 0 | Test helper tried JSON.parse on /docs HTML 404; application auth operations passed |
| npm --prefix backend test (final) | 34 | 0 | 0 | Includes original auth/AI/usage tests and 14 new security tests |
| npm --prefix backend run test:postgres (final) | 14 | 0 | 0 | Existing isolated-schema suite plus two targeted security cases |
| npm --prefix frontend test | 36 | 0 | 0 | Existing jsdom/mocked HTTP tests; not proof of browser cookie transport |
| git diff --check | n/a | 0 | n/a | No whitespace errors; Git emits a line-ending normalization notice |

Final suites total 84 passed, 0 failed, 0 skipped. The initial authentication tests are included in the final backend total, not additional distinct tests.

The initial integration failure was investigated before changes: GET /docs returns Express's default HTML 404, but the test request helper unconditionally called JSON.parse. Only the test helper was changed to inspect Content-Type. The application was not changed. This fixed the failure; the full final integration suite passes.

New file: backend/test/auth-security.test.js. Modified test file: backend/integration/questions.js (response helper and two added cases). This report is docs/auth-verification.md. No other files were modified by this verification.

The PostgreSQL fixture uses a cryptographically named temporary schema and startup search_path on every pool connection, verifies its scope, applies the existing schema, creates temporary accounts, and drops only its schema in cleanup. Existing production data was not queried or changed. Unit/HTTP tests use random in-memory signing keys; no secrets are printed.

## Edge-case evidence

- Duplicate normalized email: 409 with message only; case and surrounding whitespace normalization verified.
- Malformed email, missing/null input, malformed local/domain parts, short password, non-string password, over-72-byte ASCII and multibyte passwords: registration returns 400 without creating users or cookies. Existing rules are 8 or more Unicode code points and no more than 72 UTF-8 bytes for registration; login permits 1 or more code points within the same byte limit to support legacy/demo accounts.
- Incorrect password, unknown account, malformed login email and empty password: identical 401 JSON message and no cookie. Unknown valid email uses bcrypt comparison against a random dummy hash. No rigorous timing-distribution measurement was performed.
- Registration ignores supplied role and ID. Public registration cannot create an administrator. There is no account-update API; tested invented PATCH routes return 404 and database role stays user.
- Registration/login/me responses contain id, email, role and created_at only; administrator directory selects the same public fields. Password hashes are not returned in tested responses.
- Visible questions are intentionally shared among authenticated users, not private to their owners. Hidden questions are restricted to administrators, including against their original owner. Administrators can edit visible questions and manage hidden ones; they cannot delete someone else's visible question under current rules. All are verified by existing integration cases.
- No browser cookie after logout: protected requests return 401. Replaying a copied, valid JWT after logout returns 200 until expiry: logout clears the browser cookie; it does not revoke the token server-side. No revocation feature was added or required.
- Session restoration and frontend guards pass existing mocked frontend tests. They establish application state behavior, not actual browser cookie storage or transport.

## Cross-origin verification

Configured deployment in docs/production.md: https://codebridge-ai.netlify.app and https://codebridge-api.duckdns.org. These are separate sites as well as separate origins. The runbook specifies NODE_ENV=production, exact CLIENT_ORIGIN, SESSION_COOKIE_SAME_SITE=none, and Netlify VITE_API_BASE_URL pointing to the API. Actual hosted runtime/build values were not accessed or verified.

Verified locally through direct HTTP and configuration tests:

- Exact allowed-origin matching; credentialed CORS with Access-Control-Allow-Credentials: true.
- Allowed preflight returns 204 with the expected origin/header permissions.
- Foreign-origin GET/preflight does not receive Access-Control-Allow-Origin. CORS permission denial is not synonymous with every HTTP response being 403; cross-origin reads may execute but cannot be read by the browser.
- Foreign or absent Origin on writes is rejected with 403 before action, including login/logout, question changes and AI requests. Origin is browser-controlled; direct non-browser clients can set it, which is why JWT/role/ownership checks also remain necessary.
- API fetch uses credentials: include; JWT never enters browser localStorage through the inspected client.
- SameSite=None requires Secure at startup; secure cookie configuration requires an HTTPS frontend origin. Invalid SameSite values are rejected.
- Cookie path, expiration, HttpOnly and matching logout attributes verified. No Domain attribute is set.
- Production flag and correct cookie settings are derived in server.js; deployment behavior depends on the actual environment.

No deployed login/registration/browser-cookie test was performed: the run uses isolated temporary local accounts and no deployed test credentials or isolated hosted test environment were supplied. There is no evidence here that browser accepts or sends the deployed cookie, and no claim of successful deployed authentication. Postman/curl-style HTTP results are not being used as browser evidence.

## Secrets and sensitive output

JWT_SECRET is loaded through the root environment by server.js; database connection credentials also come from the environment. The local key is present, meets the byte-length guard and is not the example placeholder; no value is reproduced here. createApp rejects absent, short and recognized example signing keys; new tests verify this. The length check cannot establish randomness, so operators must generate a random key.

.gitignore excludes .env and environment variants except .env.example. Git tracks only .env.example among environment files; it contains placeholders. A bounded scan of current tracked text found no common private-key/token patterns. Exact current sensitive .env values were compared internally against diffs in all 17 locally reachable Git commits: no matches. This does not prove absence of all possible past secrets, unreferenced/deleted remote commits, hosted settings, production logs, or untracked submission archives.

There are deliberate public demo password fixtures in backend/scripts/seed-demo.js and demo documentation. They are hardcoded test credentials, not production secrets; no values are reproduced in this report. The seed CLI rejects NODE_ENV=production and documents disposable/demo use. It cannot prove that an operator has never seeded a production database under a different environment. Ensure these accounts are absent or disabled on any public non-demo deployment. That hosted state was not inspected.

Source logging inspected in authentication/application/seed paths does not print passwords, hashes, JWTs or signing keys. Unexpected application failures return a generic error. Production reverse-proxy/PM2 logging was not accessed, so live logging practices remain unverified. Duplicate-registration 409 deliberately reveals that an address is registered; login errors remain generic. The duplicate-email response is existing behavior, not a demonstrated privilege bypass.

## Issues and recommendations in priority order

1. Required before completion: verify the hosted frontend and API in a real target browser, with an explicitly designated temporary test account. Record browser/version/privacy settings and actual runtime cookie/CORS behavior. No production configuration fix is justified until this check demonstrates a failure.
2. Confirm production has NODE_ENV=production, exact CLIENT_ORIGIN, SameSite=None for the current separate sites and the correct Vite API base. Verify Secure/HttpOnly and HTTPS at the deployed response. Browser policy may still block cross-site cookies; do not weaken attributes to force a pass. If blocked, diagnose the actual browser behavior before choosing a deployment adjustment.
3. Confirm public demo fixtures are not exposed as usable privileged accounts on a public non-demo deployment. This is a conditional deployment risk, not a confirmed production vulnerability. Do not rotate unrelated keys or change account data based only on this report.
4. Test harness defect fixed: Content-Type-aware parsing prevents the HTML 404 from falsely failing integration coverage. No confirmed application auth bug was found in the executed cases.
5. Coverage limits: no real-browser refresh/logout/cookie test, live secret/log audit, statistical timing analysis, broad penetration test, exhaustive fuzzing or future deployment regression guarantee. These do not invalidate the passing scoped local tests; the browser check is the mandatory outstanding item. Brute-force rate limiting is not implemented in the inspected authentication router; it is optional hardening outside this verification, not a newly introduced assignment requirement.

## Deployment browser checklist

Using an authorized temporary account in the actual deployed frontend:

1. Open register/login on Netlify. Register and log in; inspect Network for the API origin and credentialed requests.
2. Check the login Set-Cookie and browser cookie storage: codebridge_session, HttpOnly, Secure, SameSite=None, host-only API domain, Path=/api/v1, roughly one-hour lifetime. Do not copy the token into the report.
3. Inspect a protected API request for cookie inclusion. Confirm /auth/me and a protected operation return 200. Confirm private user/usage data matches that account.
4. Reload a protected route and verify authentication persists. Record third-party-cookie restrictions; do not infer acceptance just from a 200 login response.
5. Log out; verify the cookie is removed and frontend returns to login. A new protected request without the cookie must return 401. Do not describe old-token replay as a logout bug under this stateless design.
6. With two regular test accounts and an authorized admin fixture, verify direct-API modification denial and admin restrictions. Do not modify other users' records or existing production data.
7. Repeat in the browsers used for assignment testing. If privacy settings prevent cross-site cookies, record the failure and diagnose deployment compatibility.

Final classification: implemented and locally verified for registration, bcrypt, signed/expiring JWTs, backend access control, ownership and user-data isolation; implemented but not verified in the deployed browser for cross-origin session behavior and production configuration. No missing or partially implemented mandatory authentication feature was identified in the inspected local source. Authentication and Authorization should remain awaiting deployment verification, rather than fully complete.
