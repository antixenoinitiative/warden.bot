/**
 * Warden verification captcha registry.
 *
 * How to add a new captcha for future admin selection:
 * 1. Add a stable ID as a new key in `captchas` (for example: `eliteDangerousBasics`).
 * 2. Add the user-facing `prompt` that should be shown in the verification challenge.
 * 3. Add every accepted answer to `answers`; answers are normalized with `normalizeAnswer`
 *    unless the captcha defines a custom `normalizer`.
 * 4. Update `config.Warden.verification.activeCaptchaId` in `config.json` to the new ID.
 *
 * Reserved future admin command names:
 * - /verification captcha list
 * - /verification captcha set <id>
 * - /verification captcha disable
 *
 * Do not add persistent dynamic mutation here until Warden verification settings have a
 * chosen persistence layer. For now, `config.Warden.verification.activeCaptchaId` is the
 * single source of truth for the active captcha source.
 */
const DEFAULT_CAPTCHA_ID = 'placeholder';

const captchas = {
    [DEFAULT_CAPTCHA_ID]: {
        id: DEFAULT_CAPTCHA_ID,
        prompt: 'Type "AXI" to verify.',
        answers: ['axi'],
    },
};

function normalizeAnswer(answer) {
    return String(answer ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function getCaptcha(captchaId) {
    if (!captchaId) return undefined;

    return captchas[captchaId];
}

function getActiveCaptcha(config) {
    const captchaId = config?.verification?.captchaId
        ?? config?.verification?.activeCaptchaId
        ?? config?.captchaId
        ?? config?.activeCaptchaId
        ?? 'placeholder';

    return getCaptcha(captchaId) ?? getCaptcha(DEFAULT_CAPTCHA_ID);
}

function validateAnswer(captchaId, answer) {
    const captcha = getCaptcha(captchaId);

    if (!captcha) {
        return { ok: false, reason: 'not_found' };
    }

    const normalizer = captcha.normalizer ?? normalizeAnswer;
    const normalizedAnswer = normalizer(answer);
    const validAnswers = captcha.answers.map((validAnswer) => normalizer(validAnswer));

    if (validAnswers.includes(normalizedAnswer)) {
        return { ok: true };
    }

    return { ok: false, reason: 'incorrect' };
}

module.exports = {
    DEFAULT_CAPTCHA_ID,
    captchas,
    getCaptcha,
    getActiveCaptcha,
    normalizeAnswer,
    validateAnswer,
};
