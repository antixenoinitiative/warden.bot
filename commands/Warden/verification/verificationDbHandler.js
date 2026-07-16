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

function attachCatalogMetadata(normalized, catalogEntry) {
    const questionsById = new Map((catalogEntry.questions ?? []).map((question) => [String(question.id), question]));
    const questions = Object.freeze((normalized.questions ?? []).map((question) => {
        const source = questionsById.get(String(question.id)) ?? {};
        return Object.freeze({ ...question,
            sourceType: source.sourceType, sourceTemplateId: source.sourceTemplateId,
            templateVersion: source.templateVersion, protectedTemplate: source.protectedTemplate === true,
            createdBy: source.createdBy, updatedBy: source.updatedBy,
            createdAt: source.createdAt, updatedAt: source.updatedAt });
    }));
    return Object.freeze({ ...normalized, questions,
        sourceType: catalogEntry.sourceType, sourceTemplateId: catalogEntry.sourceTemplateId,
        templateVersion: catalogEntry.templateVersion, protectedTemplate: catalogEntry.protectedTemplate === true,
        createdBy: catalogEntry.createdBy, updatedBy: catalogEntry.updatedBy,
        createdAt: catalogEntry.createdAt, updatedAt: catalogEntry.updatedAt });
}

function buildSnapshot(guildId, guildSettings, challengeCatalog) {
    const { challengeOverrides: _legacyChallengeOverrides, ...nativeGuildSettings } = guildSettings ?? {};
    const generation = ++snapshotGeneration;
    const challenges = Object.freeze(Object.values(challengeCatalog)
        .map((challenge) => attachCatalogMetadata(
            normalizeVerificationChallenge(challenge, { challengeOverrides: {} }), challenge)));
    const challengesById = new Map(challenges.map((challenge) => [challenge.id, challenge]));
    const activeChallengeIds = Object.freeze([...(nativeGuildSettings.activeChallengeIds ?? [])]);
    const activeChallenges = Object.freeze(activeChallengeIds
        .map((challengeId) => challengesById.get(String(challengeId)))
        .filter(Boolean));
    const runtime = Object.freeze({
        guildId,
        generation,
        mode: nativeGuildSettings.mode,
        activeChallengeIds,
        challengeExpirySeconds: nativeGuildSettings.challengeExpirySeconds,
        cooldownSeconds: nativeGuildSettings.cooldownSeconds,
        autokickEnabled: nativeGuildSettings.autokickEnabled,
        autokickSeconds: nativeGuildSettings.autokickSeconds,
        challenges,
        activeChallenges,
    });

    return Object.freeze({
        guildId,
        generation,
        loadedAt: Date.now(),
        guildSettings: Object.freeze(nativeGuildSettings),
        runtime,
        challengeCatalog,
        challenges,
        challengesById,
        questionsByChallengeId: buildQuestionLookup(challenges),
        activeChallengeIds,
        activeChallenges,
    });
}

function getCatalogQuestionChanges(snapshot, challengeId, questionId) {
    const challenge = snapshot?.challengeCatalog?.[String(challengeId ?? '').trim()];
    const question = challenge?.questions?.find((candidate) => String(candidate.id) === String(questionId ?? '').trim());
    if (!question) return {};

    const templateQuestion = verificationCatalog.getVerificationChallengeTemplate(challenge.id)?.questions
        ?.find((candidate) => String(candidate.id) === String(question.id));
    return verificationCatalog.catalogQuestionToSettingsOverride(question, templateQuestion);
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

const ALLOWED_IMAGE_ROLES = new Set(['solution', 'control', 'center', 'outer']);
const ALLOWED_IMAGE_DIRECTION_DEGREES = new Set([0, 45, 90, 135, 180, 225, 270, 315]);

function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value ?? {}, key);
}

function cloneCatalogValue(value) {
    if (Array.isArray(value)) return value.map(cloneCatalogValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneCatalogValue(entry)]));
    }
    return value;
}

function normalizeStringArray(value) {
    const values = Array.isArray(value) ? value : String(value ?? '').split(/[\s,]+/);
    return [...new Set(values.map((entry) => String(entry ?? '').trim()).filter(Boolean))];
}

