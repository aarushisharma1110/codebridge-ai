# Docker and database setup

Follow these steps after downloading or cloning the project. Run commands from the main project folder (the folder containing `docker-compose.yml`) unless a step says otherwise.

## 1. Install what you need

- Docker Desktop, installed and running with Linux containers enabled.
- Node.js and npm, if you want to run the backend and check its database connection.

Check that the tools are available:

```sh
docker --version
docker compose version
node --version
npm --version
```

Docker runs PostgreSQL only. The backend runs separately on your computer.

## 2. Add your settings

Copy `.env.example` to `.env` in the main project folder. This file holds your local settings and passwords.

PowerShell (Windows):

```powershell
Copy-Item .env.example .env
```

macOS / Linux:

```sh
cp .env.example .env
```

If you already have a `.env`, edit it instead of overwriting it. Set these values:

```dotenv
PORT=3000
POSTGRES_USER=codebridge
POSTGRES_PASSWORD=choose_a_local_password
POSTGRES_DB=codebridge_ai
DATABASE_URL=postgresql://codebridge:choose_a_local_password@localhost:5433/codebridge_ai
```

Replace `choose_a_local_password` in both places with the same password. Use letters and numbers to avoid extra formatting in the connection address. Keep `POSTGRES_USER` and `POSTGRES_DB` as shown so Docker can check that the database is ready.

Before starting the backend, generate a `JWT_SECRET` and set `CLIENT_ORIGIN` as
described in the [authentication guide](authentication.md#configure-and-run).

## 3. Start PostgreSQL

```sh
docker compose up -d postgres
docker compose ps
```

The first start downloads PostgreSQL and creates the database. Wait for `postgres` to show `healthy`, which means it is ready. If it does not, check the error messages:

```sh
docker compose logs --tail=100 postgres
```

The first time you start it, Docker uses `backend/db/schema.sql` to create the `users`, `questions`, and `api_usage` tables. Your data is saved even when you stop Docker.

## 4. Check the database

Open PostgreSQL's terminal:

```sh
docker compose exec postgres psql -U codebridge -d codebridge_ai
```

Inside that terminal, run:

```sql
\dt
SELECT current_database();
\q
```

You should see the three tables and the database name `codebridge_ai`. `\q` exits the terminal.

If you use an app such as pgAdmin or DBeaver to view the database, enter:

| Setting | Value |
| --- | --- |
| Host | `localhost` |
| Port | `5433` |
| Database | `codebridge_ai` |
| Username | `codebridge` |
| Password | Your `POSTGRES_PASSWORD` from `.env` |

Use port **5433** to connect from your computer.

## 5. Check the backend connection

From the main project folder:

```sh
cd backend
npm ci
node server.js
```

Leave the server running and open [this test link](http://localhost:3000/api/v1/db-test) in your browser. If you changed `PORT`, use that port instead. If everything works, you will see:

```json
{
  "message": "Database connected successfully",
  "database": "codebridge_ai"
}
```

The backend reads your `.env` settings automatically. Stop it with `Ctrl+C` when finished. Run `cd ..` to return to the main project folder before using the commands below.

## Everyday commands

```sh
# Start the database again
docker compose up -d postgres

# Stop the database and keep your data
docker compose down

# View recent database logs
docker compose logs --tail=100 postgres
```

## Updating tables or starting over

Docker reads `backend/db/schema.sql` only when it first creates the database. Editing this file or restarting Docker will not update existing tables. To keep your data, run the SQL commands needed to update the tables in the database terminal from step 4.

To start over and create the tables again, run these commands from the main project folder. **This permanently deletes all your local database data.**

```sh
docker compose down -v
docker compose up -d postgres
```

## Common problems

- **Docker is not running:** Start Docker Desktop, wait for it to finish starting, then retry.
- **Port 5433 is already in use:** Another program is using that port. Stop that program, or change `5433` in `5433:5432` in `docker-compose.yml` to an unused port. Use the same new port in `DATABASE_URL` and your database app.
- **Password authentication failed:** Check that the passwords in `.env` match. If you have already created the database, it still uses the original password. Use that password, or follow the steps above to start over if you no longer need the data.
- **Database connection failed in the backend:** Check that Docker shows `healthy`, `.env` is in the main project folder, and `DATABASE_URL` uses `localhost:5433`. Restart the backend after editing `.env`.
- **Tables are missing:** Make sure you connected to `codebridge_ai`. If the database was created before the tables were added, run the missing SQL from `backend/db/schema.sql` in the database terminal, or follow the steps above to start over.
