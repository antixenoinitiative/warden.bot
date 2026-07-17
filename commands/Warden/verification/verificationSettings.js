const config = require('../../../config.json');
let database;

function getDatabase() {
    if (!database) database = require('../../../Warden/db/database');
    return database;
}

const DEFAULT_GUILD_ID = 'global';
const VERIFICATION_MODES = {
    challenge: 'challenge',
    halt: 'halt',
    oneClick: 'one-click',
};
const VALID_VERIFICATION_MODES = Object.values(VERIFICATION_MODES);
const DEFAULT_CHALLENGE_EXPIRY_SECONDS = 10 * 60;
const DEFAULT_COOLDOWN_SECONDS = 60;
const DEFAULT_AUTOKICK_SECONDS = 10 * 60;
const settingsCache = new Map();
let guildSettingsTableReady;

function normalizeGuildId(guildId) {
    return String(guildId ?? DEFAULT_GUILD_ID);
}

function clearVerificationSettingsCache(guildId) {
    if (guildId === undefined || guildId === null) settingsCache.clear();
    else settingsCache.delete(normalizeGuildId(guildId));
}

function safeParseJson(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    try {
        return JSON.parse(value);
    }
    catch (err) {
        console.error('Failed to parse verification settings JSON:', err);
        return fallback;
    }
}

function stringifyJsonOrNull(value) {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value) && value.length < 1) return null;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length < 1) return null;
    return JSON.stringify(value);
}

function normalizeActiveChallengeIds(value) {
    const rawChallengeIds = Array.isArray(value)
        ? value
        : safeParseJson(value, String(value ?? '').split(/[\s,]+/));
    return [...new Set((Array.isArray(rawChallengeIds) ? rawChallengeIds : [rawChallengeIds])
        .map((challengeId) => String(challengeId ?? '').trim())
        .filter(Boolean))];
}

function normalizeVerificationMode(mode, fallback = VERIFICATION_MODES.challenge) {
    return VALID_VERIFICATION_MODES.includes(mode) ? mode : fallback;
}

function normalizeTimerSeconds(value, fallback) {
    const seconds = Math.floor(Number(value));
    return Number.isFinite(seconds) && seconds > 0 ? seconds : fallback;
}

function normalizeBoolean(value) {
    return value === true || value === 1 || value === '1';
}

function defaultVerificationSettings() {
    const verificationConfig = config.Warden?.verification ?? {};
    const activeChallengeIds = normalizeActiveChallengeIds(
        verificationConfig.activeChallengeIds
        ?? 'placeholder',
    );
    return {
        mode: normalizeVerificationMode(verificationConfig.mode, VERIFICATION_MODES.challenge),
        activeChallengeIds: activeChallengeIds.length > 0 ? activeChallengeIds : ['placeholder'],
        challengeExpirySeconds: normalizeTimerSeconds(verificationConfig.challengeExpirySeconds, DEFAULT_CHALLENGE_EXPIRY_SECONDS),
        cooldownSeconds: normalizeTimerSeconds(verificationConfig.cooldownSeconds, DEFAULT_COOLDOWN_SECONDS),
        autokickEnabled: verificationConfig.autokickEnabled === true,
        autokickSeconds: normalizeTimerSeconds(verificationConfig.autokickSeconds, DEFAULT_AUTOKICK_SECONDS),
    };
}

function normalizeSettings(settings) {
    const defaults = defaultVerificationSettings();
    const activeChallengeIds = normalizeActiveChallengeIds(settings?.activeChallengeIds ?? defaults.activeChallengeIds);
    return {
        mode: normalizeVerificationMode(settings?.mode, defaults.mode),
        activeChallengeIds: activeChallengeIds.length > 0 ? activeChallengeIds : defaults.activeChallengeIds,
        challengeExpirySeconds: normalizeTimerSeconds(settings?.challengeExpirySeconds, defaults.challengeExpirySeconds),
        cooldownSeconds: normalizeTimerSeconds(settings?.cooldownSeconds, defaults.cooldownSeconds),
        autokickEnabled: normalizeBoolean(settings?.autokickEnabled),
        autokickSeconds: normalizeTimerSeconds(settings?.autokickSeconds, defaults.autokickSeconds),
    };
}

