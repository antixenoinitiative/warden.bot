/**
 * Warden verification challenge registry.
 *
 * Verification challenges can be single-step or multi-step. Single-step challenges may define
 * `prompt`/`answers` directly. Multi-step challenges should define `steps`, where each step can
 * contain:
 * - `prompt`: user-facing question, riddle, or challenge text.
 * - `questionText`: optional text shown under the question heading before the prompt image/text.
 * - `description`: optional description text used before the prompt.
 * - `answers`: accepted answers for that step. Static answers are only valid for bundled
 *   self-contained challenges; challenges with `requiresConfiguredAnswers` must use DB overrides.
 * - `generatePrompt`: controls prompt rendering. Use `true` to always render prompt text
 *   (falling back to default copy), `false` to keep a gallery-only step, or `'configured'`
 *   to render only when a static or DB-configured prompt exists.
 * - `omitAnswerInput`: true when a prompted step should not ask for a separate text answer.
 * - `answerInputPlaceholder`: optional placeholder text for the prompted answer modal input.
 * - `requiresConfiguredPrompt`: true when staff must set a DB prompt override before using the challenge.
 * - `requiresConfiguredAnswers`: true when staff must set DB answer overrides before using the challenge.
 * - `title`: optional embed title for the step.
 * - `imageUrl`: optional primary image shown on the challenge embed.
 * - `thumbnailUrl`: optional thumbnail shown on the challenge embed.
 * - `fields`: optional content blocks. Each field can define `title`/`name`, `content`/`value`,
 *   `inline`, and/or `imageUrl`. Fields without a title use a blank Discord field name.
 * - `embeds`: optional extra embed blocks for additional images/descriptions.
 * - `renderMode`: optional renderer. Use `componentsV2Gallery` for a Components V2 media gallery.
 * - `imagePoolId`: optional reusable image pool ID for gallery challenges.
 * - `gallerySize`: optional number of images to show for gallery challenges.
 * - `solutionImageCount`: optional `{ min, max }` range for solution image slots. Solution
 *   images may repeat if the requested slot count is larger than the number of solution URLs.
 * - `controlImageCount`: optional `{ min, max }` range for control images.
 * - `maxControlImageRepeats`: optional maximum number of times the same control image can appear.
 * - `compositeImageGallery`: optional boolean that renders selected gallery images as one labeled grid.
 *
 * How to add a new verification challenge for future admin selection:
 * 1. Add a stable ID as a new key in `verificationChallenges`.
 * 2. Add either a single-step `prompt`/`answers` pair or a multi-step `steps` array.
 * 3. Add every accepted static answer to `answers` for self-contained bundled challenges;
 *    DB-configured answer challenges should set `requiresConfiguredAnswers` instead. Answers
 *    are normalized with `normalizeAnswer` unless the challenge defines a custom `normalizer`.
 * 4. Include the challenge in `/verification challenge set <id>` or add it to `config.Warden.verification.activeChallengeIds` as a boot fallback.
 */
const DEFAULT_CHALLENGE_ID = 'placeholder';

