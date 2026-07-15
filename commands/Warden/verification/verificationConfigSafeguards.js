const Discord = require('discord.js');
const { botLog } = require('../../../functions');
const { VERIFICATION_MODES, getVerificationSettings, saveVerificationGuildSettingsOnly } = require('./verificationSettings');
const { DEFAULT_CHALLENGE_ID } = require('./verificationChallenges/verificationChallenges');
const { evaluateVerificationConfigIssues } = require('./verificationChallenges/verificationConfigIssues');

function getActiveChallengeIds(settings = {}) {
    return Array.isArray(settings.activeChallengeIds) ? settings.activeChallengeIds.map(String) : [];
}

function formatVerificationConfigIssues(issues = [], limit = 10) {
    const lines = issues.slice(0, limit).map((issue) => {
        const location = issue.questionId ? `${issue.challengeId}/${issue.questionId}` : issue.challengeId;
        return `- ${location} — ${issue.label ?? issue.message}`;
    });
    if (issues.length > limit) lines.push(`…and ${issues.length - limit} more.`);
    return lines.length > 0 ? lines.join('\n') : 'No required configuration issues found.';
}

function evaluateVerificationConfig(settings = {}, options = {}) {
    const activeChallengeIds = getActiveChallengeIds(settings);
    const issues = evaluateVerificationConfigIssues(settings).map((issue) => ({
        ...issue,
        active: activeChallengeIds.includes(String(issue.challengeId)),
        changed: (!options.changedChallengeId || issue.challengeId === options.changedChallengeId)
            && (!options.changedQuestionId || issue.questionId === options.changedQuestionId),
    }));
    const blockingIssues = issues.filter((issue) => issue.severity === 'blocking');
    const activeBlockingIssues = blockingIssues.filter((issue) => issue.active);
    return {
        mode: settings.mode,
        activeChallengeIds,
        issues,
        blockingIssues,
        activeBlockingIssues,
        unsafeActiveChallengeIds: [...new Set(activeBlockingIssues.map((issue) => issue.challengeId))],
    };
}

function buildVerificationConfigWarningEmbed({
    title = 'Verification configuration warning',
    description,
    report = {},
    disabledChallengeIds = [],
    fallbackApplied = false,
    source,
    actorId,
    finalActiveChallengeIds,
} = {}) {
    const issues = report.issues ?? report.blockingIssues ?? [];
    const embed = new Discord.EmbedBuilder()
        .setTitle(title)
        .setColor(0xffa500)
        .setDescription(description ?? 'One or more verification challenges require additional configuration before they can safely be active.');

    if (source) embed.addFields({ name: 'Source', value: String(source), inline: true });
    if (actorId) embed.addFields({ name: 'Changed by', value: actorId === 'startup' ? 'startup' : `<@${actorId}>`, inline: true });
    if (disabledChallengeIds.length > 0) embed.addFields({ name: 'Auto-disabled active challenges', value: disabledChallengeIds.join(', '), inline: false });
    embed.addFields({ name: 'Fallback applied', value: fallbackApplied ? DEFAULT_CHALLENGE_ID : 'No', inline: true });
    if (Array.isArray(finalActiveChallengeIds)) embed.addFields({ name: 'Final active challenges', value: finalActiveChallengeIds.length > 0 ? finalActiveChallengeIds.join(', ') : 'None', inline: true });
    embed.addFields({ name: 'Required configuration issues', value: formatVerificationConfigIssues(issues).slice(0, 1024), inline: false });
    return embed;
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
        let activeChallengeIds = getActiveChallengeIds(originalSettings).filter((challengeId) => !unsafe.has(String(challengeId)));
        if (originalSettings.mode === VERIFICATION_MODES.challenge && activeChallengeIds.length < 1) {
            activeChallengeIds = [DEFAULT_CHALLENGE_ID];
            fallbackApplied = true;
        }
        finalSettings = { ...originalSettings, activeChallengeIds };
        await saveVerificationGuildSettingsOnly(guildId, finalSettings, actorId ?? 'system');
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
        await botLog(guild, embed, 1, 'staff').catch((err) => console.error('Failed to send verification configuration safeguard warning:', err));
        staffNotified = true;
    }

    return { originalSettings, finalSettings, report, finalReport, disabledChallengeIds, fallbackApplied, staffNotified };
}

module.exports = {
    evaluateVerificationConfig,
    applyVerificationConfigSafeguard,
    buildVerificationConfigWarningEmbed,
    formatVerificationConfigIssues,
};