function normalizeBoolean(value) {
    return value === true || value === 1 || value === '1';
}

function normalizeQuestionId(questionId) {
    return String(questionId ?? '').trim();
}

function normalizeDirectionList(value) {
    const values = Array.isArray(value) ? value : String(value ?? '').split(/[\s,]+/);
    return [...new Set(values
        .map((degrees) => Number(degrees) === 360 ? 0 : Number(degrees))
        .filter((degrees) => Number.isInteger(degrees) && ALLOWED_IMAGE_DIRECTION_DEGREES.has(degrees)))]
        .sort((left, right) => left - right);
}

function getTemplateQuestion(challengeId, questionId) {
    return verificationCatalog.getVerificationChallengeTemplate(challengeId)?.questions
        ?.find((question) => question.id === String(questionId));
}

function assignOrDelete(target, key, value) {
    if (value === null || value === '') delete target[key];
    else target[key] = cloneCatalogValue(value);
}

function applyQuestionPatch(question, patch = {}) {
    const updated = cloneCatalogValue(question);
    for (const key of ['order', 'label', 'text', 'separateStep']) {
        if (hasOwn(patch, key)) assignOrDelete(updated, key, patch[key]);
    }

    for (const containerKey of ['generatedImage', 'answer']) {
        if (!hasOwn(patch, containerKey)) continue;
        const containerPatch = patch[containerKey];
        if (containerPatch === null || containerPatch === '') {
            delete updated[containerKey];
            continue;
        }

        const currentContainer = cloneCatalogValue(updated[containerKey] ?? {});
        for (const [key, value] of Object.entries(containerPatch ?? {})) {
            assignOrDelete(currentContainer, key, value);
        }
        if (Object.keys(currentContainer).length > 0) updated[containerKey] = currentContainer;
        else delete updated[containerKey];
    }

    return updated;
}

function getPathValue(value, path) {
    let current = value;
    for (const part of path) {
        if (!current || typeof current !== 'object' || !hasOwn(current, part)) {
            return { found: false, value: undefined };
        }
        current = current[part];
    }
    return { found: true, value: current };
}

function resetQuestionPath(question, baseline, dottedPath) {
    const parts = String(dottedPath ?? '').split('.').filter(Boolean);
    if (parts.length < 1) throw new Error('Verification question reset path is required.');
    const baselineValue = getPathValue(baseline, parts);
    let target = question;

    for (const part of parts.slice(0, -1)) {
        if (!target[part] || typeof target[part] !== 'object' || Array.isArray(target[part])) target[part] = {};
        target = target[part];
    }
    const leaf = parts.at(-1);
    if (baselineValue.found) target[leaf] = cloneCatalogValue(baselineValue.value);
    else delete target[leaf];

    for (let depth = parts.length - 1; depth > 0; depth -= 1) {
        const parentPath = parts.slice(0, depth);
        const parent = getPathValue(question, parentPath);
        if (parent.found && parent.value && typeof parent.value === 'object' && Object.keys(parent.value).length < 1) {
            const grandparent = getPathValue(question, parentPath.slice(0, -1));
            if (grandparent.found) delete grandparent.value[parentPath.at(-1)];
        }
    }
}

async function runCatalogWrite(guildId, write) {
    const normalizedGuildId = normalizeGuildId(guildId);
    const committedSettings = (await loadVerificationSnapshot(normalizedGuildId)).guildSettings;
    return runVerificationWrite(normalizedGuildId, async () => {
        await write(normalizedGuildId);
        return committedSettings;
    });
}

function updateChallengeMetaOverrides(guildId, challengeId, patch, updatedBy) {
    return runCatalogWrite(guildId, (normalizedGuildId) =>
        verificationCatalog.mutateVerificationChallengeCatalogEntry({
            guildId: normalizedGuildId,
            challengeId,
            updatedBy,
            mutate: (challenge) => ({
                ...challenge,
                ...(hasOwn(patch, 'title') ? { title: patch.title } : {}),
                ...(hasOwn(patch, 'description') ? { description: patch.description } : {}),
                ...(hasOwn(patch, 'color') ? { color: patch.color } : {}),
            }),
        }));
}

