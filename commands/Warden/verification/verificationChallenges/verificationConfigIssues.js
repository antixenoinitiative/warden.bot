const {
    DEFAULT_CHALLENGE_ID,
    verificationChallenges,
} = require('./verificationChallengesConfig');
const {
    normalizeVerificationChallenge,
    buildQuestionScreens,
    validateQuestionScreens,
} = require('./verificationChallenges');

const ALLOWED_IMAGE_DIRECTION_DEGREES = new Set([0, 45, 90, 135, 180, 225, 270, 315]);

function getQuestionTaskType(question) {
    const generatedImage = question?.generatedImage ?? {};
    if (generatedImage.enabled !== true || generatedImage.type === 'none') return 'none';
    return String(generatedImage.type ?? 'none');
}

function getConfiguredRoleIds(generatedImage, role) {
    return Array.isArray(generatedImage?.imageIds?.[role]) ? generatedImage.imageIds[role] : [];
}

function getInvalidConfiguredDirections(directions) {
    return (Array.isArray(directions) ? directions : [])
        .filter((degrees) => !Number.isInteger(Number(degrees)) || !ALLOWED_IMAGE_DIRECTION_DEGREES.has(Number(degrees)));
}

function createIssue({ code, challengeId, questionId = null, taskType = 'none', field = null, label, message, active = false }) {
    return { severity: 'blocking', code, challengeId, questionId, taskType, field, label, message, active };
}

function resolveConfiguredActiveChallengeIds(verificationSettings = {}) {
    if (Array.isArray(verificationSettings.activeChallengeIds) && verificationSettings.activeChallengeIds.length > 0) {
        return verificationSettings.activeChallengeIds.map(String);
    }
    const legacy = verificationSettings.activeChallengeId ?? verificationSettings.challengeId;
    return legacy ? [String(legacy)] : [DEFAULT_CHALLENGE_ID];
}

function evaluateChallengeConfigIssues(challenge, verificationSettings = {}, activeChallengeIds = resolveConfiguredActiveChallengeIds(verificationSettings)) {
    const activeSet = new Set(activeChallengeIds.map(String));
    const normalizedChallenge = normalizeVerificationChallenge(challenge, verificationSettings);
    if (!normalizedChallenge) return [];
    const active = activeSet.has(String(normalizedChallenge.id));
    const screens = buildQuestionScreens(normalizedChallenge);
    const issues = screens.length < 1 ? [createIssue({
        code: 'missing_questions',
        challengeId: normalizedChallenge.id,
        label: 'Questions',
        message: `${normalizedChallenge.id}: Verification challenge requires at least one question.`,
        active,
    })] : [];
    issues.push(...validateQuestionScreens(screens).map((issue) => createIssue({
        code: 'invalid_screen_answers',
        challengeId: normalizedChallenge.id,
        questionId: null,
        label: 'Screen answers',
        message: issue.message,
        active,
    })));

    for (const question of normalizedChallenge.questions ?? []) {
        const generatedImage = question.generatedImage ?? {};
        const answer = question.answer ?? {};
        const taskType = getQuestionTaskType(question);
        const prefix = `${normalizedChallenge.id}/${question.id}`;
        const base = { challengeId: normalizedChallenge.id, questionId: question.id, taskType, active };

        if (generatedImage.requiresConfiguredText === true && !generatedImage.text) {
            issues.push(createIssue({ ...base, code: 'missing_task_prompt_text', field: 'generatedImage.text', label: 'Task prompt text', message: `${prefix}: Prompt Text task requires configured task prompt text.` }));
        }
        if (answer.required === true && answer.type === 'text' && (answer.requiresConfiguredAnswers === true || !answer.accepted?.length) && !answer.accepted?.length) {
            issues.push(createIssue({ ...base, code: 'missing_accepted_answers', field: 'answer.accepted', label: 'Accepted answers', message: `${prefix}: Required text answer needs at least one accepted answer.` }));
        }
        if (taskType === 'gallery-standard') {
            if (getConfiguredRoleIds(generatedImage, 'solution').length < 1) issues.push(createIssue({ ...base, code: 'missing_solution_image_ids', field: 'generatedImage.imageIds.solution', label: 'Solution image IDs', message: `${prefix}: Standard Gallery task requires solution image IDs.` }));
            if (getConfiguredRoleIds(generatedImage, 'control').length < 1) issues.push(createIssue({ ...base, code: 'missing_control_image_ids', field: 'generatedImage.imageIds.control', label: 'Control image IDs', message: `${prefix}: Standard Gallery task requires control image IDs.` }));
        }
        if (taskType === 'gallery-rotation-alignment') {
            const centerIds = getConfiguredRoleIds(generatedImage, 'center');
            const outerIds = getConfiguredRoleIds(generatedImage, 'outer');
            if (centerIds.length < 1) issues.push(createIssue({ ...base, code: 'missing_center_image_ids', field: 'generatedImage.imageIds.center', label: 'Center image IDs', message: `${prefix}: Rotation Alignment task requires center image IDs.` }));
            if (outerIds.length < 1) issues.push(createIssue({ ...base, code: 'missing_outer_image_ids', field: 'generatedImage.imageIds.outer', label: 'Outer image IDs', message: `${prefix}: Rotation Alignment task requires outer image IDs.` }));
            const directions = generatedImage.imageDirections ?? {};
            for (const imageId of [...new Set([...centerIds, ...outerIds].map(String))]) {
                if (!Array.isArray(directions[imageId]) || directions[imageId].length < 1) issues.push(createIssue({ ...base, code: 'missing_image_directions', field: `generatedImage.imageDirections.${imageId}`, label: 'Image directions', message: `${prefix}: Rotation Alignment task requires image directions for ${imageId}.` }));
                else if (getInvalidConfiguredDirections(directions[imageId]).length > 0) issues.push(createIssue({ ...base, code: 'invalid_image_directions', field: `generatedImage.imageDirections.${imageId}`, label: 'Image directions', message: `${prefix}: Rotation Alignment task has invalid image directions for ${imageId}.` }));
            }
        }
        if (taskType === 'static-image' && generatedImage.requiresConfiguredUrl === true && !generatedImage.url) {
            issues.push(createIssue({ ...base, code: 'missing_static_image_url', field: 'generatedImage.url', label: 'Static image URL', message: `${prefix}: Static Image task requires configured image URL.` }));
        }
    }
    return issues;
}

