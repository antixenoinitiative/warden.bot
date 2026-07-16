const {
    evaluateVerificationConfigIssues,
    resolveConfiguredActiveChallengeIds,
} = require('./verificationChallenges/verificationConfigIssues');

function evaluateVerificationConfig(configuration = {}, options = {}) {
    const activeChallengeIds = resolveConfiguredActiveChallengeIds(configuration);
    const issues = evaluateVerificationConfigIssues(configuration).map((issue) => ({
        ...issue,
        active: activeChallengeIds.includes(String(issue.challengeId)),
        changed: (!options.changedChallengeId || issue.challengeId === options.changedChallengeId)
            && (!options.changedQuestionId || issue.questionId === options.changedQuestionId),
    }));
    const blockingIssues = issues.filter((issue) => issue.severity === 'blocking');
    const activeBlockingIssues = blockingIssues.filter((issue) => issue.active);

    return Object.freeze({
        mode: configuration.mode,
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
