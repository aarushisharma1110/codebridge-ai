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

Use Node.js 20.19+ or 22.12+, npm, and Docker Compose. Follow the [database setup guide](docs/database.md#2-add-your-settings) and [authentication setup](docs/authentication.md#configure-and-run) to configure the private root `.env`. Start Qwen separately using the [local inference instructions](docs/frontend.md#local-qwen-inference).

From the repository root, start PostgreSQL and the backend in one terminal.

```sh
docker compose up -d --wait postgres
npm --prefix backend ci
npm --prefix backend start
```

Start the frontend in a second terminal.

```sh
npm --prefix frontend ci
npm --prefix frontend run dev
```

Open [CodeBridge AI locally](http://localhost:5173). The frontend uses `http://localhost:3000/api/v1` in development. If the API runs elsewhere, set `VITE_API_BASE_URL` in `frontend/.env.local`. See the [authentication guide](docs/authentication.md#seed-the-course-demo-accounts) for disposable demo accounts.

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
- Milestone 2 usage reporting requires additional backend endpoints.
- Compare current behavior with Q2A in the [migration notes](docs/migration-notes.md) and [historical source analysis](docs/q2a-analysis.md).
