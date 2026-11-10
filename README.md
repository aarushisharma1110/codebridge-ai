# CodeBridge AI

CodeBridge AI is a web application that explores moving question management features from Question2Answer (Q2A), an open-source PHP application, to a Node.js API using AI-assisted development.

The project will include user accounts, user and admin roles, and a question improvement feature powered by Google Gemini.

## Tech Stack

| Component | Technology |
| --- | --- |
| Backend | Node.js, Express.js |
| Frontend | React, Vite (planned) |
| Database | PostgreSQL 17.6, Docker Compose |
| Authentication | bcrypt, JWT (planned) |
| AI | Google Gemini API (planned) |
| API Testing | Postman |

## Project Structure

```text
codebridge-ai/
├── backend/              # Server and database files
├── frontend/             # Frontend (planned)
├── docs/
│   └── database.md       # Docker and database setup guide
├── docker-compose.yml
├── .env.example
└── README.md
```

## Getting Started

Follow the [Docker and database setup guide](docs/database.md) to set up your local database and run the backend.

Frontend setup instructions will be added when the React app is ready.

## Planned Features

- Register and log in with user or admin access.
- View, create, edit, and delete questions.
- Improve question wording with Google Gemini.
- Track API usage and handle errors and usage limits.
- Manage users and view API usage through an admin dashboard.
- Compare the migrated question features with the original Q2A application.
