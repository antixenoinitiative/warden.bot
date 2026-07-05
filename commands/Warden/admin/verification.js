const Discord = require('discord.js');
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
    enableChallengeId,
    disableChallengeId,
} = require('../verification/verificationSettings');

const VERIFICATION_MODES = {
    enabled: 'enabled',
    disabled: 'disabled',
    skip: 'skip',
};

const COMPONENTS_V2_RENDER_MODE = 'componentsV2Gallery';
const DEFAULT_GALLERY_SIZE = 6;

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
        ...pickRandomItems(solutionImages, solutionCount, 'solution'),
        ...pickRandomItemsWithRepeatLimit(controlImages, controlCount, maxControlImageRepeats, 'control'),
    ]).map((image, index) => ({
        ...image,
        position: index + 1,
    }));

    return {
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

    if (verificationSettings?.enabled === false) return VERIFICATION_MODES.disabled;

    return VERIFICATION_MODES.enabled;
}

function userErrorEmbed(message) {
    return new Discord.EmbedBuilder()
        .setColor(resolveEmbedColor('#E74C3C'))
        .setTitle('Verification Error')
        .setDescription(message);
}


function selectVerificationChallenge(verificationSettings) {
    const enabledChallenges = getEnabledVerificationChallenges({ verification: verificationSettings });
    if (enabledChallenges.length < 2) {
        return enabledChallenges[0] ?? getActiveVerificationChallenge({ verification: verificationSettings });
    }

    return enabledChallenges[Math.floor(Math.random() * enabledChallenges.length)];
}

function buildWelcomeEmbed() {
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

    return embed;
}

function buildResultEmbed(embedConfig, fallbackTitle, fallbackDescription, replacements = {}) {
    let description = embedConfig?.description ?? fallbackDescription;

    for (const [key, value] of Object.entries(replacements)) {
        description = description.replaceAll(`{${key}}`, String(value));
    }

    return new Discord.EmbedBuilder()
        .setColor(resolveEmbedColor(embedConfig?.color))
        .setTitle(embedConfig?.title ?? fallbackTitle)
        .setDescription(description);
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

function buildChallengeEmbeds(challenge, stepIndex = 0) {
    const step = getVerificationChallengeStep(challenge.id, stepIndex);
    const embedConfig = verificationEmbedConfig.challengeEmbed ?? {};
    const steps = getVerificationChallengeSteps(challenge);
    const totalSteps = steps.length || 1;
    const stepLabel = totalSteps > 1 ? `\n\nStep ${stepIndex + 1} of ${totalSteps}` : '';
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
        .setDescription(`${description}${stepLabel}`);

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

function buildChallengeComponentsV2(challenge, stepIndex = 0, galleryState) {
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
        new Discord.TextDisplayBuilder().setContent(`**Question 1**\n${prompt}`),
    );

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
                .setURL(image.url)
                .setDescription(`Position ${image.position}`)),
        ),
    );

    container.addActionRowComponents(buildGiveAnswerRow(challenge.id, stepIndex));

    return [container];
}

function buildChallengeReplyOptions(challenge, stepIndex = 0, galleryState) {
    const step = getVerificationChallengeStep(challenge.id, stepIndex);

    if (isComponentsV2GalleryChallenge(challenge, step)) {
        return {
            components: buildChallengeComponentsV2(challenge, stepIndex, galleryState),
            flags: Discord.MessageFlags.Ephemeral | Discord.MessageFlags.IsComponentsV2,
        };
    }

    return {
        embeds: buildChallengeEmbeds(challenge, stepIndex),
        components: [buildGiveAnswerRow(challenge.id, stepIndex)],
        ephemeral: true,
    };
}

function buildOldVersionRow(challengeId, stepIndex = 0) {
    return new Discord.ActionRowBuilder()
        .addComponents(
            new Discord.ButtonBuilder()
                .setCustomId(`wardenVerify-oldVersion-${challengeId}-${stepIndex}`)
                .setLabel('Old Version')
                .setStyle(Discord.ButtonStyle.Secondary),
        );
}

function buildGalleryFallbackPrompt(challenge, stepIndex = 0) {
    return {
        embeds: [
            new Discord.EmbedBuilder()
                .setColor(resolveEmbedColor(verificationEmbedConfig.challengeEmbed?.color))
                .setTitle('Not working?')
                .setDescription('If you cannot see the Verification Challenge please update your client, or click the Old Version button below.'),
        ],
        components: [buildOldVersionRow(challenge.id, stepIndex)],
        ephemeral: true,
    };
}

