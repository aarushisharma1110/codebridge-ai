const messages = require('../../lang/message/en/messages.json');

const MAX_TIMEOUT_MS = 120000;
const MAX_OUTPUT_LENGTH = 4000;
const DEFAULT_MODEL = 'Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M';

const prompt = [
    {
        role: 'system',
        content: `You are a technical question improvement assistant.

Rewrite vague questions into clear, useful, answerable questions.

Rules:
- Clarify the user's technical problem or goal.
- Improve clarity and specificity.
- Add relevant troubleshooting direction when useful.
- Preserve the user's original meaning and perspective.
- Never invent errors, facts, configurations, or solutions the user hasn't provided.
- Do not answer the question.
- Do more than correct grammar.
- Do not unnecessarily lengthen already clear questions.
- Return only the improved question.`
    },
    { role: 'user', content: 'why my api slow' },
    { role: 'assistant', content: 'What could be causing slow response times in my API, and how can I identify the source of the performance problem?' },
    { role: 'user', content: 'react state not updating' },
    { role: 'assistant', content: 'Why might changes to state not be reflected in my React component, and what should I check to diagnose the issue?' }
];

class ModelError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function createQuestionImprover({
    serviceUrl = 'http://127.0.0.1:8080',
    model = DEFAULT_MODEL,
    timeoutMs = 30000,
    fetchImpl = globalThis.fetch
} = {}) {
    let url;
    try {
        url = new URL(serviceUrl);
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== serviceUrl.replace(/\/$/, '')) {
            throw new Error();
        }
    } catch {
        throw new Error('Set AI_SERVICE_URL to the HTTP(S) origin of llama.cpp');
    }
    const timeout = Number(timeoutMs);
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_TIMEOUT_MS) {
        throw new Error('Set AI_TIMEOUT_MS to an integer between 1 and 120000');
    }
    if (!model.trim()) throw new Error('Set AI_MODEL to the model ID served by llama.cpp');

    const completionUrl = new URL('/v1/chat/completions', url);
    return async function improveQuestion(question) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        const invalid = () => new ModelError(502, messages.ai.invalidSuggestion);
        const unavailable = () => new ModelError(503, messages.ai.unavailable);

        try {
            let response;
            try {
                response = await fetchImpl(completionUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    redirect: 'error',
                    signal: controller.signal,
                    body: JSON.stringify({
                        model: model.trim(),
                        messages: [...prompt, { role: 'user', content: question }],
                        temperature: 0.2,
                        max_tokens: 256,
                        stream: false
                    })
                });
            } catch {
                throw unavailable();
            }
            if (!response.ok) {
                await response.body?.cancel();
                throw unavailable();
            }

            let result;
            try {
                const completion = (await response.json())?.choices?.[0];
                const content = completion?.message?.content;
                if (completion?.finish_reason === 'length' || typeof content !== 'string') throw invalid();
                result = content.trim();
            } catch {
                throw invalid();
            }
            if (!result || result.length > MAX_OUTPUT_LENGTH) throw invalid();
            return result;
        } catch (error) {
            if (controller.signal.aborted) {
                throw new ModelError(504, messages.ai.timeout);
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    };
}

module.exports = { createQuestionImprover, ModelError };
