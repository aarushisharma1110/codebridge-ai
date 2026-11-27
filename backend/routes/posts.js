// Routes for answers (/api/v1/answers) and comments (/api/v1/comments).
const express = require('express');
const messages = require('../messages');
const { LIMITS, atLeast, parseId } = require('../lib/rules');
const { getAnswer, getComment } = require('../lib/posts');
const { cleanContent } = require('../lib/html');
const {
    castVote, flag, clearFlags, setHidden, deleteHidden, handle, fail, requireActive, loadPost
} = require('../lib/moderation');

function createPostRouter(kind, pool, requireAuth, trackApiUsage) {
    const router = express.Router();
    const tracked = [requireAuth, trackApiUsage];
    const notFound = messages[`${kind}s`].notFound;
    const load = kind === 'answer' ? getAnswer : getComment;
    const [min, max] = kind === 'answer' ? [LIMITS.minAnswer, LIMITS.maxAnswer] : [LIMITS.minComment, LIMITS.maxComment];
    const key = kind === 'answer' ? 'answer' : 'comment';

    const idParam = (req) => {
        const id = parseId(req.params.id);
        if (!id) fail(404, notFound);
        return id;
    };
    const respond = async (res, id, user) => res.json({ [key]: await load(pool, id, user.id) });

    router.patch('/:id', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        const body = cleanContent(req.body?.body, req.body?.format, min, max);
        if (body === null) fail(400, messages[`${kind}s`].invalidInput(LIMITS));
        const post = await loadPost(pool, kind, id);
        if (!post) fail(404, notFound);
        if (post.hidden) fail(atLeast(req.user, 'editor') ? 409 : 403, messages[`${kind}s`].hidden);
        if (post.user_id !== req.user.id && !atLeast(req.user, 'editor')) fail(403, messages[`${kind}s`].notOwner);
        requireActive(req.user);
        await pool.query(
            `UPDATE ${kind}s SET body = $2, format = $4, updated_at = CURRENT_TIMESTAMP, last_edited_by = $3 WHERE id = $1`,
            [id, body.body, req.user.id, body.format]);
        await respond(res, id, req.user);
    }));

    if (kind === 'answer') {
        router.post('/:id/vote', ...tracked, handle(async (req, res) => {
            const id = idParam(req);
            await castVote(pool, 'answer', id, req.user, req.body?.vote);
            await respond(res, id, req.user);
        }));

        router.post('/:id/comments', ...tracked, handle(async (req, res) => {
            const id = idParam(req);
            const post = await loadPost(pool, 'answer', id);
            if (!post) fail(404, notFound);
            if (post.hidden) fail(403, messages.answers.hidden);
            if (post.parent_hidden || post.parent_closed) fail(409, messages.posts.parentHidden);
            requireActive(req.user);
            const body = cleanContent(req.body?.body, req.body?.format, LIMITS.minComment, LIMITS.maxComment);
            if (body === null) fail(400, messages.comments.invalidInput(LIMITS));
            const { rows: [row] } = await pool.query(
                'INSERT INTO comments (question_id, answer_id, user_id, body, format) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [post.question_id, id, req.user.id, body.body, body.format]);
            res.status(201).json({ comment: await getComment(pool, row.id, req.user.id) });
        }));
    }

    router.post('/:id/flag', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        await flag(pool, kind, id, req.user, true);
        await respond(res, id, req.user);
    }));

    router.delete('/:id/flag', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        await flag(pool, kind, id, req.user, false);
        await respond(res, id, req.user);
    }));

    router.delete('/:id/flags', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        await clearFlags(pool, kind, id, req.user);
        await respond(res, id, req.user);
    }));

    router.post('/:id/hide', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        await setHidden(pool, kind, id, req.user, true);
        await respond(res, id, req.user);
    }));

    router.post('/:id/reshow', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        await setHidden(pool, kind, id, req.user, false);
        await respond(res, id, req.user);
    }));

    router.delete('/:id', ...tracked, handle(async (req, res) => {
        const id = idParam(req);
        await deleteHidden(pool, kind, id, req.user);
        res.status(204).end();
    }));

    return router;
}

module.exports = createPostRouter;
