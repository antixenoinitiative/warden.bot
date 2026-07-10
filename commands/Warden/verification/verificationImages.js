const Discord = require('discord.js');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const fetch = require('node-fetch');
const {
    getVerificationChallengeStep,
    resolvePrompt,
    resolveSolutionImageIds,
    resolveControlImageIds,
} = require('./verificationChallenges');


/**
 * Reusable image pools for verification gallery challenges.
 *
 * Each pool can be referenced by one or more verification challenges. Public pool entries
 * are neutral image inventory only. Per-challenge solution/control mappings live in DB
 * challenge overrides. Pools with `directory` read local image `fileName` entries from
 * that directory.
 *
 * Keep URLs and any displayed metadata neutral. Discord clients receive them.
 * - Changed code so images are turned into discordapp attachments before transmitting,
 * this will obscure image URLs atlest.
 */
const verificationImagesRegistry = {
    
    eliteVessels_c: {
        id: 'eliteVessels_c',
        description: 'Elite Dangerous vessel img pool for verification challenges.',
        images: [
            {
                id: 'ev8',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel8_c.png',
            },
            {
                id: 'ev1',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel1_c.png',
            },
            {
                id: 'ev2',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel2_c.png',
            },
            {
                id: 'ev3',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel3_c.png',
            },
            {
                id: 'ev9',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel9_c.png',
            },
            {
                id: 'ev4',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel4_c.png',
            },
            {
                id: 'ev5',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel5_c.png',
            },
            {
                id: 'ev6',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel6_c.png',
            },
            {
                id: 'ev10',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel10_c.png',
            },
            {
                id: 'ev7',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel7_c.png',
            },
        ],
    },
    eliteVessels_c_local: {
        id: 'eliteVessels_c_local',
        description: 'Local Elite Dangerous vessel img pool for verification challenges.',
        directory: '/home/container/verificationPool/',
        images: [
            {
                id: 'elitevessel8',
                fileName: 'elitevessel8_c.png',
            },
            {
                id: 'elitevessel1',
                fileName: 'elitevessel1_c.png',
            },
            {
                id: 'elitevessel2',
                fileName: 'elitevessel2_c.png',
            },
            {
                id: 'elitevessel3',
                fileName: 'elitevessel3_c.png',
            },
            {
                id: 'elitevessel9',
                fileName: 'elitevessel9_c.png',
            },
            {
                id: 'elitevessel4',
                fileName: 'elitevessel4_c.png',
            },
            {
                id: 'elitevessel5',
                fileName: 'elitevessel5_c.png',
            },
            {
                id: 'elitevessel6',
                fileName: 'elitevessel6_c.png',
            },
            {
                id: 'elitevessel10',
                fileName: 'elitevessel10_c.png',
            },
            {
                id: 'elitevessel7',
                fileName: 'elitevessel7_c.png',
            },
        ],
    },
};

let canvasApi;

function getCanvasApi() {
    if (!canvasApi) {
        canvasApi = require('@napi-rs/canvas');
    }

    return canvasApi;
}

