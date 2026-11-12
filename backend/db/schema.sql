CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_role
    CHECK (role IN ('user', 'admin'))
);

CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    last_edited_by INT REFERENCES users(id) ON DELETE SET NULL
);

-- Adds the column to databases created before it existed. Safe to run again.
ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS last_edited_by INT REFERENCES users(id) ON DELETE SET NULL;

 CREATE TABLE IF NOT EXISTS api_usage (
     id SERIAL PRIMARY KEY,
     user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     method VARCHAR(10) NOT NULL,
     route_template VARCHAR(255) NOT NULL,
     status_code INT NOT NULL,
     created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
 );
