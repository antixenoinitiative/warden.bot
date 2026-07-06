const Discord = require('discord.js');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { createCanvas } = require('@napi-rs/canvas');
const config = require('../../../config.json');
const { botLog } = require('../../../functions');
const verificationEmbedConfig = require('../verification/verificationEmbedConfig.json');
const {
    verificationChallenges,
    getActiveVerificationChallenge,
    getEnabledVerificationChallenges,
    getVerificationChallengeStep,
    getVerificationChallengeSteps,
    hasNextVerificationChallengeStep,
    validateAnswer,
} = require('../verification/verificationChallenges');
const { getVerificationImagePool } = require('../verification/verificationImagePools');
const { setChallenge, getChallenge, clearChallenge, setCooldown, getCooldownRemaining, clearCooldown } = require('../verification/verificationState');
const {
    getVerificationSettings,
    setVerificationMode,
    setActiveChallengeIds,
    setChallengeExpirySeconds,
    setCooldownSeconds,
    setAutokickSettings,
} = require('../verification/verificationSettings');

const VERIFICATION_MODES = {
    block: 'block',
    challenge: 'challenge',
    skipChallenge: 'skip_challenge',
};
const LEGACY_VERIFICATION_MODE_ALIASES = {
    disabled: VERIFICATION_MODES.block,
    enabled: VERIFICATION_MODES.challenge,
    skip: VERIFICATION_MODES.skipChallenge,
};

const COMPONENTS_V2_RENDER_MODE = 'componentsV2Gallery';
const DEFAULT_GALLERY_SIZE = 6;
const LEGACY_GALLERY_FIRST_PAGE_IMAGE_LIMIT = 9;
const LEGACY_GALLERY_FOLLOWUP_IMAGE_LIMIT = 10;
const GALLERY_IMAGE_ATTACHMENT_NAME_PREFIX = 'warden-gallery';
const GALLERY_IMAGE_FETCH_TIMEOUT_MS = 10000;
const GALLERY_IMAGE_FETCH_TIMEOUT_CODE = 'VERIFICATION_GALLERY_IMAGE_FETCH_TIMEOUT';
const PROMPT_IMAGE_ATTACHMENT_NAME_PREFIX = 'warden-prompt';
const PROMPT_IMAGE_WIDTH = 1200;
const PROMPT_IMAGE_MIN_HEIGHT = 360;
const PROMPT_IMAGE_PADDING = 58;
const PROMPT_IMAGE_FONT_SIZE = 54;
const PROMPT_IMAGE_LINE_HEIGHT = 68;

function resolveEmbedColor(color, fallbackColor = '#3498DB') {
    if (typeof color === 'string' && /^#[0-9a-fA-F]{3}$/.test(color)) {
        return `#${color.slice(1).split('').map((char) => char + char).join('')}`;
    }

    return color ?? fallbackColor;
}

function resolveComponentAccentColor(color, fallbackColor = '#3498DB') {
    const resolvedColor = resolveEmbedColor(color, fallbackColor);

    if (typeof resolvedColor === 'number') {
        return resolvedColor;
    }

    if (typeof resolvedColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(resolvedColor)) {
        return Number.parseInt(resolvedColor.slice(1), 16);
    }

    return Number.parseInt(resolveEmbedColor(fallbackColor).slice(1), 16);
}

function isComponentsV2GalleryChallenge(challenge, step) {
    return challenge?.renderMode === COMPONENTS_V2_RENDER_MODE || step?.renderMode === COMPONENTS_V2_RENDER_MODE;
}


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