function evaluateVerificationConfigIssues(verificationSettings = {}) {
    const activeChallengeIds = resolveConfiguredActiveChallengeIds(verificationSettings);
    const catalogChallenges = Array.isArray(verificationSettings.challenges)
        ? verificationSettings.challenges
        : undefined;

    if (catalogChallenges) {
        const catalogById = new Map(catalogChallenges.map((challenge) => [String(challenge.id), challenge]));
        const issues = catalogChallenges.flatMap((challenge) =>
            evaluateChallengeConfigIssues(challenge, {}, activeChallengeIds));

        for (const challengeId of activeChallengeIds) {
            if (catalogById.has(String(challengeId))) continue;
            issues.push(createIssue({
                code: 'missing_active_challenge',
                challengeId: String(challengeId),
                label: 'Active challenge',
                message: `${challengeId}: Active verification challenge is missing from the authoritative catalog.`,
                active: true,
            }));
        }

        return issues;
    }

    const challengeIds = [...new Set([...Object.keys(verificationChallenges), ...activeChallengeIds])];
    return challengeIds.flatMap((challengeId) => evaluateChallengeConfigIssues(verificationChallenges[challengeId], verificationSettings, activeChallengeIds));
}

function formatMissingChallengeOverrideRequirements(verificationSettings = {}) {
    const grouped = new Map();
    for (const issue of evaluateVerificationConfigIssues(verificationSettings).filter((item) => item.active)) {
        if (!grouped.has(issue.challengeId)) grouped.set(issue.challengeId, []);
        grouped.get(issue.challengeId).push(issue.label ?? issue.message);
    }
    return [...grouped.entries()].map(([challengeId, missing]) => ({ challengeId, missing }));
}

module.exports = {
    ALLOWED_IMAGE_DIRECTION_DEGREES,
    resolveConfiguredActiveChallengeIds,
    getQuestionTaskType,
    getConfiguredRoleIds,
    getInvalidConfiguredDirections,
    evaluateChallengeConfigIssues,
    evaluateVerificationConfigIssues,
    formatMissingChallengeOverrideRequirements,
};
