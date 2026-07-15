function normalizeVerificationAdminGuildId(guildId) {
    const normalizedGuildId = String(guildId ?? '').trim();
    if (!normalizedGuildId || normalizedGuildId === 'global') {
        throw new Error('Verification Admin catalog reads require a real guild ID.');
    }
    return normalizedGuildId;
}

function resolveVerificationAdminGuildId(interaction) {
    return interaction?.guildId || interaction?.guild?.id || process.env.GUILDID;
}

async function getVerificationAdminChallengeCatalog(guildId) {
    const normalizedGuildId = normalizeVerificationAdminGuildId(guildId);
    const { getVerificationChallengeCatalog } = require('./verificationChallengeRepository');
    return getVerificationChallengeCatalog(normalizedGuildId);
}

async function getVerificationAdminChallenge(guildId, challengeId) {
    const normalizedGuildId = normalizeVerificationAdminGuildId(guildId);
    const { getVerificationChallengeFromCatalog } = require('./verificationChallengeRepository');
    return getVerificationChallengeFromCatalog(normalizedGuildId, String(challengeId ?? '').trim());
}

module.exports = {
    getVerificationAdminChallengeCatalog,
    getVerificationAdminChallenge,
    normalizeVerificationAdminGuildId,
    resolveVerificationAdminGuildId,
};