const DEFAULT_GALLERY_SIZE = 6;
const GALLERY_IMAGE_ATTACHMENT_NAME_PREFIX = 'warden-gallery';
const GALLERY_IMAGE_FETCH_TIMEOUT_MS = 10000;
const GALLERY_IMAGE_FETCH_TIMEOUT_CODE = 'VERIFICATION_GALLERY_IMAGE_FETCH_TIMEOUT';
const GALLERY_COMPOSITE_ATTACHMENT_NAME_PREFIX = 'warden-gallery-grid';
const GALLERY_COMPOSITE_GRID_COLUMNS = 3;
const GALLERY_COMPOSITE_TILE_SIZE = 320;
const GALLERY_COMPOSITE_LABEL_PADDING = 16;
const GALLERY_COMPOSITE_LABEL_SIZE = 72;
const PROMPT_IMAGE_ATTACHMENT_NAME_PREFIX = 'warden-prompt';
const PROMPT_IMAGE_WIDTH = 960;
const PROMPT_IMAGE_MIN_HEIGHT = 320;
const PROMPT_IMAGE_PADDING = 54;
const PROMPT_IMAGE_FONT_SIZE = 54;
const PROMPT_IMAGE_LINE_HEIGHT = 74;
const PROMPT_IMAGE_CURVE_NOISE_COUNT = 170;
const PROMPT_IMAGE_PIXEL_NOISE_COUNT = 3200;
const PROMPT_IMAGE_DECOY_GLYPH_COUNT = 160;
const PROMPT_IMAGE_OCCLUSION_LINE_COUNT = 26;
const PROMPT_IMAGE_MAX_CHARACTER_ROTATION = 0.18;
const PROMPT_IMAGE_CHARACTER_JITTER = 7;
const PROMPT_IMAGE_PALETTES = [
    { background: ['#07111f', '#14213d', '#0b1020'], curve: ['#76d7ff', '#f5b7ff'], glyph: ['#d9f3ff', '#ffd9fb'], stroke: 'rgba(118, 215, 255, 0.70)' },
    { background: ['#1c0b2b', '#3d145c', '#10091f'], curve: ['#ff9cf5', '#8ad8ff'], glyph: ['#ffe2fb', '#d8f4ff'], stroke: 'rgba(255, 156, 245, 0.70)' },
    { background: ['#06261d', '#115740', '#071611'], curve: ['#8dffcc', '#ffe08a'], glyph: ['#dcfff0', '#fff2cc'], stroke: 'rgba(141, 255, 204, 0.70)' },
    { background: ['#2b1608', '#5a3112', '#120904'], curve: ['#ffcf8a', '#8ac7ff'], glyph: ['#fff1d8', '#d8ecff'], stroke: 'rgba(255, 207, 138, 0.70)' },
    { background: ['#25110f', '#5b1f2d', '#120708'], curve: ['#ff8aa8', '#ffd36e'], glyph: ['#ffe0e7', '#fff0c5'], stroke: 'rgba(255, 138, 168, 0.70)' },
];

function createPromptImageNonce() {
    return crypto.randomBytes(12).toString('hex');
}

function buildPromptImageAttachmentName() {
    return `${PROMPT_IMAGE_ATTACHMENT_NAME_PREFIX}-${createPromptImageNonce()}.png`;
}

function wrapCanvasText(context, text, maxWidth) {
    const words = String(text ?? '').split(/\s+/).filter(Boolean);
    const lines = [];
    let currentLine = '';

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (context.measureText(testLine).width <= maxWidth || !currentLine) {
            currentLine = testLine;
        }
        else {
            lines.push(currentLine);
            currentLine = word;
        }
    }

    if (currentLine) {
        lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [''];
}

function pickPromptImagePalette() {
    return PROMPT_IMAGE_PALETTES[Math.floor(Math.random() * PROMPT_IMAGE_PALETTES.length)];
}

function drawPromptImageNoise(context, width, height, palette) {
    for (let index = 0; index < PROMPT_IMAGE_CURVE_NOISE_COUNT; index += 1) {
        context.save();
        context.globalAlpha = 0.16 + Math.random() * 0.26;
        context.strokeStyle = palette.curve[index % palette.curve.length];
        context.lineWidth = 1 + Math.random() * 5;
        context.beginPath();
        context.moveTo(Math.random() * width, Math.random() * height);
        context.bezierCurveTo(
            Math.random() * width,
            Math.random() * height,
            Math.random() * width,
            Math.random() * height,
            Math.random() * width,
            Math.random() * height,
        );
        context.stroke();
        context.restore();
    }

    for (let index = 0; index < PROMPT_IMAGE_PIXEL_NOISE_COUNT; index += 1) {
        context.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.20)';
        context.fillRect(Math.random() * width, Math.random() * height, 1 + Math.random() * 4, 1 + Math.random() * 4);
    }
}

