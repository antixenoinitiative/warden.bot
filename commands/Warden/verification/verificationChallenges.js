/**
 * Warden verification challenge registry.
 *
 * Verification challenges can be single-step or multi-step. Single-step challenges may define
 * `prompt`/`answers` directly. Multi-step challenges should define `steps`, where each step can
 * contain:
 * - `prompt`: user-facing question, riddle, or challenge text.
 * - `description`: optional description text used before the prompt.
 * - `answers`: accepted answers for that step.
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
 * 3. Add every accepted answer to `answers`; answers are normalized with `normalizeAnswer`
 *    unless the challenge defines a custom `normalizer`.
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
    eliteStarterShipGallery: {
        id: 'eliteStarterShipGallery',
        enabled: false,
        renderMode: 'componentsV2Gallery',
        imagePoolId: 'eliteStarterShips_c',
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
                positionInputLabel: 'Image position(s) (1-9)',
                positionInputPlaceholder: 'Enter their number. If multiple, seperate by commas or spaces',
            },
        ],
    },
    eliteStarterShipGalleryObfuscatedPrompt: {
        id: 'eliteStarterShipGalleryObfuscatedPrompt',
        enabled: false,
        renderMode: 'componentsV2Gallery',
        promptImageGallery: true,
        compositeImageGallery: true,
        imagePoolId: 'eliteStarterShips_c',
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
                positionInputLabel: 'Image position(s) (1-9)',
                positionInputPlaceholder: 'Enter their number. If multiple, seperate by commas or spaces',
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

function getEnabledVerificationChallenges(config) {
    const configuredChallengeIds = config?.verification?.activeChallengeIds
        ?? config?.activeChallengeIds;

    if (Array.isArray(configuredChallengeIds) && configuredChallengeIds.length > 0) {
        return configuredChallengeIds
            .map((challengeId) => getVerificationChallenge(challengeId))
            .filter(Boolean);
    }

    const legacyChallengeId = config?.verification?.activeChallengeId
        ?? config?.verification?.challengeId
        ?? config?.activeChallengeId
        ?? config?.challengeId;

    if (legacyChallengeId) {
        return [getVerificationChallenge(legacyChallengeId) ?? getVerificationChallenge(DEFAULT_CHALLENGE_ID)];
    }

    return Object.values(verificationChallenges).filter((challenge) => challenge.enabled);
}

function getActiveVerificationChallenge(config) {
    return getEnabledVerificationChallenges(config)[0] ?? getVerificationChallenge(DEFAULT_CHALLENGE_ID);
}

function validateAnswer(challengeId, answer, stepIndex = 0) {
    const challenge = getVerificationChallenge(challengeId);
    const step = getVerificationChallengeStep(challengeId, stepIndex);

    if (!challenge || !step) {
        return { ok: false, reason: 'not_found' };
    }

    const normalizer = step.normalizer ?? challenge.normalizer ?? normalizeAnswer;
    const normalizedAnswer = normalizer(answer);
    const validAnswers = (step.answers ?? []).map((validAnswer) => normalizer(validAnswer));

    if (validAnswers.includes(normalizedAnswer)) {
        return { ok: true };
    }

    return { ok: false, reason: 'incorrect' };
}

module.exports = {
    DEFAULT_CHALLENGE_ID,
    verificationChallenges,
    getVerificationChallenge,
    getVerificationChallengeStep,
    getVerificationChallengeSteps,
    getEnabledVerificationChallenges,
    getActiveVerificationChallenge,
    hasNextVerificationChallengeStep,
    normalizeAnswer,
    validateAnswer,
};
