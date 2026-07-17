const ADMIN_CUSTOM_ID_PREFIX = 'wVA';
const ADMIN_CUSTOM_ID_MAX_LENGTH = 100;
const ADMIN_CUSTOM_ID_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const ADMIN_CUSTOM_ID_SESSION_MAX_ENTRIES = 1000;

const adminCustomIdSessions = new Map();
let adminCustomIdSequence = 0;

function pruneAdminCustomIdSessions() {
    const now = Date.now();
    for (const [key, session] of adminCustomIdSessions.entries()) {
        if (now - Number(session.createdAt ?? 0) > ADMIN_CUSTOM_ID_SESSION_TTL_MS) {
            adminCustomIdSessions.delete(key);
        }
    }

    while (adminCustomIdSessions.size > ADMIN_CUSTOM_ID_SESSION_MAX_ENTRIES) {
        adminCustomIdSessions.delete(adminCustomIdSessions.keys().next().value);
    }
}

function buildAdminSessionKey(action, parts, state) {
    pruneAdminCustomIdSessions();
    adminCustomIdSequence = (adminCustomIdSequence + 1) % Number.MAX_SAFE_INTEGER;
    const key = `${Date.now().toString(36)}${adminCustomIdSequence.toString(36)}`;
    adminCustomIdSessions.set(key, {
        action: String(action),
        parts: parts.map(String),
        state,
        createdAt: Date.now(),
    });
    return key;
}

function buildCustomId(action, parts, state) {
    const key = buildAdminSessionKey(action, parts, state);
    const customId = [ADMIN_CUSTOM_ID_PREFIX, action, key].map(String).join(':');
    if (customId.length > ADMIN_CUSTOM_ID_MAX_LENGTH) {
        throw new Error(`Verification admin custom ID exceeded Discord's ${ADMIN_CUSTOM_ID_MAX_LENGTH}-character limit.`);
    }
    return customId;
}

function buildAdminCustomId(action, ...parts) {
    return buildCustomId(action, parts);
}

function buildAdminFormCustomId(action, parts, baseline = {}) {
    return buildCustomId(action, parts, { baseline });
}

function parseAdminCustomId(customId) {
    const parts = String(customId ?? '').split(':');
    if (parts[0] !== ADMIN_CUSTOM_ID_PREFIX) return null;

    pruneAdminCustomIdSessions();
    const session = adminCustomIdSessions.get(parts[2]);
    if (session) return { action: session.action, parts: session.parts, state: session.state };
    return { expired: true };
}

module.exports = {
    buildAdminCustomId,
    buildAdminFormCustomId,
    parseAdminCustomId,
};
