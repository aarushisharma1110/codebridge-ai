// SQL builders for question, answer and comment summaries shared by the routes.
// Every summary has the same shape wherever it appears, so list items and detail views match.

const { LIMITS } = require('./rules');

const authorColumns = (alias) => `
    ${alias}u.handle AS author_handle,
    ${alias}u.role AS author_role,
    (SELECT p.points FROM user_points p WHERE p.user_id = ${alias}u.id) AS author_points`;

// viewer: SQL placeholder holding the viewing user's id.
function questionColumns(viewer) {
    return `q.id, q.user_id, q.title, q.body, q.format, q.created_at, q.updated_at, q.last_edited_by, q.hidden,
        q.category_id, c.title AS category_title, c.slug AS category_slug,
        q.views, q.selected_answer_id, (q.closed_at IS NOT NULL) AS closed, q.close_reason, q.duplicate_of,
        ${authorColumns('q')},
        COALESCE((SELECT array_agg(t.tag ORDER BY t.position, t.tag) FROM question_tags t
                  WHERE t.question_id = q.id), '{}') AS tags,
        (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.id AND NOT a.hidden)::int AS answer_count,
        (SELECT COUNT(*) FROM question_votes v WHERE v.question_id = q.id AND v.vote > 0)::int AS upvotes,
        (SELECT COUNT(*) FROM question_votes v WHERE v.question_id = q.id AND v.vote < 0)::int AS downvotes,
        COALESCE((SELECT SUM(v.vote) FROM question_votes v WHERE v.question_id = q.id), 0)::int AS netvotes,
        COALESCE((SELECT v.vote FROM question_votes v WHERE v.question_id = q.id AND v.user_id = ${viewer}), 0)::int AS my_vote,
        EXISTS (SELECT 1 FROM favorite_questions f WHERE f.question_id = q.id AND f.user_id = ${viewer}) AS favorited,
        (SELECT COUNT(*) FROM question_flags f WHERE f.question_id = q.id)::int AS flag_count,
        EXISTS (SELECT 1 FROM question_flags f WHERE f.question_id = q.id AND f.user_id = ${viewer}) AS my_flag`;
}

const questionFrom = `questions q
    JOIN users qu ON qu.id = q.user_id
    LEFT JOIN categories c ON c.id = q.category_id`;

const SORTS = {
    recent: 'created_at DESC, id DESC',
    hot: `(extract(epoch FROM created_at) / 43200.0 + answer_count + netvotes + ln(views + 1)) DESC, id DESC`,
    votes: 'netvotes DESC, created_at DESC, id DESC',
    answers: 'answer_count DESC, created_at DESC, id DESC',
    views: 'views DESC, created_at DESC, id DESC'
};

const UNANSWERED = {
    none: 'answer_count = 0',
    selected: 'selected_answer_id IS NULL',
    upvotes: `NOT EXISTS (SELECT 1 FROM answers a JOIN answer_votes v ON v.answer_id = a.id
               WHERE a.question_id = s.id AND NOT a.hidden AND v.vote > 0)`
};

function stripTotal(rows) {
    return rows.map(({ total_count, ...row }) => row);
}

// Runs a paginated question summary query. `where` filters the questions table (alias q).
async function listQuestions(pool, { viewerId, where = [], params = [], sort = 'recent', outer = [], page = 1,
    pageSize = LIMITS.pageSize, order } = {}) {
    const values = [viewerId, ...params];
    const conditions = where.length ? where.join(' AND ') : 'TRUE';
    const outerConditions = outer.length ? outer.join(' AND ') : 'TRUE';
    values.push(pageSize, (page - 1) * pageSize);
    const limitIndex = values.length - 1;
    const { rows } = await pool.query(
        `SELECT s.*, COUNT(*) OVER ()::int AS total_count FROM (
            SELECT ${questionColumns('$1')} FROM ${questionFrom} WHERE ${conditions}
         ) s
         WHERE ${outerConditions}
         ORDER BY ${order || SORTS[sort] || SORTS.recent}
         LIMIT $${limitIndex} OFFSET $${limitIndex + 1}`,
        values
    );
    return { questions: stripTotal(rows), total: rows[0]?.total_count || 0, page, pageSize };
}