function buildLegacyGalleryEmbeds(challenge, stepIndex = 0, galleryState) {
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
            `**Question 1**\n${prompt}`,
            galleryPrompt ? `**Question 2**\n${galleryPrompt}${stepLabel}` : undefined,
        ].filter(Boolean).join('\n\n'));

    for (const field of step?.fields ?? []) {
        applyFieldToEmbed(challengeEmbed, field);
    }

    const imageEmbeds = (galleryState?.selectedImages ?? []).map((image) => {
        return new Discord.EmbedBuilder()
            .setColor(resolveEmbedColor(step?.color ?? embedConfig.color))
            .setTitle(`Position ${image.position}`)
            .setImage(image.url);
    });

    return [challengeEmbed, ...imageEmbeds].slice(0, 10);
}

function buildLegacyGalleryReplyOptions(challenge, stepIndex = 0, galleryState) {
    return {
        embeds: buildLegacyGalleryEmbeds(challenge, stepIndex, galleryState),
        components: [buildGiveAnswerRow(challenge.id, stepIndex)],
        ephemeral: true,
    };
}

async function replyWithChallenge(interaction, challenge, stepIndex = 0, galleryState) {
    const step = getVerificationChallengeStep(challenge.id, stepIndex);
    const isGalleryChallenge = isComponentsV2GalleryChallenge(challenge, step);

    try {
        await interaction.reply(buildChallengeReplyOptions(challenge, stepIndex, galleryState));
    }
    catch (err) {
        if (!isGalleryChallenge) {
            throw err;
        }

        console.error('Failed to send Components V2 verification challenge. Falling back to legacy embeds:', err);
        return interaction.reply(buildLegacyGalleryReplyOptions(challenge, stepIndex, galleryState));
    }

    if (isGalleryChallenge) {
        await interaction.followUp(buildGalleryFallbackPrompt(challenge, stepIndex)).catch((err) => {
            console.error('Failed to send Components V2 verification fallback prompt:', err);
        });
    }
}

function buildGiveAnswerRow(challengeId, stepIndex = 0) {
    return new Discord.ActionRowBuilder()
        .addComponents(
            new Discord.ButtonBuilder()
                .setCustomId(`wardenVerify-answer-${challengeId}-${stepIndex}`)
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
        .setCustomId(`wardenVerify-submit-${challengeId}-${stepIndex}`)
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

    const challengeId = payload.slice(0, stepSeparatorIndex);
    const stepIndex = Number(payload.slice(stepSeparatorIndex + 1));

    if (!Number.isInteger(stepIndex) || stepIndex < 0) return undefined;

    return { challengeId, stepIndex };
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

async function completeVerification(interaction) {
    const verificationConfig = config.Warden?.verification;
    clearChallenge(interaction.user.id);
    clearCooldown(interaction.user.id);

    const unverifiedRoleId = verificationConfig?.unverifiedRoleId;

    if (unverifiedRoleId && interaction.member?.roles?.cache?.has(unverifiedRoleId)) {
        await interaction.member.roles.remove(unverifiedRoleId);
    }

    return interaction.reply({
        embeds: [buildResultEmbed(
            verificationEmbedConfig.successEmbed,
            'Verification Complete',
            'You have been verified successfully.',
        )],
        ephemeral: true,
    });
}

async function handleVerifyStart(interaction) {
    const verificationSettings = await getVerificationSettings(interaction.guild?.id);
    const verificationMode = resolveVerificationMode(verificationSettings);

    if (verificationMode === VERIFICATION_MODES.disabled) {
        return interaction.reply({ content: 'Verification is currently disabled.', ephemeral: true });
    }

    if (verificationMode === VERIFICATION_MODES.skip) {
        return completeVerification(interaction);
    }

    const cooldownRemaining = getCooldownRemaining(interaction.user.id);
    if (cooldownRemaining > 0) {
        const retryAt = Math.ceil((Date.now() + cooldownRemaining) / 1000);
        return interaction.reply({ content: `Please wait before trying verification again. You can retry <t:${retryAt}:R>.`, ephemeral: true });
    }

    const challenge = selectVerificationChallenge(verificationSettings);
    const challengeId = challenge.id;
    const stepIndex = 0;
    const step = getVerificationChallengeStep(challengeId, stepIndex);
    const galleryState = isComponentsV2GalleryChallenge(challenge, step)
        ? createGalleryState(challenge, stepIndex)
        : undefined;
    setChallenge(interaction.user.id, { challengeId, stepIndex, gallery: galleryState });

    return replyWithChallenge(interaction, challenge, stepIndex, galleryState);
}

async function handleVerifyAnswer(interaction) {
    const verificationSettings = await getVerificationSettings(interaction.guild?.id);
    const verificationMode = resolveVerificationMode(verificationSettings);

    if (verificationMode === VERIFICATION_MODES.disabled) {
        return interaction.reply({ content: 'Verification is currently disabled.', ephemeral: true });
    }

    if (verificationMode === VERIFICATION_MODES.skip) {
        return completeVerification(interaction);
    }

    const activeChallenge = getChallenge(interaction.user.id);
    if (!activeChallenge) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'Your verification challenge has expired. Please start verification again.',
            )],
            ephemeral: true,
        });
    }

    const clickedChallenge = parseAnswerCustomId(interaction.customId);
    const challengeId = activeChallenge.challengeId;
    const stepIndex = activeChallenge.stepIndex ?? 0;

    if (!clickedChallenge
        || clickedChallenge.challengeId !== challengeId
        || clickedChallenge.stepIndex !== stepIndex) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'This challenge button is no longer current. Please use the latest verification challenge message.',
            )],
            ephemeral: true,
        });
    }

    return interaction.showModal(buildAnswerModal(challengeId, stepIndex, activeChallenge));
}

