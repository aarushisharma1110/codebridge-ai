# Milestone 1 authentication

The Express API uses the existing PostgreSQL `users` table and shared connection pool. Registration trims and lowercases email addresses, accepts common ASCII email formats up to 254 characters, and requires passwords of at least 8 characters and at most 72 UTF-8 bytes. The byte limit prevents bcrypt from silently truncating longer passwords. Passwords are passed to bcrypt as entered and PostgreSQL stores only the salted hash. Registration uses the database's default `user` role.

Login compares the password against the stored bcrypt hash. After a match, the API signs a JWT with `JWT_SECRET`. The token identifies the account by ID and expires after one hour. Express sends it as the `codebridge_session` cookie with `HttpOnly`, `SameSite=Lax`, and `Path=/api/v1`. In production the cookie also has `Secure`. The browser stores and sends it automatically, and JavaScript cannot read it.

On protected requests, the authentication middleware verifies the token's signature, issuer, and expiration, then loads the account from PostgreSQL. An administrator has the same profile access as a user and can also read the admin dashboard. The admin middleware checks the current database role for each request, so a role change takes effect on the next request. Public registration ignores any submitted role.

## Endpoints

| Method and path | Request | Success |
| --- | --- | --- |
| `POST /api/v1/auth/register` | JSON with `email` and `password` | `201` with the new profile. Log in separately to start a session. |
| `POST /api/v1/auth/login` | JSON with `email` and `password` | `200` with the profile and a session cookie |
| `GET /api/v1/auth/me` | Session cookie | `200` with the current profile |
| `POST /api/v1/auth/logout` | Empty body. Cookie optional. | `204` with a cookie expiration header and an empty body |
| `GET /api/v1/admin/dashboard` | Administrator session cookie | `200` with counts by role, for example `{"users": 1, "admins": 1}` |

Example JSON body for registration and login:

```json
{
  "email": "student@example.com",
  "password": "a sample passphrase"
}
```

Example profile response from registration, login, and `/auth/me`:

```json
{
  "user": {
    "id": 42,
    "email": "student@example.com",
    "role": "user",
    "created_at": "2026-11-11T20:00:00.000Z"
  }
}
```

Errors use a JSON object such as `{"message":"Invalid email or password"}`. Invalid registration input returns `400`, an existing email returns `409`, and invalid credentials or a missing, invalid, or expired session return `401`. An authenticated user without admin access receives `403` on the dashboard. A missing or mismatched `Origin` on a write also returns `403`. Unexpected database failures return a generic `500`.

## React and API clients

Use `credentials: 'include'` for requests to the API. During local development, open Vite at `http://localhost:5173` and call the API at `http://localhost:3000`. Use `localhost` consistently so the frontend and API are same-site.

```js
const api = 'http://localhost:3000/api/v1';

await fetch(`${api}/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
});

const login = await fetch(`${api}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
});
if (!login.ok) throw new Error((await login.json()).message);

const profile = await fetch(`${api}/auth/me`, { credentials: 'include' });
if (!profile.ok) throw new Error((await profile.json()).message);
const { user } = await profile.json();

await fetch(`${api}/auth/logout`, { method: 'POST', credentials: 'include' });
```

CORS allows credentialed requests from the exact `CLIENT_ORIGIN`. For CSRF protection, the server independently checks the browser's `Origin` on state-changing requests, including login and logout. Browsers set this header automatically. In Postman, set `Origin: http://localhost:5173` on POST requests (or use your configured origin) and enable the cookie jar.

Logout expires the browser cookie. The server does not track individual JWTs for revocation, so a copy of a JWT can still be used until its expiration if the account is active.

## Configure and run

Follow [the database guide](database.md) for the existing Compose setup. Edit the root `.env` and keep it private.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string for the API and seed script |
| `JWT_SECRET` | Random signing secret of at least 32 bytes. Generate one with the command below. |
| `CLIENT_ORIGIN` | Exact frontend origin, including scheme and port when applicable, with no trailing slash. Local example `http://localhost:5173`. |
| `PORT` | API port, defaults to `3000` |
| `NODE_ENV` | Set to `production` for an HTTPS deployment. This enables `Secure` cookies and blocks the demo seed command. |
| `TEST_DATABASE_URL` | Optional PostgreSQL URL for integration tests. Defaults to `DATABASE_URL`. |

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the generated value into the root `.env` as `JWT_SECRET`. Then run from the repository root:

```sh
docker compose up -d --wait postgres
npm --prefix backend ci
npm --prefix backend start
```

In production, serve the frontend and API over HTTPS on the same site, for example `app.example.com` and `api.example.com`. Set `CLIENT_ORIGIN` to the deployed frontend's exact HTTPS origin and set the frontend's API base URL to the deployed API. Supply the database credentials and JWT secret through the deployment's secret configuration. Add rate limiting to registration and login before exposing the API publicly.

## Seed the course demo accounts

**Use these public course fixtures only in a disposable demo environment. Never use them with real or privileged data.** The seed command creates `john@john.com` with the course-specified user password and `admin@admin.com` with the course-specified admin password. Both passwords are hashed. The three-character passwords are accepted at login for the seeded accounts and rejected by public registration.

```sh
npm --prefix backend run seed:demo
```

The command reads the root `.env`. Running it again succeeds if both accounts match. If an existing account has one of the demo emails but a different password or role, the command rolls back without overwriting that account.

## Run tests

```sh
npm --prefix backend test
npm --prefix backend run test:postgres
```

The first command uses an in-memory database substitute and real HTTP requests to a temporary loopback server. The second uses real PostgreSQL and also tests demo seeding. Start PostgreSQL first and use a connection with permission to create a schema. The tests create a randomly named schema, load the existing SQL schema into it, and remove only that temporary schema at teardown. Existing development tables and records are outside the test schema.
