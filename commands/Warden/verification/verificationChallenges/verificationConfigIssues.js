const {
    VERIFICATION_UI_LIMITS,
    normalizeVerificationChallenge,
    buildQuestionScreens,
    isSupportedRequiredAnswerType,
    validateQuestionScreens,
} = require('./verificationChallenges');
const {
    getQuestionTaskModule,
    getQuestionTaskType,
} = require('./questionTasks/taskRegistry');
const { getVerificationImagePool } = require('../verificationImages');

function createIssue({ code, challengeId, questionId = null, taskType = 'none', field = null, label, message, active = false }) {
    return { severity: 'blocking', code, challengeId, questionId, taskType, field, label, message, active };
}

function resolveConfiguredActiveChallengeIds(verificationSettings = {}) {
    if (Array.isArray(verificationSettings.activeChallengeIds) && verificationSettings.activeChallengeIds.length > 0) {
        return verificationSettings.activeChallengeIds.map(String);
    }
    return [];
}

function evaluateChallengeConfigIssues(challenge, activeChallengeIds = []) {
    const activeSet = new Set(activeChallengeIds.map(String));
    const normalizedChallenge = normalizeVerificationChallenge(challenge);
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
    issues.push(...validateQuestionScreens(screens, normalizedChallenge).map((issue) => createIssue({
        code: issue.code ?? 'invalid_question_screen',
        challengeId: normalizedChallenge.id,
        questionId: null,
        label: issue.code === 'too_many_modal_inputs' ? 'Screen answers' : 'Discord screen limits',
        message: issue.message,
        active,
    })));

    for (const question of normalizedChallenge.questions ?? []) {
        const generatedImage = question.generatedImage ?? {};
        const answer = question.answer ?? {};
        const taskType = getQuestionTaskType(question);
        const prefix = `${normalizedChallenge.id}/${question.id}`;
        const base = { challengeId: normalizedChallenge.id, questionId: question.id, taskType, active };

        const taskModule = getQuestionTaskModule(question);
        if (!taskModule) {
            issues.push(createIssue({ ...base, code: 'unsupported_task_type', field: 'generatedImage.type', label: 'Task type', message: `${prefix}: Unsupported verification task type "${taskType}".` }));
        }
        if (answer.required === true && !isSupportedRequiredAnswerType(answer.type)) {
            issues.push(createIssue({ ...base, code: 'unsupported_answer_type', field: 'answer.type', label: 'Answer type', message: `${prefix}: Required verification answer type "${answer.type}" is unsupported.` }));
        }
        if (answer.required === true && answer.type === 'positions' && taskModule?.providesPositionAnswers !== true) {
            issues.push(createIssue({ ...base, code: 'positions_answer_requires_gallery', field: 'answer.type', label: 'Position answer task', message: `${prefix}: Required position answers need a gallery task that provides solution positions.` }));
        }
        if (answer.required === true && String(answer.inputLabel ?? '').length > VERIFICATION_UI_LIMITS.modalLabelLength) {
            issues.push(createIssue({ ...base, code: 'answer_input_label_too_long', field: 'answer.inputLabel', label: 'Answer input label', message: `${prefix}: Answer input label exceeds Discord's ${VERIFICATION_UI_LIMITS.modalLabelLength}-character limit.` }));
        }
        if (answer.required === true && String(answer.inputPlaceholder ?? '').length > VERIFICATION_UI_LIMITS.textInputPlaceholderLength) {
            issues.push(createIssue({ ...base, code: 'answer_input_placeholder_too_long', field: 'answer.inputPlaceholder', label: 'Answer input placeholder', message: `${prefix}: Answer input placeholder exceeds Discord's ${VERIFICATION_UI_LIMITS.textInputPlaceholderLength}-character limit.` }));
        }
        if (generatedImage.requiresConfiguredText === true && !generatedImage.text) {
            issues.push(createIssue({ ...base, code: 'missing_task_prompt_text', field: 'generatedImage.text', label: 'Task prompt text', message: `${prefix}: Prompt Text task requires configured task prompt text.` }));
        }
        if (answer.required === true && answer.type === 'text' && (answer.requiresConfiguredAnswers === true || !answer.accepted?.length) && !answer.accepted?.length) {
            issues.push(createIssue({ ...base, code: 'missing_accepted_answers', field: 'answer.accepted', label: 'Accepted answers', message: `${prefix}: Required text answer needs at least one accepted answer.` }));
        }
        if (taskModule?.validateConfig) {
            const taskIssues = taskModule.validateConfig(question, {
                challengeId: normalizedChallenge.id,
                getVerificationImagePool,
            });
            issues.push(...taskIssues.map((taskIssue) => createIssue({ ...base, ...taskIssue })));
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
            evaluateChallengeConfigIssues(challenge, activeChallengeIds));

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

    return activeChallengeIds.map((challengeId) => createIssue({
        code: 'missing_active_challenge',
        challengeId,
        label: 'Active challenge',
        message: `${challengeId}: Active verification challenge is missing from the authoritative catalog.`,
        active: true,
    }));
}

module.exports = {
    resolveConfiguredActiveChallengeIds,
    getQuestionTaskType,
    evaluateChallengeConfigIssues,
    evaluateVerificationConfigIssues,
};
