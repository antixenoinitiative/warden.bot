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
    challenge: 'challenge',
    halt: 'halt',
    oneClick: 'one-click',
};
const VALID_VERIFICATION_MODES = Object.values(VERIFICATION_MODES);
const DEFAULT_CHALLENGE_EXPIRY_SECONDS = 10 * 60;
const DEFAULT_COOLDOWN_SECONDS = 60;
const DEFAULT_AUTOKICK_SECONDS = 10 * 60;
const settingsCache = new Map();
let tableReady;

function normalizeGuildId(guildId) {
    return String(guildId ?? DEFAULT_GUILD_ID);
}

function defaultChallengeOverrides() {
    return {};
}

function defaultVerificationSettings() {
    const verificationConfig = config.Warden?.verification ?? {};
    const mode = normalizeVerificationMode(verificationConfig.mode, VERIFICATION_MODES.challenge);
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
        autokickEnabled: verificationConfig.autokickEnabled === true,
        autokickSeconds: normalizeTimerSeconds(verificationConfig.autokickSeconds ?? verificationConfig.autokickTimerSeconds, DEFAULT_AUTOKICK_SECONDS),
        challengeOverrides: defaultChallengeOverrides(),
    };
}

function normalizeChallengeIds(challengeIds) {
    const normalizedChallengeIds = (Array.isArray(challengeIds) ? challengeIds : [challengeIds])
        .map((challengeId) => String(challengeId ?? '').trim())
        .filter(Boolean);

    return [...new Set(normalizedChallengeIds)];
}

function normalizeVerificationMode(mode, fallback = VERIFICATION_MODES.challenge) {
    if (VALID_VERIFICATION_MODES.includes(mode)) {
        return mode;
    }

    return fallback;
}

function normalizeTimerSeconds(value, fallback) {
    const seconds = Math.floor(Number(value));
    return Number.isFinite(seconds) && seconds > 0 ? seconds : fallback;
}

function normalizeOverrideIdList(value) {
    const values = Array.isArray(value)
        ? value
        : String(value ?? '').split(/[\s,]+/);

    return [...new Set(values
        .map((id) => String(id ?? '').trim())
        .filter(Boolean))];
}

function normalizeDirectionList(value) {
    const values = Array.isArray(value) ? value : String(value ?? '').split(/[\s,]+/);

    return [...new Set(values
        .map((degrees) => Number(degrees))
        .filter((degrees) => Number.isInteger(degrees) && degrees >= 0 && degrees < 360 && degrees % 45 === 0))]
        .sort((left, right) => left - right);
}

function normalizeSolutionImageDirections(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return Object.entries(value).reduce((directions, [imageId, degreeList]) => {
        const normalizedImageId = String(imageId ?? '').trim();
        const normalizedDegrees = normalizeDirectionList(degreeList);

        if (normalizedImageId && normalizedDegrees.length > 0) {
            directions[normalizedImageId] = normalizedDegrees;
        }

        return directions;
    }, {});
}

function normalizeChallengeOverrideEntry(entry) {
    const normalizedEntry = {};

    if (typeof entry?.prompt === 'string' && entry.prompt.trim()) {
        normalizedEntry.prompt = entry.prompt.trim();
    }

    const answers = (Array.isArray(entry?.answers) ? entry.answers : [])
        .map((answer) => String(answer ?? '').trim())
        .filter(Boolean);

    if (answers.length > 0) {
        normalizedEntry.answers = [...new Set(answers)];
    }

    const solutionImageIds = normalizeOverrideIdList(entry?.solutionImageIds);
    const controlImageIds = normalizeOverrideIdList(entry?.controlImageIds);
    const solutionImageDirections = normalizeSolutionImageDirections(entry?.solutionImageDirections);

    if (solutionImageIds.length > 0) {
        normalizedEntry.solutionImageIds = solutionImageIds;
    }

    if (controlImageIds.length > 0) {
        normalizedEntry.controlImageIds = controlImageIds;
    }

    if (Object.keys(solutionImageDirections).length > 0) {
        normalizedEntry.solutionImageDirections = solutionImageDirections;
    }

    if (entry?.updatedBy) {
        normalizedEntry.updatedBy = String(entry.updatedBy);
    }

    if (entry?.updatedAt) {
        normalizedEntry.updatedAt = String(entry.updatedAt);
    }

    return normalizedEntry;
}

function normalizeChallengeOverrides(challengeOverrides) {
    if (!challengeOverrides || typeof challengeOverrides !== 'object' || Array.isArray(challengeOverrides)) {
        return defaultChallengeOverrides();
    }

    return Object.entries(challengeOverrides).reduce((normalizedOverrides, [challengeId, entry]) => {
        const normalizedChallengeId = String(challengeId ?? '').trim();
        if (!normalizedChallengeId) return normalizedOverrides;

        const normalizedEntry = normalizeChallengeOverrideEntry(entry);
        if (
            normalizedEntry.prompt
            || normalizedEntry.answers?.length
            || normalizedEntry.solutionImageIds?.length
            || normalizedEntry.controlImageIds?.length
            || Object.keys(normalizedEntry.solutionImageDirections ?? {}).length > 0
        ) {
            normalizedOverrides[normalizedChallengeId] = normalizedEntry;
        }

        return normalizedOverrides;
    }, {});
}

