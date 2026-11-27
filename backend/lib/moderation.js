// Voting, flagging and hiding shared by questions, answers and comments.
const messages = require('../messages');
const { atLeast, LIMITS } = require('./rules');

const KINDS = {
    question: { table: 'questions', votes: 'question_votes', flags: 'question_flags', key: 'question_id',
        notFound: messages.questions.notFound },
    answer: { table: 'answers', votes: 'answer_votes', flags: 'answer_flags', key: 'answer_id',
        notFound: messages.answers.notFound },
    comment: { table: 'comments', flags: 'comment_flags', key: 'comment_id', notFound: messages.comments.notFound }
};

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const fail = (status, message) => { throw new HttpError(status, message); };

// Loads a post with its parent question's hidden/closed state.
async function loadPost(db, kind, id) {
    const parent = kind === 'question'
        ? 'p.hidden AS parent_hidden, (p.closed_at IS NOT NULL) AS parent_closed, p.id AS question_id'
        : `q.hidden AS parent_hidden, (q.closed_at IS NOT NULL) AS parent_closed, q.id AS question_id`;
    const join = kind === 'question' ? '' : 'JOIN questions q ON q.id = p.question_id';
    const { rows: [post] } = await db.query(
        `SELECT p.id, p.user_id, p.hidden, ${parent} FROM ${KINDS[kind].table} p ${join} WHERE p.id = $1`, [id]);
    return post;
}

function requireActive(user) {
    if (user.blocked) fail(403, messages.posts.blocked);
}

// A post others can interact with: it exists, it and its question are visible.
async function interactivePost(db, kind, id) {
    const post = await loadPost(db, kind, id);
    if (!post) fail(404, KINDS[kind].notFound);
    if (post.hidden) fail(403, messages[`${kind}s`].hidden);
    if (kind !== 'question' && post.parent_hidden) fail(403, messages.posts.parentHidden);
    return post;
}

async function castVote(db, kind, id, user, value) {
    requireActive(user);
    if (![1, -1, 0].includes(value)) fail(400, messages.posts.invalidVote);
    const post = await interactivePost(db, kind, id);
    if (post.user_id === user.id) fail(403, messages.posts.ownVote);
    const { votes, key } = KINDS[kind];
    if (value === 0) {
        await db.query(`DELETE FROM ${votes} WHERE user_id = $1 AND ${key} = $2`, [user.id, id]);
    } else {
        await db.query(
            `INSERT INTO ${votes} (user_id, ${key}, vote) VALUES ($1, $2, $3)
             ON CONFLICT (user_id, ${key}) DO UPDATE SET vote = EXCLUDED.vote, created_at = CURRENT_TIMESTAMP`,
            [user.id, id, value]);
    }
}

// Flags a post; Q2A hides a post automatically once it reaches the flag threshold.
async function flag(db, kind, id, user, add) {
    requireActive(user);
    const post = await interactivePost(db, kind, id);
    if (post.user_id === user.id) fail(403, messages.posts.ownFlag);
    const { flags, key, table } = KINDS[kind];
    if (!add) {
        await db.query(`DELETE FROM ${flags} WHERE user_id = $1 AND ${key} = $2`, [user.id, id]);
        return;
    }
    await db.query(`INSERT INTO ${flags} (user_id, ${key}) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.id, id]);
    const { rows: [{ count }] } = await db.query(`SELECT COUNT(*)::int AS count FROM ${flags} WHERE ${key} = $1`, [id]);
    if (count >= LIMITS.flagHideAfter) {
        await db.query(`UPDATE ${table} SET hidden = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
    }
}

async function clearFlags(db, kind, id, user) {
    if (!atLeast(user, 'editor')) fail(403, messages.posts.permission);
    const post = await loadPost(db, kind, id);
    if (!post) fail(404, KINDS[kind].notFound);
    const { flags, key } = KINDS[kind];
    await db.query(`DELETE FROM ${flags} WHERE ${key} = $1`, [id]);
}

// Hide (owner or editor+) and reshow (editor+) answers and comments.
async function setHidden(db, kind, id, user, hidden) {
    const post = await loadPost(db, kind, id);
    if (!post) fail(404, KINDS[kind].notFound);
    const editor = atLeast(user, 'editor');
    if (hidden) {
        if (post.user_id !== user.id && !editor) fail(403, messages[`${kind}s`].notOwner);
        if (post.hidden) fail(409, messages.posts.alreadyHidden);
    } else {
        if (!editor) fail(403, messages.posts.permission);
        if (!post.hidden) fail(409, messages.posts.notHidden);
    }
    await db.query(
        `UPDATE ${KINDS[kind].table} SET hidden = $2, updated_at = CURRENT_TIMESTAMP, last_edited_by = $3 WHERE id = $1`,
        [id, hidden, user.id]);
    if (kind === 'answer' && hidden) {
        await db.query('UPDATE questions SET selected_answer_id = NULL WHERE selected_answer_id = $1', [id]);
    }
}

// Moderators and administrators may permanently delete hidden answers and comments.
async function deleteHidden(db, kind, id, user) {
    const post = await loadPost(db, kind, id);
    if (!post) fail(404, KINDS[kind].notFound);
    if (!atLeast(user, 'moderator')) fail(403, messages.posts.permission);
    if (!post.hidden) fail(409, messages.posts.deleteVisible);
    await db.query(`DELETE FROM ${KINDS[kind].table} WHERE id = $1 AND hidden`, [id]);
}

// Wraps an async handler so HttpError becomes a JSON response.
function handle(fn) {
    return async (req, res, next) => {
        try {
            await fn(req, res, next);
        } catch (error) {
            if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
            next(error);
        }
    };
}

module.exports = {
    KINDS, HttpError, fail, loadPost, requireActive, interactivePost,
    castVote, flag, clearFlags, setHidden, deleteHidden, handle
};
