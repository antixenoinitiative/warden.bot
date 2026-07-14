const {
    createGalleryToken,
    resolveGalleryImageCounts,
    getPoolImagesByIds,
    getQuestionGeneratedImage,
    getRoleImageIds,
} = require('./shared/gallery');

const {
    shuffleArray,
    pickRandomItemsWithRepeats,
    pickRandomItemsWithRepeatLimit,
} = require('./shared/random');

function createGalleryState(question, context) {
    const generatedImage = getQuestionGeneratedImage(question);
    const { challengeId, getVerificationImagePool } = context;
    const imagePoolId = generatedImage.imagePoolId;
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
    createGalleryState,
    prepareAsset,
};
