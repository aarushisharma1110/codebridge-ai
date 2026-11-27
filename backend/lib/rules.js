// Shared Q2A rules: user levels, input limits and parsing helpers.
// Defaults follow Question2Answer v1.8.8 (qa-include/app/options.php and db/maxima.php).

const LEVELS = ['user', 'expert', 'editor', 'moderator', 'admin'];
const LEVEL_TITLES = {
    user: 'Registered user', expert: 'Expert', editor: 'Editor', moderator: 'Moderator', admin: 'Administrator'
};

const LIMITS = {
    minTitle: 12, maxTitle: 120,
    minBody: 0, maxBody: 12000,
    minAnswer: 12, maxAnswer: 12000,
    minComment: 12, maxComment: 12000,
    maxTags: 5, maxTagLength: 40,
    pageSize: 20, tagPageSize: 60, userPageSize: 30,
    flagHideAfter: 5
};

const MAX_ID = 2147483647; // largest value of a SERIAL id column

function atLeast(user, level) {
    return Boolean(user) && LEVELS.indexOf(user.role) >= LEVELS.indexOf(level);
}

// Returns the trimmed text, or null if it is not text or its length is out of range.
function cleanText(value, minLength, maxLength) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text.length >= minLength && text.length <= maxLength ? text : null;
}

// Returns the id as a positive integer, or null if the URL value is not one.
function parseId(value) {
    if (typeof value === 'number') value = String(value);
    if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) return null;
    const id = Number(value);
    return id <= MAX_ID ? id : null;
}

function parsePage(value) {
    const page = parseId(value);
    return page && page <= 100000 ? page : 1;
}

const TAG_PATTERN = /^[a-z0-9][a-z0-9+#._-]*$/;

// Q2A splits tags on spaces and commas. Returns a de-duplicated list, or null if a tag is invalid.
function cleanTags(value) {
    if (value === undefined || value === null) return [];
    let list = value;
    if (typeof value === 'string') list = value.split(/[\s,]+/);
    if (!Array.isArray(list)) return null;
    const tags = [];
    for (const item of list) {
        if (typeof item !== 'string') return null;
        const tag = item.trim().toLowerCase();
        if (!tag) continue;
        if (tag.length > LIMITS.maxTagLength || !TAG_PATTERN.test(tag)) return null;
        if (!tags.includes(tag)) tags.push(tag);
    }
    return tags.length <= LIMITS.maxTags ? tags : null;
}

function cleanTag(value) {
    const tags = cleanTags(typeof value === 'string' ? value : null);
    return tags && tags.length === 1 ? tags[0] : null;
}

const HANDLE_PATTERN = /^[A-Za-z0-9_.-]{2,20}$/;
function cleanHandle(value) {
    if (typeof value !== 'string') return null;
    const handle = value.trim();
    return HANDLE_PATTERN.test(handle) ? handle : null;
}

function slugify(value) {
    return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

module.exports = {
    LEVELS, LEVEL_TITLES, LIMITS, MAX_ID,
    atLeast, cleanText, parseId, parsePage, cleanTags, cleanTag, cleanHandle, slugify
};
