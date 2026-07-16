const {
    createGalleryToken,
    resolveGalleryImageCountOptions,
    resolveGalleryImageCounts,
    getPoolImagesByIds,
    getGalleryAttachmentCount,
    getImagePoolId,
    getQuestionGeneratedImage,
    getRoleImageIds,
    validateGalleryPoolReferences,
} = require('./shared/gallery');

const {
    shuffleArray,
    pickRandomItemsWithRepeats,
    pickRandomItemsWithRepeatLimit,
} = require('./shared/random');

const GALLERY_ROLES = [
    { role: 'solution', label: 'Solution image IDs', missingCode: 'missing_solution_image_ids' },
    { role: 'control', label: 'Control image IDs', missingCode: 'missing_control_image_ids' },
];

function validateConfig(question, context) {
    const generatedImage = getQuestionGeneratedImage(question);
    const validation = validateGalleryPoolReferences(generatedImage, {
        ...context,
        questionId: question.id,
    }, GALLERY_ROLES);
    const issues = [...validation.issues];
    let countOptions;

    try {
        countOptions = resolveGalleryImageCountOptions(generatedImage, context.challengeId);
    }
    catch (err) {
        issues.push({
            code: 'invalid_gallery_counts',
            field: 'generatedImage.gallerySize',
            label: 'Gallery image counts',
            message: `${context.challengeId}/${question.id}: ${err.message}`,
        });
    }

    const configuredRepeatLimit = generatedImage.maxControlImageRepeats ?? 1;
    const maxControlImageRepeats = Math.floor(Number(configuredRepeatLimit));
    if (!Number.isInteger(maxControlImageRepeats) || maxControlImageRepeats < 1) {
        issues.push({
            code: 'invalid_control_image_repeat_limit',
            field: 'generatedImage.maxControlImageRepeats',
            label: 'Control image repeat limit',
            message: `${context.challengeId}/${question.id}: Control image repeat limit must be a positive integer.`,
        });
    }
    else if (countOptions && validation.roleIds.control.length > 0) {
        const maximumControlCount = Math.max(...countOptions.validSolutionCounts
            .map((solutionCount) => countOptions.gallerySize - solutionCount));
        const controlCapacity = validation.roleIds.control.length * maxControlImageRepeats;
        if (controlCapacity < maximumControlCount) {
            issues.push({
                code: 'insufficient_control_image_capacity',
                field: 'generatedImage.maxControlImageRepeats',
                label: 'Control image capacity',
                message: `${context.challengeId}/${question.id}: Control images provide ${controlCapacity} slot${controlCapacity === 1 ? '' : 's'}, but this gallery can require ${maximumControlCount}.`,
            });
        }
    }

    return issues;
}

function createGalleryState(question, context) {
    const generatedImage = getQuestionGeneratedImage(question);
    const { challengeId, getVerificationImagePool } = context;
    const imagePoolId = getImagePoolId(generatedImage);
    const imagePool = getVerificationImagePool(imagePoolId);

    if (!imagePool) {
        throw new Error(`Unknown verification image pool "${imagePoolId}" for challenge "${challengeId}" question "${question.id}".`);
    }

    const { solutionCount, controlCount } = resolveGalleryImageCounts(generatedImage, challengeId);
    const solutionIds = getRoleImageIds(generatedImage, 'solution');
    const controlIds = getRoleImageIds(generatedImage, 'control');

    if (question.answer?.type === 'positions' && solutionIds.length < 1) {
        throw new Error(`Verification challenge "${challengeId}" question "${question.id}" has no configured solution image IDs.`);
    }

    if (controlIds.length < 1) {
        throw new Error(`Verification challenge "${challengeId}" question "${question.id}" has no configured control image IDs.`);
    }

    const solutionImages = getPoolImagesByIds(imagePool, solutionIds, 'solution', challengeId);
    const controlImages = getPoolImagesByIds(imagePool, controlIds, 'control', challengeId);
    const maxControlImageRepeats = generatedImage.maxControlImageRepeats ?? 1;
    const selectedImages = shuffleArray([
        ...pickRandomItemsWithRepeats(solutionImages, solutionCount, 'solution'),
        ...pickRandomItemsWithRepeatLimit(controlImages, controlCount, maxControlImageRepeats, 'control'),
    ]).map((image, index) => ({
        ...image,
        directory: imagePool.directory,
        position: index + 1,
    }));

    return {
        token: createGalleryToken(),
        imagePoolId,
        selectedImages,
        useCompositeImage: generatedImage.compositeImageGallery === true,
        solutionPositions: selectedImages
            .filter((image) => image.role === 'solution')
            .map((image) => image.position)
            .sort((left, right) => left - right),
    };
}

async function prepareAsset(question, context) {
    const galleryState = await context.helpers.prepareGalleryImageAttachments(createGalleryState(question, context));
    const asset = {
        type: 'gallery-standard',
        galleryState,
        displayItems: context.helpers.getGalleryDisplayImages(galleryState),
    };
    asset.files = context.helpers.getQuestionAssetFiles(asset);
    return asset;
}

module.exports = {
    type: 'gallery-standard',
    label: 'Standard Gallery',
    providesPositionAnswers: true,
    getAttachmentCount: getGalleryAttachmentCount,
    validateConfig,
    createGalleryState,
    prepareAsset,
};