const verificationChallenges = {
    [DEFAULT_CHALLENGE_ID]: {
        id: DEFAULT_CHALLENGE_ID,
        enabled: true,
        steps: [
            {
                title: 'Verification Challenge',
                prompt: 'Type "AXI" to verify.',
                answers: ['axi'],
                fields: [
                    {
                        title: 'Answer format',
                        content: 'Enter the three letters shown in the prompt.',
                        inline: false,
                    },
                ],
            },
        ],
    },
    multiFieldExample: {
        id: 'multiFieldExample',
        enabled: false,
        steps: [
            {
                title: 'Multi-field Verification Challenge',
                description: 'Review the information below, then answer the prompt.',
                prompt: 'What three-letter group does this server stand for?',
                answers: ['axi', 'anti-xeno initiative', 'antixenoinitiative'],
                thumbnailUrl: 'https://antixenoinitiative.com/wp-content/uploads/2024/09/cropped-AXI_Logo_New2.png',
                fields: [
                    {
                        title: 'Hint',
                        content: 'The answer is visible in the Anti-Xeno Initiative name.',
                        inline: false,
                    },
                    {
                        content: 'This field intentionally has no visible title, only content.',
                        inline: false,
                    },
                    {
                        title: 'Reference image',
                        imageUrl: 'https://antixenoinitiative.com/wp-content/uploads/2024/09/cropped-AXI_Logo_New2.png',
                    },
                ],
                embeds: [
                    {
                        title: 'Additional image example',
                        description: 'Optional extra embeds can carry more pictures for multi-picture challenges.',
                        imageUrl: 'https://antixenoinitiative.com/wp-content/uploads/2024/09/cropped-AXI_Logo_New2.png',
                    },
                ],
            },
        ],
    },
    
    eliteVesselGallery: {
        id: 'eliteVesselGallery',
        enabled: false,
        renderMode: 'componentsV2Gallery',
        imagePoolId: 'eliteVessels_c',
        gallerySize: 9,
        solutionImageCount: {
            min: 1,
            max: 2,
        },
        maxControlImageRepeats: 2,
        steps: [
            {
                title: 'Verification Challenge',
                description: 'Answer both questions below.',
                prompt: 'What is the name of the starter ship in Elite Dangerous?',
                galleryPrompt: 'Find all images depicting the starter ship. It may be multiple. Remember their position in the order.',
                answers: ['sidewinder', 'sidewinder mk i', 'sidewinder mki', 'sidewinder mk1', 'sidewindermki', 'sidewindermk1', 'sidewinder mk.i', 'sidewinder mk.1'],
                answerInputPlaceholder: 'Enter the ship name',
                positionInputLabel: 'Image position(s) (1-9)',
                positionInputPlaceholder: 'Enter their number. If multiple, seperate by commas or spaces',
            },
        ],
    },
    
    eliteVesselGalleryEnhanced: {
        id: 'eliteVesselGalleryEnhanced',
        enabled: false,
        renderMode: 'componentsV2Gallery',
        promptImageGallery: true,
        compositeImageGallery: true,
        imagePoolId: 'eliteVessels_c_local',
        gallerySize: 9,
        solutionImageCount: {
            min: 1,
            max: 2,
        },
        maxControlImageRepeats: 2,
        requiresConfiguredPrompt: true,
        requiresConfiguredAnswers: true,
        requiresConfiguredSolutionImages: true,
        requiresConfiguredControlImages: true,
        steps: [
            {
                title: 'Verification Challenge',
                description: 'Answer both questions below.',
                questionText: 'What is the name of the following object from Elite Dangerous?',
                galleryPrompt: 'Find all images depicting the object we are looking for. It may be multiple. Remember their tag number.',
                answerInputPlaceholder: 'Enter the object name',
                positionInputLabel: 'Image tags (1-9)',
                positionInputPlaceholder: 'Enter their number. If multiple, seperate by commas or spaces',
            },
        ],
    },

    onTheBlueDanube: {
        id: 'onTheBlueDanube',
        enabled: false,
        renderMode: 'componentsV2Gallery',
        generatePrompt: 'configured',
        promptImageGallery: true,
        compositeImageGallery: true,
        imagePoolId: 'eliteRotationAlignmentAssets',
        gallerySize: 6,
        solutionImageCount: { 
            min: 1,
            max: 1 
        },
        requiresConfiguredSolutionImageDirections: true,
        omitAnswerInput: true,
        generatedGallery: {
            type: 'rotationAlignment',
            clockPositionDegrees: [0, 45, 90, 135, 180, 225, 270, 315],
            maxImageOrientationRepeats: 2,
            rotationDegrees: [0, 45, 90, 135, 180, 225, 270, 315],
            alignmentRule: {
                centerTargetOffsetDegrees: 0,
                outerTargetOffsetDegrees: 180,
            },
            tileCanvas: {
                width: 512,
                height: 512,
                background: '#05070d',
                centerScale: 0.40,
                outerScale: 0.20,
                outerRadius: 178,
                glow: true,
            },
        },
        steps: [
            {
                title: 'Verification Challenge',
                description: 'Look carefully at the generated imagery.',
                questionText: 'Which image shows its objects perfectly aligned to [...] ?',
                galleryPrompt: 'Find what we are looking for. Note the tag number.',
                positionInputLabel: 'Image tag (1-9)',
                positionInputPlaceholder: 'Enter one number only',
                omitAnswerInput: true,
            },
        ],
    },
};

