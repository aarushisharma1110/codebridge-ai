# CodeBridge AI

CodeBridge AI is a BCIT COMP 4537 project that adapts Question2Answer (Q2A) question management to an Express REST API and a separate React frontend. PostgreSQL stores accounts and questions. A private llama.cpp service runs Qwen2.5-3B-Instruct to suggest clearer question wording.

## Tech Stack

| Component | Technology |
| --- | --- |
| Backend | Node.js, Express.js |
| Frontend | React, Vite, Tailwind CSS, React Router |
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

## Milestone 1 instructor smoke test

1. **Authentication.** Register with a disposable email and a password of at least eight characters, then log in. Reload **My Questions** and confirm the session persists. Use **Log out** from **Profile** and confirm that opening `/questions` takes you to login. Log back in for the remaining checks. [Optional course demo accounts](docs/authentication.md#seed-the-course-demo-accounts)
2. **Question management.** Use **New Question** to create a question with the title `why my api returns 404` and save it. Find it in **My Questions**, open it, edit the details, and save. Reopen the question to confirm the edit persisted.
3. **AI improvement.** Edit the saved question and select **Improve with AI**. Confirm the comparison shows a rewrite and the draft stays the same until you select **Accept suggestion**. Review the draft, select **Save Question**, and reopen it to check that the accepted change persisted. Use **Delete Question** in the editor and confirm that the question disappears from the list. [Inference setup and behavior](docs/frontend.md#local-qwen-inference)

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

Use a disposable PostgreSQL database for `test:postgres`. It verifies question CRUD, visibility rules, and administrator directory access. See the [test setup](docs/authentication.md#run-tests) for connection and isolation details.

## Features

- Register, log in, and view, create, edit, or delete questions according to account permissions.
- Search visible questions and filter by ownership. Owners can hide their own questions. Administrators can view, reshow, and permanently delete hidden questions.
- View account counts and the registered-user directory as an administrator.
- Review Qwen-backed wording suggestions in the editor and AI Assistant.
- View persisted API consumption, remaining free calls and a non-blocking warning at 20 calls; administrators can view usage by user and endpoint. See [consumption policy and verification](docs/api-usage.md).
- Compare current behavior with Q2A in the [migration notes](docs/migration-notes.md) and [historical source analysis](docs/q2a-analysis.md).

## OpenAPI documentation

Open [Swagger UI](http://localhost:3000/doc/) after starting or restarting the backend. The raw specification is at `/doc/openapi.json`. See [API documentation coverage, cookie authentication limitations and verification](docs/api-documentation.md). All explicit API operations use `/api/v1/`.