function drawPromptDecoyGlyphs(context, width, height, palette) {
    const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789?/#%&';

    for (let index = 0; index < PROMPT_IMAGE_DECOY_GLYPH_COUNT; index += 1) {
        const glyph = glyphs[Math.floor(Math.random() * glyphs.length)];
        context.save();
        context.translate(Math.random() * width, Math.random() * height);
        context.rotate((Math.random() - 0.5) * 1.2);
        context.globalAlpha = 0.06 + Math.random() * 0.10;
        context.font = `700 ${18 + Math.random() * 44}px Arial, Helvetica, sans-serif`;
        context.fillStyle = palette.glyph[Math.floor(Math.random() * palette.glyph.length)];
        context.fillText(glyph, 0, 0);
        context.restore();
    }
}

function drawPromptOcclusionLines(context, width, height) {
    for (let index = 0; index < PROMPT_IMAGE_OCCLUSION_LINE_COUNT; index += 1) {
        const y = Math.random() * height;
        context.save();
        context.globalAlpha = 0.18 + Math.random() * 0.18;
        context.strokeStyle = index % 2 === 0 ? '#07111f' : '#ffffff';
        context.lineWidth = 2 + Math.random() * 5;
        context.beginPath();
        context.moveTo(0, y);
        context.bezierCurveTo(
            width * 0.25, y + ((Math.random() - 0.5) * 90),
            width * 0.75, y + ((Math.random() - 0.5) * 90),
            width, y + ((Math.random() - 0.5) * 40),
        );
        context.stroke();
        context.restore();
    }
}

function drawPromptTextLine(context, line, centerX, centerY, palette) {
    const characters = [...line];
    const characterWidths = characters.map((character) => context.measureText(character).width);
    const totalWidth = characterWidths.reduce((sum, width) => sum + width, 0);
    let currentX = centerX - (totalWidth / 2);

    characters.forEach((character, index) => {
        const characterWidth = characterWidths[index];
        const x = currentX + (characterWidth / 2) + ((Math.random() - 0.5) * PROMPT_IMAGE_CHARACTER_JITTER);
        const y = centerY + ((Math.random() - 0.5) * PROMPT_IMAGE_CHARACTER_JITTER);
        const fontSize = PROMPT_IMAGE_FONT_SIZE + ((Math.random() - 0.5) * 8);

        context.save();
        context.translate(x, y);
        context.rotate((Math.random() - 0.5) * PROMPT_IMAGE_MAX_CHARACTER_ROTATION);
        context.font = `700 ${fontSize}px Arial, Helvetica, sans-serif`;
        context.fillStyle = 'rgba(0, 0, 0, 0.55)';
        context.fillText(character, 4, 5);
        context.strokeStyle = palette.stroke;
        context.lineWidth = 3;
        context.strokeText(character, 0, 0);
        context.fillStyle = '#f6fbff';
        context.fillText(character, 0, 0);
        context.restore();

        currentX += characterWidth;
    });
}

