const Discord = require('discord.js');
const { DEFAULT_CHALLENGE_ID } = require('./verificationChallenges/verificationChallengesConfig');

function formatVerificationConfigIssues(issues = [], limit = 10) {
    const lines = issues.slice(0, limit).map((issue) => {
        const location = issue.questionId ? `${issue.challengeId}/${issue.questionId}` : issue.challengeId;
        return `- ${location} — ${issue.label ?? issue.message}`;
    });
    if (issues.length > limit) lines.push(`…and ${issues.length - limit} more.`);
    return lines.length > 0 ? lines.join('\n') : 'No required configuration issues found.';
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

module.exports = {
    buildVerificationConfigWarningEmbed,
    formatVerificationConfigIssues,
};