function drawPromptImageNoise(context, width, height) {
    for (let index = 0; index < 90; index += 1) {
        context.save();
        context.globalAlpha = 0.12 + Math.random() * 0.18;
        context.strokeStyle = index % 2 === 0 ? '#76d7ff' : '#f5b7ff';
        context.lineWidth = 1 + Math.random() * 4;
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

    for (let index = 0; index < 1400; index += 1) {
        context.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)';
        context.fillRect(Math.random() * width, Math.random() * height, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
}

async function createPromptImageAttachment(prompt) {
    const measureCanvas = createCanvas(PROMPT_IMAGE_WIDTH, PROMPT_IMAGE_MIN_HEIGHT);
    const measureContext = measureCanvas.getContext('2d');
    measureContext.font = `700 ${PROMPT_IMAGE_FONT_SIZE}px Arial, Helvetica, sans-serif`;
    const lines = wrapCanvasText(measureContext, prompt, PROMPT_IMAGE_WIDTH - (PROMPT_IMAGE_PADDING * 2));
    const height = Math.max(PROMPT_IMAGE_MIN_HEIGHT, (PROMPT_IMAGE_PADDING * 2) + (lines.length * PROMPT_IMAGE_LINE_HEIGHT));
    const canvas = createCanvas(PROMPT_IMAGE_WIDTH, height);
    const context = canvas.getContext('2d');

    const gradient = context.createLinearGradient(0, 0, PROMPT_IMAGE_WIDTH, height);
    gradient.addColorStop(0, '#07111f');
    gradient.addColorStop(0.5, '#14213d');
    gradient.addColorStop(1, '#0b1020');
    context.fillStyle = gradient;
    context.fillRect(0, 0, PROMPT_IMAGE_WIDTH, height);

    drawPromptImageNoise(context, PROMPT_IMAGE_WIDTH, height);

    context.font = `700 ${PROMPT_IMAGE_FONT_SIZE}px Arial, Helvetica, sans-serif`;
    context.textBaseline = 'middle';
    context.textAlign = 'center';

    const startY = (height - ((lines.length - 1) * PROMPT_IMAGE_LINE_HEIGHT)) / 2;
    lines.forEach((line, index) => {
        const y = startY + (index * PROMPT_IMAGE_LINE_HEIGHT);
        const x = PROMPT_IMAGE_WIDTH / 2;
        context.save();
        context.translate(x, y);
        context.rotate((Math.random() - 0.5) * 0.035);
        context.fillStyle = 'rgba(0, 0, 0, 0.45)';
        context.fillText(line, 4, 5);
        context.strokeStyle = 'rgba(118, 215, 255, 0.55)';
        context.lineWidth = 2;
        context.strokeText(line, 0, 0);
        context.fillStyle = '#f6fbff';
        context.fillText(line, 0, 0);
        context.restore();
    });

    const name = buildPromptImageAttachmentName();
    const buffer = await canvas.png();

    return {
        displayUrl: `attachment://${name}`,
        attachment: new Discord.AttachmentBuilder(buffer, { name }),
    };
}

async function preparePromptImageAttachment(challenge, step) {
    if (!step?.promptImageGallery && !challenge?.promptImageGallery) {
        return undefined;
    }

    const prompt = step?.prompt ?? challenge.prompt ?? 'Please answer the verification challenge.';
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

async function fetchGalleryImageAttachment(image) {
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
    };
}

async function prepareGalleryImageAttachments(galleryState) {
    if (!galleryState?.selectedImages?.length) {
        return galleryState;
    }

    return {
        ...galleryState,
        selectedImages: await Promise.all(galleryState.selectedImages.map(fetchGalleryImageAttachment)),
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

function createGalleryState(challenge, stepIndex = 0) {
    const step = getVerificationChallengeStep(challenge.id, stepIndex);
    const imagePoolId = step?.imagePoolId ?? challenge.imagePoolId;
    const imagePool = getVerificationImagePool(imagePoolId);

    if (!imagePool) {
        throw new Error(`Unknown verification image pool "${imagePoolId}" for challenge "${challenge.id}".`);
    }

    const { solutionCount, controlCount } = resolveGalleryImageCounts(challenge, step);
    const solutionImages = imagePool.images.filter((image) => image.role === 'solution');
    const controlImages = imagePool.images.filter((image) => image.role === 'control');
    const maxControlImageRepeats = step?.maxControlImageRepeats ?? challenge.maxControlImageRepeats ?? 1;
    const selectedImages = shuffleArray([
        ...pickRandomItemsWithRepeats(solutionImages, solutionCount, 'solution'),
        ...pickRandomItemsWithRepeatLimit(controlImages, controlCount, maxControlImageRepeats, 'control'),
    ]).map((image, index) => ({
        ...image,
        position: index + 1,
    }));

    return {
        token: createGalleryToken(),
        imagePoolId,
        selectedImages,
        solutionPositions: selectedImages
            .filter((image) => image.role === 'solution')
            .map((image) => image.position)
            .sort((left, right) => left - right),
    };
}


function parsePositionAnswer(positionAnswer) {
    const normalizedInput = String(positionAnswer ?? '').trim();
    if (!normalizedInput) return [];

    return normalizedInput
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((position) => Number(position));
}

function validatePositionAnswer(positionAnswer, expectedPositions, gallerySize) {
    const submittedPositions = parsePositionAnswer(positionAnswer);

    if (submittedPositions.length !== expectedPositions.length) {
        return false;
    }

    if (submittedPositions.some((position) => !Number.isInteger(position) || position < 1 || position > gallerySize)) {
        return false;
    }

    if (new Set(submittedPositions).size !== submittedPositions.length) {
        return false;
    }

    const sortedSubmittedPositions = [...submittedPositions].sort((left, right) => left - right);
    return expectedPositions.every((expectedPosition, index) => sortedSubmittedPositions[index] === expectedPosition);
}

function resolveVerificationMode(verificationSettings = config.Warden?.verification) {
    const configuredMode = verificationSettings?.mode;
    if (Object.values(VERIFICATION_MODES).includes(configuredMode)) {
        return configuredMode;
    }

    if (LEGACY_VERIFICATION_MODE_ALIASES[configuredMode]) {
        return LEGACY_VERIFICATION_MODE_ALIASES[configuredMode];
    }

    if (verificationSettings?.enabled === false) return VERIFICATION_MODES.block;

    return VERIFICATION_MODES.challenge;
}

function userErrorEmbed(message) {
    return new Discord.EmbedBuilder()
        .setColor(resolveEmbedColor('#E74C3C'))
        .setTitle('Verification Error')
        .setDescription(message);
}

function resolveChallengeExpiryMs(verificationSettings) {
    return Number(verificationSettings?.challengeExpirySeconds ?? config.Warden?.verification?.challengeExpirySeconds ?? config.Warden?.verification?.expirySeconds ?? 600) * 1000;
}

function resolveCooldownSeconds(verificationSettings) {
    return Number(verificationSettings?.cooldownSeconds ?? config.Warden?.verification?.cooldownSeconds ?? 60);
}

function buildExpiryLine(expiresAt) {
    if (!expiresAt) return undefined;
    return `-# This prompt will expire in <t:${Math.floor(expiresAt / 1000)}:R>`;
}

function buildGalleryOrderLine() {
    return '-# **Click the gallery to view image order; positions start top-left, left-to-right by row.**';
}

function parseDurationSeconds(input) {
    const value = String(input ?? '').trim().toLowerCase();
    if (!value) return undefined;

    const compactMatch = value.match(/^(\d+)(s|sec|secs|second|seconds|m|min|mins|minute|minutes)?$/);
    if (compactMatch) {
        const amount = Number(compactMatch[1]);
        const unit = compactMatch[2] ?? 'seconds';
        return unit.startsWith('m') ? amount * 60 : amount;
    }

    const spacedMatch = value.match(/^(\d+)\s+(seconds?|secs?|minutes?|mins?)$/);
    if (spacedMatch) {
        const amount = Number(spacedMatch[1]);
        return spacedMatch[2].startsWith('m') ? amount * 60 : amount;
    }

    return undefined;
}

function parseChallengeIdList(input) {
    return String(input ?? '')
        .split(/[\s,]+/)
        .map((challengeId) => challengeId.trim())
        .filter(Boolean);
}

function formatDuration(seconds) {
    if (seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? '' : 's'}`;
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
}


function applyTextReplacements(text, replacements = {}) {
    let resolvedText = String(text ?? '');

    for (const [key, value] of Object.entries(replacements)) {
        resolvedText = resolvedText.replaceAll(`{${key}}`, String(value));
    }

    return resolvedText;
}

function selectVerificationChallenge(verificationSettings) {
    const enabledChallenges = getEnabledVerificationChallenges({ verification: verificationSettings });
    if (enabledChallenges.length < 2) {
        return enabledChallenges[0] ?? getActiveVerificationChallenge({ verification: verificationSettings });
    }

    return enabledChallenges[Math.floor(Math.random() * enabledChallenges.length)];
}

function buildWelcomeEmbed(verificationSettings) {
    const welcomeEmbedConfig = verificationEmbedConfig.welcomeEmbed ?? {};
    const embed = new Discord.EmbedBuilder()
        .setColor(resolveEmbedColor(welcomeEmbedConfig.color))
        .setTitle(welcomeEmbedConfig.title ?? 'Welcome to the server')
        .setDescription(welcomeEmbedConfig.description ?? 'Please verify to access the server.');

    if (welcomeEmbedConfig.thumbnail?.enabled && welcomeEmbedConfig.thumbnail.url) {
        embed.setThumbnail(welcomeEmbedConfig.thumbnail.url);
    }

    if (welcomeEmbedConfig.icon?.enabled && welcomeEmbedConfig.icon.url) {
        embed.setAuthor({ name: welcomeEmbedConfig.title ?? 'Welcome to the server', iconURL: welcomeEmbedConfig.icon.url });
    }

    for (const field of welcomeEmbedConfig.fields ?? []) {
        applyFieldToEmbed(embed, field);
    }

    if (verificationSettings?.autokickEnabled) {
        const autoKickWelcomeFieldConfig = verificationEmbedConfig.autoKickWelcomeField ?? {};
        const replacements = {
            autokickTimer: formatDuration(verificationSettings.autokickSeconds),
            timer: formatDuration(verificationSettings.autokickSeconds),
        };

        applyFieldToEmbed(embed, {
            title: applyTextReplacements(autoKickWelcomeFieldConfig.title ?? 'Verification time limit', replacements),
            value: applyTextReplacements(autoKickWelcomeFieldConfig.value ?? 'Please complete verification within {timer}, or you will be removed from the server.', replacements),
            inline: autoKickWelcomeFieldConfig.inline ?? false,
        });
    }

    return embed;
}

function buildVerificationHelpEmbed() {
    return buildResultEmbed(
        verificationEmbedConfig.verificationHelpEmbed,
        'Verification Help',
        'If you are having trouble verifying, please contact staff for assistance.',
    );
}

function buildVerificationPostComponents() {
    return [new Discord.ActionRowBuilder()
        .addComponents(
            new Discord.ButtonBuilder()
                .setCustomId('wardenVerify-start')
                .setLabel('Verify')
                .setStyle(Discord.ButtonStyle.Success),
            new Discord.ButtonBuilder()
                .setCustomId('wardenVerify-help')
                .setLabel('Help')
                .setStyle(Discord.ButtonStyle.Secondary),
        )];
}

async function handleVerifyHelp(interaction) {
    return interaction.reply({
        embeds: [buildVerificationHelpEmbed()],
        flags: Discord.MessageFlags.Ephemeral,
    });
}

async function fetchVerificationMessage(interaction, messageId) {
    const channels = await interaction.guild.channels.fetch();
    for (const channel of channels.values()) {
        if (!channel?.isTextBased?.()) continue;

        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (message) return message;
    }

    return null;
}

function buildResultEmbed(embedConfig, fallbackTitle, fallbackDescription, replacements = {}) {
    let description = embedConfig?.description ?? fallbackDescription;
    description = applyTextReplacements(description, replacements);

    return new Discord.EmbedBuilder()
        .setColor(resolveEmbedColor(embedConfig?.color))
        .setTitle(embedConfig?.title ?? fallbackTitle)
        .setDescription(description);
}

function buildInProgressEmbed(expiresAt) {
    return buildResultEmbed(
        verificationEmbedConfig.inProgressEmbed,
        'Verification in Progress',
        'You already have a verification challenge in progress. Please answer your current challenge or retry after it expires {retryTime}.',
        { retryTime: `<t:${Math.floor(expiresAt / 1000)}:R>` },
    );
}

function applyFieldToEmbed(embed, field) {
    if (!field) return;

    if (field.imageUrl) {
        return;
    }

    const value = field.content ?? field.value ?? field.description;
    if (!value) return;

    embed.addFields({
        name: field.title ?? field.name ?? '\u200B',
        value,
        inline: field.inline ?? false,
    });
}

function buildImageEmbed(fieldOrEmbed, embedConfig) {
    const embed = new Discord.EmbedBuilder()
        .setColor(resolveEmbedColor(fieldOrEmbed.color ?? embedConfig.color));

    if (fieldOrEmbed.title ?? fieldOrEmbed.name) {
        embed.setTitle(fieldOrEmbed.title ?? fieldOrEmbed.name);
    }

    if (fieldOrEmbed.description ?? fieldOrEmbed.content ?? fieldOrEmbed.value) {
        embed.setDescription(fieldOrEmbed.description ?? fieldOrEmbed.content ?? fieldOrEmbed.value);
    }

    if (fieldOrEmbed.imageUrl) {
        embed.setImage(fieldOrEmbed.imageUrl);
    }

    if (fieldOrEmbed.thumbnailUrl) {
        embed.setThumbnail(fieldOrEmbed.thumbnailUrl);
    }

    return embed;
}

function buildChallengeEmbeds(challenge, stepIndex = 0, expiresAt) {
    const step = getVerificationChallengeStep(challenge.id, stepIndex);
    const embedConfig = verificationEmbedConfig.challengeEmbed ?? {};
    const steps = getVerificationChallengeSteps(challenge);
    const totalSteps = steps.length || 1;
    const stepLabel = totalSteps > 1 ? `\n\nStep ${stepIndex + 1} of ${totalSteps}` : '';
    const expiryLine = buildExpiryLine(expiresAt);
    const prompt = step?.prompt ?? challenge.prompt ?? 'Please answer the verification challenge.';
    const stepDescription = step?.description ? `${step.description}\n\n` : '';
    let description = embedConfig.description ?? '{challenge}';

    description = description
        .replaceAll('{challenge}', `${stepDescription}${prompt}`)
        .replaceAll('{step}', String(stepIndex + 1))
        .replaceAll('{totalSteps}', String(totalSteps));

    const embed = new Discord.EmbedBuilder()
        .setColor(resolveEmbedColor(step?.color ?? embedConfig.color))
        .setTitle(step?.title ?? embedConfig.title ?? 'Verification Challenge')
        .setDescription([`${description}${stepLabel}`, expiryLine].filter(Boolean).join('\n\n'));

    const imageUrl = step?.imageUrl ?? challenge.imageUrl;
    const thumbnailUrl = step?.thumbnailUrl ?? challenge.thumbnailUrl;

    if (imageUrl) {
        embed.setImage(imageUrl);
    }

    if (thumbnailUrl) {
        embed.setThumbnail(thumbnailUrl);
    }

    for (const field of step?.fields ?? []) {
        applyFieldToEmbed(embed, field);
    }

    const embeds = [embed];

    for (const field of step?.fields ?? []) {
        if (field.imageUrl) {
            embeds.push(buildImageEmbed(field, embedConfig));
        }
    }

    for (const extraEmbed of step?.embeds ?? []) {
        embeds.push(buildImageEmbed(extraEmbed, embedConfig));
    }

    return embeds.slice(0, 10);
}

function assertComponentsV2Support() {
    const requiredBuilders = [
        'ContainerBuilder',
        'TextDisplayBuilder',
        'MediaGalleryBuilder',
        'MediaGalleryItemBuilder',
    ];
    const missingBuilders = requiredBuilders.filter((builderName) => !Discord[builderName]);

    if (missingBuilders.length > 0 || !Discord.MessageFlags?.IsComponentsV2) {
        throw new Error(`Discord Components V2 support is unavailable. Missing: ${missingBuilders.join(', ') || 'MessageFlags.IsComponentsV2'}`);
    }
}

function markdownHeading(text) {
    return `# ${text}`;
}

function getPromptImageAttachment(promptImage) {
    return promptImage?.attachment ? [promptImage.attachment] : [];
}

function getGalleryImageAttachments(selectedImages = []) {
    return selectedImages
        .map((image) => image.attachment)
        .filter(Boolean);
}

function getGalleryDisplayUrl(image) {
    return image.displayUrl ?? image.url;
}

function buildChallengeComponentsV2(challenge, stepIndex = 0, galleryState, expiresAt, promptImage) {
    assertComponentsV2Support();

    const step = getVerificationChallengeStep(challenge.id, stepIndex);
    const embedConfig = verificationEmbedConfig.challengeEmbed ?? {};
    const steps = getVerificationChallengeSteps(challenge);
    const totalSteps = steps.length || 1;
    const stepLabel = totalSteps > 1 ? `\n\nStep ${stepIndex + 1} of ${totalSteps}` : '';
    const title = step?.title ?? embedConfig.title ?? 'Verification Challenge';
    const prompt = step?.prompt ?? challenge.prompt ?? 'Please answer the verification challenge.';
    const galleryPrompt = step?.galleryPrompt ?? challenge.galleryPrompt;
    const selectedImages = galleryState?.selectedImages ?? [];
    const expiryLine = buildExpiryLine(expiresAt);

    if (selectedImages.length < 1) {
        throw new Error(`No gallery images were selected for challenge "${challenge.id}".`);
    }

    const container = new Discord.ContainerBuilder()
        .setAccentColor(resolveComponentAccentColor(step?.color ?? embedConfig.color));

    container.addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(markdownHeading(title)),
    );

    if (step?.description) {
        container.addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent(step.description),
        );
    }

    container.addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('**Question 1**'),
    );

    if (promptImage?.displayUrl) {
        container.addMediaGalleryComponents(
            new Discord.MediaGalleryBuilder().addItems(
                new Discord.MediaGalleryItemBuilder()
                    .setURL(promptImage.displayUrl)
                    .setDescription('Question 1 prompt'),
            ),
        );
    }
    else {
        container.addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent(prompt),
        );
    }

    if (galleryPrompt) {
        container.addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent(`**Question 2**\n${galleryPrompt}${stepLabel}`),
        );
    }

    for (const field of step?.fields ?? []) {
        const value = field.content ?? field.value ?? field.description;
        if (value) {
            container.addTextDisplayComponents(
                new Discord.TextDisplayBuilder().setContent(`**${field.title ?? field.name ?? 'Information'}**\n${value}`),
            );
        }
    }

    container.addMediaGalleryComponents(
        new Discord.MediaGalleryBuilder().addItems(
            selectedImages.map((image) => new Discord.MediaGalleryItemBuilder()
                .setURL(getGalleryDisplayUrl(image))
                .setDescription(`Position ${image.position}`)),
        ),
    );

    container.addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(buildGalleryOrderLine()),
    );

    if (expiryLine) {
        container.addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent(expiryLine),
        );
    }

    container.addActionRowComponents(buildGiveAnswerRow(challenge.id, stepIndex, galleryState?.token));

    return [container];
}

