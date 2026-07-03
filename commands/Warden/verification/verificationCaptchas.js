const captchas = {
    placeholder: {
        id: 'placeholder',
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

    return getCaptcha(captchaId) ?? getCaptcha('placeholder');
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
    captchas,
    getCaptcha,
    getActiveCaptcha,
    normalizeAnswer,
    validateAnswer,
};
