const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;

// Accept common ASCII mailbox addresses, including plus tags and apostrophes.
const localPartPattern = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function normalizeEmail(value) {
    if (typeof value !== 'string') return null;

    const email = value.trim().toLowerCase();
    const [local, domain, extra] = email.split('@');
    if (email.length > 254 || local.length > 64 || extra !== undefined ||
        !localPartPattern.test(local) || !domain || !domainPattern.test(domain)) {
        return null;
    }
    return email;
}

function validPassword(value, minLength = MIN_PASSWORD_LENGTH) {
    return typeof value === 'string' &&
        [...value].length >= minLength &&
        Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES;
}

module.exports = { BCRYPT_ROUNDS, normalizeEmail, validPassword };
