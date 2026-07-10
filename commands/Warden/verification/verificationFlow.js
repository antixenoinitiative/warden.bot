const Discord = require('discord.js');
const crypto = require('crypto');
const config = require('../../../config.json');
const { botLog } = require('../../../functions');
const {
    VERIFICATION_MODES,
    getVerificationSettings,
} = require('./verificationSettings');
const {
    verificationChallenges,
    getActiveVerificationChallenge,
    applyVerificationChallengeOverrides,
    getEnabledVerificationChallenges,
    getVerificationChallengeStep,
    hasNextVerificationChallengeStep,
    validateAnswer,
} = require('./verificationChallenges');
const {
    GALLERY_IMAGE_FETCH_TIMEOUT_CODE,
    createGalleryState,
    prepareGalleryImageAttachments,
    preparePromptImageAttachment,
} = require('./verificationImages');
const {
    buildVerificationPublicResponse,
    buildVerificationInProgressResponse,
    buildVerificationExpiredResponse,
    buildVerificationFailureResponse,
    buildVerificationErrorEmbed,
    isComponentsV2GalleryChallenge,
    buildAnswerModal,
    parseAnswerCustomId,
    parseSubmitCustomId,
    parseOldVersionCustomId,
    isStaleGalleryComponent,
    replyWithChallenge,
    replyWithLegacyGallery,
    sendInitialInteractionResponse,
} = require('./verificationResponses');

const DEFAULT_CHALLENGE_EXPIRY_MS = 10 * 60 * 1000;

// Verification challenge and cooldown state is intentionally in-memory only.
// It is not persisted and will reset whenever the bot process restarts.
const activeChallenges = new Map();
const cooldowns = new Map();

function setChallenge(userId, challenge, expiryMs = DEFAULT_CHALLENGE_EXPIRY_MS) {
    const createdTimestamp = challenge.createdTimestamp ?? Date.now();
    activeChallenges.set(userId, {
        ...challenge,
        createdTimestamp,
        expiresAt: challenge.expiresAt ?? createdTimestamp + expiryMs,
    });
}

function getChallenge(userId, expiryMs = DEFAULT_CHALLENGE_EXPIRY_MS) {
    const challenge = activeChallenges.get(userId);

    if (!challenge) return undefined;

    const expiresAt = challenge.expiresAt ?? ((challenge.createdTimestamp ?? 0) + expiryMs);
    if (Date.now() > expiresAt) {
        clearChallenge(userId);
        return undefined;
    }

    return challenge;
}

function clearChallenge(userId) {
    activeChallenges.delete(userId);
}

function setCooldown(userId, retryAt) {
    cooldowns.set(userId, retryAt);
}

function getCooldownRemaining(userId) {
    const retryAt = cooldowns.get(userId);

    if (!retryAt) return 0;

    const remaining = retryAt - Date.now();
    if (remaining <= 0) {
        clearCooldown(userId);
        return 0;
    }

    return remaining;
}

function clearCooldown(userId) {
    cooldowns.delete(userId);
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

    return VERIFICATION_MODES.challenge;
}

function resolveChallengeExpiryMs(verificationSettings) {
    return Number(verificationSettings?.challengeExpirySeconds ?? config.Warden?.verification?.challengeExpirySeconds ?? config.Warden?.verification?.expirySeconds ?? 600) * 1000;
}

function resolveCooldownSeconds(verificationSettings) {
    return Number(verificationSettings?.cooldownSeconds ?? config.Warden?.verification?.cooldownSeconds ?? 60);
}

function selectVerificationChallenge(verificationSettings) {
    const enabledChallenges = getEnabledVerificationChallenges({ verification: verificationSettings });
    if (enabledChallenges.length < 2) {
        return enabledChallenges[0] ?? getActiveVerificationChallenge({ verification: verificationSettings });
    }

    return enabledChallenges[Math.floor(Math.random() * enabledChallenges.length)];
}

