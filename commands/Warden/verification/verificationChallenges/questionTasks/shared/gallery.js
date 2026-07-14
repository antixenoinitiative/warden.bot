const verificationEmbedConfig = require('../../../verificationEmbedConfig.json');

function createGalleryToken() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function getPositiveInteger(value, fallback) {
    const numericValue = Number(value);

    if (!Number.isInteger(numericValue) || numericValue < 1) {
        return fallback;
    }

    return numericValue;
}

function resolveGalleryImageCounts(galleryConfigInput, challengeId) {
    const galleryConfig = verificationEmbedConfig.imageGeneration?.gallery ?? {};
    const gallerySize = Number(galleryConfigInput?.gallerySize ?? getPositiveInteger(galleryConfig.defaultSize, 6));
    const solutionRange = galleryConfigInput?.solutionImageCount ?? { min: 1, max: 1 };
    const controlRange = galleryConfigInput?.controlImageCount;

    if (!Number.isInteger(gallerySize) || gallerySize < 1) {
        throw new Error(`Invalid gallery size for challenge ${challengeId}: ${gallerySize}`);
    }

    const solutionMin = Math.ceil(Number(solutionRange.min ?? 1));
    const solutionMax = Math.floor(Number(solutionRange.max ?? 1));
    const controlMin = controlRange ? Math.ceil(Number(controlRange.min ?? 0)) : 0;
    const controlMax = controlRange ? Math.floor(Number(controlRange.max ?? gallerySize)) : gallerySize;
    const validSolutionCounts = [];

    for (let solutionCount = solutionMin; solutionCount <= solutionMax; solutionCount += 1) {
        const controlCount = gallerySize - solutionCount;

        if (solutionCount >= 1 && controlCount >= 0 && controlCount >= controlMin && controlCount <= controlMax) {
            validSolutionCounts.push(solutionCount);
        }
    }

    if (validSolutionCounts.length < 1) {
        throw new Error(`No valid solution/control image count combination exists for challenge ${challengeId}.`);
    }

    const solutionCount = validSolutionCounts[Math.floor(Math.random() * validSolutionCounts.length)];
    const controlCount = gallerySize - solutionCount;

    return { gallerySize, solutionCount, controlCount };
}

function getPoolImagesByIds(imagePool, imageIds, roleName, challengeId) {
    const imageMap = new Map((imagePool.images ?? []).map((image) => [image.id, image]));
    const images = [];

    for (const imageId of imageIds) {
        const image = imageMap.get(imageId);
        if (!image) {
            throw new Error(`Verification challenge "${challengeId}" references unknown ${roleName} image ID "${imageId}" in pool "${imagePool.id}".`);
        }

        images.push({
            ...image,
            role: roleName,
        });
    }

    return images;
}

function getQuestionGeneratedImage(question) {
    const generatedImage = {
        ...(question?.generatedImage ?? {}),
    };

    if (generatedImage.config && typeof generatedImage.config === 'object') {
        Object.assign(generatedImage, generatedImage.config);
    }

    return generatedImage;
}

function getRoleImageIds(generatedImage, role) {
    return Array.isArray(generatedImage?.imageIds?.[role]) ? generatedImage.imageIds[role] : [];
}

module.exports = {
    createGalleryToken,
    resolveGalleryImageCounts,
    getPoolImagesByIds,
    getQuestionGeneratedImage,
    getRoleImageIds,
};
