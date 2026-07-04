/**
 * Warden verification captcha registry.
 *
 * Captchas can be single-step or multi-step. Single-step captchas may define
 * `prompt`/`answers` directly. Multi-step captchas should define `steps`, where
 * each step can contain:
 * - `prompt`: user-facing question, riddle, or captcha text.
 * - `answers`: accepted answers for that step.
 * - `title`: optional embed title for the step.
 * - `imageUrl`: optional captcha/riddle image shown in the challenge embed.
 * - `thumbnailUrl`: optional thumbnail shown in the challenge embed.
 *
 * How to add a new captcha for future admin selection:
 * 1. Add a stable ID as a new key in `captchas` (for example: `eliteDangerousBasics`).
 * 2. Add either a single-step `prompt`/`answers` pair or a multi-step `steps` array.
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
        steps: [
            {
                prompt: 'Type "AXI" to verify.',
                answers: ['axi'],
            },
        ],
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

function getCaptchaSteps(captcha) {
    if (!captcha) return [];

    if (Array.isArray(captcha.steps) && captcha.steps.length > 0) {
        return captcha.steps;
    }

    return [
        {
            prompt: captcha.prompt,
            answers: captcha.answers ?? [],
            title: captcha.title,
            imageUrl: captcha.imageUrl,
            thumbnailUrl: captcha.thumbnailUrl,
        },
    ];
}

function getCaptchaStep(captchaId, stepIndex = 0) {
    const captcha = getCaptcha(captchaId);
    const steps = getCaptchaSteps(captcha);

    return steps[stepIndex];
}

function hasNextCaptchaStep(captchaId, stepIndex = 0) {
    const captcha = getCaptcha(captchaId);
    const steps = getCaptchaSteps(captcha);

    return stepIndex + 1 < steps.length;
}

function getActiveCaptcha(config) {
    const captchaId = config?.verification?.activeCaptchaId
        ?? config?.verification?.captchaId
        ?? config?.activeCaptchaId
        ?? config?.captchaId
        ?? 'placeholder';

    return getCaptcha(captchaId) ?? getCaptcha(DEFAULT_CAPTCHA_ID);
}

function validateAnswer(captchaId, answer, stepIndex = 0) {
    const captcha = getCaptcha(captchaId);
    const step = getCaptchaStep(captchaId, stepIndex);

    if (!captcha || !step) {
        return { ok: false, reason: 'not_found' };
    }

    const normalizer = step.normalizer ?? captcha.normalizer ?? normalizeAnswer;
    const normalizedAnswer = normalizer(answer);
    const validAnswers = (step.answers ?? []).map((validAnswer) => normalizer(validAnswer));

    if (validAnswers.includes(normalizedAnswer)) {
        return { ok: true };
    }

    return { ok: false, reason: 'incorrect' };
}

module.exports = {
    DEFAULT_CAPTCHA_ID,
    captchas,
    getCaptcha,
    getCaptchaStep,
    getCaptchaSteps,
    getActiveCaptcha,
    hasNextCaptchaStep,
    normalizeAnswer,
    validateAnswer,
};
