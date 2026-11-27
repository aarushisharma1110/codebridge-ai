-- Run through the Compose migration service, which supplies a single transaction.
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = public;
SELECT pg_advisory_xact_lock(17064537);

\getenv app_password APP_DB_PASSWORD
SELECT format('CREATE ROLE codebridge_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'codebridge_app')
\gexec

\ir schema.sql

GRANT CONNECT ON DATABASE codebridge_ai TO codebridge_app;
GRANT USAGE ON SCHEMA public TO codebridge_app;
-- Users now have editable profiles, levels and blocked state (UPDATE is required).
GRANT SELECT, INSERT, UPDATE ON users TO codebridge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
    questions, answers, comments, categories, question_tags,
    question_votes, answer_votes, question_flags, answer_flags, comment_flags,
    favorite_questions, favorite_users, favorite_tags, favorite_categories, site_options
    TO codebridge_app;
GRANT SELECT, INSERT ON api_usage TO codebridge_app;
GRANT SELECT ON user_points TO codebridge_app;
GRANT USAGE ON SEQUENCE users_id_seq, questions_id_seq, answers_id_seq, comments_id_seq,
    categories_id_seq, api_usage_id_seq TO codebridge_app;
