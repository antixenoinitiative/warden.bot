const verificationSettings = require('./verificationSettings');
const verificationCatalog = require('./verificationChallengeRepository');

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

function buildSnapshot(guildId, settings, challengeCatalog) {
    const challenges = Object.freeze(Object.values(challengeCatalog));
    const challengesById = new Map(challenges.map((challenge) => [challenge.id, challenge]));

    return Object.freeze({
        guildId,
        generation: ++snapshotGeneration,
        loadedAt: Date.now(),
        settings,
        challengeCatalog,
        challenges,
        challengesById,
        questionsByChallengeId: buildQuestionLookup(challenges),
        activeChallengeIds: Object.freeze([...(settings.activeChallengeIds ?? [])]),
    });
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
        const settings = await verificationSettings.getVerificationSettings(normalizedGuildId);
        const challengeCatalog = await verificationCatalog.getVerificationChallengeCatalog(normalizedGuildId);
        const snapshot = buildSnapshot(normalizedGuildId, settings, challengeCatalog);
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