async function handleVerifyOldVersion(interaction) {
    const verificationSettings = await getVerificationSettings(interaction.guild?.id);
    const verificationMode = resolveVerificationMode(verificationSettings);

    if (verificationMode === VERIFICATION_MODES.disabled) {
        return interaction.reply({ content: 'Verification is currently disabled.', ephemeral: true });
    }

    if (verificationMode === VERIFICATION_MODES.skip) {
        return completeVerification(interaction);
    }

    const activeChallenge = getChallenge(interaction.user.id);
    if (!activeChallenge) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'Your verification challenge has expired. Please start verification again.',
            )],
            ephemeral: true,
        });
    }

    const clickedChallenge = parseOldVersionCustomId(interaction.customId);
    const challengeId = activeChallenge.challengeId;
    const stepIndex = activeChallenge.stepIndex ?? 0;

    if (!clickedChallenge
        || clickedChallenge.challengeId !== challengeId
        || clickedChallenge.stepIndex !== stepIndex) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'This old version button is no longer current. Please use the latest verification challenge message.',
            )],
            ephemeral: true,
        });
    }

    const challenge = verificationChallenges[challengeId] ?? getActiveVerificationChallenge({ verification: verificationSettings });
    const step = getVerificationChallengeStep(challengeId, stepIndex);

    if (!isComponentsV2GalleryChallenge(challenge, step)) {
        return interaction.reply({
            embeds: [userErrorEmbed('This verification challenge does not have an old version fallback.')],
            ephemeral: true,
        });
    }

    return interaction.reply(buildLegacyGalleryReplyOptions(challenge, stepIndex, activeChallenge.gallery));
}

async function handleVerifySubmit(interaction) {
    const verificationSettings = await getVerificationSettings(interaction.guild?.id);
    const verificationMode = resolveVerificationMode(verificationSettings);

    if (verificationMode === VERIFICATION_MODES.disabled) {
        return interaction.reply({ content: 'Verification is currently disabled.', ephemeral: true });
    }

    if (verificationMode === VERIFICATION_MODES.skip) {
        return completeVerification(interaction);
    }

    const activeChallenge = getChallenge(interaction.user.id);
    if (!activeChallenge) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'Your verification challenge has expired. Please start verification again.',
            )],
            ephemeral: true,
        });
    }

    const submittedChallenge = parseSubmitCustomId(interaction.customId);
    const challengeId = activeChallenge.challengeId;
    const stepIndex = activeChallenge.stepIndex ?? 0;

    if (!submittedChallenge
        || submittedChallenge.challengeId !== challengeId
        || submittedChallenge.stepIndex !== stepIndex) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'This answer modal is no longer current. Please use the latest verification challenge message.',
            )],
            ephemeral: true,
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
        const cooldownSeconds = Number(config.Warden?.verification?.cooldownSeconds ?? 60);
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
            ephemeral: true,
        });
    }

    if (hasNextVerificationChallengeStep(challengeId, stepIndex)) {
        const nextStepIndex = stepIndex + 1;
        const nextStep = getVerificationChallengeStep(challengeId, nextStepIndex);
        const nextGalleryState = isComponentsV2GalleryChallenge(challenge, nextStep)
            ? createGalleryState(challenge, nextStepIndex)
            : undefined;
        setChallenge(interaction.user.id, { challengeId, stepIndex: nextStepIndex, gallery: nextGalleryState });

        return replyWithChallenge(interaction, challenge, nextStepIndex, nextGalleryState);
    }

    return completeVerification(interaction);
}