function mutateQuestionEntries(guildId, challengeId, questionIds, updatedBy, mutate) {
    return runCatalogWrite(guildId, (normalizedGuildId) =>
        verificationCatalog.mutateVerificationQuestionCatalogEntries({
            guildId: normalizedGuildId,
            challengeId,
            questionIds,
            updatedBy,
            mutate,
        }));
}

function setQuestionCommonOverrides(guildId, challengeId, questionId, data, updatedBy) {
    const normalizedQuestionId = normalizeQuestionId(questionId);
    return mutateQuestionEntries(guildId, challengeId, [questionId], updatedBy, (questions) => {
        const question = questions.get(normalizedQuestionId);
        questions.set(normalizedQuestionId, {
            ...question,
            ...(hasOwn(data, 'label') ? { label: data.label } : {}),
            ...(hasOwn(data, 'text') ? { text: data.text } : {}),
            ...(hasOwn(data, 'separateStep') ? { separateStep: normalizeBoolean(data.separateStep) } : {}),
        });
        return questions;
    });
}

function setQuestionImageTextOverride(guildId, challengeId, questionId, text, updatedBy) {
    const normalizedQuestionId = normalizeQuestionId(questionId);
    return mutateQuestionEntries(guildId, challengeId, [questionId], updatedBy, (questions) => {
        const question = questions.get(normalizedQuestionId);
        questions.set(normalizedQuestionId, {
            ...question,
            generatedImage: { ...(question.generatedImage ?? {}), text },
        });
        return questions;
    });
}

function setQuestionAnswerOverrides(guildId, challengeId, questionId, answers, updatedBy) {
    const normalizedQuestionId = normalizeQuestionId(questionId);
    return mutateQuestionEntries(guildId, challengeId, [questionId], updatedBy, (questions) => {
        const question = questions.get(normalizedQuestionId);
        questions.set(normalizedQuestionId, {
            ...question,
            answer: { ...(question.answer ?? {}), accepted: normalizeStringArray(answers) },
        });
        return questions;
    });
}

function setQuestionImageIdOverrides(guildId, challengeId, questionId, roleImageIds, updatedBy) {
    const normalizedQuestionId = normalizeQuestionId(questionId);
    const normalizedRoleImageIds = Object.entries(roleImageIds ?? {}).reduce((updates, [role, imageIds]) => {
        if (!ALLOWED_IMAGE_ROLES.has(role)) throw new Error(`Unsupported verification image role: ${role}`);
        updates[role] = normalizeStringArray(imageIds);
        return updates;
    }, {});

    return mutateQuestionEntries(guildId, challengeId, [questionId], updatedBy, (questions) => {
        const question = questions.get(normalizedQuestionId);
        questions.set(normalizedQuestionId, {
            ...question,
            generatedImage: {
                ...(question.generatedImage ?? {}),
                imageIds: { ...(question.generatedImage?.imageIds ?? {}), ...normalizedRoleImageIds },
            },
        });
        return questions;
    });
}

function setQuestionImageDirectionOverrides(guildId, challengeId, questionId, imageDirectionUpdates, updatedBy) {
    const normalizedQuestionId = normalizeQuestionId(questionId);
    const normalizedUpdates = Object.entries(imageDirectionUpdates ?? {}).reduce((updates, [imageId, degrees]) => {
        const normalizedImageId = String(imageId ?? '').trim();
        if (normalizedImageId) updates[normalizedImageId] = normalizeDirectionList(degrees);
        return updates;
    }, {});

    return mutateQuestionEntries(guildId, challengeId, [questionId], updatedBy, (questions) => {
        const question = questions.get(normalizedQuestionId);
        questions.set(normalizedQuestionId, {
            ...question,
            generatedImage: {
                ...(question.generatedImage ?? {}),
                imageDirections: { ...(question.generatedImage?.imageDirections ?? {}), ...normalizedUpdates },
            },
        });
        return questions;
    });
}

