const express = require('express');
const { createQuestionImprover, ModelError } = require('../services/question-improver');
const messages = require('../../lang/message/en/messages.json');

const MAX_QUESTION_LENGTH = 2000;

function createAiRouter(requireAuth, options, trackApiUsage)
{
    const router = express.Router();
    const improveQuestion = createQuestionImprover(options);

    router.post('/improve-question', requireAuth, trackApiUsage, async (req, res) => {
        const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
        if (!question || question.length > MAX_QUESTION_LENGTH) {
            return res.status(400).json({ message: messages.ai.invalidInput });
        }

        try {
            const improvedQuestion = await improveQuestion(question);
            return res.json({ improvedQuestion });
        } catch (error) {
            if (!(error instanceof ModelError)) throw error;
            return res.status(error.status).json({ message: error.message });
        }
    });

    return router;
}

module.exports = createAiRouter;
