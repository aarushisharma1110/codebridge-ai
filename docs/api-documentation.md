# API documentation (Milestone 2 Section 8)

Start the backend using the existing setup, then open http://localhost:3000/doc/. If the backend was already running when the documentation was added, restart it so it loads the new route. `/doc` redirects to `/doc/`. The raw OpenAPI 3.0.3 document is at `/doc/openapi.json`.

The canonical file is `backend/docs/openapi.json`, included by the backend Docker build. Swagger UI JavaScript/CSS are served locally from the installed dependency; no CDN is required. External online Swagger validation is disabled. The runtime document hides `/db-test` when that diagnostic is disabled.

## Coverage

An operation is an explicit HTTP method + API path. There are **70 development operations across 56 distinct paths**, and **69 production operations across 55 paths** when the database diagnostic is disabled. Implicit Express HEAD handling and OPTIONS preflight are described as infrastructure, not counted as separate application operations. Documentation assets are not application API operations.

| Group | Operations relative to /api/v1 |
| --- | --- |
| Authentication/account | POST /auth/register, POST /auth/login, GET /auth/me, POST /auth/logout |
| Questions | GET /questions, POST /questions, GET /questions/hidden, GET /questions/{id}, PATCH /questions/{id}, DELETE /questions/{id}, POST /questions/{id}/hide, POST /questions/{id}/reshow |
| AI | POST /ai/improve-question |
| User consumption | GET /usage |
| Administration | GET /admin/dashboard, GET /admin/users, GET /admin/usage |
| Diagnostics | GET /health; GET /db-test in development only |

No API operation requires query parameters. Search/ownership filters are currently client-side. There are no account update/delete, password-reset, arbitrary-user profile, or role-update endpoints; the documentation does not invent them.

The specification includes request examples and validation constraints; required path IDs; success/error status codes and JSON examples; empty 204 responses; hidden-resource/owner/admin rules; versioned servers; normalized endpoint groups; zero-use accounts; usage threshold fields and compatibility aliases. Errors rejected by JSON parsing or Origin validation are described globally and on writes. Unknown routes and disabled diagnostics may return Express HTML 404 responses.

## Cookie authentication and Swagger Try it out

The JWT is delivered only through the browser-managed HttpOnly `codebridge_session` cookie. There is no Bearer-token input workflow and no token field in the login response. Swagger uses an OpenAPI `apiKey` scheme with `in: cookie` and `withCredentials: true`. Do not copy a JWT into Swagger Authorize: JavaScript cannot set the browser's Cookie header or read an HttpOnly cookie.

Log in through the actual configured frontend using the same browser profile and the same API hostname used by Swagger. Existing browser-supplied cookies can accompany protected read requests. Cookies are host-scoped, not port-scoped; `localhost` and `127.0.0.1` are different hostnames. Browser privacy policies may affect cookies between the separate deployed sites. Protected authenticated browser requests from Swagger were not verified with a live signed-in account in this review.

**Existing security restriction:** every write requires a browser Origin exactly equal to `CLIENT_ORIGIN`. The normal local frontend is `http://localhost:5173`; `/doc/` is hosted on the API at `http://localhost:3000`. Swagger on that API origin cannot log in, log out or submit POST/PATCH/DELETE: these writes return 403. `withCredentials` does not change Origin. Do not add Bearer authentication, spoof headers, broaden CORS, or change security controls to make the documentation work. Use the actual frontend for writes. If interactive Swagger writes are desired later, serve the docs under the already allowed frontend origin and select the correct API server; that deployment integration is not implemented by this change.

Authoritative Swagger references: https://swagger.io/docs/specification/v3_0/authentication/cookie-authentication/ and https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/ .

## Verification results (November 24, 2026)

Before this change, there was no OpenAPI/Swagger file, Swagger dependency or `/doc/` route. Existing prose docs described many contracts, but did not satisfy hosted OpenAPI coverage. Initial http://localhost:3000/doc/ returned `Cannot GET /doc/` because the existing backend process had not loaded these changes.

New focused checks:

```sh
node --test backend/test/documentation.test.js
```

The tests validate the OpenAPI document, compare its 70 operations against instantiated backend routers, check path parameters and authorization declarations, verify public docs/assets/configuration in both development and production modes through socket-free HTTP injection, and compare both consumption response examples against the actual Express route response transformations using controlled database fixtures. The fixture-based comparison verifies the JSON contract, not production statistics or PostgreSQL aggregation correctness; those were covered separately earlier. No unrelated authentication/security suites are repeated.

A temporary backend preview on port 3002 served the new docs. Real-browser verification observed Swagger UI with all operation groups, schema rendering and examples; executing GET /api/v1/health from Swagger returned 200 with the exact documented JSON. The preview used a database stub and no real-account writes. It does not verify authenticated browser-cookie transport or model inference. The preview is stopped after verification.

Shell HTTP tests initially encountered restricted-loopback `fetch failed` errors. The final docs tests use socket-free injection; browser testing separately confirms real serving. Schema/redirect issues found while constructing the new documentation were corrected before final verification.

The deployed https://codebridge-api.duckdns.org/doc/ was checked in a real browser and returned `Cannot GET /doc/`. This change has not been deployed. Do not mark hosted documentation as passed.

## Files changed for this review

- Created `backend/docs/openapi.json`, `backend/routes/documentation.js`, `backend/test/documentation.test.js` and this guide.
- Modified `backend/app.js` only to mount documentation and its trailing-slash redirect; existing API handlers and authentication rules are unchanged.
- Updated backend package/lock files: runtime Swagger UI dependency; development-only OpenAPI validator and socket-free test helper.
- Updated the optional Compose `deploy/Caddyfile` to forward `/doc` and `/doc/*` to Express. The active PM2 host proxy has not been changed.
- Added links/instructions in README and production documentation.

## Remaining deployment checks

1. Restart the local backend and open http://localhost:3000/doc/. Confirm the specification and assets load. The temporary preview was a separate process and did not restart the user's backend.
2. After separately authorized deployment, install locked dependencies, restart the backend and ensure the active proxy forwards `/doc` and `/doc/*` without stripping the prefix. The supplied Compose proxy is updated; the external PM2 host Caddy configuration must be checked separately.
3. Open https://codebridge-api.duckdns.org/doc/ and its openapi.json. Confirm 69 production operations, no enabled `/db-test`, correct server selection and all examples.
4. In the same target browser, log in through the deployed frontend and check a protected read through Swagger with the existing cookie. Expect API-origin writes to remain denied by the existing Origin policy. Document any third-party-cookie restriction rather than weakening security settings.

**Assessment:** Section 8's local documentation coverage and serving requirements are implemented and verified. Interactive authenticated Swagger reads remain unverified; writes from API-origin docs have a documented existing security limitation. Section 8 as a hosted submission requirement is not complete until deployed `/doc/` is available and checked.
