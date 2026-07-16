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

function resolveGalleryImageCountOptions(galleryConfigInput, challengeId) {
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

    return { gallerySize, validSolutionCounts };
}

function resolveGalleryImageCounts(galleryConfigInput, challengeId) {
    const { gallerySize, validSolutionCounts } = resolveGalleryImageCountOptions(galleryConfigInput, challengeId);

    const solutionCount = validSolutionCounts[Math.floor(Math.random() * validSolutionCounts.length)];
    const controlCount = gallerySize - solutionCount;

    return { gallerySize, solutionCount, controlCount };
}

function getPoolImagesByIds(imagePool, imageIds, roleName, challengeId) {
    const imageMap = new Map((imagePool.images ?? []).map((image) => [String(image.id), image]));
    const images = [];

    for (const imageId of [...new Set((imageIds ?? []).map(String))]) {
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

function getUnknownPoolImageIds(imagePool, imageIds) {
    const availableImageIds = new Set((imagePool?.images ?? []).map((image) => String(image.id)));
    return [...new Set((imageIds ?? []).map(String))].filter((imageId) => !availableImageIds.has(imageId));
}

function getImagePoolId(generatedImage) {
    return String(generatedImage?.imagePoolId ?? '').trim();
}

function validateGalleryPoolReferences(generatedImage, context, roles) {
    const { challengeId, questionId, getVerificationImagePool } = context;
    const prefix = `${challengeId}/${questionId}`;
    const imagePoolId = getImagePoolId(generatedImage);
    const roleIds = Object.fromEntries(roles.map(({ role }) => [role, getRoleImageIds(generatedImage, role).map(String)]));
    const issues = [];

    if (!imagePoolId) {
        issues.push({
            code: 'missing_image_pool',
            field: 'generatedImage.imagePoolId',
            label: 'Image pool',
            message: `${prefix}: Gallery task requires an image pool.`,
        });
    }

    const imagePool = imagePoolId ? getVerificationImagePool?.(imagePoolId) : undefined;
    if (imagePoolId && !imagePool) {
        issues.push({
            code: 'unknown_image_pool',
            field: 'generatedImage.imagePoolId',
            label: 'Image pool',
            message: `${prefix}: Unknown verification image pool "${imagePoolId}".`,
        });
    }

    for (const { role, label, missingCode } of roles) {
        const imageIds = roleIds[role];
        if (imageIds.length < 1) {
            issues.push({
                code: missingCode,
                field: `generatedImage.imageIds.${role}`,
                label,
                message: `${prefix}: Gallery task requires ${label.toLowerCase()}.`,
            });
            continue;
        }

        if (!imagePool) continue;
        const unknownImageIds = getUnknownPoolImageIds(imagePool, imageIds);
        if (unknownImageIds.length > 0) {
            issues.push({
                code: `unknown_${role}_image_ids`,
                field: `generatedImage.imageIds.${role}`,
                label,
                message: `${prefix}: Unknown ${role} image ID${unknownImageIds.length === 1 ? '' : 's'} in pool "${imagePoolId}": ${unknownImageIds.join(', ')}.`,
            });
        }
    }

    return { issues, imagePool, roleIds };
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

function getGalleryAttachmentCount(question) {
    const generatedImage = getQuestionGeneratedImage(question);
    try {
        const { gallerySize } = resolveGalleryImageCountOptions(generatedImage, question?.id ?? 'unknown');
        return generatedImage.compositeImageGallery === true ? 1 : gallerySize;
    }
    catch (err) {
        return 0;
    }
}

function getRoleImageIds(generatedImage, role) {
    return Array.isArray(generatedImage?.imageIds?.[role])
        ? [...new Set(generatedImage.imageIds[role].map(String))]
        : [];
}

module.exports = {
    createGalleryToken,
    resolveGalleryImageCountOptions,
    resolveGalleryImageCounts,
    getPoolImagesByIds,
    getUnknownPoolImageIds,
    getImagePoolId,
    validateGalleryPoolReferences,
    getQuestionGeneratedImage,
    getGalleryAttachmentCount,
    getRoleImageIds,
};