function buildChallengeReplyOptions(challenge, stepIndex = 0, galleryState, expiresAt, promptImage) {
    const step = getVerificationChallengeStep(challenge.id, stepIndex);

    if (isComponentsV2GalleryChallenge(challenge, step)) {
        return {
            components: buildChallengeComponentsV2(challenge, stepIndex, galleryState, expiresAt, promptImage),
            files: [...getPromptImageAttachment(promptImage), ...getGalleryImageAttachments(galleryState?.selectedImages)],
            flags: Discord.MessageFlags.Ephemeral | Discord.MessageFlags.IsComponentsV2,
        };
    }

    return {
        embeds: buildChallengeEmbeds(challenge, stepIndex, expiresAt),
        components: [buildGiveAnswerRow(challenge.id, stepIndex)],
        flags: Discord.MessageFlags.Ephemeral,
    };
}

function buildOldVersionRow(challengeId, stepIndex = 0, token) {
    return new Discord.ActionRowBuilder()
        .addComponents(
            new Discord.ButtonBuilder()
                .setCustomId(buildChallengeComponentCustomId('wardenVerify-oldVersion-', challengeId, stepIndex, token))
                .setLabel('Old Version')
                .setStyle(Discord.ButtonStyle.Secondary),
        );
}

function buildGalleryFallbackPrompt(challenge, stepIndex = 0, galleryState, expiresAt) {
    return {
        embeds: [
            new Discord.EmbedBuilder()
                .setColor(resolveEmbedColor(verificationEmbedConfig.challengeEmbed?.color))
                .setTitle('Not working?')
                .setDescription(['If you cannot see the Verification Challenge please update your client, or click the Old Version button below.', buildExpiryLine(expiresAt)].filter(Boolean).join('\n\n')),
        ],
        components: [buildOldVersionRow(challenge.id, stepIndex, galleryState?.token)],
        flags: Discord.MessageFlags.Ephemeral,
    };
}

