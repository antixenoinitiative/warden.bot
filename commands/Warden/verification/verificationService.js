const { botLog } = require('../../../functions');
const verificationDb = require('./verificationDbHandler');
const { evaluateVerificationConfig: evaluateVerificationConfigUncached } = require('./verificationValidation');
const { buildVerificationConfigWarningEmbed } = require('./verificationLegacyUi');
const { DEFAULT_CHALLENGE_ID } = require('./verificationChallenges/verificationChallengesConfig');
const { VERIFICATION_MODES } = verificationDb;
const preflightByConfiguration = new WeakMap();

function evaluateVerificationConfig(configuration = {}, options = {}) {
    const hasScopedChange = Boolean(options.changedChallengeId || options.changedQuestionId);
    if (hasScopedChange || !configuration || typeof configuration !== 'object') {
        return evaluateVerificationConfigUncached(configuration, options);
    }

    if (preflightByConfiguration.has(configuration)) return preflightByConfiguration.get(configuration);
    const report = evaluateVerificationConfigUncached(configuration, options);
    preflightByConfiguration.set(configuration, report);
    return report;
}

function normalizeVerificationAdminGuildId(guildId) {
    const normalizedGuildId = String(guildId ?? '').trim();
    if (!normalizedGuildId || normalizedGuildId === 'global') {
        throw new Error('Verification Admin operations require a real guild ID.');
    }
    return normalizedGuildId;
}

function resolveVerificationAdminGuildId(interaction) {
    return interaction?.guildId || interaction?.guild?.id || process.env.GUILDID;
}

async function getVerificationSnapshot(guildId, options) {
    return verificationDb.loadVerificationSnapshot(guildId, options);
}

async function getVerificationSettings(guildId, options) {
    return (await getVerificationSnapshot(guildId, options)).settings;
}

async function getVerificationRuntime(guildId, options) {
    return (await getVerificationSnapshot(guildId, options)).runtime;
}

async function getVerificationChallengeCatalog(guildId, options) {
    return (await getVerificationSnapshot(guildId, options)).challengeCatalog;
}

async function getVerificationChallenge(guildId, challengeId, options) {
    const snapshot = await getVerificationSnapshot(guildId, options);
    return snapshot.challengesById.get(String(challengeId ?? '').trim());
}

async function getVerificationAdminChallengeCatalog(guildId, options) {
    return getVerificationChallengeCatalog(normalizeVerificationAdminGuildId(guildId), options);
}

async function getVerificationAdminChallenge(guildId, challengeId, options) {
    return getVerificationChallenge(normalizeVerificationAdminGuildId(guildId), challengeId, options);
}