function getChallengeOverride(challengeId, verificationSettings) {
    if (!challengeId) return undefined;

    return verificationSettings?.challengeOverrides?.[challengeId];
}

function applyVerificationChallengeOverrides(challenge, verificationSettings) {
    if (!challenge) return challenge;

    const override = getChallengeOverride(challenge.id, verificationSettings);
    if (!override) return challenge;

    const overriddenChallenge = { ...challenge };

    if (override.prompt) {
        overriddenChallenge.prompt = override.prompt;
        overriddenChallenge.hasPromptOverride = true;
    }

    if (override.answers?.length) {
        overriddenChallenge.answers = override.answers;
        overriddenChallenge.hasAnswerOverride = true;
    }

    if (override.solutionImageIds?.length) {
        overriddenChallenge.solutionImageIds = override.solutionImageIds;
        overriddenChallenge.hasSolutionImageOverride = true;
    }

    if (override.controlImageIds?.length) {
        overriddenChallenge.controlImageIds = override.controlImageIds;
        overriddenChallenge.hasControlImageOverride = true;
    }

    if (override.solutionImageDirections && typeof override.solutionImageDirections === 'object') {
        overriddenChallenge.solutionImageDirections = override.solutionImageDirections;
        overriddenChallenge.hasSolutionImageDirectionOverride = true;
    }

    if (Array.isArray(challenge.steps) && challenge.steps.length > 0) {
        overriddenChallenge.steps = challenge.steps.map((step, index) => {
            if (index !== 0) return { ...step };

            return {
                ...step,
                ...(override.prompt ? { prompt: override.prompt } : {}),
                ...(override.answers?.length ? { answers: override.answers } : {}),
                ...(override.solutionImageIds?.length ? { solutionImageIds: override.solutionImageIds } : {}),
                ...(override.controlImageIds?.length ? { controlImageIds: override.controlImageIds } : {}),
                ...(override.solutionImageDirections ? { solutionImageDirections: override.solutionImageDirections } : {}),
            };
        });
    }

    return overriddenChallenge;
}

function resolvePrompt(challenge, step, verificationSettings) {
    const override = getChallengeOverride(challenge?.id, verificationSettings);

    if (challenge?.hasPromptOverride && challenge.prompt) {
        return challenge.prompt;
    }

    return override?.prompt
        ?? step?.prompt
        ?? challenge?.prompt
        ?? 'Please answer the verification challenge.';
}

function resolveAnswers(challenge, step, verificationSettings) {
    const override = getChallengeOverride(challenge?.id, verificationSettings);

    if (challenge?.hasAnswerOverride && challenge.answers?.length) {
        return challenge.answers;
    }

    if (override?.answers?.length) {
        return override.answers;
    }

    if (step?.requiresConfiguredAnswers === true || challenge?.requiresConfiguredAnswers === true) {
        return [];
    }

    return step?.answers ?? challenge?.answers ?? [];
}

function resolveSolutionImageIds(challenge, step, verificationSettings) {
    const override = getChallengeOverride(challenge?.id, verificationSettings);

    return override?.solutionImageIds
        ?? step?.solutionImageIds
        ?? challenge?.solutionImageIds
        ?? [];
}

