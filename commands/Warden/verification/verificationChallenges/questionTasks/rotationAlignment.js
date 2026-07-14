const {
    createGalleryToken,
    resolveGalleryImageCounts,
    getPoolImagesByIds,
    getQuestionGeneratedImage,
    getRoleImageIds,
} = require('./shared/gallery');

const {
    DEFAULT_ROTATION_ALIGNMENT_DEGREES,
    normalizeDegrees,
    getDegreeList,
    hasDirection,
    getWorldDirections,
} = require('./shared/degrees');

const {
    shuffleArray,
    pickRandomItem,
    pickRandomItems,
} = require('./shared/random');

function getRotationAlignmentDirections(imageDirections, imageId, challengeId) {
    const directions = getDegreeList(imageDirections?.[imageId], []);

    if (directions.length < 1) {
        throw new Error(`Verification challenge "${challengeId}" has no configured image directions for "${imageId}".`);
    }

    return directions;
}

function pickClockPositionDegrees(clockDegrees, gallerySize, maxRepeats) {
    const normalizedClockDegrees = [...new Set(clockDegrees ?? [])];
    const limit = Math.max(1, Math.floor(Number(maxRepeats ?? gallerySize)));

    if (normalizedClockDegrees.length < 1) {
        throw new Error('Rotation-alignment gallery requires at least one clock position degree.');
    }

    const capacity = normalizedClockDegrees.length * limit;
    if (capacity < gallerySize) {
        throw new Error(`Rotation-alignment gallery does not have enough clock-position capacity. Required ${gallerySize}, capacity ${capacity}. Increase maxImageOrientationRepeats or add clock positions.`);
    }

    const counts = new Map();
    const selected = [];

    for (let index = 0; index < gallerySize; index += 1) {
        const available = normalizedClockDegrees.filter((degrees) => (counts.get(degrees) ?? 0) < limit);
        const degrees = pickRandomItem(available);
        counts.set(degrees, (counts.get(degrees) ?? 0) + 1);
        selected.push(degrees);
    }

    return selected;
}

function isRotationAlignmentCorrect({
    clockPositionDegrees,
    centerRotationDegrees,
    outerRotationDegrees,
    centerDirections,
    outerDirections,
    alignmentRule,
}) {
    const requiredCenterWorldDirection = normalizeDegrees(clockPositionDegrees + alignmentRule.centerTargetOffsetDegrees);
    const requiredOuterWorldDirection = normalizeDegrees(clockPositionDegrees + alignmentRule.outerTargetOffsetDegrees);

    return hasDirection(getWorldDirections(centerDirections, centerRotationDegrees), requiredCenterWorldDirection)
        && hasDirection(getWorldDirections(outerDirections, outerRotationDegrees), requiredOuterWorldDirection);
}

function createCorrectRotationAlignmentRotations(clockPositionDegrees, centerDirections, outerDirections, alignmentRule) {
    const centerDirection = pickRandomItem(centerDirections);
    const outerDirection = pickRandomItem(outerDirections);

    return {
        centerRotationDegrees: normalizeDegrees(clockPositionDegrees + alignmentRule.centerTargetOffsetDegrees - centerDirection),
        outerRotationDegrees: normalizeDegrees(clockPositionDegrees + alignmentRule.outerTargetOffsetDegrees - outerDirection),
    };
}

function createIncorrectRotationAlignmentRotations(clockPositionDegrees, centerDirections, outerDirections, alignmentRule, rotationDegrees) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const rotations = {
            centerRotationDegrees: pickRandomItem(rotationDegrees),
            outerRotationDegrees: pickRandomItem(rotationDegrees),
        };

        if (!isRotationAlignmentCorrect({ clockPositionDegrees, ...rotations, centerDirections, outerDirections, alignmentRule })) {
            return rotations;
        }
    }

    const correct = createCorrectRotationAlignmentRotations(clockPositionDegrees, centerDirections, outerDirections, alignmentRule);

    for (const offset of DEFAULT_ROTATION_ALIGNMENT_DEGREES.slice(1)) {
        const rotations = {
            ...correct,
            outerRotationDegrees: normalizeDegrees(correct.outerRotationDegrees + offset),
        };

        if (!isRotationAlignmentCorrect({ clockPositionDegrees, ...rotations, centerDirections, outerDirections, alignmentRule })) {
            return rotations;
        }
    }

    throw new Error('Unable to generate an incorrect rotation-alignment control tile.');
}

