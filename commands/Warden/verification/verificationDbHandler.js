const verificationSettings = require('./verificationSettings');
const verificationCatalog = require('./verificationChallengeRepository');
const { normalizeVerificationChallenge } = require('./verificationChallenges/verificationChallenges');

const DEFAULT_GUILD_ID = 'global';
const SNAPSHOT_CACHE_TTL_MS = 60 * 1000;
const SNAPSHOT_CACHE_MAX_GUILDS = 100;
const snapshotCache = new Map();
const snapshotLoads = new Map();
let snapshotGeneration = 0;

function normalizeGuildId(guildId) {
    return String(guildId ?? DEFAULT_GUILD_ID);
}

function touchSnapshot(guildId, entry) {
    snapshotCache.delete(guildId);
    snapshotCache.set(guildId, entry);
}

function getCachedSnapshot(guildId) {
    const entry = snapshotCache.get(guildId);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
        snapshotCache.delete(guildId);
        clearRepositoryCaches(guildId);
        return undefined;
    }

    touchSnapshot(guildId, entry);
    return entry.snapshot;
}

function cacheSnapshot(guildId, snapshot) {
    touchSnapshot(guildId, {
        snapshot,
        expiresAt: Date.now() + SNAPSHOT_CACHE_TTL_MS,
    });

    while (snapshotCache.size > SNAPSHOT_CACHE_MAX_GUILDS) {
        const evictedGuildId = snapshotCache.keys().next().value;
        snapshotCache.delete(evictedGuildId);
        clearRepositoryCaches(evictedGuildId);
    }
}

function clearRepositoryCaches(guildId) {
    verificationSettings.clearVerificationSettingsCache(guildId);
    verificationCatalog.clearVerificationChallengeCatalogCache(guildId);
}

function invalidateVerificationGuild(guildId) {
    if (guildId === undefined || guildId === null) {
        snapshotCache.clear();
        for (const load of snapshotLoads.values()) load.invalidated = true;
        snapshotLoads.clear();
        clearRepositoryCaches();
        return;
    }

    const normalizedGuildId = normalizeGuildId(guildId);
    snapshotCache.delete(normalizedGuildId);
    const activeLoad = snapshotLoads.get(normalizedGuildId);
    if (activeLoad) {
        activeLoad.invalidated = true;
        snapshotLoads.delete(normalizedGuildId);
    }
    clearRepositoryCaches(normalizedGuildId);
}

function buildQuestionLookup(challenges) {
    return new Map(challenges.map((challenge) => [
        challenge.id,
        new Map((challenge.questions ?? []).map((question) => [question.id, question])),
    ]));
}

function buildSnapshot(guildId, guildSettings, challengeCatalog) {
    const generation = ++snapshotGeneration;
    const challenges = Object.freeze(Object.values(challengeCatalog)
        .map((challenge) => normalizeVerificationChallenge(challenge, { challengeOverrides: {} })));
    const challengesById = new Map(challenges.map((challenge) => [challenge.id, challenge]));
    const activeChallengeIds = Object.freeze([...(guildSettings.activeChallengeIds ?? [])]);
    const activeChallenges = Object.freeze(activeChallengeIds
        .map((challengeId) => challengesById.get(String(challengeId)))
        .filter(Boolean));
    const runtime = Object.freeze({
        guildId,
        generation,
        mode: guildSettings.mode,
        activeChallengeIds,
        challengeExpirySeconds: guildSettings.challengeExpirySeconds,
        cooldownSeconds: guildSettings.cooldownSeconds,
        autokickEnabled: guildSettings.autokickEnabled,
        autokickSeconds: guildSettings.autokickSeconds,
        challenges,
        activeChallenges,
    });

    let compatibilitySettings;
    const snapshot = {
        guildId,
        generation,
        loadedAt: Date.now(),
        guildSettings: Object.freeze({ ...guildSettings, challengeOverrides: {} }),
        runtime,
        challengeCatalog,
        challenges,
        challengesById,
        questionsByChallengeId: buildQuestionLookup(challenges),
        activeChallengeIds,
        activeChallenges,
    };
    Object.defineProperty(snapshot, 'settings', {
        enumerable: true,
        get() {
            if (!compatibilitySettings) {
                const challengeOverrides = typeof verificationCatalog.catalogChallengesToSettingsOverrides === 'function'
                    ? verificationCatalog.catalogChallengesToSettingsOverrides(challengeCatalog)
                    : (guildSettings.challengeOverrides ?? {});
                compatibilitySettings = Object.freeze({ ...guildSettings, challengeOverrides });
            }
            return compatibilitySettings;
        },
    });
    return Object.freeze(snapshot);
}

