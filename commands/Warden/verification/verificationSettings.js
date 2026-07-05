const config = require('../../../config.json');
let database;

function getDatabase() {
    if (!database) {
        database = require('../../../Warden/db/database');
    }

    return database;
}

const DEFAULT_GUILD_ID = 'global';
const VALID_VERIFICATION_MODES = ['enabled', 'disabled', 'skip'];
const settingsCache = new Map();
let tableReady;

function normalizeGuildId(guildId) {
    return String(guildId ?? DEFAULT_GUILD_ID);
}

function defaultVerificationSettings() {
    const verificationConfig = config.Warden?.verification ?? {};
    const configuredMode = verificationConfig.mode;
    const mode = VALID_VERIFICATION_MODES.includes(configuredMode)
        ? configuredMode
        : verificationConfig.enabled === false ? 'disabled' : 'enabled';
    const activeChallengeIds = Array.isArray(verificationConfig.activeChallengeIds)
        ? verificationConfig.activeChallengeIds
        : [verificationConfig.activeChallengeId ?? verificationConfig.challengeId ?? 'placeholder'];

    return {
        mode,
        activeChallengeIds: normalizeChallengeIds(activeChallengeIds),
    };
}

function normalizeChallengeIds(challengeIds) {
    const normalizedChallengeIds = (Array.isArray(challengeIds) ? challengeIds : [challengeIds])
        .map((challengeId) => String(challengeId ?? '').trim())
        .filter(Boolean);

    return [...new Set(normalizedChallengeIds)];
}

function normalizeSettings(settings) {
    const defaults = defaultVerificationSettings();
    const mode = VALID_VERIFICATION_MODES.includes(settings?.mode) ? settings.mode : defaults.mode;
    const activeChallengeIds = normalizeChallengeIds(settings?.activeChallengeIds ?? defaults.activeChallengeIds);

    return {
        mode,
        activeChallengeIds: activeChallengeIds.length > 0 ? activeChallengeIds : defaults.activeChallengeIds,
    };
}

function parseSettingsRow(row) {
    let activeChallengeIds;

    try {
        activeChallengeIds = JSON.parse(row.active_challenge_ids ?? '[]');
    }
    catch (err) {
        console.error('Failed to parse verification_settings.active_challenge_ids:', err);
        activeChallengeIds = [];
    }

    return normalizeSettings({
        mode: row.mode,
        activeChallengeIds,
    });
}

async function ensureVerificationSettingsTable() {
    if (!tableReady) {
        tableReady = getDatabase().query(`
            CREATE TABLE IF NOT EXISTS verification_settings (
                guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
                mode VARCHAR(16) NOT NULL DEFAULT 'enabled',
                active_challenge_ids TEXT NOT NULL,
                updated_by VARCHAR(32) NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `).catch((err) => {
            tableReady = undefined;
            throw err;
        });
    }

    return tableReady;
}

async function saveVerificationSettings(guildId, settings, updatedBy) {
    const normalizedGuildId = normalizeGuildId(guildId);
    const normalizedSettings = normalizeSettings(settings);

    await ensureVerificationSettingsTable();
    await getDatabase().query(
        `INSERT INTO verification_settings (guild_id, mode, active_challenge_ids, updated_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            mode = VALUES(mode),
            active_challenge_ids = VALUES(active_challenge_ids),
            updated_by = VALUES(updated_by)`,
        [
            normalizedGuildId,
            normalizedSettings.mode,
            JSON.stringify(normalizedSettings.activeChallengeIds),
            updatedBy ? String(updatedBy) : null,
        ],
    );

    settingsCache.set(normalizedGuildId, normalizedSettings);
    return normalizedSettings;
}

async function getVerificationSettings(guildId) {
    const normalizedGuildId = normalizeGuildId(guildId);

    if (settingsCache.has(normalizedGuildId)) {
        return settingsCache.get(normalizedGuildId);
    }

    await ensureVerificationSettingsTable();
    const rows = await getDatabase().query('SELECT mode, active_challenge_ids FROM verification_settings WHERE guild_id = ? LIMIT 1', [normalizedGuildId]);

    if (rows.length > 0) {
        const settings = parseSettingsRow(rows[0]);
        settingsCache.set(normalizedGuildId, settings);
        return settings;
    }

    return saveVerificationSettings(normalizedGuildId, defaultVerificationSettings(), null);
}

async function setVerificationMode(guildId, mode, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    return saveVerificationSettings(guildId, { ...currentSettings, mode }, updatedBy);
}

async function setActiveChallengeIds(guildId, challengeIds, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    return saveVerificationSettings(guildId, { ...currentSettings, activeChallengeIds: challengeIds }, updatedBy);
}

async function enableChallengeId(guildId, challengeId, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    return setActiveChallengeIds(guildId, [...currentSettings.activeChallengeIds, challengeId], updatedBy);
}

async function disableChallengeId(guildId, challengeId, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    return setActiveChallengeIds(
        guildId,
        currentSettings.activeChallengeIds.filter((activeChallengeId) => activeChallengeId !== challengeId),
        updatedBy,
    );
}

module.exports = {
    VALID_VERIFICATION_MODES,
    ensureVerificationSettingsTable,
    getVerificationSettings,
    setVerificationMode,
    setActiveChallengeIds,
    enableChallengeId,
    disableChallengeId,
};
