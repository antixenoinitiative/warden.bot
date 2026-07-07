const Discord = require('discord.js');
const verificationEmbedConfig = require('./verificationEmbedConfig.json');
const {
    resolveEmbedColor,
    resolveComponentAccentColor,
    applyFieldToEmbed,
} = require('./verificationResponses');
const {
    verificationChallenges,
    getVerificationChallengeStep,
    getVerificationChallengeSteps,
    resolvePrompt,
} = require('./verificationChallenges');

const COMPONENTS_V2_RENDER_MODE = 'componentsV2Gallery';
const LEGACY_GALLERY_FIRST_PAGE_IMAGE_LIMIT = 9;
const LEGACY_GALLERY_FOLLOWUP_IMAGE_LIMIT = 10;

function buildExpiryLine(expiresAt) {
    if (!expiresAt) return undefined;
    return `-# This prompt will expire in <t:${Math.floor(expiresAt / 1000)}:R>`;
}

function buildGalleryOrderLine(galleryState) {
    if (galleryState?.compositeImage?.displayUrl) {
        return '-# **Use the number labels in the top-left of each grid square; positions read left-to-right by row.**';
    }

    return '-# **Click the gallery to view image order; positions start top-left, left-to-right by row.**';
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
    const view = resolveChallengePresentation(challenge, stepIndex, expiresAt);
    const { step, embedConfig, totalSteps, stepLabel, expiryLine, prompt } = view;
    const stepDescription = step?.description ? `${step.description}\n\n` : '';
    let description = embedConfig.description ?? '{challenge}';

    description = description
        .replaceAll('{challenge}', `${stepDescription}${prompt}`)
        .replaceAll('{step}', String(stepIndex + 1))
        .replaceAll('{totalSteps}', String(totalSteps));

    const embed = new Discord.EmbedBuilder()
        .setColor(resolveEmbedColor(view.color))
        .setTitle(view.title)
        .setDescription([`${description}${stepLabel}`, expiryLine].filter(Boolean).join('\n\n'));

    if (view.imageUrl) {
        embed.setImage(view.imageUrl);
    }

    if (view.thumbnailUrl) {
        embed.setThumbnail(view.thumbnailUrl);
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

function getGalleryImageAttachments(selectedImages = [], compositeImage) {
    if (compositeImage?.attachment) {
        return [compositeImage.attachment];
    }

    return selectedImages
        .map((image) => image.attachment)
        .filter(Boolean);
}

function getGalleryDisplayImages(galleryState) {
    if (galleryState?.compositeImage?.displayUrl) {
        return [{
            displayUrl: galleryState.compositeImage.displayUrl,
            position: `1-${galleryState.selectedImages?.length ?? 9}`,
            description: `Positions 1-${galleryState.selectedImages?.length ?? 9} in a labeled grid`,
        }];
    }

    return galleryState?.selectedImages ?? [];
}

function getGalleryDisplayUrl(image) {
    return image.displayUrl ?? image.url;
}

function resolveChallengePresentation(challenge, stepIndex = 0, expiresAt, galleryState, promptImage) {
    const step = getVerificationChallengeStep(challenge.id, stepIndex);
    const embedConfig = verificationEmbedConfig.challengeEmbed ?? {};
    const steps = getVerificationChallengeSteps(challenge);
    const totalSteps = steps.length || 1;
    const stepLabel = totalSteps > 1 ? `\n\nStep ${stepIndex + 1} of ${totalSteps}` : '';
    const expiryLine = buildExpiryLine(expiresAt);
    const prompt = resolvePrompt(challenge, step);
    const questionText = step?.questionText ?? challenge.questionText;
    const galleryPrompt = step?.galleryPrompt ?? challenge.galleryPrompt;

    return {
        challenge,
        step,
        embedConfig,
        stepIndex,
        totalSteps,
        stepLabel,
        expiryLine,
        prompt,
        questionText,
        galleryPrompt,
        selectedImages: galleryState?.selectedImages ?? [],
        displayImages: getGalleryDisplayImages(galleryState),
        title: step?.title ?? embedConfig.title ?? 'Verification Challenge',
        color: step?.color ?? embedConfig.color,
        fields: step?.fields ?? [],
        imageUrl: step?.imageUrl ?? challenge.imageUrl,
        thumbnailUrl: step?.thumbnailUrl ?? challenge.thumbnailUrl,
        promptImage,
        galleryState,
    };
}

function buildChallengeComponentsV2(challenge, stepIndex = 0, galleryState, expiresAt, promptImage) {
    assertComponentsV2Support();

    const view = resolveChallengePresentation(challenge, stepIndex, expiresAt, galleryState, promptImage);
    const { step, stepLabel, title, prompt, questionText, galleryPrompt, selectedImages, displayImages, expiryLine } = view;

    if (selectedImages.length < 1) {
        throw new Error(`No gallery images were selected for challenge "${challenge.id}".`);
    }

    const container = new Discord.ContainerBuilder()
        .setAccentColor(resolveComponentAccentColor(view.color));

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

    if (questionText) {
        container.addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent(questionText),
        );
    }

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
            displayImages.map((image) => new Discord.MediaGalleryItemBuilder()
                .setURL(getGalleryDisplayUrl(image))
                .setDescription(image.description ?? `Position ${image.position}`)),
        ),
    );

    container.addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(buildGalleryOrderLine(galleryState)),
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
            files: [...getPromptImageAttachment(promptImage), ...getGalleryImageAttachments(galleryState?.selectedImages, galleryState?.compositeImage)],
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
    const view = resolveChallengePresentation(challenge, stepIndex, expiresAt, galleryState, promptImage);
    const { step, stepLabel, prompt, questionText, galleryPrompt } = view;
    const challengeEmbed = new Discord.EmbedBuilder()
        .setColor(resolveEmbedColor(view.color))
        .setTitle(view.title)
        .setDescription([
            step?.description,
            promptImage?.displayUrl
                ? ['**Question 1**', questionText].filter(Boolean).join('\n')
                : `**Question 1**\n${questionText ? `${questionText}\n` : ''}${prompt}`,
            galleryPrompt ? `**Question 2**\n${galleryPrompt}${stepLabel}` : undefined,
            buildExpiryLine(expiresAt),
        ].filter(Boolean).join('\n\n'));

    if (promptImage?.displayUrl) {
        challengeEmbed.setImage(promptImage.displayUrl);
    }

    for (const field of step?.fields ?? []) {
        applyFieldToEmbed(challengeEmbed, field);
    }

    const imageEmbeds = getGalleryDisplayImages(galleryState).map((image) => {
        return new Discord.EmbedBuilder()
            .setColor(resolveEmbedColor(view.color))
            .setTitle(image.description ?? `Position ${image.position}`)
            .setImage(getGalleryDisplayUrl(image));
    });

    return [challengeEmbed, ...imageEmbeds];
}

function buildLegacyGalleryReplyOptions(challenge, stepIndex = 0, galleryState, embeds, expiresAt, files, promptImage) {
    return {
        embeds: embeds ?? buildLegacyGalleryEmbeds(challenge, stepIndex, galleryState, expiresAt, promptImage),
        files: files ?? [...getPromptImageAttachment(promptImage), ...getGalleryImageAttachments(galleryState?.selectedImages, galleryState?.compositeImage)],
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
            files: [...getPromptImageAttachment(promptImage), ...getGalleryImageAttachments(selectedImages.slice(0, LEGACY_GALLERY_FIRST_PAGE_IMAGE_LIMIT), galleryState?.compositeImage)],
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


module.exports = {
    isComponentsV2GalleryChallenge,
    buildAnswerModal,
    parseAnswerCustomId,
    parseSubmitCustomId,
    parseOldVersionCustomId,
    isStaleGalleryComponent,
    replyWithChallenge,
    replyWithLegacyGallery,
};
