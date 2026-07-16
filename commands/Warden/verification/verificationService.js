const { botLog } = require('../../../functions');
const verificationDb = require('./verificationDbHandler');
const { evaluateVerificationConfig: evaluateVerificationConfigUncached } = require('./verificationValidation');
const { buildVerificationConfigWarningEmbed } = require('./verificationLegacyUi');
const { DEFAULT_CHALLENGE_ID } = require('./verificationChallenges/verificationChallengesConfig');
const { VERIFICATION_MODES } = verificationDb;
const preflightBySettings = new WeakMap();

function evaluateVerificationConfig(settings = {}, options = {}) {
    const hasScopedChange = Boolean(options.changedChallengeId || options.changedQuestionId);
    if (hasScopedChange || !settings || typeof settings !== 'object') {
        return evaluateVerificationConfigUncached(settings, options);
    }

    if (preflightBySettings.has(settings)) return preflightBySettings.get(settings);
    const report = evaluateVerificationConfigUncached(settings, options);
    preflightBySettings.set(settings, report);
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
    settings,
    source = 'unknown',
    actorId = null,
    changedChallengeId = null,
    changedQuestionId = null,
    reason = 'Verification configuration changed.',
    notifyStaff = false,
    deactivateUnsafeActiveChallenges = true,
} = {}) {
    const originalSettings = settings ?? await getVerificationSettings(guildId);
    const report = evaluateVerificationConfig(originalSettings, { changedChallengeId, changedQuestionId });
    const disabledChallengeIds = deactivateUnsafeActiveChallenges ? report.unsafeActiveChallengeIds : [];
    let finalSettings = originalSettings;
    let finalReport = report;
    let fallbackApplied = false;

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
        finalSettings = await verificationDb.saveVerificationGuildSettingsOnly(
            guildId,
            { ...originalSettings, activeChallengeIds },
            actorId ?? 'system',
        );
        finalReport = evaluateVerificationConfig(finalSettings, { changedChallengeId, changedQuestionId });
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
        finalSettings,
        report,
        finalReport,
        disabledChallengeIds,
        fallbackApplied,
        staffNotified,
    };
}

module.exports = {
    VERIFICATION_MODES,
    applyVerificationConfigSafeguard,
    evaluateVerificationConfig,
    getVerificationAdminChallenge,
    getVerificationAdminChallengeCatalog,
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
