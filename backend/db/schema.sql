-- CodeBridge AI schema. Every statement is additive and safe to run again on an existing database:
-- it creates missing tables, columns, indexes and views and never drops stored data.

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
    last_edited_by INT REFERENCES users(id) ON DELETE SET NULL,
    hidden BOOLEAN NOT NULL DEFAULT FALSE
);

-- Adds the columns to databases created before they existed. Safe to run again.
ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS last_edited_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;

 CREATE TABLE IF NOT EXISTS api_usage (
     id SERIAL PRIMARY KEY,
     user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     method VARCHAR(10) NOT NULL,
     route_template VARCHAR(255) NOT NULL,
     status_code INT NOT NULL,
     created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
 );

-- ---------------------------------------------------------------------------
-- Question2Answer features (Milestone 2)
-- ---------------------------------------------------------------------------

-- User levels follow Q2A: Basic user, Expert, Editor, Moderator, Administrator.
ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_role;
ALTER TABLE users ADD CONSTRAINT valid_role
    CHECK (role IN ('user', 'expert', 'editor', 'moderator', 'admin'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS handle VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS website VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS about TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT FALSE;

-- Usernames derived from an email local part, made unique with the account ID when needed.
CREATE OR REPLACE FUNCTION codebridge_handle_base(email TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT COALESCE(NULLIF(left(regexp_replace(split_part(email, '@', 1), '[^A-Za-z0-9_.-]', '', 'g'), 20), ''), 'user')
$$;

WITH candidates AS (
    SELECT id, codebridge_handle_base(email) AS base,
           row_number() OVER (PARTITION BY lower(codebridge_handle_base(email)) ORDER BY id) AS position
    FROM users WHERE handle IS NULL
)
UPDATE users u
SET handle = CASE
    WHEN c.position = 1 AND NOT EXISTS (
        SELECT 1 FROM users other WHERE other.handle IS NOT NULL AND lower(other.handle) = lower(c.base)
    ) THEN c.base
    ELSE c.base || u.id
END
FROM candidates c
WHERE u.id = c.id;

CREATE OR REPLACE FUNCTION codebridge_default_handle() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.handle IS NULL THEN
        NEW.handle := codebridge_handle_base(NEW.email);
        IF EXISTS (SELECT 1 FROM users WHERE lower(handle) = lower(NEW.handle)) THEN
            NEW.handle := NEW.handle || NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS users_default_handle ON users;
CREATE TRIGGER users_default_handle BEFORE INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION codebridge_default_handle();

ALTER TABLE users ALTER COLUMN handle SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_handle_unique ON users (lower(handle));

CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    parent_id INT REFERENCES categories(id) ON DELETE CASCADE,
    title VARCHAR(80) NOT NULL,
    slug VARCHAR(80) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE questions ADD COLUMN IF NOT EXISTS category_id INT REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS views INT NOT NULL DEFAULT 0;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS closed_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS close_reason TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS duplicate_of INT REFERENCES questions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS answers (
    id SERIAL PRIMARY KEY,
    question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_edited_by INT REFERENCES users(id) ON DELETE SET NULL,
    hidden BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS answers_question ON answers (question_id);
CREATE INDEX IF NOT EXISTS answers_user ON answers (user_id);

ALTER TABLE questions ADD COLUMN IF NOT EXISTS selected_answer_id INT REFERENCES answers(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    answer_id INT REFERENCES answers(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_edited_by INT REFERENCES users(id) ON DELETE SET NULL,
    hidden BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS comments_question ON comments (question_id);
CREATE INDEX IF NOT EXISTS comments_answer ON comments (answer_id);

CREATE TABLE IF NOT EXISTS question_tags (
    question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    tag VARCHAR(40) NOT NULL,
    position SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (question_id, tag)
);
CREATE INDEX IF NOT EXISTS question_tags_tag ON question_tags (tag);

CREATE TABLE IF NOT EXISTS question_votes (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    vote SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, question_id)
);
CREATE INDEX IF NOT EXISTS question_votes_question ON question_votes (question_id);

CREATE TABLE IF NOT EXISTS answer_votes (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    answer_id INT NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
    vote SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, answer_id)
);
CREATE INDEX IF NOT EXISTS answer_votes_answer ON answer_votes (answer_id);

CREATE TABLE IF NOT EXISTS question_flags (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, question_id)
);
CREATE TABLE IF NOT EXISTS answer_flags (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    answer_id INT NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, answer_id)
);
CREATE TABLE IF NOT EXISTS comment_flags (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment_id INT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, comment_id)
);

CREATE TABLE IF NOT EXISTS favorite_questions (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, question_id)
);
CREATE TABLE IF NOT EXISTS favorite_users (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, target_user_id)
);
CREATE TABLE IF NOT EXISTS favorite_tags (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tag VARCHAR(40) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, tag)
);
CREATE TABLE IF NOT EXISTS favorite_categories (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, category_id)
);