function updateQuestionOptionOverrides(guildId, challengeId, questionPatches, updatedBy) {
    const normalizedPatches = Object.fromEntries(Object.entries(questionPatches ?? {})
        .map(([questionId, patch]) => [normalizeQuestionId(questionId), patch])
        .filter(([questionId]) => questionId));
    const questionIds = Object.keys(normalizedPatches);

    return mutateQuestionEntries(guildId, challengeId, questionIds, updatedBy, (questions) => {
        for (const questionId of questionIds) {
            const current = questions.get(questionId);
            questions.set(questionId, applyQuestionPatch(current, normalizedPatches[questionId]));
        }
        return questions;
    });
}

function clearQuestionOverrideFields(guildId, challengeId, questionId, fields, updatedBy) {
    const normalizedQuestionId = normalizeQuestionId(questionId);
    const baseline = getTemplateQuestion(challengeId, normalizedQuestionId) ?? {};
    return mutateQuestionEntries(guildId, challengeId, [questionId], updatedBy, (questions) => {
        const updated = cloneCatalogValue(questions.get(normalizedQuestionId));
        for (const field of fields ?? []) resetQuestionPath(updated, baseline, field);
        questions.set(normalizedQuestionId, updated);
        return questions;
    });
}

async function runCatalogCrud(guildId, write) {
    const normalizedGuildId = normalizeGuildId(guildId);
    const committedSettings = (await loadVerificationSnapshot(normalizedGuildId)).guildSettings;
    return runVerificationWrite(normalizedGuildId, async () => {
        const result = await write(normalizedGuildId);
        return { result, committedSettings };
    });
}

function createCustomChallenge(guildId, data, actorId) {
    return runCatalogCrud(guildId, (normalizedGuildId) =>
        verificationCatalog.createVerificationChallengeCatalogEntry({
            guildId: normalizedGuildId,
            challengeId: data.id,
            title: data.title,
            description: data.description,
            color: data.color,
            createdBy: actorId,
        }));
}

function createCustomQuestion(guildId, challengeId, data, actorId) {
    return runCatalogCrud(guildId, (normalizedGuildId) =>
        verificationCatalog.createVerificationQuestionCatalogEntry({
            guildId: normalizedGuildId,
            challengeId,
            question: data,
            createdBy: actorId,
        }));
}

async function deleteOrResetChallenge(guildId, challengeId, actorId) {
    const normalizedGuildId = normalizeGuildId(guildId);
    const snapshot = await loadVerificationSnapshot(normalizedGuildId);
    const challenge = snapshot.challengesById.get(String(challengeId));
    if (challenge?.protectedTemplate !== true && snapshot.activeChallengeIds.includes(String(challengeId))) {
        const error = new Error('Deactivate this verification challenge in Settings before deleting it.');
        error.code = 'VERIFICATION_CHALLENGE_ACTIVE';
        throw error;
    }
    return runCatalogCrud(normalizedGuildId, (targetGuildId) =>
        verificationCatalog.deleteOrResetVerificationChallengeCatalogEntry({
            guildId: targetGuildId, challengeId, updatedBy: actorId,
        }));
}

function deleteOrResetQuestion(guildId, challengeId, questionId, actorId) {
    return runCatalogCrud(guildId, (normalizedGuildId) =>
        verificationCatalog.deleteOrResetVerificationQuestionCatalogEntry({
            guildId: normalizedGuildId, challengeId, questionId, updatedBy: actorId,
        }));
}

module.exports = {
    VERIFICATION_MODES: verificationSettings.VERIFICATION_MODES,
    initializeVerificationData,
    invalidateVerificationGuild,
    loadVerificationSnapshot,
    getCatalogQuestionChanges,
    saveVerificationGuildSettingsOnly,
    updateChallengeMetaOverrides,
    setQuestionCommonOverrides,
    setQuestionImageTextOverride,
    setQuestionAnswerOverrides,
    setQuestionImageIdOverrides,
    setQuestionImageDirectionOverrides,
    updateQuestionOptionOverrides,
    clearQuestionOverrideFields,
    createCustomChallenge,
    createCustomQuestion,
    deleteOrResetChallenge,
    deleteOrResetQuestion,
};
