const {
    evaluateVerificationConfigIssues,
    resolveConfiguredActiveChallengeIds,
} = require('./verificationChallenges/verificationConfigIssues');

function evaluateVerificationConfig(settings = {}, options = {}) {
    const activeChallengeIds = resolveConfiguredActiveChallengeIds(settings);
    const issues = evaluateVerificationConfigIssues(settings).map((issue) => ({
        ...issue,
        active: activeChallengeIds.includes(String(issue.challengeId)),
        changed: (!options.changedChallengeId || issue.challengeId === options.changedChallengeId)
            && (!options.changedQuestionId || issue.questionId === options.changedQuestionId),
    }));
    const blockingIssues = issues.filter((issue) => issue.severity === 'blocking');
    const activeBlockingIssues = blockingIssues.filter((issue) => issue.active);

    return Object.freeze({
        mode: settings.mode,
        activeChallengeIds: Object.freeze([...activeChallengeIds]),
        issues: Object.freeze(issues),
        blockingIssues: Object.freeze(blockingIssues),
        activeBlockingIssues: Object.freeze(activeBlockingIssues),
        unsafeActiveChallengeIds: Object.freeze([...new Set(activeBlockingIssues.map((issue) => issue.challengeId))]),
    });
}

module.exports = {
    evaluateVerificationConfig,
};