function buildLegacyGalleryEmbeds(challenge, stepIndex = 0, galleryState, expiresAt, promptImage) {
    const step = getVerificationChallengeStep(challenge.id, stepIndex);
    const embedConfig = verificationEmbedConfig.challengeEmbed ?? {};
    const steps = getVerificationChallengeSteps(challenge);
    const totalSteps = steps.length || 1;
    const stepLabel = totalSteps > 1 ? `\n\nStep ${stepIndex + 1} of ${totalSteps}` : '';
    const prompt = step?.prompt ?? challenge.prompt ?? 'Please answer the verification challenge.';
    const galleryPrompt = step?.galleryPrompt ?? challenge.galleryPrompt;
    const challengeEmbed = new Discord.EmbedBuilder()
        .setColor(resolveEmbedColor(step?.color ?? embedConfig.color))
        .setTitle(step?.title ?? embedConfig.title ?? 'Verification Challenge')
        .setDescription([
            step?.description,
            promptImage?.displayUrl ? '**Question 1**' : `**Question 1**\n${prompt}`,
            galleryPrompt ? `**Question 2**\n${galleryPrompt}${stepLabel}` : undefined,
            buildExpiryLine(expiresAt),
        ].filter(Boolean).join('\n\n'));

    if (promptImage?.displayUrl) {
        challengeEmbed.setImage(promptImage.displayUrl);
    }

    for (const field of step?.fields ?? []) {
        applyFieldToEmbed(challengeEmbed, field);
    }

    const imageEmbeds = (galleryState?.selectedImages ?? []).map((image) => {
        return new Discord.EmbedBuilder()
            .setColor(resolveEmbedColor(step?.color ?? embedConfig.color))
            .setTitle(`Position ${image.position}`)
            .setImage(getGalleryDisplayUrl(image));
    });

    return [challengeEmbed, ...imageEmbeds];
}

