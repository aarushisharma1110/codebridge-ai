# CodeBridge AI

CodeBridge AI is a BCIT COMP 4537 project that reimplements Question2Answer (Q2A) — questions, answers, comments, voting, best answers, categories, tags, search, user profiles, reputation, moderation and administration — as an Express REST API and a separate React frontend styled after Q2A's SnowFlat theme. PostgreSQL stores all data. A private llama.cpp service runs Qwen2.5-3B-Instruct to suggest clearer question wording, the project's addition to Q2A.

## Tech Stack

| Component | Technology |
| --- | --- |
| Backend | Node.js, Express.js |
| Frontend | React, Vite, React Router, plain CSS (Q2A SnowFlat layout) |
| Database | PostgreSQL 17.6, Docker Compose |
| Authentication | bcrypt, JWT in an HttpOnly cookie |
| AI | Qwen2.5-3B-Instruct GGUF, llama.cpp |
| Testing | Node test runner, PostgreSQL integration tests, Vitest |

## Project Structure

```text
codebridge-ai/
├── backend/              # Express API, PostgreSQL schema, seed script, and backend tests
├── frontend/             # React application and interaction tests
├── lang/                 # Shared English message catalog for Express and React
├── docs/                 # Setup, deployment, and Q2A migration evidence
├── docker-compose.yml    # Local PostgreSQL
├── netlify.toml          # Frontend build and publish settings
├── deploy/               # Proxy and database tooling for the optional Compose stack
├── .env.example          # Backend and database configuration example
└── README.md
```

## Getting Started

Use Node.js 20.19+ or 22.12+, npm, and Docker with the Compose plugin. If you received the two Milestone 1 ZIPs, extract both into the same empty directory and run the commands below from that directory. `backend/`, `frontend/`, and `lang/` must be siblings.

Copy `.env.example` to `.env` in the project root (`Copy-Item .env.example .env` in PowerShell or `cp .env.example .env` on macOS/Linux). Choose a local PostgreSQL password, put it in both `POSTGRES_PASSWORD` and `DATABASE_URL`, and generate a fresh `JWT_SECRET` with the command in the authentication guide. Keep `CLIENT_ORIGIN=http://localhost:5173` for the default local setup. [Database settings](docs/database.md#2-add-your-settings) · [Authentication settings](docs/authentication.md#configure-and-run)

From the repository root, start PostgreSQL and the backend in one terminal.

```sh
docker compose up -d --wait postgres
npm --prefix backend ci
npm --prefix backend start
```

Compose applies `backend/db/schema.sql` when it initializes an empty PostgreSQL volume. Verify the connection at [the database diagnostic endpoint](http://localhost:3000/api/v1/db-test). [Schema and database checks](docs/database.md#4-check-the-database)

Start the frontend in a second terminal.

```sh
npm --prefix frontend ci
npm --prefix frontend run dev
```

Open [CodeBridge AI locally](http://localhost:5173). The frontend uses `http://localhost:3000/api/v1` in development. If the API runs on a different port, set `VITE_API_BASE_URL` in `frontend/.env.local`. Keep the root `.env` private. [Frontend environment settings](docs/frontend.md#run-locally)

Start `llama-server` in a third terminal to test AI improvement. [Download Qwen and start llama.cpp](docs/frontend.md#local-qwen-inference)

## Instructor smoke test

Optionally load demonstration content into a disposable database first: `npm --prefix backend run seed:demo -- --content` (demo accounts `john@john.com` / `123` and `admin@admin.com` / `111`, plus categories, questions, answers and votes).

1. **Authentication.** Register with a username, a disposable email and a password of at least eight characters, then log in with either the email or the username. Reload and confirm the session persists. Use **Logout** from the account menu at the top right and confirm that opening `/questions` takes you to login.
2. **Asking with AI.** Select **Ask a Question**, enter `why my api returns 404`, select **Improve with AI**, review the comparison and select **Accept suggestion**. Add tags, choose a category if any exist and select **Ask the Question**.
3. **Q2A workflow.** From a second account, vote on the question, answer it and add a comment. As the asker, select the green check to choose the best answer, and check that both users' points changed on **Users**. Try **Questions** sorting, **Unanswered**, **Tags**, **Categories** and the sidebar search.
4. **Moderation.** Flag a post from another account. As an administrator, open **Admin > Flagged**, clear or hide it, reshow it from **Admin > Hidden**, change a user's level from their profile and review **Admin > API usage**.

## Milestone 1 submission archives

Build both archives from the project root using a tracked-file list. Include `lang/message/en/messages.json` because both components import it by relative path. Include the shared README and guides in both ZIPs. The backend ZIP also supplies the root `.env.example` and `docker-compose.yml` needed for local setup.

On Windows, run these commands in PowerShell. They replace any existing ZIPs with the same names.

```powershell
git ls-files -- backend/ lang/ docs/ README.md .env.example docker-compose.yml | tar.exe -a -cf backend.zip -T -
git ls-files -- frontend/ lang/ docs/ README.md | tar.exe -a -cf frontend.zip -T -
tar.exe -tf backend.zip
tar.exe -tf frontend.zip
```

Check each listing for its source directory, `package.json`, `package-lock.json`, the shared catalog, and setup documentation. Check that the backend ZIP includes `backend/db/schema.sql`, `.env.example`, and `docker-compose.yml`. Exclude local `.env` files, credentials, tokens, private keys, database dumps, model weights, `node_modules/`, and `dist/`. Extract both ZIPs into the same empty directory and repeat the quick start and smoke test before submitting.

## Deployment

The active deployment serves the frontend from Netlify and the Express API from Contabo using PM2 behind Caddy. PostgreSQL runs in Docker, and Express reaches llama.cpp privately. The full Docker Compose deployment is an optional alternative. See the [production runbook](docs/production.md) and [architecture diagram](docs/frontend.md#deployment).

## Verification

```sh
npm --prefix backend test
npm --prefix backend run test:postgres
npm --prefix frontend test
npm --prefix frontend run build
```

Use a disposable PostgreSQL database for `test:postgres`. It verifies question CRUD, visibility rules, administrator directory access, schema re-application, and the Q2A answers, comments, votes, points, tags, categories, search, moderation, favorites, profiles and administration endpoints. See the [test setup](docs/authentication.md#run-tests) for connection and isolation details.

## Features

- The Q2A feature set: questions, answers, comments, voting, best answer selection, categories, tags, search, Q2A sorting and unanswered filters, activity, user profiles, Q2A points and levels, favorites, flags, closing, hiding, blocking and an administration center. See the [feature comparison](docs/migration-notes.md).
- Q2A URLs and the SnowFlat layout, including its responsive menu and sidebar. See [frontend routes](docs/frontend.md#routes-and-permissions).
- Review Qwen-backed wording suggestions on the Ask and Edit forms and in the AI assistant.
- View persisted API consumption, remaining free calls and a non-blocking warning at 20 calls; administrators can view usage by user and endpoint. See [consumption policy and verification](docs/api-usage.md).
- Compare current behavior with Q2A in the [migration notes](docs/migration-notes.md) and [historical source analysis](docs/q2a-analysis.md).

## OpenAPI documentation

Open [Swagger UI](http://localhost:3000/doc/) after starting or restarting the backend. The raw specification is at `/doc/openapi.json`. See [API documentation coverage, cookie authentication limitations and verification](docs/api-documentation.md). All explicit API operations use `/api/v1/`.