-- Administrator-editable site options (Admin > General).
CREATE TABLE IF NOT EXISTS site_options (
    name VARCHAR(40) PRIMARY KEY,
    value TEXT NOT NULL
);

-- Q2A v1.8.8 default point rules (qa-include/app/options.php):
-- base 100, multiple 10, ask 2, answer 4, select 3, selected 30, each vote cast 1,
-- per question vote received 1 (net, capped at +10/-3), per answer vote received 2 (net, capped at +20/-5).
CREATE OR REPLACE VIEW user_points AS
SELECT u.id AS user_id, s.qposts, s.aposts, s.cposts, s.aselects, s.aselecteds,
       s.qupvotes, s.qdownvotes, s.aupvotes, s.adownvotes, s.qvoteds, s.avoteds,
       s.upvoteds, s.downvoteds,
       (100 + 10 * (2 * s.qposts + 4 * s.aposts + 3 * s.aselects + 30 * s.aselecteds
           + s.qupvotes + s.qdownvotes + s.aupvotes + s.adownvotes
           + s.qvoteds + 2 * s.avoteds))::int AS points
FROM users u
CROSS JOIN LATERAL (
    SELECT
        (SELECT COUNT(*) FROM questions q WHERE q.user_id = u.id AND NOT q.hidden)::int AS qposts,
        (SELECT COUNT(*) FROM answers a WHERE a.user_id = u.id AND NOT a.hidden)::int AS aposts,
        (SELECT COUNT(*) FROM comments c WHERE c.user_id = u.id AND NOT c.hidden)::int AS cposts,
        (SELECT COUNT(*) FROM questions q JOIN answers a ON a.id = q.selected_answer_id
          WHERE q.user_id = u.id AND a.user_id <> u.id AND NOT q.hidden)::int AS aselects,
        (SELECT COUNT(*) FROM answers a JOIN questions q ON q.selected_answer_id = a.id
          WHERE a.user_id = u.id AND q.user_id <> u.id AND NOT a.hidden)::int AS aselecteds,
        (SELECT COUNT(*) FROM question_votes v WHERE v.user_id = u.id AND v.vote > 0)::int AS qupvotes,
        (SELECT COUNT(*) FROM question_votes v WHERE v.user_id = u.id AND v.vote < 0)::int AS qdownvotes,
        (SELECT COUNT(*) FROM answer_votes v WHERE v.user_id = u.id AND v.vote > 0)::int AS aupvotes,
        (SELECT COUNT(*) FROM answer_votes v WHERE v.user_id = u.id AND v.vote < 0)::int AS adownvotes,
        COALESCE((SELECT SUM(LEAST(10, GREATEST(-3, net))) FROM (
            SELECT SUM(v.vote) AS net FROM questions q JOIN question_votes v ON v.question_id = q.id
            WHERE q.user_id = u.id AND NOT q.hidden GROUP BY q.id) qn), 0)::int AS qvoteds,
        COALESCE((SELECT SUM(LEAST(20, GREATEST(-5, net))) FROM (
            SELECT SUM(v.vote) AS net FROM answers a JOIN answer_votes v ON v.answer_id = a.id
            WHERE a.user_id = u.id AND NOT a.hidden GROUP BY a.id) an), 0)::int AS avoteds,
        ((SELECT COUNT(*) FROM question_votes v JOIN questions q ON q.id = v.question_id
           WHERE q.user_id = u.id AND v.vote > 0)
         + (SELECT COUNT(*) FROM answer_votes v JOIN answers a ON a.id = v.answer_id
           WHERE a.user_id = u.id AND v.vote > 0))::int AS upvoteds,
        ((SELECT COUNT(*) FROM question_votes v JOIN questions q ON q.id = v.question_id
           WHERE q.user_id = u.id AND v.vote < 0)
         + (SELECT COUNT(*) FROM answer_votes v JOIN answers a ON a.id = v.answer_id
           WHERE a.user_id = u.id AND v.vote < 0))::int AS downvoteds
) s;

-- Post format, as in Q2A: '' for plain text (all Milestone 1 posts) or 'html' from the rich text editor.
ALTER TABLE questions ADD COLUMN IF NOT EXISTS format VARCHAR(8) NOT NULL DEFAULT '';
ALTER TABLE answers ADD COLUMN IF NOT EXISTS format VARCHAR(8) NOT NULL DEFAULT '';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS format VARCHAR(8) NOT NULL DEFAULT '';
