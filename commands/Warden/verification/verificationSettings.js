const config = require('../../../config.json');
let database;

function getDatabase() {
    if (!database) {
        database = require('../../../Warden/db/database');
    }

    return database;
}

const DEFAULT_GUILD_ID = 'global';
const VERIFICATION_MODES = {
    block: 'block',
    challenge: 'challenge',
    skipChallenge: 'skip_challenge',
};
const VALID_VERIFICATION_MODES = Object.values(VERIFICATION_MODES);
const LEGACY_VERIFICATION_MODE_ALIASES = {
    disabled: VERIFICATION_MODES.block,
    enabled: VERIFICATION_MODES.challenge,
    skip: VERIFICATION_MODES.skipChallenge,
};
const DEFAULT_CHALLENGE_EXPIRY_SECONDS = 10 * 60;
const DEFAULT_COOLDOWN_SECONDS = 60;
const settingsCache = new Map();
let tableReady;

function normalizeGuildId(guildId) {
    return String(guildId ?? DEFAULT_GUILD_ID);
}

function defaultVerificationSettings() {
    const verificationConfig = config.Warden?.verification ?? {};
    const fallbackMode = verificationConfig.enabled === false ? VERIFICATION_MODES.block : VERIFICATION_MODES.challenge;
    const mode = normalizeVerificationMode(verificationConfig.mode, fallbackMode);
    const activeChallengeIds = Array.isArray(verificationConfig.activeChallengeIds)
        ? verificationConfig.activeChallengeIds
        : [
            verificationConfig.activeChallengeId
            ?? verificationConfig.challengeId
            ?? verificationConfig.activeCaptchaId
            ?? verificationConfig.captchaId
            ?? 'placeholder',
        ];

    return {
        mode,
        activeChallengeIds: normalizeChallengeIds(activeChallengeIds),
        challengeExpirySeconds: normalizeTimerSeconds(verificationConfig.challengeExpirySeconds ?? verificationConfig.expirySeconds, DEFAULT_CHALLENGE_EXPIRY_SECONDS),
        cooldownSeconds: normalizeTimerSeconds(verificationConfig.cooldownSeconds, DEFAULT_COOLDOWN_SECONDS),
    };
}

function normalizeChallengeIds(challengeIds) {
    const normalizedChallengeIds = (Array.isArray(challengeIds) ? challengeIds : [challengeIds])
        .map((challengeId) => String(challengeId ?? '').trim())
        .filter(Boolean);

    return [...new Set(normalizedChallengeIds)];
}

function normalizeVerificationMode(mode, fallback) {
    if (VALID_VERIFICATION_MODES.includes(mode)) {
        return mode;
    }

    return LEGACY_VERIFICATION_MODE_ALIASES[mode] ?? fallback;
}

function normalizeTimerSeconds(value, fallback) {
    const seconds = Math.floor(Number(value));
    return Number.isFinite(seconds) && seconds > 0 ? seconds : fallback;
}

function normalizeSettings(settings) {
    const defaults = defaultVerificationSettings();
    const mode = normalizeVerificationMode(settings?.mode, defaults.mode);
    const activeChallengeIds = normalizeChallengeIds(settings?.activeChallengeIds ?? defaults.activeChallengeIds);

    return {
        mode,
        activeChallengeIds: activeChallengeIds.length > 0 ? activeChallengeIds : defaults.activeChallengeIds,
        challengeExpirySeconds: normalizeTimerSeconds(settings?.challengeExpirySeconds, defaults.challengeExpirySeconds),
        cooldownSeconds: normalizeTimerSeconds(settings?.cooldownSeconds, defaults.cooldownSeconds),
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
        challengeExpirySeconds: row.challenge_expiry_seconds,
        cooldownSeconds: row.cooldown_seconds,
    });
}

async function ensureVerificationSettingsColumn(columnName, definition) {
    const rows = await getDatabase().query(
        `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'verification_settings'
           AND COLUMN_NAME = ?
         LIMIT 1`,
        [columnName],
    );

    if (rows.length < 1) {
        await getDatabase().query(`ALTER TABLE verification_settings ADD COLUMN ${definition}`);
        return;
    }

    const [column] = rows;
    if (column.IS_NULLABLE !== 'YES' || column.COLUMN_DEFAULT !== null || column.DATA_TYPE !== 'int') {
        await getDatabase().query(`ALTER TABLE verification_settings MODIFY COLUMN ${definition}`);
    }
}

async function migrateVerificationModeNames() {
    await getDatabase().query(
        `UPDATE verification_settings
         SET mode = CASE mode
            WHEN 'disabled' THEN ?
            WHEN 'enabled' THEN ?
            WHEN 'skip' THEN ?
            ELSE mode
         END
         WHERE mode IN ('disabled', 'enabled', 'skip')`,
        [VERIFICATION_MODES.block, VERIFICATION_MODES.challenge, VERIFICATION_MODES.skipChallenge],
    );
}

async function ensureVerificationSettingsTable() {
    if (!tableReady) {
        tableReady = getDatabase().query(`
            CREATE TABLE IF NOT EXISTS verification_settings (
                guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
                mode VARCHAR(16) NOT NULL DEFAULT 'challenge',
                active_challenge_ids TEXT NOT NULL,
                challenge_expiry_seconds INT NULL DEFAULT NULL,
                cooldown_seconds INT NULL DEFAULT NULL,
                updated_by VARCHAR(32) NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `)
            .then(async () => {
                await ensureVerificationSettingsColumn('challenge_expiry_seconds', 'challenge_expiry_seconds INT NULL DEFAULT NULL');
                await ensureVerificationSettingsColumn('cooldown_seconds', 'cooldown_seconds INT NULL DEFAULT NULL');
                await migrateVerificationModeNames();
            })
            .catch((err) => {
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
        `INSERT INTO verification_settings (guild_id, mode, active_challenge_ids, challenge_expiry_seconds, cooldown_seconds, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            mode = VALUES(mode),
            active_challenge_ids = VALUES(active_challenge_ids),
            challenge_expiry_seconds = VALUES(challenge_expiry_seconds),
            cooldown_seconds = VALUES(cooldown_seconds),
            updated_by = VALUES(updated_by)`,
        [
            normalizedGuildId,
            normalizedSettings.mode,
            JSON.stringify(normalizedSettings.activeChallengeIds),
            normalizedSettings.challengeExpirySeconds,
            normalizedSettings.cooldownSeconds,
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
    const rows = await getDatabase().query('SELECT mode, active_challenge_ids, challenge_expiry_seconds, cooldown_seconds FROM verification_settings WHERE guild_id = ? LIMIT 1', [normalizedGuildId]);

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

async function setChallengeExpirySeconds(guildId, challengeExpirySeconds, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    return saveVerificationSettings(guildId, { ...currentSettings, challengeExpirySeconds }, updatedBy);
}

async function setCooldownSeconds(guildId, cooldownSeconds, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    return saveVerificationSettings(guildId, { ...currentSettings, cooldownSeconds }, updatedBy);
}

module.exports = {
    VALID_VERIFICATION_MODES,
    DEFAULT_CHALLENGE_EXPIRY_SECONDS,
    DEFAULT_COOLDOWN_SECONDS,
    ensureVerificationSettingsTable,
    getVerificationSettings,
    setVerificationMode,
    setActiveChallengeIds,
    enableChallengeId,
    disableChallengeId,
    setChallengeExpirySeconds,
    setCooldownSeconds,
};
