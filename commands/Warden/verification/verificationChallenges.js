/**
 * Warden verification challenge runtime helpers.
 *
 * Static challenge definitions live in verificationChallengesConfig.js. This file
 * owns challenge normalization, DB override application, runtime screen planning,
 * and answer validation. A challenge is metadata plus ordered questions[]. Runtime
 * screens are groups of questions: separateStep:true questions become their own
 * screen, while consecutive separateStep:false questions are grouped together.
 */
const {
    DEFAULT_CHALLENGE_ID,
    verificationChallenges,
} = require('./verificationChallengesConfig');

const DEFAULT_GENERATED_IMAGE = Object.freeze({ enabled: false, type: 'none' });
const DEFAULT_ANSWER = Object.freeze({ required: false, type: 'none' });
const ALLOWED_IMAGE_DIRECTION_DEGREES = new Set([0, 45, 90, 135, 180, 225, 270, 315]);

function normalizeAnswer(answer) {
    return String(answer ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function normalizeGeneratedImage(generatedImage = {}) {
    const enabled = generatedImage.enabled === true;
    return {
        ...DEFAULT_GENERATED_IMAGE,
        ...generatedImage,
        enabled,
        type: generatedImage.type ?? (enabled ? 'prompt-text' : 'none'),
    };
}

function normalizeQuestionAnswer(answer = {}) {
    return {
        ...DEFAULT_ANSWER,
        ...answer,
        required: answer.required === true,
        type: answer.type ?? (answer.required ? 'text' : 'none'),
        accepted: Array.isArray(answer.accepted) ? answer.accepted : [],
    };
}

function getChallengeOverride(challengeId, verificationSettings) {
    if (!challengeId) return undefined;
    return verificationSettings?.challengeOverrides?.[challengeId];
}

function applyConfiguredQuestionValues(question, challengeId, verificationSettings) {
    const challengeOverride = getChallengeOverride(challengeId, verificationSettings);
    const questionOverride = challengeOverride?.questions?.[question.id];
    if (!questionOverride) return question;

    const generatedImage = {
        ...question.generatedImage,
        ...(questionOverride.generatedImage ?? {}),
    };
    const answer = {
        ...question.answer,
        ...(questionOverride.answer ?? {}),
    };

    if (questionOverride.label) question.label = questionOverride.label;
    if (questionOverride.text) question.text = questionOverride.text;
    if (questionOverride.separateStep !== undefined) question.separateStep = questionOverride.separateStep === true;

    if (generatedImage.config && typeof generatedImage.config === 'object') {
        Object.assign(generatedImage, generatedImage.config);
    }

    return { ...question, generatedImage, answer };
}

function normalizeVerificationChallenge(challenge, verificationSettings) {
    if (!challenge) return challenge;

    const challengeOverride = getChallengeOverride(challenge.id, verificationSettings);

    return {
        id: challenge.id,
        enabled: challenge.enabled === true,
        title: challengeOverride?.title ?? challenge.title,
        description: challengeOverride?.description ?? challenge.description,
        color: challengeOverride?.color ?? challenge.color,
        fields: Array.isArray(challenge.fields) ? challenge.fields : [],
        questions: getChallengeQuestions(challenge).map((question, index) => applyConfiguredQuestionValues({
            ...question,
            id: question.id,
            label: question.label ?? `Question ${index + 1}`,
            separateStep: question.separateStep === true,
            generatedImage: normalizeGeneratedImage(question.generatedImage),
            answer: normalizeQuestionAnswer(question.answer),
        }, challenge.id, verificationSettings)),
    };
}

function getChallengeQuestions(challenge) {
    return Array.isArray(challenge?.questions) ? challenge.questions : [];
}

function getChallengeQuestion(challenge, questionIdOrIndex) {
    const questions = getChallengeQuestions(challenge);
    if (Number.isInteger(questionIdOrIndex)) return questions[questionIdOrIndex];
    return questions.find((question) => question.id === questionIdOrIndex);
}

function buildQuestionScreens(challenge) {
    const screens = [];
    let groupedQuestions = [];

    const pushScreen = (questions, separate) => {
        if (questions.length < 1) return;
        screens.push({
            id: `screen-${screens.length}`,
            index: screens.length,
            questions,
            separate,
            answerRequired: questions.some((question) => question.answer?.required === true),
        });
    };

    for (const question of getChallengeQuestions(challenge)) {
        if (question.separateStep === true) {
            pushScreen(groupedQuestions, false);
            groupedQuestions = [];
            pushScreen([question], true);
            continue;
        }
        groupedQuestions.push(question);
    }

    pushScreen(groupedQuestions, false);
    return screens;
}

function getScreenAnswerSpec(screen) {
    return (screen?.questions ?? [])
        .filter((question) => question.answer?.required === true)
        .map((question) => ({ questionId: question.id, ...question.answer }));
}

function screenRequiresAnswer(screen) {
    return screen?.answerRequired === true || getScreenAnswerSpec(screen).length > 0;
}

function getScreenRequiredAnswerQuestions(screen) {
    return (screen?.questions ?? []).filter((question) => question.answer?.required === true && question.answer?.type !== 'none');
}

function validateQuestionScreens(screens) {
    const issues = [];

    for (const screen of screens ?? []) {
        const requiredAnswers = getScreenRequiredAnswerQuestions(screen);
        if (requiredAnswers.length > 5) {
            issues.push({
                screenIndex: screen.index,
                code: 'too_many_modal_inputs',
                message: `Screen ${screen.index + 1} has ${requiredAnswers.length} required answer inputs. Discord modals support at most 5. Mark some questions separateStep:true.`,
            });
        }
    }

    return issues;
}

function screenAllowsBack(session, targetScreenIndex) {
    const currentScreenIndex = Number(session?.screenIndex ?? 0);
    if (!Number.isInteger(targetScreenIndex) || targetScreenIndex !== currentScreenIndex - 1) return false;
    const targetScreen = session?.screens?.[targetScreenIndex];
    return Boolean(targetScreen && !screenRequiresAnswer(targetScreen) && !session?.answeredScreenIndexes?.includes(targetScreen.index));
}

function parsePositionAnswer(positionAnswer) {
    const normalizedInput = String(positionAnswer ?? '').trim();
    if (!normalizedInput) return [];
    return normalizedInput.split(/[\s,]+/).filter(Boolean).map((position) => Number(position));
}

function validatePositionAnswer(positionAnswer, expectedPositions, gallerySize) {
    const submittedPositions = parsePositionAnswer(positionAnswer);
    if (submittedPositions.length !== expectedPositions.length) return false;
    if (submittedPositions.some((position) => !Number.isInteger(position) || position < 1 || position > gallerySize)) return false;
    if (new Set(submittedPositions).size !== submittedPositions.length) return false;
    const sortedSubmittedPositions = [...submittedPositions].sort((left, right) => left - right);
    return expectedPositions.every((expectedPosition, index) => sortedSubmittedPositions[index] === expectedPosition);
}

function getSubmittedValue(submittedValues, question) {
    if (submittedValues && typeof submittedValues === 'object' && !Array.isArray(submittedValues)) {
        return submittedValues[question.id] ?? submittedValues[question.answer?.type] ?? submittedValues.answer ?? submittedValues.positions;
    }
    return submittedValues;
}

function validateQuestionAnswer(question, submittedValue, questionAssets = {}) {
    const answer = question?.answer ?? DEFAULT_ANSWER;
    if (answer.required !== true || answer.type === 'none') return { ok: true };

    if (answer.type === 'text') {
        const normalizer = answer.normalizer ?? normalizeAnswer;
        const normalizedAnswer = normalizer(submittedValue);
        const validAnswers = (answer.accepted ?? []).map((validAnswer) => normalizer(validAnswer));
        return validAnswers.includes(normalizedAnswer) ? { ok: true } : { ok: false, reason: 'incorrect' };
    }

    if (answer.type === 'positions') {
        const expectedPositions = questionAssets.solutionPositions ?? questionAssets.expectedPositions ?? [];
        const gallerySize = questionAssets.gallerySize ?? question.generatedImage?.gallerySize ?? questionAssets.selectedImages?.length ?? 0;
        return validatePositionAnswer(submittedValue, expectedPositions, gallerySize) ? { ok: true } : { ok: false, reason: 'incorrect' };
    }

    return { ok: false, reason: 'unsupported_answer_type' };
}

function validateScreenAnswers(screen, submittedValues, questionAssets = {}) {
    for (const question of screen?.questions ?? []) {
        const assets = questionAssets[question.id] ?? questionAssets;
        const result = validateQuestionAnswer(question, getSubmittedValue(submittedValues, question), assets);
        if (!result.ok) return { ...result, questionId: question.id };
    }
    return { ok: true };
}

function applyVerificationChallengeOverrides(challenge, verificationSettings) {
    return normalizeVerificationChallenge(challenge, verificationSettings);
}

function getVerificationChallenge(challengeId) {
    if (!challengeId) return undefined;

    return verificationChallenges[challengeId];
}

function getRoleIds(generatedImage, role) {
    return Array.isArray(generatedImage?.imageIds?.[role]) ? generatedImage.imageIds[role] : [];
}

function getInvalidDirectionValues(directions) {
    return (Array.isArray(directions) ? directions : [])
        .filter((degrees) => !Number.isInteger(Number(degrees)) || !ALLOWED_IMAGE_DIRECTION_DEGREES.has(Number(degrees)));
}

function getMissingChallengeOverrideRequirements(verificationSettings) {
    const enabledChallenges = getEnabledVerificationChallenges({ verification: verificationSettings });

    return enabledChallenges.flatMap((challenge) => {
        const missing = validateQuestionScreens(buildQuestionScreens(challenge)).map((issue) => issue.message);

        for (const question of challenge.questions ?? []) {
            const generatedImage = question.generatedImage ?? {};
            const answer = question.answer ?? {};
            const prefix = `${challenge.id}/${question.id}`;

            if (generatedImage.requiresConfiguredText && !generatedImage.text) {
                missing.push(`${prefix}: generated image text`);
            }

            if (answer.requiresConfiguredAnswers && answer.required === true && !answer.accepted?.length) {
                missing.push(`${prefix}: accepted answers`);
            }

            if (generatedImage.type === 'gallery-standard'
                && (generatedImage.requiresConfiguredImageIds || getRoleIds(generatedImage, 'solution').length < 1 || getRoleIds(generatedImage, 'control').length < 1)) {
                if (getRoleIds(generatedImage, 'solution').length < 1) missing.push(`${prefix}: solution image IDs`);
                if (getRoleIds(generatedImage, 'control').length < 1) missing.push(`${prefix}: control image IDs`);
            }

            if (generatedImage.type === 'gallery-rotation-alignment'
                && (generatedImage.requiresConfiguredImageIds || getRoleIds(generatedImage, 'center').length < 1 || getRoleIds(generatedImage, 'outer').length < 1)) {
                if (getRoleIds(generatedImage, 'center').length < 1) missing.push(`${prefix}: center image IDs`);
                if (getRoleIds(generatedImage, 'outer').length < 1) missing.push(`${prefix}: outer image IDs`);
            }

            if (generatedImage.type === 'gallery-rotation-alignment' && (generatedImage.requiresConfiguredImageDirections || getRoleIds(generatedImage, 'center').length > 0 || getRoleIds(generatedImage, 'outer').length > 0)) {
                const directions = generatedImage.imageDirections ?? {};
                const imageIds = [...new Set([...getRoleIds(generatedImage, 'center'), ...getRoleIds(generatedImage, 'outer')])];
                const missingDirectionIds = imageIds.filter((imageId) => !Array.isArray(directions[imageId]) || directions[imageId].length < 1);

                if (missingDirectionIds.length > 0) {
                    missing.push(`${prefix}: image directions (${missingDirectionIds.join(', ')})`);
                }

                const invalidDirectionIds = imageIds.filter((imageId) => getInvalidDirectionValues(directions[imageId]).length > 0);
                if (invalidDirectionIds.length > 0) {
                    missing.push(`${prefix}: invalid image directions (${invalidDirectionIds.join(', ')})`);
                }
            }
        }

        if (missing.length < 1) return [];

        return [{ challengeId: challenge.id, missing }];
    });
}

function getEnabledVerificationChallenges(config) {
    const verificationSettings = config?.verification ?? config;
    const configuredChallengeIds = verificationSettings?.activeChallengeIds;

    if (Array.isArray(configuredChallengeIds) && configuredChallengeIds.length > 0) {
        return configuredChallengeIds
            .map((challengeId) => applyVerificationChallengeOverrides(getVerificationChallenge(challengeId), verificationSettings))
            .filter(Boolean);
    }

    const legacyChallengeId = config?.verification?.activeChallengeId
        ?? config?.verification?.challengeId
        ?? config?.activeChallengeId
        ?? config?.challengeId;

    if (legacyChallengeId) {
        const legacyChallenge = getVerificationChallenge(legacyChallengeId) ?? getVerificationChallenge(DEFAULT_CHALLENGE_ID);
        return [applyVerificationChallengeOverrides(legacyChallenge, verificationSettings)];
    }

    return Object.values(verificationChallenges)
        .filter((challenge) => challenge.enabled)
        .map((challenge) => applyVerificationChallengeOverrides(challenge, verificationSettings));
}

function getActiveVerificationChallenge(config) {
    return getEnabledVerificationChallenges(config)[0] ?? getVerificationChallenge(DEFAULT_CHALLENGE_ID);
}

module.exports = {
    DEFAULT_CHALLENGE_ID,
    verificationChallenges,

    getVerificationChallenge,
    getEnabledVerificationChallenges,
    getActiveVerificationChallenge,

    normalizeVerificationChallenge,
    getChallengeQuestion,
    getChallengeQuestions,
    buildQuestionScreens,
    getScreenAnswerSpec,
    screenRequiresAnswer,
    getScreenRequiredAnswerQuestions,
    validateQuestionScreens,
    screenAllowsBack,

    normalizeAnswer,
    validateQuestionAnswer,
    validateScreenAnswers,

    getMissingChallengeOverrideRequirements,
};
