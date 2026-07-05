const DEFAULT_CHALLENGE_EXPIRY_MS = 10 * 60 * 1000;

// Verification challenge and cooldown state is intentionally in-memory only.
// It is not persisted and will reset whenever the bot process restarts.
const activeChallenges = new Map();
const cooldowns = new Map();

function setChallenge(userId, challenge, expiryMs = DEFAULT_CHALLENGE_EXPIRY_MS) {
    const createdTimestamp = challenge.createdTimestamp ?? Date.now();
    activeChallenges.set(userId, {
        ...challenge,
        createdTimestamp,
        expiresAt: challenge.expiresAt ?? createdTimestamp + expiryMs,
    });
}

function getChallenge(userId, expiryMs = DEFAULT_CHALLENGE_EXPIRY_MS) {
    const challenge = activeChallenges.get(userId);

    if (!challenge) return undefined;

    const expiresAt = challenge.expiresAt ?? ((challenge.createdTimestamp ?? 0) + expiryMs);
    if (Date.now() > expiresAt) {
        clearChallenge(userId);
        return undefined;
    }

    return challenge;
}

function clearChallenge(userId) {
    activeChallenges.delete(userId);
}

function setCooldown(userId, retryAt) {
    cooldowns.set(userId, retryAt);
}

function getCooldownRemaining(userId) {
    const retryAt = cooldowns.get(userId);

    if (!retryAt) return 0;

    const remaining = retryAt - Date.now();
    if (remaining <= 0) {
        clearCooldown(userId);
        return 0;
    }

    return remaining;
}

function clearCooldown(userId) {
    cooldowns.delete(userId);
}

module.exports = {
    DEFAULT_CHALLENGE_EXPIRY_MS,
    activeChallenges,
    cooldowns,
    setChallenge,
    getChallenge,
    clearChallenge,
    setCooldown,
    getCooldownRemaining,
    clearCooldown,
};