function resolveControlImageIds(challenge, step, verificationSettings) {
    const override = getChallengeOverride(challenge?.id, verificationSettings);

    return override?.controlImageIds
        ?? step?.controlImageIds
        ?? challenge?.controlImageIds
        ?? [];
}

function resolveSolutionImageDirections(challenge, step, verificationSettings) {
    const override = getChallengeOverride(challenge?.id, verificationSettings);

    return override?.solutionImageDirections
        ?? step?.solutionImageDirections
        ?? challenge?.solutionImageDirections
        ?? {};
}

function normalizeAnswer(answer) {
    return String(answer ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function getVerificationChallenge(challengeId) {
    if (!challengeId) return undefined;

    return verificationChallenges[challengeId];
}

function getVerificationChallengeSteps(challenge) {
    if (!challenge) return [];

    if (Array.isArray(challenge.steps) && challenge.steps.length > 0) {
        return challenge.steps;
    }

    return [
        {
            prompt: challenge.prompt,
            description: challenge.description,
            answers: challenge.answers ?? [],
            answerInputPlaceholder: challenge.answerInputPlaceholder,
            title: challenge.title,
            imageUrl: challenge.imageUrl,
            thumbnailUrl: challenge.thumbnailUrl,
            fields: challenge.fields ?? [],
            embeds: challenge.embeds ?? [],
        },
    ];
}

function getVerificationChallengeStep(challengeId, stepIndex = 0) {
    const challenge = getVerificationChallenge(challengeId);
    const steps = getVerificationChallengeSteps(challenge);

    return steps[stepIndex];
}

function hasNextVerificationChallengeStep(challengeId, stepIndex = 0) {
    const challenge = getVerificationChallenge(challengeId);
    const steps = getVerificationChallengeSteps(challenge);

    return stepIndex + 1 < steps.length;
}

function isGalleryImageChallenge(challenge) {
    const steps = Array.isArray(challenge?.steps) ? challenge.steps : [];

    return Boolean(
        (
            challenge?.renderMode === 'componentsV2Gallery'
            && (challenge.imagePoolId || steps.some((step) => step?.imagePoolId))
        )
        || steps.some((step) => (
            step?.renderMode === 'componentsV2Gallery'
            && (step.imagePoolId || challenge?.imagePoolId)
        )),
    );
}

function isRotationAlignmentGeneratedGalleryChallenge(challenge) {
    const steps = Array.isArray(challenge?.steps) ? challenge.steps : [];

    return Boolean(
        challenge?.renderMode === 'componentsV2Gallery'
        && (
            challenge?.generatedGallery?.type === 'rotationAlignment'
            || steps.some((step) => step?.generatedGallery?.type === 'rotationAlignment')
        )
    );
}

function getRotationAlignmentRequiredDirectionIds(challenge) {
    const steps = Array.isArray(challenge?.steps) ? challenge.steps : [];
    const galleries = [challenge?.generatedGallery, ...steps.map((step) => step?.generatedGallery)]
        .filter((gallery) => gallery?.type === 'rotationAlignment');
    const configuredCenterIds = steps.flatMap((step) => step?.solutionImageIds ?? []);
    const configuredOuterIds = steps.flatMap((step) => step?.controlImageIds ?? []);

    return [...new Set([
        ...(challenge?.solutionImageIds ?? []),
        ...(challenge?.controlImageIds ?? []),
        ...configuredCenterIds,
        ...configuredOuterIds,
        ...galleries.flatMap((gallery) => [
            ...(Array.isArray(gallery.centerImageIds) ? gallery.centerImageIds : []),
            ...(Array.isArray(gallery.outerImageIds) ? gallery.outerImageIds : []),
        ]),
    ])];
}

function getMissingChallengeOverrideRequirements(verificationSettings) {
    const enabledChallenges = getEnabledVerificationChallenges({ verification: verificationSettings });

    return enabledChallenges.flatMap((challenge) => {
        const override = getChallengeOverride(challenge.id, verificationSettings);
        const missing = [];
        const isRotationAlignmentGallery = isRotationAlignmentGeneratedGalleryChallenge(challenge);
        const requiresSolutionImages = challenge.requiresConfiguredSolutionImages || isGalleryImageChallenge(challenge);
        const requiresControlImages = challenge.requiresConfiguredControlImages || isGalleryImageChallenge(challenge);

        if (challenge.requiresConfiguredPrompt && !override?.prompt) {
            missing.push('prompt');
        }

        const steps = getVerificationChallengeSteps(challenge);
        const requiresTextAnswer = steps.some((step) => !shouldOmitAnswerInput(challenge, step));

        if (challenge.requiresConfiguredAnswers && requiresTextAnswer && !override?.answers?.length) {
            missing.push('answers');
        }

        if (requiresSolutionImages && !override?.solutionImageIds?.length) {
            missing.push(isRotationAlignmentGallery ? 'center images' : 'solution images');
        }

        if (requiresControlImages && !override?.controlImageIds?.length) {
            missing.push(isRotationAlignmentGallery ? 'outer images' : 'control images');
        }

        if (isRotationAlignmentGallery || challenge.requiresConfiguredSolutionImageDirections) {
            const directions = override?.solutionImageDirections ?? {};
            const missingDirectionIds = getRotationAlignmentRequiredDirectionIds(challenge)
                .filter((imageId) => !Array.isArray(directions[imageId]) || directions[imageId].length < 1);

            if (missingDirectionIds.length > 0) {
                missing.push(`solution image directions (${missingDirectionIds.join(', ')})`);
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

function hasConfiguredPrompt(challenge, step) {
    return Boolean(
        (typeof step?.prompt === 'string' && step.prompt.trim())
        || (typeof challenge?.prompt === 'string' && challenge.prompt.trim()),
    );
}

function shouldGeneratePrompt(challenge, step) {
    const generatePrompt = step?.generatePrompt ?? challenge?.generatePrompt;

    if (generatePrompt === false) {
        return false;
    }

    if (generatePrompt === 'configured') {
        return hasConfiguredPrompt(challenge, step);
    }

    return true;
}

function shouldOmitAnswerInput(challenge, step) {
    return !shouldGeneratePrompt(challenge, step)
        || step?.omitAnswerInput === true
        || challenge?.omitAnswerInput === true;
}

function validateAnswer(challengeId, answer, stepIndex = 0, verificationSettings) {
    const challenge = applyVerificationChallengeOverrides(getVerificationChallenge(challengeId), verificationSettings);
    const step = getVerificationChallengeSteps(challenge)[stepIndex];

    if (!challenge || !step) {
        return { ok: false, reason: 'not_found' };
    }

    if (shouldOmitAnswerInput(challenge, step)) {
        return { ok: true };
    }

    const normalizer = step.normalizer ?? challenge.normalizer ?? normalizeAnswer;
    const normalizedAnswer = normalizer(answer);
    const validAnswers = resolveAnswers(challenge, step, verificationSettings).map((validAnswer) => normalizer(validAnswer));

    if (validAnswers.includes(normalizedAnswer)) {
        return { ok: true };
    }

    return { ok: false, reason: 'incorrect' };
}

module.exports = {
    DEFAULT_CHALLENGE_ID,
    verificationChallenges,
    getVerificationChallenge,
    applyVerificationChallengeOverrides,
    getVerificationChallengeStep,
    getVerificationChallengeSteps,
    getMissingChallengeOverrideRequirements,
    getEnabledVerificationChallenges,
    getActiveVerificationChallenge,
    hasNextVerificationChallengeStep,
    normalizeAnswer,
    resolvePrompt,
    resolveAnswers,
    resolveSolutionImageIds,
    resolveControlImageIds,
    resolveSolutionImageDirections,
    isRotationAlignmentGeneratedGalleryChallenge,
    shouldGeneratePrompt,
    shouldOmitAnswerInput,
    validateAnswer,
};
