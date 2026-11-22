// User-facing messages returned by the API, kept apart from the route logic.
module.exports = {
    questions: {
        notFound: 'Question not found',
        hidden: 'This question is hidden.',
        editHidden: 'Reshow this question before editing it.',
        alreadyHidden: 'This question is already hidden.',
        notHidden: 'This question is already visible.',
        notOwner: 'You can only change your own questions',
        invalidInput: ({ minTitle, maxTitle, maxBody }) =>
            `Title must be ${minTitle}-${maxTitle} characters and body at most ${maxBody} characters`,
        invalidUpdate: ({ minTitle, maxTitle, maxBody }) =>
            `Provide a title of ${minTitle}-${maxTitle} characters, a body of at most ${maxBody} characters, or both`
    }
};