async function loadVerificationSnapshot(guildId, options = {}) {
    const normalizedGuildId = normalizeGuildId(guildId);
    if (options.fresh === true) invalidateVerificationGuild(normalizedGuildId);

    const cached = getCachedSnapshot(normalizedGuildId);
    if (cached) return cached;
    if (snapshotLoads.has(normalizedGuildId)) return snapshotLoads.get(normalizedGuildId).promise;

    // Expired snapshots must not be reconstructed from an older repository cache.
    clearRepositoryCaches(normalizedGuildId);
    const load = { invalidated: false };
    load.promise = (async () => {
        const readGuildSettings = verificationSettings.getVerificationGuildSettings
            ?? verificationSettings.getVerificationSettings;
        const guildSettings = await readGuildSettings(normalizedGuildId);
        const challengeCatalog = await verificationCatalog.getVerificationChallengeCatalog(normalizedGuildId);
        const snapshot = buildSnapshot(normalizedGuildId, guildSettings, challengeCatalog);
        if (!load.invalidated) cacheSnapshot(normalizedGuildId, snapshot);
        else clearRepositoryCaches(normalizedGuildId);
        return snapshot;
    })().catch((err) => {
        clearRepositoryCaches(normalizedGuildId);
        throw err;
    }).finally(() => {
        if (snapshotLoads.get(normalizedGuildId) === load) snapshotLoads.delete(normalizedGuildId);
    });
    snapshotLoads.set(normalizedGuildId, load);
    return load.promise;
}

async function initializeVerificationData(guildId) {
    const normalizedGuildId = normalizeGuildId(guildId);
    await verificationSettings.ensureVerificationSettingsTable();
    return loadVerificationSnapshot(normalizedGuildId, { fresh: true });
}

async function runVerificationWrite(guildId, write) {
    const normalizedGuildId = normalizeGuildId(guildId);
    invalidateVerificationGuild(normalizedGuildId);
    try {
        return await write(normalizedGuildId);
    }
    finally {
        invalidateVerificationGuild(normalizedGuildId);
    }
}

function saveVerificationGuildSettingsOnly(guildId, settings, updatedBy) {
    return runVerificationWrite(guildId, (normalizedGuildId) =>
        verificationSettings.saveVerificationGuildSettingsOnly(normalizedGuildId, settings, updatedBy));
}

const settingWriteMethods = [
    'updateChallengeMetaOverrides',
    'setQuestionCommonOverrides',
    'setQuestionImageTextOverride',
    'setQuestionAnswerOverrides',
    'setQuestionImageIdOverrides',
    'setQuestionImageDirectionOverrides',
    'updateQuestionOptionOverrides',
    'clearQuestionOverrideFields',
];

function wrapSettingsWrite(methodName) {
    const write = verificationSettings[methodName];
    if (typeof write !== 'function') {
        throw new Error(`Unknown verification settings write method: ${methodName}`);
    }

    return (guildId, ...args) => runVerificationWrite(guildId, (normalizedGuildId) =>
        write(normalizedGuildId, ...args));
}

const verificationWrites = Object.fromEntries(settingWriteMethods.map((methodName) => [
    methodName,
    wrapSettingsWrite(methodName),
]));

module.exports = {
    VERIFICATION_MODES: verificationSettings.VERIFICATION_MODES,
    initializeVerificationData,
    invalidateVerificationGuild,
    loadVerificationSnapshot,
    saveVerificationGuildSettingsOnly,
    ...verificationWrites,
};