async function createPromptImageAttachment(prompt) {
    const { createCanvas } = getCanvasApi();
    const measureCanvas = createCanvas(PROMPT_IMAGE_WIDTH, PROMPT_IMAGE_MIN_HEIGHT);
    const measureContext = measureCanvas.getContext('2d');
    measureContext.font = `700 ${PROMPT_IMAGE_FONT_SIZE}px Arial, Helvetica, sans-serif`;
    const lines = wrapCanvasText(measureContext, prompt, PROMPT_IMAGE_WIDTH - (PROMPT_IMAGE_PADDING * 2));
    const height = Math.max(PROMPT_IMAGE_MIN_HEIGHT, (PROMPT_IMAGE_PADDING * 2) + (lines.length * PROMPT_IMAGE_LINE_HEIGHT));
    const canvas = createCanvas(PROMPT_IMAGE_WIDTH, height);
    const context = canvas.getContext('2d');

    const palette = pickPromptImagePalette();
    const gradient = context.createLinearGradient(0, 0, PROMPT_IMAGE_WIDTH, height);
    gradient.addColorStop(0, palette.background[0]);
    gradient.addColorStop(0.5, palette.background[1]);
    gradient.addColorStop(1, palette.background[2]);
    context.fillStyle = gradient;
    context.fillRect(0, 0, PROMPT_IMAGE_WIDTH, height);

    drawPromptImageNoise(context, PROMPT_IMAGE_WIDTH, height, palette);
    drawPromptDecoyGlyphs(context, PROMPT_IMAGE_WIDTH, height, palette);

    context.font = `700 ${PROMPT_IMAGE_FONT_SIZE}px Arial, Helvetica, sans-serif`;
    context.textBaseline = 'middle';
    context.textAlign = 'center';

    const startY = (height - ((lines.length - 1) * PROMPT_IMAGE_LINE_HEIGHT)) / 2;
    lines.forEach((line, index) => {
        const y = startY + (index * PROMPT_IMAGE_LINE_HEIGHT);
        const x = PROMPT_IMAGE_WIDTH / 2;
        drawPromptTextLine(context, line, x, y, palette);
    });

    drawPromptOcclusionLines(context, PROMPT_IMAGE_WIDTH, height);

    const name = buildPromptImageAttachmentName();
    const buffer = await canvas.encode('png');

    return {
        displayUrl: `attachment://${name}`,
        attachment: new Discord.AttachmentBuilder(buffer, { name }),
    };
}

async function preparePromptImageAttachment(challenge, step) {
    if (!step?.promptImageGallery && !challenge?.promptImageGallery) {
        return undefined;
    }

    const prompt = resolvePrompt(challenge, step);
    return createPromptImageAttachment(prompt);
}

function createGalleryImageNonce() {
    return crypto.randomBytes(12).toString('hex');
}

function getGalleryImageExtension(imageUrl, contentType) {
    const contentTypeExtensions = new Map([
        ['image/jpeg', 'jpg'],
        ['image/jpg', 'jpg'],
        ['image/png', 'png'],
        ['image/gif', 'gif'],
        ['image/webp', 'webp'],
    ]);

    const normalizedContentType = String(contentType ?? '').split(';')[0].trim().toLowerCase();
    if (contentTypeExtensions.has(normalizedContentType)) {
        return contentTypeExtensions.get(normalizedContentType);
    }

    try {
        const pathname = new URL(imageUrl).pathname;
        const extensionMatch = pathname.match(/\.([a-zA-Z0-9]{1,8})$/);
        if (extensionMatch) {
            return extensionMatch[1].toLowerCase();
        }
    }
    catch (err) {
        // Fall back to png below when the configured image URL is not parseable.
    }

    return 'png';
}

function buildGalleryAttachmentName(image, extension) {
    return `${GALLERY_IMAGE_ATTACHMENT_NAME_PREFIX}-${createGalleryImageNonce()}-${image.position}.${extension}`;
}

function isLocalGalleryImage(image) {
    return Boolean(image?.directory && (image.fileName || image.url));
}

function resolveLocalGalleryImagePath(image) {
    const fileName = image.fileName ?? image.url;
    const resolvedDirectory = path.resolve(image.directory);
    const resolvedPath = path.resolve(resolvedDirectory, fileName);

    if (!resolvedPath.startsWith(`${resolvedDirectory}${path.sep}`) && resolvedPath !== resolvedDirectory) {
        throw new Error(`Invalid local verification gallery image path for position ${image.position}.`);
    }

    return resolvedPath;
}

function getGalleryImageExtensionFromPath(filePath) {
    const extension = path.extname(filePath).slice(1).toLowerCase();

    return /^[a-z0-9]{1,8}$/.test(extension) ? extension : 'png';
}