function buildLegacyGalleryReplyOptions(challenge, stepIndex = 0, galleryState, embeds, expiresAt, files, promptImage) {
    return {
        embeds: embeds ?? buildLegacyGalleryEmbeds(challenge, stepIndex, galleryState, expiresAt, promptImage),
        files: files ?? [...getPromptImageAttachment(promptImage), ...getGalleryImageAttachments(galleryState?.selectedImages)],
        components: [buildGiveAnswerRow(challenge.id, stepIndex, galleryState?.token)],
        flags: Discord.MessageFlags.Ephemeral,
    };
}

function buildLegacyGalleryEmbedPages(challenge, stepIndex = 0, galleryState, expiresAt, promptImage) {
    const embeds = buildLegacyGalleryEmbeds(challenge, stepIndex, galleryState, expiresAt, promptImage);
    const challengeEmbed = embeds[0];
    const imageEmbeds = embeds.slice(1);
    const selectedImages = galleryState?.selectedImages ?? [];
    const pages = [
        {
            embeds: [challengeEmbed, ...imageEmbeds.slice(0, LEGACY_GALLERY_FIRST_PAGE_IMAGE_LIMIT)].filter(Boolean),
            files: [...getPromptImageAttachment(promptImage), ...getGalleryImageAttachments(selectedImages.slice(0, LEGACY_GALLERY_FIRST_PAGE_IMAGE_LIMIT))],
        },
    ];

    for (let index = LEGACY_GALLERY_FIRST_PAGE_IMAGE_LIMIT; index < imageEmbeds.length; index += LEGACY_GALLERY_FOLLOWUP_IMAGE_LIMIT) {
        pages.push({
            embeds: imageEmbeds.slice(index, index + LEGACY_GALLERY_FOLLOWUP_IMAGE_LIMIT),
            files: getGalleryImageAttachments(selectedImages.slice(index, index + LEGACY_GALLERY_FOLLOWUP_IMAGE_LIMIT)),
        });
    }

    return pages.filter((page) => page.embeds.length > 0);
}

async function replyWithLegacyGallery(interaction, challenge, stepIndex = 0, galleryState, expiresAt, promptImage) {
    const [firstPage, ...followUpPages] = buildLegacyGalleryEmbedPages(challenge, stepIndex, galleryState, expiresAt, promptImage);
    await sendInitialInteractionResponse(interaction, buildLegacyGalleryReplyOptions(challenge, stepIndex, galleryState, firstPage.embeds, expiresAt, firstPage.files, promptImage));

    for (const page of followUpPages) {
        await interaction.followUp({ embeds: page.embeds, files: page.files, flags: Discord.MessageFlags.Ephemeral });
    }
}

async function sendInitialInteractionResponse(interaction, options) {
    if (interaction.deferred) {
        return interaction.editReply(removeInitialOnlyResponseOptions(options));
    }

    if (interaction.replied) {
        return interaction.followUp(options);
    }

    return interaction.reply(options);
}

function removeInitialOnlyResponseOptions(options) {
    const editOptions = { ...options };

    delete editOptions.ephemeral;

    if (typeof editOptions.flags === 'number') {
        editOptions.flags &= ~Discord.MessageFlags.Ephemeral;

        if (editOptions.flags === 0) {
            delete editOptions.flags;
        }
    }

    return editOptions;
}

async function replyWithChallenge(interaction, challenge, stepIndex = 0, galleryState, expiresAt, promptImage) {
    const step = getVerificationChallengeStep(challenge.id, stepIndex);
    const isGalleryChallenge = isComponentsV2GalleryChallenge(challenge, step);

    try {
        await sendInitialInteractionResponse(interaction, buildChallengeReplyOptions(challenge, stepIndex, galleryState, expiresAt, promptImage));
    }
    catch (err) {
        if (!isGalleryChallenge) {
            throw err;
        }

        console.error('Failed to send Components V2 verification challenge. Falling back to legacy embeds:', err);
        return replyWithLegacyGallery(interaction, challenge, stepIndex, galleryState, expiresAt, promptImage);
    }

    if (isGalleryChallenge) {
        await interaction.followUp(buildGalleryFallbackPrompt(challenge, stepIndex, galleryState, expiresAt)).catch((err) => {
            console.error('Failed to send Components V2 verification fallback prompt:', err);
        });
    }
}

function buildChallengeComponentCustomId(prefix, challengeId, stepIndex = 0, token) {
    return `${prefix}${challengeId}-${stepIndex}${token ? `-${token}` : ''}`;
}

function buildGiveAnswerRow(challengeId, stepIndex = 0, token) {
    return new Discord.ActionRowBuilder()
        .addComponents(
            new Discord.ButtonBuilder()
                .setCustomId(buildChallengeComponentCustomId('wardenVerify-answer-', challengeId, stepIndex, token))
                .setLabel('Give Answer')
                .setStyle(Discord.ButtonStyle.Primary),
        );
}

function buildAnswerModal(challengeId, stepIndex = 0, activeChallenge) {
    const challenge = verificationChallenges[challengeId];
    const step = getVerificationChallengeStep(challengeId, stepIndex);
    const answerInput = new Discord.TextInputBuilder()
        .setCustomId('answer')
        .setLabel('Verification answer')
        .setPlaceholder('Enter your Answer here')
        .setStyle(Discord.TextInputStyle.Short)
        .setRequired(true);
    const modal = new Discord.ModalBuilder()
        .setCustomId(buildChallengeComponentCustomId('wardenVerify-submit-', challengeId, stepIndex, activeChallenge?.gallery?.token))
        .setTitle('Verify')
        .addComponents(new Discord.ActionRowBuilder().addComponents(answerInput));

    if (isComponentsV2GalleryChallenge(challenge, step) || activeChallenge?.gallery) {
        const positionInput = new Discord.TextInputBuilder()
            .setCustomId('positions')
            .setLabel(step?.positionInputLabel ?? 'Image position(s)')
            .setPlaceholder(step?.positionInputPlaceholder ?? 'If multiple, seperate position numbers by commas or spaces')
            .setStyle(Discord.TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new Discord.ActionRowBuilder().addComponents(positionInput));
    }

    return modal;
}

