// User-facing messages returned by the API, kept apart from the route logic.
module.exports = {
    questions: {
        invalidInput: (maxTitle, maxBody) =>
            `Title (1-${maxTitle} characters) and body (1-${maxBody} characters) are required`
    }
};
