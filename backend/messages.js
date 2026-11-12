// User-facing messages returned by the API, kept apart from the route logic.
module.exports = {
    questions: {
        notFound: 'Question not found',
        notOwner: 'You can only change your own questions',
        invalidUpdate: (maxTitle, maxBody) =>
            `Provide a title (1-${maxTitle} characters), a body (1-${maxBody} characters), or both`,
        invalidInput: (maxTitle, maxBody) =>
            `Title (1-${maxTitle} characters) and body (1-${maxBody} characters) are required`
    }
};
