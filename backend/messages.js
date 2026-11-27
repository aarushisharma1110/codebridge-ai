// User-facing messages returned by the API, kept apart from the route logic.
module.exports = {
    questions: {
        notFound: 'Question not found',
        hidden: 'This question is hidden.',
        editHidden: 'Reshow this question before editing it.',
        alreadyHidden: 'This question is already hidden.',
        notHidden: 'This question is already visible.',
        notOwner: 'You can only change your own questions',
        hasAnswers: 'This question has answers or comments. Hide it instead of deleting it.',
        closed: 'This question is closed.',
        alreadyClosed: 'This question is already closed.',
        notClosed: 'This question is not closed.',
        invalidClose: 'Give a reason of 1-800 characters or the ID of an existing visible question it duplicates.',
        invalidCategory: 'Choose an existing category.',
        invalidTags: 'Use at most 5 tags of up to 40 lowercase letters, digits or + # . _ - characters, separated by spaces.',
        invalidSelection: 'Choose a visible answer to this question.',
        invalidInput: ({ minTitle, maxTitle, maxBody }) =>
            `Title must be ${minTitle}-${maxTitle} characters and body at most ${maxBody} characters`,
        invalidUpdate: ({ minTitle, maxTitle, maxBody }) =>
            `Provide a title of ${minTitle}-${maxTitle} characters, a body of at most ${maxBody} characters, tags, a category, or a combination`
    },
    answers: {
        notFound: 'Answer not found',
        hidden: 'This answer is hidden.',
        invalidInput: ({ minAnswer, maxAnswer }) => `Answers must be ${minAnswer}-${maxAnswer} characters`,
        notOwner: 'You can only change your own answers'
    },
    comments: {
        notFound: 'Comment not found',
        hidden: 'This comment is hidden.',
        invalidInput: ({ minComment, maxComment }) => `Comments must be ${minComment}-${maxComment} characters`,
        notOwner: 'You can only change your own comments'
    },
    posts: {
        ownVote: 'You cannot vote on your own posts.',
        ownFlag: 'You cannot flag your own posts.',
        invalidVote: 'Send a vote of 1, -1 or 0.',
        alreadyHidden: 'This post is already hidden.',
        notHidden: 'This post is already visible.',
        deleteVisible: 'Hide this post before deleting it.',
        blocked: 'Your account is blocked from posting, voting and flagging.',
        permission: 'You do not have permission to do this.',
        parentHidden: 'The question for this post is hidden or closed.'
    },
    users: {
        notFound: 'User not found',
        invalidProfile: 'Use at most 100 characters for name and location, 200 for website and 12,000 for about.',
        invalidHandle: 'Usernames must be 2-20 letters, digits, dots, underscores or hyphens.',
        handleTaken: 'That username is already taken.',
        invalidRole: 'Choose a level of user, expert, editor, moderator or admin.',
        selfChange: 'You cannot change your own level or block yourself.',
        wrongPassword: 'Your current password is incorrect.',
        invalidPassword: 'Use a new password with at least 8 characters and at most 72 UTF-8 bytes.'
    },
    categories: {
        notFound: 'Category not found',
        invalid: 'Category titles must be 1-80 characters, with a description of at most 800 characters.',
        slugTaken: 'Another category already uses that slug.',
        invalidParent: 'Choose an existing top-level category as the parent.'
    },
    options: {
        invalid: 'Unknown option or invalid value.'
    }
};
