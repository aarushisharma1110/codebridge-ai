// User-facing messages returned by the API, kept apart from the route logic.
module.exports = {
    questions: {
        notFound: 'Question not found',
        hidden: 'This question has been hidden',
        adminOnly: 'Only an administrator can view hidden questions',
        notOwner: 'You can only change your own questions',
        alreadyHidden: 'This question is already hidden',
        notHidden: 'This question is not hidden',
        hiddenByOther: 'Only an administrator can reshow a question that someone else hid',
        editHidden: 'A hidden question cannot be edited; reshow it first',
        deleteAdminOnly: 'Only an administrator can delete a question',
        deleteNotHidden: 'A question must be hidden before it can be deleted',
        invalidInput: ({ minTitle, maxTitle, maxBody }) =>
            `Title must be ${minTitle}-${maxTitle} characters and body at most ${maxBody} characters`,
        invalidUpdate: ({ minTitle, maxTitle, maxBody }) =>
            `Provide a title of ${minTitle}-${maxTitle} characters, a body of at most ${maxBody} characters, or both`
    }
};
