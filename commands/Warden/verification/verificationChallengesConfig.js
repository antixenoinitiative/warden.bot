/**
 * Static verification challenge definitions only.
 *
 * Parent challenge fields describe challenge-level metadata: id, enabled, title,
 * description, fields, and questions. Verification logic belongs inside each
 * question through generatedImage and answer settings. Runtime normalization,
 * screen planning, DB overrides, and validation live in verificationChallenges.js.
 */
const DEFAULT_CHALLENGE_ID = 'placeholder';

const starterShipAnswers = ['sidewinder', 'sidewinder mk i', 'sidewinder mki', 'sidewinder mk1', 'sidewindermki', 'sidewindermk1', 'sidewinder mk.i', 'sidewinder mk.1'];

const rotationAlignmentConfig = {
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
};

const verificationChallenges = {
    [DEFAULT_CHALLENGE_ID]: {
        id: DEFAULT_CHALLENGE_ID,
        enabled: true,
        title: 'Verification Challenge',
        description: 'Type the required verification text.',
        fields: [
            {
                title: 'Answer format',
                content: 'Enter the three letters shown in the prompt.',
                inline: false,
            },
        ],
        questions: [
            {
                id: 'axi-text',
                label: 'Question 1',
                text: 'Type "AXI" to verify.',
                separateStep: false,
                generatedImage: { enabled: false, type: 'none' },
                answer: {
                    required: true,
                    type: 'text',
                    accepted: ['axi'],
                    inputLabel: 'Verification answer',
                    inputPlaceholder: 'Enter the three letters shown in the prompt.',
                },
            },
        ],
    },
    multiFieldExample: {
        id: 'multiFieldExample',
        enabled: false,
        title: 'Multi-field Verification Challenge',
        description: 'Review the information below, then answer the prompt.',
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
        questions: [
            {
                id: 'axi-name',
                label: 'Question 1',
                text: 'What three-letter group does this server stand for?',
                separateStep: false,
                generatedImage: {
                    enabled: true,
                    type: 'static-image',
                    url: 'https://antixenoinitiative.com/wp-content/uploads/2024/09/cropped-AXI_Logo_New2.png',
                },
                answer: {
                    required: true,
                    type: 'text',
                    accepted: ['axi', 'anti-xeno initiative', 'antixenoinitiative'],
                    inputLabel: 'Verification answer',
                    inputPlaceholder: 'Enter your answer here',
                },
            },
        ],
    },
    eliteVesselGallery: {
        id: 'eliteVesselGallery',
        enabled: false,
        title: 'Verification Challenge',
        description: 'Answer both questions below.',
        questions: [
            {
                id: 'starter-ship-name',
                label: 'Question 1',
                text: 'What is the name of the starter ship in Elite Dangerous?',
                separateStep: false,
                generatedImage: { enabled: false, type: 'none' },
                answer: {
                    required: true,
                    type: 'text',
                    accepted: starterShipAnswers,
                    inputLabel: 'Verification answer',
                    inputPlaceholder: 'Enter the ship name',
                },
            },
            {
                id: 'starter-ship-gallery',
                label: 'Question 2',
                text: 'Find all images depicting the starter ship. It may be multiple. Remember their position in the order.',
                separateStep: false,
                generatedImage: {
                    enabled: true,
                    type: 'gallery-standard',
                    imagePoolId: 'eliteVessels_c',
                    gallerySize: 9,
                    solutionImageCount: { min: 1, max: 2 },
                    maxControlImageRepeats: 2,
                    compositeImageGallery: false,
                },
                answer: {
                    required: true,
                    type: 'positions',
                    inputLabel: 'Image position(s) (1-9)',
                    inputPlaceholder: 'Enter their number. If multiple, seperate by commas or spaces',
                },
            },
        ],
    },
    eliteVesselGalleryEnhanced: {
        id: 'eliteVesselGalleryEnhanced',
        enabled: false,
        title: 'Verification Challenge',
        description: 'Answer both questions below.',
        questions: [
            {
                id: 'configured-object-name',
                label: 'Question 1',
                text: 'What is the name of the following object from Elite Dangerous?',
                separateStep: false,
                generatedImage: {
                    enabled: true,
                    type: 'prompt-text',
                    requiresConfiguredText: true,
                },
                answer: {
                    required: true,
                    type: 'text',
                    requiresConfiguredAnswers: true,
                    inputLabel: 'Verification answer',
                    inputPlaceholder: 'Enter the object name',
                },
            },
            {
                id: 'configured-object-gallery',
                label: 'Question 2',
                text: 'Find all images depicting the object we are looking for. It may be multiple. Remember their tag number.',
                separateStep: false,
                generatedImage: {
                    enabled: true,
                    type: 'gallery-standard',
                    imagePoolId: 'eliteVessels_c_local',
                    gallerySize: 9,
                    compositeImageGallery: true,
                    solutionImageCount: { min: 1, max: 2 },
                    maxControlImageRepeats: 2,
                    requiresConfiguredImageIds: true,
                },
                answer: {
                    required: true,
                    type: 'positions',
                    inputLabel: 'Image tags (1-9)',
                    inputPlaceholder: 'Enter their number. If multiple, seperate by commas or spaces',
                },
            },
        ],
    },
    onTheBlueDanube: {
        id: 'onTheBlueDanube',
        enabled: false,
        title: 'Verification Challenge',
        description: 'Look carefully at the generated imagery.',
        questions: [
            {
                id: 'danube-prompt-text',
                label: 'Question 1',
                text: 'Which image shows its objects perfectly aligned to [...] ?',
                separateStep: false,
                generatedImage: {
                    enabled: true,
                    type: 'prompt-text',
                    requiresConfiguredText: true,
                },
                answer: {
                    required: true,
                    type: 'text',
                    requiresConfiguredAnswers: true,
                    inputLabel: 'Verification answer',
                    inputPlaceholder: 'Repeat whats written in the first image.',
                },
            },
            {
                id: 'danube-rotation-gallery',
                label: 'Question 2',
                text: 'Find what we are looking for. Note the tag number.',
                separateStep: false,
                generatedImage: {
                    enabled: true,
                    type: 'gallery-rotation-alignment',
                    imagePoolId: 'eliteRotationAlignmentAssets',
                    gallerySize: 6,
                    compositeImageGallery: true,
                    solutionImageCount: { min: 1, max: 1 },
                    requiresConfiguredImageIds: true,
                    requiresConfiguredImageDirections: true,
                    rotationAlignment: rotationAlignmentConfig,
                },
                answer: {
                    required: true,
                    type: 'positions',
                    inputLabel: 'Image tag (1-9)',
                    inputPlaceholder: 'Enter one number only',
                },
            },
        ],
    },
};

module.exports = {
    DEFAULT_CHALLENGE_ID,
    verificationChallenges,
};
