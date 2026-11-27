// Administrator-editable site options (Q2A Admin > General and Layout), with Q2A-style defaults.
const DEFAULTS = {
    site_title: 'CodeBridge AI',
    welcome_text: 'Welcome to CodeBridge AI Q&A, where you can ask questions and receive answers from other members of the community. Use Improve with AI to make your question clearer before you post it.',
    show_welcome: 'true',
    footer_text: ''
};
const LIMITS = { site_title: 80, welcome_text: 2000, show_welcome: 5, footer_text: 400 };

async function readOptions(pool) {
    const { rows } = await pool.query('SELECT name, value FROM site_options');
    const options = { ...DEFAULTS };
    for (const { name, value } of rows) if (Object.hasOwn(DEFAULTS, name)) options[name] = value;
    return options;
}

// Returns the cleaned changes, or null when a name or value is invalid.
function cleanOptions(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const changes = {};
    for (const [name, raw] of Object.entries(input)) {
        if (!Object.hasOwn(DEFAULTS, name)) return null;
        let value = raw;
        if (name === 'show_welcome') {
            if (typeof raw !== 'boolean' && !['true', 'false'].includes(raw)) return null;
            value = String(raw);
        }
        if (typeof value !== 'string') return null;
        value = value.trim();
        if (value.length > LIMITS[name] || (name === 'site_title' && !value)) return null;
        changes[name] = value;
    }
    return Object.keys(changes).length ? changes : null;
}

async function writeOptions(pool, changes) {
    for (const [name, value] of Object.entries(changes)) {
        await pool.query(
            `INSERT INTO site_options (name, value) VALUES ($1, $2)
             ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value`, [name, value]);
    }
    return readOptions(pool);
}

module.exports = { DEFAULTS, readOptions, cleanOptions, writeOptions };