function parseChallengeComponentCustomId(customId, prefix) {
    if (!customId.startsWith(prefix)) return undefined;

    const payload = customId.slice(prefix.length);
    const stepSeparatorIndex = payload.lastIndexOf('-');

    if (stepSeparatorIndex < 1) return undefined;

    let challengePayload = payload.slice(0, stepSeparatorIndex);
    let stepIndex = Number(payload.slice(stepSeparatorIndex + 1));
    let token;

    if (!Number.isInteger(stepIndex) || stepIndex < 0) {
        token = payload.slice(stepSeparatorIndex + 1);
        const tokenSeparatorIndex = challengePayload.lastIndexOf('-');

        if (tokenSeparatorIndex < 1) return undefined;

        stepIndex = Number(challengePayload.slice(tokenSeparatorIndex + 1));
        challengePayload = challengePayload.slice(0, tokenSeparatorIndex);
    }

    if (!Number.isInteger(stepIndex) || stepIndex < 0) return undefined;

    return { challengeId: challengePayload, stepIndex, token };
}

function parseAnswerCustomId(customId) {
    return parseChallengeComponentCustomId(customId, 'wardenVerify-answer-');
}

function parseSubmitCustomId(customId) {
    return parseChallengeComponentCustomId(customId, 'wardenVerify-submit-');
}

function parseOldVersionCustomId(customId) {
    return parseChallengeComponentCustomId(customId, 'wardenVerify-oldVersion-');
}

function isStaleGalleryComponent(parsedChallenge, activeChallenge) {
    if (!activeChallenge?.gallery?.token) return false;

    return parsedChallenge?.token !== activeChallenge.gallery.token;
}

async function completeVerification(interaction) {
    const verificationConfig = config.Warden?.verification;
    clearChallenge(interaction.user.id);
    clearCooldown(interaction.user.id);

    const unverifiedRoleId = verificationConfig?.unverifiedRoleId;

    if (unverifiedRoleId && interaction.member?.roles?.cache?.has(unverifiedRoleId)) {
        await interaction.member.roles.remove(unverifiedRoleId);
    }

    return sendInitialInteractionResponse(interaction, {
        embeds: [buildResultEmbed(
            verificationEmbedConfig.successEmbed,
            'Verification Complete',
            'You have been verified successfully.',
        )],
        flags: Discord.MessageFlags.Ephemeral,
    });
}