function createGalleryState(question, context) {
    const generatedImage = getQuestionGeneratedImage(question);
    const { challengeId, getVerificationImagePool } = context;
    const imagePoolId = generatedImage.imagePoolId;
    const imagePool = getVerificationImagePool(imagePoolId);

    if (!imagePool) {
        throw new Error(`Unknown verification image pool "${imagePoolId}" for challenge "${challengeId}" question "${question.id}".`);
    }

    const { gallerySize, solutionCount } = resolveGalleryImageCounts(generatedImage, challengeId);
    const centerImageIds = getRoleImageIds(generatedImage, 'center');
    const outerImageIds = getRoleImageIds(generatedImage, 'outer');
    const rotationAlignment = generatedImage.rotationAlignment ?? generatedImage;
    const rotationDegrees = getDegreeList(rotationAlignment.rotationDegrees);
    const clockDegrees = getDegreeList(rotationAlignment.clockPositionDegrees);
    const alignmentRule = {
        centerTargetOffsetDegrees: normalizeDegrees(rotationAlignment.alignmentRule?.centerTargetOffsetDegrees ?? 0),
        outerTargetOffsetDegrees: normalizeDegrees(rotationAlignment.alignmentRule?.outerTargetOffsetDegrees ?? 180),
    };
    const imageDirections = generatedImage.imageDirections ?? {};
    const token = createGalleryToken();
    const solutionIndexes = new Set(pickRandomItems([...Array(gallerySize).keys()], solutionCount, 'solution tile indexes'));
    const clockPositions = pickClockPositionDegrees(clockDegrees, gallerySize, rotationAlignment.maxImageOrientationRepeats);
    const generatedImages = [];

    if (centerImageIds.length < 1) {
        throw new Error(`Verification challenge "${challengeId}" question "${question.id}" requires center image IDs for rotation-alignment galleries.`);
    }

    if (outerImageIds.length < 1) {
        throw new Error(`Verification challenge "${challengeId}" question "${question.id}" requires outer image IDs for rotation-alignment galleries.`);
    }

    getPoolImagesByIds(imagePool, centerImageIds, 'center', challengeId);
    getPoolImagesByIds(imagePool, outerImageIds, 'outer', challengeId);

    for (let index = 0; index < gallerySize; index += 1) {
        const centerImageId = pickRandomItem(centerImageIds);
        const outerImageId = pickRandomItem(outerImageIds);
        const centerDirections = getRotationAlignmentDirections(imageDirections, centerImageId, challengeId);
        const outerDirections = getRotationAlignmentDirections(imageDirections, outerImageId, challengeId);
        const clockPositionDegrees = clockPositions[index];
        const isSolution = solutionIndexes.has(index);
        const rotations = isSolution
            ? createCorrectRotationAlignmentRotations(clockPositionDegrees, centerDirections, outerDirections, alignmentRule)
            : createIncorrectRotationAlignmentRotations(clockPositionDegrees, centerDirections, outerDirections, alignmentRule, rotationDegrees);

        generatedImages.push({
            id: `rotation-alignment-${token}-${index}`,
            role: isSolution ? 'solution' : 'control',
            generatedTile: {
                type: 'rotationAlignment',
                imagePoolId,
                centerImageId,
                outerImageId,
                clockPositionDegrees,
                centerRotationDegrees: rotations.centerRotationDegrees,
                outerRotationDegrees: rotations.outerRotationDegrees,
                tileCanvas: rotationAlignment.tileCanvas,
            },
        });
    }

    const selectedImages = shuffleArray(generatedImages).map((image, index) => ({
        ...image,
        position: index + 1,
    }));

    return {
        token,
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
        type: 'gallery-rotation-alignment',
        galleryState,
        displayItems: context.helpers.getGalleryDisplayImages(galleryState),
    };
    asset.files = context.helpers.getQuestionAssetFiles(asset);
    return asset;
}

module.exports = {
    type: 'gallery-rotation-alignment',
    label: 'Rotation Alignment',
    createGalleryState,
    prepareAsset,
    isRotationAlignmentCorrect,
};
