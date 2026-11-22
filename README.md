# CodeBridge AI

CodeBridge AI is a web application that explores moving question management features from Question2Answer (Q2A), an open-source PHP application, to a Node.js API using AI-assisted development.

The project includes user and administrator accounts and question wording suggestions powered by Qwen2.5-3B-Instruct through a local llama.cpp server.

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
├── .env.example          # Backend and database configuration example
└── README.md
```

## Getting Started

Follow the [Docker and database setup guide](docs/database.md) to set up your local database and run the backend.

The [authentication guide](docs/authentication.md) covers the Milestone 1 endpoints,
root environment settings, React integration, demo accounts, and tests.

Start Qwen in llama.cpp using the [local inference instructions](docs/frontend.md#local-qwen-inference).

With the backend listening on `http://localhost:3000`, run these commands from the repository root:

```sh
npm --prefix frontend ci
npm --prefix frontend run dev
```

Open [CodeBridge AI locally](http://localhost:5173). See the [deployment guide and architecture diagram](docs/frontend.md#deployment) for separate frontend and API origins. The [migration notes](docs/migration-notes.md) and [pinned Q2A source analysis](docs/q2a-analysis.md) record the PHP comparison.

## Verification

```sh
npm --prefix backend test
npm --prefix backend run test:postgres
npm --prefix frontend test
npm --prefix frontend run build
```

Start PostgreSQL before running `test:postgres`. This suite verifies CodeBridge question CRUD against real PostgreSQL. See the [test setup](docs/authentication.md#run-tests) for connection and isolation details.

## Features

- Register, log in, and view, create, edit, or delete questions according to account permissions.
- Search visible questions and filter by ownership.
- View account counts and the registered-user directory as an administrator.
- Review Qwen-backed wording suggestions in the editor and AI Assistant.
- Milestone 2 usage reporting requires additional backend endpoints.
- Compare the migrated question features with the original Q2A application.