function parseGuildSettingsRow(row) {
    return normalizeSettings({
        mode: row.mode,
        activeChallengeIds: safeParseJson(row.active_challenge_ids_json, []),
        challengeExpirySeconds: row.challenge_expiry_seconds,
        cooldownSeconds: row.cooldown_seconds,
        autokickEnabled: row.autokick_enabled,
        autokickSeconds: row.autokick_seconds,
    });
}

async function ensureVerificationGuildSettingsTable() {
    if (!guildSettingsTableReady) {
        guildSettingsTableReady = getDatabase().query(`
            CREATE TABLE IF NOT EXISTS verification_guild_settings (
                guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
                mode VARCHAR(16) NOT NULL DEFAULT 'challenge',
                active_challenge_ids_json TEXT NULL,
                challenge_expiry_seconds INT NULL DEFAULT NULL,
                cooldown_seconds INT NULL DEFAULT NULL,
                autokick_enabled TINYINT(1) NOT NULL DEFAULT 0,
                autokick_seconds INT NULL DEFAULT NULL,
                updated_by VARCHAR(32) NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `).catch((err) => {
            guildSettingsTableReady = undefined;
            throw err;
        });
    }
    return guildSettingsTableReady;
}

async function saveVerificationGuildSettingsOnly(guildId, settings, updatedBy) {
    const normalizedGuildId = normalizeGuildId(guildId);
    const normalizedSettings = normalizeSettings(settings);
    await ensureVerificationGuildSettingsTable();
    await getDatabase().query(
        `INSERT INTO verification_guild_settings (guild_id, mode, active_challenge_ids_json, challenge_expiry_seconds, cooldown_seconds, autokick_enabled, autokick_seconds, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            mode = VALUES(mode),
            active_challenge_ids_json = VALUES(active_challenge_ids_json),
            challenge_expiry_seconds = VALUES(challenge_expiry_seconds),
            cooldown_seconds = VALUES(cooldown_seconds),
            autokick_enabled = VALUES(autokick_enabled),
            autokick_seconds = VALUES(autokick_seconds),
            updated_by = VALUES(updated_by)`,
        [
            normalizedGuildId,
            normalizedSettings.mode,
            stringifyJsonOrNull(normalizedSettings.activeChallengeIds),
            normalizedSettings.challengeExpirySeconds,
            normalizedSettings.cooldownSeconds,
            normalizedSettings.autokickEnabled ? 1 : 0,
            normalizedSettings.autokickSeconds,
            updatedBy ? String(updatedBy) : null,
        ],
    );
    settingsCache.set(normalizedGuildId, normalizedSettings);
    return normalizedSettings;
}

async function getVerificationGuildSettings(guildId) {
    const normalizedGuildId = normalizeGuildId(guildId);
    if (settingsCache.has(normalizedGuildId)) return settingsCache.get(normalizedGuildId);

    await ensureVerificationGuildSettingsTable();
    const guildRows = await getDatabase().query(
        'SELECT mode, active_challenge_ids_json, challenge_expiry_seconds, cooldown_seconds, autokick_enabled, autokick_seconds FROM verification_guild_settings WHERE guild_id = ? LIMIT 1',
        [normalizedGuildId],
    );
    const settings = guildRows.length > 0
        ? parseGuildSettingsRow(guildRows[0])
        : await saveVerificationGuildSettingsOnly(normalizedGuildId, defaultVerificationSettings(), null);
    settingsCache.set(normalizedGuildId, settings);
    return settings;
}

module.exports = {
    VERIFICATION_MODES,
    clearVerificationSettingsCache,
    ensureVerificationGuildSettingsTable,
    safeParseJson,
    stringifyJsonOrNull,
    getVerificationGuildSettings,
    saveVerificationGuildSettingsOnly,
};