const localGalleryImageBufferCache = new Map();

async function readCachedLocalImageBuffer(filePath) {
    const stat = await fs.stat(filePath);
    const cacheKey = `${filePath}:${stat.size}:${stat.mtimeMs}`;

    if (localGalleryImageBufferCache.has(cacheKey)) {
        return localGalleryImageBufferCache.get(cacheKey);
    }

    const buffer = await fs.readFile(filePath);
    localGalleryImageBufferCache.set(cacheKey, buffer);
    return buffer;
}

async function readLocalGalleryImageAttachment(image) {
    const filePath = resolveLocalGalleryImagePath(image);
    const extension = getGalleryImageExtensionFromPath(filePath);
    const name = buildGalleryAttachmentName(image, extension);
    const buffer = await readCachedLocalImageBuffer(filePath);

    return {
        ...image,
        displayUrl: `attachment://${name}`,
        attachment: new Discord.AttachmentBuilder(buffer, { name }),
        buffer,
    };
}

function buildGalleryCompositeAttachmentName() {
    return `${GALLERY_COMPOSITE_ATTACHMENT_NAME_PREFIX}-${createGalleryImageNonce()}.png`;
}

function shouldUseCompositeGallery(challenge, step) {
    return step?.compositeImageGallery === true || challenge?.compositeImageGallery === true;
}

async function fetchRemoteGalleryImageAttachment(image) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), GALLERY_IMAGE_FETCH_TIMEOUT_MS);
    let response;

    try {
        response = await fetch(image.url, { signal: abortController.signal });
    }
    catch (err) {
        if (err.name === 'AbortError') {
            const timeoutError = new Error(`Timed out fetching verification gallery image for position ${image.position} after ${GALLERY_IMAGE_FETCH_TIMEOUT_MS}ms.`);
            timeoutError.code = GALLERY_IMAGE_FETCH_TIMEOUT_CODE;
            throw timeoutError;
        }

        throw err;
    }
    finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        throw new Error(`Failed to fetch verification gallery image for position ${image.position}: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    const extension = getGalleryImageExtension(image.url, contentType);
    const name = buildGalleryAttachmentName(image, extension);
    const buffer = await response.buffer();

    return {
        ...image,
        displayUrl: `attachment://${name}`,
        attachment: new Discord.AttachmentBuilder(buffer, { name }),
        buffer,
    };
}

async function fetchGalleryImageAttachment(image) {
    if (isLocalGalleryImage(image)) {
        return readLocalGalleryImageAttachment(image);
    }

    return fetchRemoteGalleryImageAttachment(image);
}