async function getQuestion(pool, id, viewerId) {
    const { rows } = await pool.query(
        `SELECT ${questionColumns('$2')} FROM ${questionFrom} WHERE q.id = $1`, [id, viewerId]);
    return rows[0];
}

function answerColumns(viewer) {
    return `a.id, a.question_id, a.user_id, a.body, a.format, a.created_at, a.updated_at, a.last_edited_by, a.hidden,
        ${authorColumns('a')},
        (q.selected_answer_id IS NOT DISTINCT FROM a.id) AS selected,
        (SELECT COUNT(*) FROM answer_votes v WHERE v.answer_id = a.id AND v.vote > 0)::int AS upvotes,
        (SELECT COUNT(*) FROM answer_votes v WHERE v.answer_id = a.id AND v.vote < 0)::int AS downvotes,
        COALESCE((SELECT SUM(v.vote) FROM answer_votes v WHERE v.answer_id = a.id), 0)::int AS netvotes,
        COALESCE((SELECT v.vote FROM answer_votes v WHERE v.answer_id = a.id AND v.user_id = ${viewer}), 0)::int AS my_vote,
        (SELECT COUNT(*) FROM answer_flags f WHERE f.answer_id = a.id)::int AS flag_count,
        EXISTS (SELECT 1 FROM answer_flags f WHERE f.answer_id = a.id AND f.user_id = ${viewer}) AS my_flag`;
}
const answerFrom = 'answers a JOIN users au ON au.id = a.user_id JOIN questions q ON q.id = a.question_id';

function commentColumns(viewer) {
    return `c.id, c.question_id, c.answer_id, c.user_id, c.body, c.format, c.created_at, c.updated_at, c.last_edited_by, c.hidden,
        ${authorColumns('c')},
        (SELECT COUNT(*) FROM comment_flags f WHERE f.comment_id = c.id)::int AS flag_count,
        EXISTS (SELECT 1 FROM comment_flags f WHERE f.comment_id = c.id AND f.user_id = ${viewer}) AS my_flag`;
}
const commentFrom = 'comments c JOIN users cu ON cu.id = c.user_id';

async function getAnswer(pool, id, viewerId) {
    const { rows } = await pool.query(
        `SELECT ${answerColumns('$2')} FROM ${answerFrom} WHERE a.id = $1`, [id, viewerId]);
    return rows[0];
}

async function getComment(pool, id, viewerId) {
    const { rows } = await pool.query(
        `SELECT ${commentColumns('$2')} FROM ${commentFrom} WHERE c.id = $1`, [id, viewerId]);
    return rows[0];
}

// Answers in Q2A order: the selected answer first, then by votes, then oldest first.
async function listAnswers(pool, questionId, viewerId, includeHidden) {
    const { rows } = await pool.query(
        `SELECT ${answerColumns('$2')} FROM ${answerFrom}
         WHERE a.question_id = $1 AND (NOT a.hidden OR $3 OR a.user_id = $2)
         ORDER BY (q.selected_answer_id IS NOT DISTINCT FROM a.id) DESC, a.created_at, a.id`,
        [questionId, viewerId, includeHidden]);
    return rows;
}

async function listComments(pool, questionId, viewerId, includeHidden) {
    const { rows } = await pool.query(
        `SELECT ${commentColumns('$2')} FROM ${commentFrom}
         WHERE c.question_id = $1 AND (NOT c.hidden OR $3 OR c.user_id = $2)
         ORDER BY c.created_at, c.id`,
        [questionId, viewerId, includeHidden]);
    return rows;
}

async function setTags(client, questionId, tags) {
    await client.query('DELETE FROM question_tags WHERE question_id = $1', [questionId]);
    if (tags.length) {
        await client.query(
            `INSERT INTO question_tags (question_id, tag, position)
             SELECT $1, tag, position - 1 FROM unnest($2::text[]) WITH ORDINALITY AS t(tag, position)`,
            [questionId, tags]);
    }
}

// Runs fn inside a transaction on a dedicated client when the pool supports it.
async function transaction(pool, fn) {
    if (typeof pool.connect !== 'function') return fn(pool);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    SORTS, UNANSWERED, questionColumns, questionFrom, listQuestions, getQuestion,
    answerColumns, answerFrom, commentColumns, commentFrom, getAnswer, getComment,
    listAnswers, listComments, setTags, transaction, stripTotal
};