async function applyVerificationConfigSafeguard({
    guildId,
    guild,
    snapshot,
    committedSettings,
    source = 'unknown',
    actorId = null,
    changedChallengeId = null,
    changedQuestionId = null,
    reason = 'Verification configuration changed.',
    notifyStaff = false,
    deactivateUnsafeActiveChallenges = true,
} = {}) {
    let originalSnapshot;
    try {
        originalSnapshot = snapshot ?? await getVerificationSnapshot(guildId);
    }
    catch (err) {
        if (!committedSettings) throw err;
        verificationDb.invalidateVerificationGuild(guildId);
        console.error('Verification configuration was committed, but the verification snapshot could not be loaded:', err);
        return {
            originalSettings: committedSettings,
            originalRuntime: null,
            finalSettings: committedSettings,
            finalRuntime: null,
            report: null,
            finalReport: null,
            disabledChallengeIds: [],
            fallbackApplied: false,
            refreshError: err,
            staffNotified: false,
        };
    }
    const originalSettings = originalSnapshot.settings;
    const originalRuntime = originalSnapshot.runtime;
    const report = evaluateVerificationConfig(originalRuntime, { changedChallengeId, changedQuestionId });
    const disabledChallengeIds = deactivateUnsafeActiveChallenges ? report.unsafeActiveChallengeIds : [];
    let finalSettings = originalSettings;
    let finalRuntime = originalRuntime;
    let finalReport = report;
    let fallbackApplied = false;
    let refreshError;

    if (disabledChallengeIds.length > 0) {
        const unsafe = new Set(disabledChallengeIds.map(String));
        const originalActiveIds = Array.isArray(originalSettings.activeChallengeIds) && originalSettings.activeChallengeIds.length > 0
            ? originalSettings.activeChallengeIds.map(String)
            : report.activeChallengeIds;
        let activeChallengeIds = originalActiveIds.filter((challengeId) => !unsafe.has(String(challengeId)));
        if (originalSettings.mode === VERIFICATION_MODES.challenge && activeChallengeIds.length < 1) {
            activeChallengeIds = [DEFAULT_CHALLENGE_ID];
            fallbackApplied = true;
        }
        await verificationDb.saveVerificationGuildSettingsOnly(
            guildId,
            { ...originalSnapshot.guildSettings, activeChallengeIds },
            actorId ?? 'system',
        );
        finalSettings = Object.freeze({ ...originalSettings, activeChallengeIds: Object.freeze([...activeChallengeIds]) });
        const challengesById = new Map(originalRuntime.challenges.map((challenge) => [challenge.id, challenge]));
        finalRuntime = Object.freeze({
            ...originalRuntime,
            activeChallengeIds: finalSettings.activeChallengeIds,
            activeChallenges: Object.freeze(activeChallengeIds.map((challengeId) => challengesById.get(String(challengeId))).filter(Boolean)),
        });
        finalReport = evaluateVerificationConfig(finalRuntime, { changedChallengeId, changedQuestionId });

        try {
            const finalSnapshot = await getVerificationSnapshot(guildId);
            finalSettings = finalSnapshot.settings;
            finalRuntime = finalSnapshot.runtime;
            finalReport = evaluateVerificationConfig(finalRuntime, { changedChallengeId, changedQuestionId });
        }
        catch (err) {
            refreshError = err;
            verificationDb.invalidateVerificationGuild(guildId);
            console.error('Verification safeguard was committed, but the verification snapshot could not be refreshed:', err);
        }
    }

    let staffNotified = false;
    if (guild && (disabledChallengeIds.length > 0 || (notifyStaff && report.activeBlockingIssues.length > 0))) {
        const description = disabledChallengeIds.length > 0
            ? `${reason} Unsafe active verification challenges were automatically disabled.`
            : reason;
        const embed = buildVerificationConfigWarningEmbed({
            description,
            report,
            disabledChallengeIds,
            fallbackApplied,
            source,
            actorId,
            finalActiveChallengeIds: finalSettings.activeChallengeIds ?? [],
        });
        try {
            await botLog(guild, embed, 1, 'staff');
            staffNotified = true;
        }
        catch (err) {
            console.error('Failed to send verification configuration safeguard warning:', err);
        }
    }

    return {
        originalSettings,
        originalRuntime,
        finalSettings,
        finalRuntime,
        report,
        finalReport,
        disabledChallengeIds,
        fallbackApplied,
        refreshError,
        staffNotified,
    };
}

module.exports = {
    VERIFICATION_MODES,
    applyVerificationConfigSafeguard,
    evaluateVerificationConfig,
    getVerificationAdminChallenge,
    getVerificationAdminChallengeCatalog,
    getVerificationRuntime,
    getVerificationSettings,
    getVerificationSnapshot,
    initializeVerificationData: verificationDb.initializeVerificationData,
    normalizeVerificationAdminGuildId,
    resolveVerificationAdminGuildId,
    saveVerificationGuildSettingsOnly: verificationDb.saveVerificationGuildSettingsOnly,
    updateChallengeMetaOverrides: verificationDb.updateChallengeMetaOverrides,
    setQuestionCommonOverrides: verificationDb.setQuestionCommonOverrides,
    setQuestionImageTextOverride: verificationDb.setQuestionImageTextOverride,
    setQuestionAnswerOverrides: verificationDb.setQuestionAnswerOverrides,
    setQuestionImageIdOverrides: verificationDb.setQuestionImageIdOverrides,
    setQuestionImageDirectionOverrides: verificationDb.setQuestionImageDirectionOverrides,
    updateQuestionOptionOverrides: verificationDb.updateQuestionOptionOverrides,
    clearQuestionOverrideFields: verificationDb.clearQuestionOverrideFields,
};