module.exports = {
    VERIFICATION_MODES,
    handleVerifyStart,
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
                .setDescription('Post the verification welcome message')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to post the verification welcome message in')
                        .addChannelTypes(
                            Discord.ChannelType.GuildText,
                            Discord.ChannelType.GuildAnnouncement,
                        )
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
                            { name: 'Enabled', value: VERIFICATION_MODES.enabled },
                            { name: 'Disabled', value: VERIFICATION_MODES.disabled },
                            { name: 'Skip', value: VERIFICATION_MODES.skip },
                        )
                )
        )
        .addSubcommandGroup(group =>
            group
                .setName('challenge')
                .setDescription('Inspect configured Warden verification challenges')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('List configured verification challenge IDs')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('set')
                        .setDescription('Set the only enabled verification challenge')
                        .addStringOption(option =>
                            option
                                .setName('id')
                                .setDescription('Challenge ID to set as the only active challenge')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('enable')
                        .setDescription('Enable a verification challenge')
                        .addStringOption(option =>
                            option
                                .setName('id')
                                .setDescription('Challenge ID to enable')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('disable')
                        .setDescription('Disable a verification challenge')
                        .addStringOption(option =>
                            option
                                .setName('id')
                                .setDescription('Challenge ID to disable')
                                .setRequired(true)
                        )
                )
        ),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const verificationConfig = config.Warden?.verification;
            const subcommandGroup = interaction.options.getSubcommandGroup(false);
            const subcommand = interaction.options.getSubcommand();

            const guildId = interaction.guild?.id;

            if (subcommand === 'mode') {
                const mode = interaction.options.getString('setting', true);
                await setVerificationMode(guildId, mode, interaction.user.id);
                return interaction.editReply({ content: `Verification mode set to **${mode}**.` });
            }

            if (subcommandGroup === 'challenge') {
                const verificationSettings = await getVerificationSettings(guildId);
                const activeChallenge = getActiveVerificationChallenge({ verification: verificationSettings });
                const enabledChallengeIds = getEnabledVerificationChallenges({ verification: verificationSettings }).map((challenge) => challenge.id);

                if (subcommand === 'list') {
                    const challengeList = Object.values(verificationChallenges)
                        .map(challenge => `${challenge.id === activeChallenge.id ? '**' : ''}${challenge.id}${challenge.id === activeChallenge.id ? '** (active)' : ''}${enabledChallengeIds.includes(challenge.id) ? ' [enabled]' : ''}`)
                        .join('\n');

                    return interaction.editReply({ content: `Configured verification challenge IDs:\n${challengeList}` });
                }

                const challengeId = interaction.options.getString('id', true);
                if (!verificationChallenges[challengeId]) {
                    return interaction.editReply({ embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });
                }

                if (subcommand === 'set') {
                    const updatedSettings = await setActiveChallengeIds(guildId, [challengeId], interaction.user.id);
                    return interaction.editReply({ content: `Verification challenges set to: ${updatedSettings.activeChallengeIds.join(', ')}` });
                }

                if (subcommand === 'enable') {
                    const updatedSettings = await enableChallengeId(guildId, challengeId, interaction.user.id);
                    return interaction.editReply({ content: `Enabled verification challenge **${challengeId}**. Active challenges: ${updatedSettings.activeChallengeIds.join(', ')}` });
                }

                if (subcommand === 'disable') {
                    if (enabledChallengeIds.length === 1 && enabledChallengeIds.includes(challengeId)) {
                        return interaction.editReply({ embeds: [userErrorEmbed('At least one verification challenge must remain enabled. Use `/verification mode disabled` or `/verification mode skip` if you do not want challenge verification.')] });
                    }

                    const updatedSettings = await disableChallengeId(guildId, challengeId, interaction.user.id);
                    return interaction.editReply({ content: `Disabled verification challenge **${challengeId}**. Active challenges: ${updatedSettings.activeChallengeIds.join(', ')}` });
                }
            }

            const verificationSettings = await getVerificationSettings(guildId);
            if (resolveVerificationMode(verificationSettings) === VERIFICATION_MODES.disabled) {
                return interaction.editReply({ embeds: [userErrorEmbed('Verification is disabled in the Warden settings.')] });
            }

            const configuredChannelId = verificationConfig?.channelId;
            const optionChannel = interaction.options.getChannel('channel');
            const targetChannelId = optionChannel?.id ?? configuredChannelId;

            if (!targetChannelId) {
                return interaction.editReply({ embeds: [userErrorEmbed('No verification channel is configured. Please provide a channel option.')] });
            }

            const targetChannel = optionChannel ?? await interaction.guild.channels.fetch(targetChannelId);

            if (!targetChannel || !targetChannel.isTextBased()) {
                return interaction.editReply({ embeds: [userErrorEmbed('The verification channel could not be found or is not a text channel.')] });
            }

            const welcomeEmbed = buildWelcomeEmbed();
            const row = new Discord.ActionRowBuilder()
                .addComponents(
                    new Discord.ButtonBuilder()
                        .setCustomId('wardenVerify-start')
                        .setLabel('Verify')
                        .setStyle(Discord.ButtonStyle.Success),
                );

            const message = await targetChannel.send({ embeds: [welcomeEmbed], components: [row] });

            return interaction.editReply({ content: `Verification message posted successfully in ${targetChannel}. ${message.url}` });
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