function parseChallengeOverridesValue(challengeOverridesValue) {
    if (!challengeOverridesValue) {
        return defaultChallengeOverrides();
    }

    try {
        return normalizeChallengeOverrides(JSON.parse(challengeOverridesValue));
    }
    catch (err) {
        console.error('Failed to parse verification_settings.challenge_overrides_json:', err);
        return defaultChallengeOverrides();
    }
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
        autokickEnabled: settings?.autokickEnabled === true || settings?.autokickEnabled === 1 || settings?.autokickEnabled === '1',
        autokickSeconds: normalizeTimerSeconds(settings?.autokickSeconds, defaults.autokickSeconds),
        challengeOverrides: normalizeChallengeOverrides(settings?.challengeOverrides ?? defaults.challengeOverrides),
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
        autokickEnabled: row.autokick_enabled,
        autokickSeconds: row.autokick_seconds,
        challengeOverrides: parseChallengeOverridesValue(row.challenge_overrides_json),
    });
}

async function ensureVerificationSettingsColumn(columnName, definition, options = {}) {
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
    const expectedNullable = options.nullable ?? 'YES';
    const expectedDefault = options.defaultValue ?? null;
    const expectedTypes = options.dataTypes ?? ['int'];
    if (column.IS_NULLABLE !== expectedNullable || column.COLUMN_DEFAULT !== expectedDefault || !expectedTypes.includes(column.DATA_TYPE)) {
        await getDatabase().query(`ALTER TABLE verification_settings MODIFY COLUMN ${definition}`);
    }
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
                autokick_enabled TINYINT(1) NOT NULL DEFAULT 0,
                autokick_seconds INT NULL DEFAULT NULL,
                challenge_overrides_json TEXT NULL DEFAULT NULL,
                updated_by VARCHAR(32) NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `)
            .then(async () => {
                await ensureVerificationSettingsColumn('challenge_expiry_seconds', 'challenge_expiry_seconds INT NULL DEFAULT NULL');
                await ensureVerificationSettingsColumn('cooldown_seconds', 'cooldown_seconds INT NULL DEFAULT NULL');
                await ensureVerificationSettingsColumn('autokick_enabled', 'autokick_enabled TINYINT(1) NOT NULL DEFAULT 0', { nullable: 'NO', defaultValue: '0', dataTypes: ['tinyint'] });
                await ensureVerificationSettingsColumn('autokick_seconds', 'autokick_seconds INT NULL DEFAULT NULL');
                await ensureVerificationSettingsColumn('challenge_overrides_json', 'challenge_overrides_json TEXT NULL DEFAULT NULL', { dataTypes: ['text', 'mediumtext', 'longtext'] });
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
        `INSERT INTO verification_settings (guild_id, mode, active_challenge_ids, challenge_expiry_seconds, cooldown_seconds, autokick_enabled, autokick_seconds, challenge_overrides_json, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            mode = VALUES(mode),
            active_challenge_ids = VALUES(active_challenge_ids),
            challenge_expiry_seconds = VALUES(challenge_expiry_seconds),
            cooldown_seconds = VALUES(cooldown_seconds),
            autokick_enabled = VALUES(autokick_enabled),
            autokick_seconds = VALUES(autokick_seconds),
            challenge_overrides_json = VALUES(challenge_overrides_json),
            updated_by = VALUES(updated_by)`,
        [
            normalizedGuildId,
            normalizedSettings.mode,
            JSON.stringify(normalizedSettings.activeChallengeIds),
            normalizedSettings.challengeExpirySeconds,
            normalizedSettings.cooldownSeconds,
            normalizedSettings.autokickEnabled ? 1 : 0,
            normalizedSettings.autokickSeconds,
            JSON.stringify(normalizedSettings.challengeOverrides),
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
    const rows = await getDatabase().query('SELECT mode, active_challenge_ids, challenge_expiry_seconds, cooldown_seconds, autokick_enabled, autokick_seconds, challenge_overrides_json FROM verification_settings WHERE guild_id = ? LIMIT 1', [normalizedGuildId]);

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

async function setChallengeExpirySeconds(guildId, challengeExpirySeconds, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    return saveVerificationSettings(guildId, { ...currentSettings, challengeExpirySeconds }, updatedBy);
}

async function setCooldownSeconds(guildId, cooldownSeconds, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    return saveVerificationSettings(guildId, { ...currentSettings, cooldownSeconds }, updatedBy);
}

async function setAutokickSettings(guildId, autokickEnabled, autokickSeconds, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    return saveVerificationSettings(guildId, {
        ...currentSettings,
        autokickEnabled,
        autokickSeconds: autokickSeconds ?? currentSettings.autokickSeconds,
    }, updatedBy);
}

function buildChallengeOverrideUpdate(currentSettings, challengeId, updatedBy, updateEntry) {
    const normalizedChallengeId = String(challengeId ?? '').trim();
    const currentOverrides = normalizeChallengeOverrides(currentSettings.challengeOverrides);
    const currentEntry = currentOverrides[normalizedChallengeId] ?? {};
    const updatedEntry = normalizeChallengeOverrideEntry({
        ...updateEntry(currentEntry),
        updatedBy,
        updatedAt: new Date().toISOString(),
    });
    const updatedOverrides = { ...currentOverrides };

    if (
        updatedEntry.prompt
        || updatedEntry.answers?.length
        || updatedEntry.solutionImageIds?.length
        || updatedEntry.controlImageIds?.length
        || Object.keys(updatedEntry.solutionImageDirections ?? {}).length > 0
    ) {
        updatedOverrides[normalizedChallengeId] = updatedEntry;
    }
    else {
        delete updatedOverrides[normalizedChallengeId];
    }

    return updatedOverrides;
}

async function setChallengePromptOverride(guildId, challengeId, prompt, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    const challengeOverrides = buildChallengeOverrideUpdate(currentSettings, challengeId, updatedBy, (currentEntry) => ({
        ...currentEntry,
        prompt,
    }));

    return saveVerificationSettings(guildId, { ...currentSettings, challengeOverrides }, updatedBy);
}

async function clearChallengePromptOverride(guildId, challengeId, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    const challengeOverrides = buildChallengeOverrideUpdate(currentSettings, challengeId, updatedBy, (currentEntry) => ({
        ...currentEntry,
        prompt: undefined,
    }));

    return saveVerificationSettings(guildId, { ...currentSettings, challengeOverrides }, updatedBy);
}

async function setChallengeAnswerOverrides(guildId, challengeId, answers, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    const challengeOverrides = buildChallengeOverrideUpdate(currentSettings, challengeId, updatedBy, (currentEntry) => ({
        ...currentEntry,
        answers,
    }));

    return saveVerificationSettings(guildId, { ...currentSettings, challengeOverrides }, updatedBy);
}

async function clearChallengeAnswerOverrides(guildId, challengeId, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    const challengeOverrides = buildChallengeOverrideUpdate(currentSettings, challengeId, updatedBy, (currentEntry) => ({
        ...currentEntry,
        answers: [],
    }));

    return saveVerificationSettings(guildId, { ...currentSettings, challengeOverrides }, updatedBy);
}

async function setChallengeSolutionImageIds(guildId, challengeId, imageIds, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    const challengeOverrides = buildChallengeOverrideUpdate(currentSettings, challengeId, updatedBy, (currentEntry) => ({
        ...currentEntry,
        solutionImageIds: imageIds,
    }));

    return saveVerificationSettings(guildId, { ...currentSettings, challengeOverrides }, updatedBy);
}

async function setChallengeControlImageIds(guildId, challengeId, imageIds, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    const challengeOverrides = buildChallengeOverrideUpdate(currentSettings, challengeId, updatedBy, (currentEntry) => ({
        ...currentEntry,
        controlImageIds: imageIds,
    }));

    return saveVerificationSettings(guildId, { ...currentSettings, challengeOverrides }, updatedBy);
}


async function setChallengeSolutionImageDirections(guildId, challengeId, imageIds, degrees, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    const challengeOverrides = buildChallengeOverrideUpdate(currentSettings, challengeId, updatedBy, (currentEntry) => {
        const solutionImageDirections = { ...(currentEntry.solutionImageDirections ?? {}) };

        for (const imageId of imageIds) {
            solutionImageDirections[imageId] = degrees;
        }

        return {
            ...currentEntry,
            solutionImageDirections,
        };
    });

    return saveVerificationSettings(guildId, { ...currentSettings, challengeOverrides }, updatedBy);
}

async function clearChallengeSolutionImageDirections(guildId, challengeId, imageIds, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    const challengeOverrides = buildChallengeOverrideUpdate(currentSettings, challengeId, updatedBy, (currentEntry) => {
        const solutionImageDirections = { ...(currentEntry.solutionImageDirections ?? {}) };

        for (const imageId of imageIds) {
            delete solutionImageDirections[imageId];
        }

        return {
            ...currentEntry,
            solutionImageDirections,
        };
    });

    return saveVerificationSettings(guildId, { ...currentSettings, challengeOverrides }, updatedBy);
}

module.exports = {
    VERIFICATION_MODES,
    VALID_VERIFICATION_MODES,
    DEFAULT_CHALLENGE_EXPIRY_SECONDS,
    DEFAULT_COOLDOWN_SECONDS,
    DEFAULT_AUTOKICK_SECONDS,
    ensureVerificationSettingsTable,
    getVerificationSettings,
    setVerificationMode,
    setActiveChallengeIds,
    setChallengeExpirySeconds,
    setCooldownSeconds,
    setAutokickSettings,
    setChallengePromptOverride,
    clearChallengePromptOverride,
    setChallengeAnswerOverrides,
    clearChallengeAnswerOverrides,
    setChallengeSolutionImageIds,
    setChallengeControlImageIds,
    setChallengeSolutionImageDirections,
    clearChallengeSolutionImageDirections,
};