async function handleVerifyHelp(interaction) {
    return interaction.reply(buildVerificationPublicResponse('verificationHelpEmbed'));
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

async function completeVerification(interaction) {
    const verificationConfig = config.Warden?.verification;
    clearChallenge(interaction.user.id);
    clearCooldown(interaction.user.id);

    const unverifiedRoleId = verificationConfig?.unverifiedRoleId;

    if (unverifiedRoleId && interaction.member?.roles?.cache?.has(unverifiedRoleId)) {
        await interaction.member.roles.remove(unverifiedRoleId);
    }

    return sendInitialInteractionResponse(
        interaction,
        buildVerificationPublicResponse('successEmbed'),
    );
}

async function handleVerifyStart(interaction) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    }

    const verificationSettings = await getVerificationSettings(interaction.guild?.id);
    const verificationMode = resolveVerificationMode(verificationSettings);

    if (verificationMode === VERIFICATION_MODES.halt) {
        return sendInitialInteractionResponse(interaction, {
            content: 'Verification is currently halted.',
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    if (verificationMode === VERIFICATION_MODES.oneClick) {
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
        return sendInitialInteractionResponse(
            interaction,
            buildVerificationInProgressResponse(existingChallenge.expiresAt),
        );
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
            ? await prepareGalleryImageAttachments(createGalleryState(challenge, stepIndex, verificationSettings))
            : undefined;
        promptImage = await preparePromptImageAttachment(challenge, step);
    }
    catch (err) {
        const reservedChallenge = getChallenge(interaction.user.id, challengeExpiryMs);
        if (reservedChallenge?.reservationToken === reservationToken) {
            clearChallenge(interaction.user.id);
        }

        console.error('Failed to generate verification image challenge:', err);

        await botLog(interaction.guild, new Discord.EmbedBuilder()
            .setTitle('⛔ Verification image challenge generation failed')
            .setDescription([
                `Challenge: **${challengeId}**`,
                `User: <@${interaction.user.id}>`,
                '',
                '```',
                String(err.stack ?? err),
                '```',
            ].join('\n')),
            2,
            'error',
        ).catch((logErr) => console.error('Failed to log verification image challenge generation error:', logErr));

        const retryMessage = err.code === GALLERY_IMAGE_FETCH_TIMEOUT_CODE
            ? 'Verification could not prepare the image challenge in time. Please click Verify again to retry.'
            : 'Verification could not generate the image challenge. Please contact staff or try again later.';

        return sendInitialInteractionResponse(interaction, {
            content: retryMessage,
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    const reservedChallenge = getChallenge(interaction.user.id, challengeExpiryMs);
    if (!reservedChallenge || reservedChallenge.reservationToken !== reservationToken) {
        return sendInitialInteractionResponse(interaction, buildVerificationExpiredResponse());
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
    const activeChallenge = getChallenge(interaction.user.id);

    if (!activeChallenge) {
        return interaction.reply(buildVerificationExpiredResponse());
    }

    if (activeChallenge.pending) {
        return interaction.reply(buildVerificationInProgressResponse(activeChallenge.expiresAt));
    }

    const clickedChallenge = parseAnswerCustomId(interaction.customId);
    const challengeId = activeChallenge.challengeId;
    const stepIndex = activeChallenge.stepIndex ?? 0;

    if (!clickedChallenge
        || clickedChallenge.challengeId !== challengeId
        || clickedChallenge.stepIndex !== stepIndex
        || isStaleGalleryComponent(clickedChallenge, activeChallenge)) {
        return interaction.reply(buildVerificationExpiredResponse(
            'This challenge button is no longer current. Please use the latest verification challenge message.',
        ));
    }

    return interaction.showModal(buildAnswerModal(challengeId, stepIndex, activeChallenge));
}

async function handleVerifyOldVersion(interaction) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    }

    const verificationSettings = await getVerificationSettings(interaction.guild?.id);
    const verificationMode = resolveVerificationMode(verificationSettings);

    if (verificationMode === VERIFICATION_MODES.halt) {
        return sendInitialInteractionResponse(interaction, { content: 'Verification is currently halted.', flags: Discord.MessageFlags.Ephemeral });
    }

    if (verificationMode === VERIFICATION_MODES.oneClick) {
        return completeVerification(interaction);
    }

    const activeChallenge = getChallenge(interaction.user.id, resolveChallengeExpiryMs(verificationSettings));
    if (!activeChallenge) {
        return sendInitialInteractionResponse(interaction, buildVerificationExpiredResponse());
    }

    if (activeChallenge.pending) {
        return sendInitialInteractionResponse(
            interaction,
            buildVerificationInProgressResponse(activeChallenge.expiresAt),
        );
    }

    const clickedChallenge = parseOldVersionCustomId(interaction.customId);
    const challengeId = activeChallenge.challengeId;
    const stepIndex = activeChallenge.stepIndex ?? 0;

    if (!clickedChallenge
        || clickedChallenge.challengeId !== challengeId
        || clickedChallenge.stepIndex !== stepIndex
        || isStaleGalleryComponent(clickedChallenge, activeChallenge)) {
        return sendInitialInteractionResponse(interaction, buildVerificationExpiredResponse(
            'This old version button is no longer current. Please use the latest verification challenge message.',
        ));
    }

    const challenge = applyVerificationChallengeOverrides(verificationChallenges[challengeId], verificationSettings) ?? getActiveVerificationChallenge({ verification: verificationSettings });
    const step = getVerificationChallengeStep(challengeId, stepIndex);

    if (!isComponentsV2GalleryChallenge(challenge, step)) {
        return sendInitialInteractionResponse(interaction, {
            embeds: [userErrorEmbed('This verification challenge does not have an old version fallback.')],
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    return replyWithLegacyGallery(interaction, challenge, stepIndex, activeChallenge.gallery, activeChallenge.expiresAt, activeChallenge.promptImage);
}

async function handleVerifySubmit(interaction) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    }

    const verificationSettings = await getVerificationSettings(interaction.guild?.id);
    const verificationMode = resolveVerificationMode(verificationSettings);

    if (verificationMode === VERIFICATION_MODES.halt) {
        return sendInitialInteractionResponse(interaction, { content: 'Verification is currently halted.', flags: Discord.MessageFlags.Ephemeral });
    }

    if (verificationMode === VERIFICATION_MODES.oneClick) {
        return completeVerification(interaction);
    }

    const activeChallenge = getChallenge(interaction.user.id, resolveChallengeExpiryMs(verificationSettings));
    if (!activeChallenge) {
        return sendInitialInteractionResponse(interaction, buildVerificationExpiredResponse());
    }

    if (activeChallenge.pending) {
        return sendInitialInteractionResponse(
            interaction,
            buildVerificationInProgressResponse(activeChallenge.expiresAt),
        );
    }

    const submittedChallenge = parseSubmitCustomId(interaction.customId);
    const challengeId = activeChallenge.challengeId;
    const stepIndex = activeChallenge.stepIndex ?? 0;

    if (!submittedChallenge
        || submittedChallenge.challengeId !== challengeId
        || submittedChallenge.stepIndex !== stepIndex
        || isStaleGalleryComponent(submittedChallenge, activeChallenge)) {
        return sendInitialInteractionResponse(interaction, buildVerificationExpiredResponse(
            'This answer modal is no longer current. Please use the latest verification challenge message.',
        ));
    }

    const answer = interaction.fields.getTextInputValue('answer');
    const result = validateAnswer(challengeId, answer, stepIndex, verificationSettings);
    const challenge = applyVerificationChallengeOverrides(verificationChallenges[challengeId], verificationSettings) ?? getActiveVerificationChallenge({ verification: verificationSettings });
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

        return sendInitialInteractionResponse(
            interaction,
            buildVerificationFailureResponse(cooldownSeconds, retryAt),
        );
    }

    if (hasNextVerificationChallengeStep(challengeId, stepIndex)) {
        const nextStepIndex = stepIndex + 1;
        const nextStep = getVerificationChallengeStep(challengeId, nextStepIndex);

        const isNextGalleryChallenge = isComponentsV2GalleryChallenge(challenge, nextStep);
        if (isNextGalleryChallenge && !interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
        }

        let nextGalleryState;
        let nextPromptImage;

        try {
            nextGalleryState = isNextGalleryChallenge
                ? await prepareGalleryImageAttachments(createGalleryState(challenge, nextStepIndex, verificationSettings))
                : undefined;
            nextPromptImage = await preparePromptImageAttachment(challenge, nextStep);
        }
        catch (err) {
            console.error('Failed to generate next verification image challenge:', err);

            await botLog(interaction.guild, new Discord.EmbedBuilder()
                .setTitle('⛔ Verification next image challenge generation failed')
                .setDescription([
                    `Challenge: **${challengeId}**`,
                    `Step: **${nextStepIndex + 1}**`,
                    `User: <@${interaction.user.id}>`,
                    '',
                    '```',
                    String(err.stack ?? err),
                    '```',
                ].join('\n')),
                2,
                'error',
            ).catch((logErr) => console.error('Failed to log next verification image challenge generation error:', logErr));

            const challengeExpiryMs = resolveChallengeExpiryMs(verificationSettings);
            const currentChallenge = getChallenge(interaction.user.id, challengeExpiryMs);
            if (currentChallenge
                && currentChallenge.challengeId === challengeId
                && (currentChallenge.stepIndex ?? 0) === stepIndex
                && currentChallenge.createdTimestamp === activeChallenge.createdTimestamp
                && currentChallenge.expiresAt === activeChallenge.expiresAt) {
                clearChallenge(interaction.user.id);
            }

            const retryMessage = err.code === GALLERY_IMAGE_FETCH_TIMEOUT_CODE
                ? 'Verification could not prepare the next image challenge in time. Please click Verify again to retry.'
                : 'Verification could not generate the next image challenge. Please contact staff or try again later.';

            return sendInitialInteractionResponse(interaction, {
                content: retryMessage,
                flags: Discord.MessageFlags.Ephemeral,
            });
        }

        const challengeExpiryMs = resolveChallengeExpiryMs(verificationSettings);
        const currentChallenge = getChallenge(interaction.user.id, challengeExpiryMs);

        if (!currentChallenge
            || currentChallenge.challengeId !== challengeId
            || (currentChallenge.stepIndex ?? 0) !== stepIndex
            || currentChallenge.createdTimestamp !== activeChallenge.createdTimestamp
            || currentChallenge.expiresAt !== activeChallenge.expiresAt) {
            return sendInitialInteractionResponse(interaction, buildVerificationExpiredResponse());
        }

        setChallenge(interaction.user.id, {
            challengeId,
            stepIndex: nextStepIndex,
            gallery: nextGalleryState,
            promptImage: nextPromptImage,
            createdTimestamp: currentChallenge.createdTimestamp,
            expiresAt: currentChallenge.expiresAt,
        }, challengeExpiryMs);
        const nextActiveChallenge = getChallenge(interaction.user.id, challengeExpiryMs);

        if (!nextActiveChallenge) {
            return sendInitialInteractionResponse(interaction, buildVerificationExpiredResponse());
        }

        return replyWithChallenge(interaction, challenge, nextStepIndex, nextGalleryState, nextActiveChallenge.expiresAt, nextPromptImage);
    }

    return completeVerification(interaction);
}

function getVerificationRoute(interaction) {
    const customId = interaction.customId;

    if (interaction.isButton() && customId === 'wardenVerify-start') {
        return {
            handler: handleVerifyStart,
            errorTitle: '⛔ Verification start error',
            userError: 'Verification could not be started. Please contact staff.',
            deferImmediately: true,
        };
    }

    if (interaction.isButton() && customId === 'wardenVerify-help') {
        return {
            handler: handleVerifyHelp,
            errorTitle: '⛔ Verification help error',
            userError: 'Verification help could not be shown. Please contact staff.',
        };
    }

    if (interaction.isButton() && customId.startsWith('wardenVerify-answer-')) {
        return {
            handler: handleVerifyAnswer,
            errorTitle: '⛔ Verification answer modal error',
            userError: 'Verification answer modal could not be opened. Please contact staff.',
        };
    }

    if (interaction.isButton() && customId.startsWith('wardenVerify-oldVersion-')) {
        return {
            handler: handleVerifyOldVersion,
            errorTitle: '⛔ Verification old version error',
            userError: 'Verification old version could not be shown. Please contact staff.',
            deferImmediately: true,
        };
    }

    if (interaction.isModalSubmit() && customId.startsWith('wardenVerify-submit-')) {
        return {
            handler: handleVerifySubmit,
            errorTitle: '⛔ Verification submission error',
            userError: 'Verification could not be submitted. Please contact staff.',
        };
    }

    return null;
}

async function sendVerificationErrorResponse(interaction, content) {
    if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content });
        return;
    }

    if (interaction.replied) {
        await interaction.followUp({ content, flags: Discord.MessageFlags.Ephemeral });
        return;
    }

    await interaction.reply({ content, flags: Discord.MessageFlags.Ephemeral });
}

async function logVerificationError(interaction, err, title) {
    console.log(err);
    await botLog(interaction.guild, new Discord.EmbedBuilder()
        .setDescription('```' + err.stack + '```')
        .setTitle(title)
        ,2
        ,'error'
    );
}

async function handleVerificationInteraction(interaction) {
    const route = getVerificationRoute(interaction);

    if (!route) return false;

    try {
        if (route.deferImmediately && !interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
        }

        await route.handler(interaction);
    }
    catch (err) {
        try {
            await sendVerificationErrorResponse(interaction, route.userError);
        }
        catch (responseErr) {
            console.error('Failed to send verification error response:', responseErr);
        }

        try {
            await logVerificationError(interaction, err, route.errorTitle);
        }
        catch (logErr) {
            console.error('Failed to log verification interaction error:', logErr);
        }
    }

    return true;
}


module.exports = {
    handleVerificationInteraction,
};