function drawImageCover(context, image, x, y, width, height) {
    const sourceRatio = image.width / image.height;
    const targetRatio = width / height;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = image.width;
    let sourceHeight = image.height;

    if (sourceRatio > targetRatio) {
        sourceWidth = image.height * targetRatio;
        sourceX = (image.width - sourceWidth) / 2;
    }
    else {
        sourceHeight = image.width / targetRatio;
        sourceY = (image.height - sourceHeight) / 2;
    }

    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function drawGalleryCompositeLabel(context, label, x, y) {
    context.save();
    context.font = `700 ${GALLERY_COMPOSITE_LABEL_SIZE}px Arial, Helvetica, sans-serif`;
    context.textBaseline = 'top';
    context.textAlign = 'left';
    const metrics = context.measureText(label);
    const labelWidth = metrics.width + (GALLERY_COMPOSITE_LABEL_PADDING * 2);
    const labelHeight = GALLERY_COMPOSITE_LABEL_SIZE + (GALLERY_COMPOSITE_LABEL_PADDING * 1.5);

    context.fillStyle = 'rgba(0, 0, 0, 0.72)';
    context.fillRect(x, y, labelWidth, labelHeight);
    context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    context.lineWidth = 4;
    context.strokeRect(x, y, labelWidth, labelHeight);
    context.fillStyle = '#ffffff';
    context.fillText(label, x + GALLERY_COMPOSITE_LABEL_PADDING, y + (GALLERY_COMPOSITE_LABEL_PADDING / 2));
    context.restore();
}

async function createGalleryCompositeAttachment(selectedImages) {
    const { createCanvas, loadImage } = getCanvasApi();
    const columns = GALLERY_COMPOSITE_GRID_COLUMNS;
    const rows = Math.ceil(selectedImages.length / columns);
    const width = columns * GALLERY_COMPOSITE_TILE_SIZE;
    const height = rows * GALLERY_COMPOSITE_TILE_SIZE;
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');

    context.fillStyle = '#05070d';
    context.fillRect(0, 0, width, height);

    const loadedImages = await Promise.all(selectedImages.map((image) => loadImage(image.buffer)));

    loadedImages.forEach((loadedImage, index) => {
        const image = selectedImages[index];
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = column * GALLERY_COMPOSITE_TILE_SIZE;
        const y = row * GALLERY_COMPOSITE_TILE_SIZE;

        drawImageCover(context, loadedImage, x, y, GALLERY_COMPOSITE_TILE_SIZE, GALLERY_COMPOSITE_TILE_SIZE);
        drawGalleryCompositeLabel(context, String(image.position), x + 12, y + 12);
    });

    const name = buildGalleryCompositeAttachmentName();
    const buffer = await canvas.encode('png');

    return {
        displayUrl: `attachment://${name}`,
        attachment: new Discord.AttachmentBuilder(buffer, { name }),
    };
}

async function prepareGalleryImageAttachments(galleryState) {
    if (!galleryState?.selectedImages?.length) {
        return galleryState;
    }

    const fetchedImages = await Promise.all(galleryState.selectedImages.map(fetchGalleryImageAttachment));
    const compositeImage = galleryState.useCompositeImage
        ? await createGalleryCompositeAttachment(fetchedImages)
        : undefined;
    const selectedImages = fetchedImages.map(({ buffer, attachment, ...image }) => {
        if (galleryState.useCompositeImage) {
            return image;
        }

        return { ...image, attachment };
    });

    return {
        ...galleryState,
        selectedImages,
        compositeImage,
    };
}

function createGalleryToken() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function shuffleArray(items) {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    return shuffled;
}

function pickRandomItems(items, count, itemRole) {
    if (items.length < count) {
        throw new Error(`Verification image pool does not contain enough ${itemRole} images. Required ${count}, found ${items.length}.`);
    }

    return shuffleArray(items).slice(0, count);
}

function pickRandomItemsWithRepeats(items, count, itemRole) {
    if (count <= 0) {
        return [];
    }

    if (items.length < 1) {
        throw new Error(`Verification image pool does not contain any ${itemRole} images. Required ${count}.`);
    }

    if (items.length >= count) {
        return pickRandomItems(items, count, itemRole);
    }

    const selectedItems = [];

    while (selectedItems.length < count) {
        selectedItems.push(items[Math.floor(Math.random() * items.length)]);
    }

    return selectedItems;
}

function pickRandomItemsWithRepeatLimit(items, count, maxRepeats, itemRole) {
    const normalizedMaxRepeats = Math.floor(Number(maxRepeats ?? 1));

    if (!Number.isInteger(normalizedMaxRepeats) || normalizedMaxRepeats < 1) {
        throw new Error(`Invalid ${itemRole} image repeat limit: ${maxRepeats}`);
    }

    if (items.length * normalizedMaxRepeats < count) {
        throw new Error(`Verification image pool does not contain enough ${itemRole} image capacity. Required ${count}, capacity ${items.length * normalizedMaxRepeats}.`);
    }

    const selectedItems = [];
    const selectedCounts = new Map();

    while (selectedItems.length < count) {
        const availableItems = items.filter((item) => (selectedCounts.get(item.id) ?? 0) < normalizedMaxRepeats);
        const selectedItem = availableItems[Math.floor(Math.random() * availableItems.length)];
        selectedCounts.set(selectedItem.id, (selectedCounts.get(selectedItem.id) ?? 0) + 1);
        selectedItems.push(selectedItem);
    }

    return selectedItems;
}

function resolveGalleryImageCounts(challenge, step) {
    const gallerySize = Number(step?.gallerySize ?? challenge.gallerySize ?? DEFAULT_GALLERY_SIZE);
    const solutionRange = step?.solutionImageCount ?? challenge.solutionImageCount ?? { min: 1, max: 1 };
    const controlRange = step?.controlImageCount ?? challenge.controlImageCount;

    if (!Number.isInteger(gallerySize) || gallerySize < 1) {
        throw new Error(`Invalid gallery size for challenge ${challenge.id}: ${gallerySize}`);
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
        throw new Error(`No valid solution/control image count combination exists for challenge ${challenge.id}.`);
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

function createGalleryState(challenge, stepIndex = 0, verificationSettings) {
    const step = getVerificationChallengeStep(challenge.id, stepIndex);
    const imagePoolId = step?.imagePoolId ?? challenge.imagePoolId;
    const imagePool = getVerificationImagePool(imagePoolId);

    if (!imagePool) {
        throw new Error(`Unknown verification image pool "${imagePoolId}" for challenge "${challenge.id}".`);
    }

    const { solutionCount, controlCount } = resolveGalleryImageCounts(challenge, step);
    const solutionImageIds = resolveSolutionImageIds(challenge, step, verificationSettings);
    const controlImageIds = resolveControlImageIds(challenge, step, verificationSettings);

    if (solutionImageIds.length < 1) {
        throw new Error(`Verification challenge "${challenge.id}" has no configured solution image IDs.`);
    }

    if (controlImageIds.length < 1) {
        throw new Error(`Verification challenge "${challenge.id}" has no configured control image IDs.`);
    }

    const solutionImages = getPoolImagesByIds(imagePool, solutionImageIds, 'solution', challenge.id);
    const controlImages = getPoolImagesByIds(imagePool, controlImageIds, 'control', challenge.id);
    const maxControlImageRepeats = step?.maxControlImageRepeats ?? challenge.maxControlImageRepeats ?? 1;
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
        useCompositeImage: shouldUseCompositeGallery(challenge, step),
        solutionPositions: selectedImages
            .filter((image) => image.role === 'solution')
            .map((image) => image.position)
            .sort((left, right) => left - right),
    };
}


function getVerificationImagePool(poolId) {
    if (!poolId) return undefined;

    return verificationImagesRegistry[poolId];
}

async function getLocalVerificationImagePoolIssues() {
    const issues = [];

    for (const pool of Object.values(verificationImagesRegistry)) {
        if (!pool.directory) continue;

        const resolvedDirectory = path.resolve(pool.directory);

        for (const image of pool.images ?? []) {
            if (!image.fileName) continue;

            const filePath = path.resolve(resolvedDirectory, image.fileName);

            if (!filePath.startsWith(`${resolvedDirectory}${path.sep}`)) {
                issues.push(`${pool.id}/${image.id}: invalid local path ${image.fileName}`);
                continue;
            }

            try {
                await fs.access(filePath);
            }
            catch (err) {
                issues.push(`${pool.id}/${image.id}: missing local file ${filePath}`);
            }
        }
    }

    return issues;
}

module.exports = {
    GALLERY_IMAGE_FETCH_TIMEOUT_CODE,
    ['verification' + 'ImagePools']: verificationImagesRegistry,
    getVerificationImagePool,
    getLocalVerificationImagePoolIssues,
    createGalleryState,
    prepareGalleryImageAttachments,
    createPromptImageAttachment,
    preparePromptImageAttachment,
};