async function handleVerifyStart(interaction) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    }

    const verificationSettings = await getVerificationSettings(interaction.guild?.id);
    const verificationMode = resolveVerificationMode(verificationSettings);

    if (verificationMode === VERIFICATION_MODES.block) {
        return sendInitialInteractionResponse(interaction, {
            content: 'Verification is currently blocked.',
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    if (verificationMode === VERIFICATION_MODES.skipChallenge) {
        return completeVerification(interaction);
    }

    const cooldownRemaining = getCooldownRemaining(interaction.user.id);
    if (cooldownRemaining > 0) {
        const retryAt = Math.ceil((Date.now() + cooldownRemaining) / 1000);
        return sendInitialInteractionResponse(interaction, {
            content: `Please wait before trying verification again. You can retry <t:${retryAt}:R>.`,
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    const challengeExpiryMs = resolveChallengeExpiryMs(verificationSettings);
    const existingChallenge = getChallenge(interaction.user.id, challengeExpiryMs);
    if (existingChallenge) {
        return sendInitialInteractionResponse(interaction, {
            embeds: [buildInProgressEmbed(existingChallenge.expiresAt)],
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    const challenge = selectVerificationChallenge(verificationSettings);
    const challengeId = challenge.id;
    const stepIndex = 0;
    const step = getVerificationChallengeStep(challengeId, stepIndex);

    const isGalleryChallenge = isComponentsV2GalleryChallenge(challenge, step);
    const reservationToken = crypto.randomUUID();
    setChallenge(interaction.user.id, { challengeId, stepIndex, pending: true, reservationToken }, challengeExpiryMs);

    let galleryState;
    let promptImage;
    try {
        galleryState = isGalleryChallenge
            ? await prepareGalleryImageAttachments(createGalleryState(challenge, stepIndex))
            : undefined;
        promptImage = await preparePromptImageAttachment(challenge, step);
    }
    catch (err) {
        const reservedChallenge = getChallenge(interaction.user.id, challengeExpiryMs);
        if (reservedChallenge?.reservationToken === reservationToken) {
            clearChallenge(interaction.user.id);
        }

        if (err.code !== GALLERY_IMAGE_FETCH_TIMEOUT_CODE) {
            throw err;
        }

        console.error('Failed to prepare verification gallery challenge:', err);
        return sendInitialInteractionResponse(interaction, {
            content: 'Verification could not prepare the image challenge in time. Please click Verify again to retry.',
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    const reservedChallenge = getChallenge(interaction.user.id, challengeExpiryMs);
    if (!reservedChallenge || reservedChallenge.reservationToken !== reservationToken) {
        return sendInitialInteractionResponse(interaction, {
            embeds: [buildResultEmbed(
                verificationEmbedConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'Your verification challenge has expired. Please start verification again.',
            )],
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    setChallenge(interaction.user.id, {
        challengeId,
        stepIndex,
        gallery: galleryState,
        promptImage,
        createdTimestamp: reservedChallenge.createdTimestamp,
        expiresAt: reservedChallenge.expiresAt,
    }, challengeExpiryMs);
    const activeChallenge = getChallenge(interaction.user.id, challengeExpiryMs);

    return replyWithChallenge(interaction, challenge, stepIndex, galleryState, activeChallenge?.expiresAt, promptImage);
}

async function handleVerifyAnswer(interaction) {
    const verificationSettings = await getVerificationSettings(interaction.guild?.id);
    const verificationMode = resolveVerificationMode(verificationSettings);

    if (verificationMode === VERIFICATION_MODES.block) {
        return interaction.reply({ content: 'Verification is currently blocked.', flags: Discord.MessageFlags.Ephemeral });
    }

    if (verificationMode === VERIFICATION_MODES.skipChallenge) {
        return completeVerification(interaction);
    }

    const activeChallenge = getChallenge(interaction.user.id, resolveChallengeExpiryMs(verificationSettings));
    if (!activeChallenge) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'Your verification challenge has expired. Please start verification again.',
            )],
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    if (activeChallenge.pending) {
        return interaction.reply({
            embeds: [buildInProgressEmbed(activeChallenge.expiresAt)],
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    const clickedChallenge = parseAnswerCustomId(interaction.customId);
    const challengeId = activeChallenge.challengeId;
    const stepIndex = activeChallenge.stepIndex ?? 0;

    if (!clickedChallenge
        || clickedChallenge.challengeId !== challengeId
        || clickedChallenge.stepIndex !== stepIndex
        || isStaleGalleryComponent(clickedChallenge, activeChallenge)) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'This challenge button is no longer current. Please use the latest verification challenge message.',
            )],
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    return interaction.showModal(buildAnswerModal(challengeId, stepIndex, activeChallenge));
}

async function handleVerifyOldVersion(interaction) {
    const verificationSettings = await getVerificationSettings(interaction.guild?.id);
    const verificationMode = resolveVerificationMode(verificationSettings);

    if (verificationMode === VERIFICATION_MODES.block) {
        return interaction.reply({ content: 'Verification is currently blocked.', flags: Discord.MessageFlags.Ephemeral });
    }

    if (verificationMode === VERIFICATION_MODES.skipChallenge) {
        return completeVerification(interaction);
    }

    const activeChallenge = getChallenge(interaction.user.id, resolveChallengeExpiryMs(verificationSettings));
    if (!activeChallenge) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'Your verification challenge has expired. Please start verification again.',
            )],
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    if (activeChallenge.pending) {
        return interaction.reply({
            embeds: [buildInProgressEmbed(activeChallenge.expiresAt)],
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    const clickedChallenge = parseOldVersionCustomId(interaction.customId);
    const challengeId = activeChallenge.challengeId;
    const stepIndex = activeChallenge.stepIndex ?? 0;

    if (!clickedChallenge
        || clickedChallenge.challengeId !== challengeId
        || clickedChallenge.stepIndex !== stepIndex
        || isStaleGalleryComponent(clickedChallenge, activeChallenge)) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'This old version button is no longer current. Please use the latest verification challenge message.',
            )],
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    const challenge = verificationChallenges[challengeId] ?? getActiveVerificationChallenge({ verification: verificationSettings });
    const step = getVerificationChallengeStep(challengeId, stepIndex);

    if (!isComponentsV2GalleryChallenge(challenge, step)) {
        return interaction.reply({
            embeds: [userErrorEmbed('This verification challenge does not have an old version fallback.')],
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    return replyWithLegacyGallery(interaction, challenge, stepIndex, activeChallenge.gallery, activeChallenge.expiresAt, activeChallenge.promptImage);
}

async function handleVerifySubmit(interaction) {
    const verificationSettings = await getVerificationSettings(interaction.guild?.id);
    const verificationMode = resolveVerificationMode(verificationSettings);

    if (verificationMode === VERIFICATION_MODES.block) {
        return interaction.reply({ content: 'Verification is currently blocked.', flags: Discord.MessageFlags.Ephemeral });
    }

    if (verificationMode === VERIFICATION_MODES.skipChallenge) {
        return completeVerification(interaction);
    }

    const activeChallenge = getChallenge(interaction.user.id, resolveChallengeExpiryMs(verificationSettings));
    if (!activeChallenge) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'Your verification challenge has expired. Please start verification again.',
            )],
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    if (activeChallenge.pending) {
        return interaction.reply({
            embeds: [buildInProgressEmbed(activeChallenge.expiresAt)],
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    const submittedChallenge = parseSubmitCustomId(interaction.customId);
    const challengeId = activeChallenge.challengeId;
    const stepIndex = activeChallenge.stepIndex ?? 0;

    if (!submittedChallenge
        || submittedChallenge.challengeId !== challengeId
        || submittedChallenge.stepIndex !== stepIndex
        || isStaleGalleryComponent(submittedChallenge, activeChallenge)) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'This answer modal is no longer current. Please use the latest verification challenge message.',
            )],
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    const answer = interaction.fields.getTextInputValue('answer');
    const result = validateAnswer(challengeId, answer, stepIndex);
    const challenge = verificationChallenges[challengeId] ?? getActiveVerificationChallenge({ verification: verificationSettings });
    const step = getVerificationChallengeStep(challengeId, stepIndex);
    const galleryState = activeChallenge.gallery;
    const galleryResultOk = !isComponentsV2GalleryChallenge(challenge, step)
        || validatePositionAnswer(
            interaction.fields.getTextInputValue('positions'),
            galleryState?.solutionPositions ?? [],
            galleryState?.selectedImages?.length ?? 0,
        );

    if (!result.ok || !galleryResultOk) {
        const cooldownSeconds = resolveCooldownSeconds(verificationSettings);
        const retryAt = Date.now() + (cooldownSeconds * 1000);
        clearChallenge(interaction.user.id);
        setCooldown(interaction.user.id, retryAt);

        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.failureEmbed,
                'Verification Failed',
                'That answer was incorrect. Please try again in {cooldownSeconds} seconds.',
                { cooldownSeconds, retryTime: `<t:${Math.floor(retryAt / 1000)}:R>` },
            )],
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    if (hasNextVerificationChallengeStep(challengeId, stepIndex)) {
        const nextStepIndex = stepIndex + 1;
        const nextStep = getVerificationChallengeStep(challengeId, nextStepIndex);

        const isNextGalleryChallenge = isComponentsV2GalleryChallenge(challenge, nextStep);
        if (isNextGalleryChallenge && !interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
        }

        const nextGalleryState = isNextGalleryChallenge
            ? await prepareGalleryImageAttachments(createGalleryState(challenge, nextStepIndex))
            : undefined;

        setChallenge(interaction.user.id, { challengeId, stepIndex: nextStepIndex, gallery: nextGalleryState }, resolveChallengeExpiryMs(verificationSettings));
        const nextActiveChallenge = getChallenge(interaction.user.id, resolveChallengeExpiryMs(verificationSettings));

        return replyWithChallenge(interaction, challenge, nextStepIndex, nextGalleryState, nextActiveChallenge?.expiresAt);
    }

    return completeVerification(interaction);
}

module.exports = {
    VERIFICATION_MODES,
    handleVerifyStart,
    handleVerifyHelp,
    handleVerifyAnswer,
    handleVerifyOldVersion,
    handleVerifySubmit,
    data: new Discord.SlashCommandBuilder()
        .setName('verification')
        .setDescription('Manage Warden verification')
        .setDefaultMemberPermissions(Discord.PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('post')
                .setDescription('Post a new verification post or refresh one by message ID')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to post the verification post in')
                        .addChannelTypes(
                            Discord.ChannelType.GuildText,
                            Discord.ChannelType.GuildAnnouncement,
                        )
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('Existing verification post message ID to refresh')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('mode')
                .setDescription('Set the persisted verification mode')
                .addStringOption(option =>
                    option
                        .setName('setting')
                        .setDescription('Verification mode to use')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Challenge', value: VERIFICATION_MODES.challenge },
                            { name: 'Block', value: VERIFICATION_MODES.block },
                            { name: 'Skip Challenge', value: VERIFICATION_MODES.skipChallenge },
                        )
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('autokick')
                .setDescription('Set the persisted verification autokick state and timer')
                .addStringOption(option =>
                    option
                        .setName('setting')
                        .setDescription('Whether verification autokick is enabled')
                        .setRequired(true)
                        .addChoices(
                            { name: 'On', value: 'on' },
                            { name: 'Off', value: 'off' },
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('timer')
                        .setDescription('Autokick delay, such as 10m, 600s, or 10 minutes')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('challenge')
                .setDescription('Manage configured Warden verification challenges')
                .addStringOption(option =>
                    option
                        .setName('action')
                        .setDescription('Challenge setting to inspect or update')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Lists verification state and info', value: 'list' },
                            { name: 'Set active challenge ID list', value: 'set' },
                            { name: 'Set prompt expiry timer', value: 'timer' },
                            { name: 'Set retry cooldown timer', value: 'cooldown' },
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('id')
                        .setDescription('Complete challenge ID list for set, separated by commas or spaces')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('time')
                        .setDescription('Duration for timer or cooldown, such as 90s, 2m, or 2 minutes')
                        .setRequired(false)
                )
        ),
    async execute(interaction) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

        try {
            const verificationConfig = config.Warden?.verification;
            const subcommand = interaction.options.getSubcommand();

            const guildId = interaction.guild?.id;

            if (subcommand === 'mode') {
                const mode = interaction.options.getString('setting', true);
                await setVerificationMode(guildId, mode, interaction.user.id);
                return interaction.editReply({ content: `Verification mode set to **${mode}**.` });
            }


            if (subcommand === 'autokick') {
                const setting = interaction.options.getString('setting', true);
                const timerInput = interaction.options.getString('timer');
                const durationSeconds = timerInput ? parseDurationSeconds(timerInput) : undefined;

                if (timerInput && !durationSeconds) {
                    return interaction.editReply({ embeds: [userErrorEmbed('Please provide a valid autokick timer, such as `600s`, `10m`, or `10 minutes`.')] });
                }

                const updatedSettings = await setAutokickSettings(guildId, setting === 'on', durationSeconds, interaction.user.id);
                return interaction.editReply({ content: `Verification autokick is now **${updatedSettings.autokickEnabled ? 'on' : 'off'}** with a timer of **${formatDuration(updatedSettings.autokickSeconds)}**.` });
            }

            if (subcommand === 'challenge') {
                const action = interaction.options.getString('action', true);
                const verificationSettings = await getVerificationSettings(guildId);
                const enabledChallengeIds = getEnabledVerificationChallenges({ verification: verificationSettings }).map((challenge) => challenge.id);

                if (action === 'list') {
                    const challengeList = Object.values(verificationChallenges)
                        .map(challenge => `${enabledChallengeIds.includes(challenge.id) ? '**' : ''}${challenge.id}${enabledChallengeIds.includes(challenge.id) ? '** [active]' : ''}`)
                        .join('\n');

                    return interaction.editReply({ content: `Configured verification challenge IDs:
${challengeList}

Prompt expiry: **${formatDuration(verificationSettings.challengeExpirySeconds)}**
Retry cooldown: **${formatDuration(verificationSettings.cooldownSeconds)}**
Autokick: **${verificationSettings.autokickEnabled ? 'on' : 'off'}** after **${formatDuration(verificationSettings.autokickSeconds)}**` });
                }

                if (action === 'timer' || action === 'cooldown') {
                    const durationSeconds = parseDurationSeconds(interaction.options.getString('time'));
                    if (!durationSeconds) {
                        return interaction.editReply({ embeds: [userErrorEmbed('Please provide a valid time, such as `90s`, `2m`, or `2 minutes`.')] });
                    }

                    const updatedSettings = action === 'timer'
                        ? await setChallengeExpirySeconds(guildId, durationSeconds, interaction.user.id)
                        : await setCooldownSeconds(guildId, durationSeconds, interaction.user.id);
                    const settingName = action === 'timer' ? 'challenge expiry timer' : 'verification retry cooldown';
                    const updatedSeconds = action === 'timer' ? updatedSettings.challengeExpirySeconds : updatedSettings.cooldownSeconds;

                    return interaction.editReply({ content: `Updated ${settingName} to **${formatDuration(updatedSeconds)}**.` });
                }

                if (action === 'set') {
                    const challengeIds = parseChallengeIdList(interaction.options.getString('id'));
                    if (challengeIds.length < 1) {
                        return interaction.editReply({ embeds: [userErrorEmbed('Please provide at least one challenge ID. To stop serving challenges, use `/verification mode block` or `/verification mode skip_challenge` instead.')] });
                    }

                    const unknownChallengeIds = challengeIds.filter((challengeId) => !verificationChallenges[challengeId]);
                    if (unknownChallengeIds.length > 0) {
                        return interaction.editReply({ embeds: [userErrorEmbed(`Unknown verification challenge ID${unknownChallengeIds.length === 1 ? '' : 's'}: ${unknownChallengeIds.join(', ')}`)] });
                    }

                    const updatedSettings = await setActiveChallengeIds(guildId, challengeIds, interaction.user.id);
                    return interaction.editReply({ content: `Active verification challenges set to: ${updatedSettings.activeChallengeIds.join(', ')}` });
                }
            }


            const verificationSettings = await getVerificationSettings(guildId);
            if (resolveVerificationMode(verificationSettings) === VERIFICATION_MODES.block) {
                return interaction.editReply({ embeds: [userErrorEmbed('Verification is blocked in the Warden settings.')] });
            }

            const configuredChannelId = verificationConfig?.channelId;
            const optionChannel = interaction.options.getChannel('channel');
            const messageId = interaction.options.getString('message_id');

            const welcomeEmbed = buildWelcomeEmbed(verificationSettings);
            const components = buildVerificationPostComponents();

            if (messageId) {
                const message = await fetchVerificationMessage(interaction, messageId);
                if (!message) {
                    return interaction.editReply({ embeds: [userErrorEmbed('Could not find that verification post. Please check the message ID.')] });
                }

                await message.edit({ embeds: [welcomeEmbed], components });
                return interaction.editReply({ content: `Verification post refreshed successfully: ${message.url}` });
            }

            const targetChannelId = optionChannel?.id ?? configuredChannelId;
            if (!targetChannelId) {
                return interaction.editReply({ embeds: [userErrorEmbed('No verification channel is configured. Please provide a channel option.')] });
            }

            const targetChannel = optionChannel ?? await interaction.guild.channels.fetch(targetChannelId);
            if (!targetChannel || !targetChannel.isTextBased()) {
                return interaction.editReply({ embeds: [userErrorEmbed('The verification channel could not be found or is not a text channel.')] });
            }

            const message = await targetChannel.send({ embeds: [welcomeEmbed], components });

            return interaction.editReply({ content: `Verification post posted successfully in ${targetChannel}. ${message.url}` });
        }
        catch (err) {
            console.log(err);
            botLog(interaction.guild, new Discord.EmbedBuilder()
                .setTitle('⛔ Verification post failed')
                .setDescription('```' + err.stack + '```')
                , 2, 'error'
            );

            return interaction.editReply({ embeds: [userErrorEmbed('Failed to post the verification message. Please try again later.')] });
        }
    },
};
