const Discord = require('discord.js');
const crypto = require('crypto');
const config = require('../../../config.json');
const { botLog } = require('../../../functions');
const {
    VERIFICATION_MODES,
    getVerificationSettings,
} = require('./verificationSettings');
const {
    getActiveVerificationChallenge,
    getEnabledVerificationChallenges,
    buildQuestionScreens,
    validateQuestionScreens,
    screenRequiresAnswer,
    screenAllowsBack,
    validateScreenAnswers,
} = require('./verificationChallenges');
const {
    GALLERY_IMAGE_FETCH_TIMEOUT_CODE,
    prepareQuestionAssets,
} = require('./verificationImages');
const {
    COMPONENTS_V2_RENDERER,
    LEGACY_RENDERER,
    buildVerificationPublicResponse,
    buildVerificationInProgressResponse,
    buildVerificationExpiredResponse,
    buildVerificationFailureResponse,
    buildVerificationErrorEmbed,
    buildChallengeIntroOptions,
    buildQuestionScreenOptions,
    buildQuestionScreenLegacyPages,
    buildOldVersionFallbackOptions,
    buildAnswerModal,
    buildCompletedQuestionOptions,
    isComponentsV2Available,
    parseAnswerCustomId,
    parseNextCustomId,
    parseBackCustomId,
    parseOldVersionCustomId,
    parseSubmitCustomId,
    sanitizeMessageEditOptions,
    sendInitialInteractionResponse,
} = require('./verificationResponses');

const DEFAULT_CHALLENGE_EXPIRY_MS = 10 * 60 * 1000;
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

function getModalTextInputValue(interaction, customId) {
    try {
        return interaction.fields.getTextInputValue(customId);
    }
    catch (err) {
        if (err?.code !== 'ModalSubmitInteractionFieldNotFound') throw err;
        return '';
    }
}

function resolveVerificationMode(verificationSettings = config.Warden?.verification) {
    const configuredMode = verificationSettings?.mode;
    return Object.values(VERIFICATION_MODES).includes(configuredMode) ? configuredMode : VERIFICATION_MODES.challenge;
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

function createSessionToken() {
    return crypto.randomUUID().replaceAll('-', '');
}

function isStaleScreenComponent(parsed, session) {
    return !parsed
        || parsed.challengeId !== session.challengeId
        || parsed.screenIndex !== session.screenIndex
        || parsed.token !== session.token;
}

function getCurrentScreen(session) {
    return session.screens[session.screenIndex];
}

function hasNextScreen(session) {
    return session.screenIndex + 1 < session.screens.length;
}

function shouldSendOldVersionPrompt(session) {
    return session.renderer === COMPONENTS_V2_RENDERER && isComponentsV2Available();
}

function buildSubmittedScreenValues(screen, interaction) {
    return (screen?.questions ?? []).reduce((values, question) => {
        const answerType = question.answer?.type;
        if (question.answer?.required !== true || answerType === 'none') return values;

        values[question.id] = getModalTextInputValue(interaction, `q:${question.id}:${answerType === 'positions' ? 'positions' : 'answer'}`);
        return values;
    }, {});
}

function buildScreenValidationAssets(screenAssets = {}) {
    return Object.entries(screenAssets).reduce((assets, [questionId, questionAsset]) => {
        if (questionAsset?.galleryState) assets[questionId] = questionAsset.galleryState;
        return assets;
    }, {});
}

async function prepareSessionScreenAssets(session) {
    return prepareQuestionAssets(getCurrentScreen(session), session.challengeId);
}

async function replaceQuestionMessage(interaction, session, options, { forceStoredMessage = false } = {}) {
    const editOptions = sanitizeMessageEditOptions({ ...options, flags: options.flags ?? Discord.MessageFlags.Ephemeral });

    try {
        if (!forceStoredMessage && interaction.isButton?.() && !interaction.deferred && !interaction.replied) {
            await interaction.update(editOptions);
            return session.questionMessageId;
        }

        if (forceStoredMessage && interaction.isButton?.() && !interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate();
        }

        if (interaction.isModalSubmit?.() || forceStoredMessage) {
            const message = await interaction.webhook.editMessage(session.questionMessageId ?? '@original', editOptions);
            return message?.id ?? session.questionMessageId;
        }

        if (interaction.deferred || interaction.replied) {
            const message = await interaction.editReply(editOptions);
            return message?.id ?? session.questionMessageId;
        }
    }
    catch (err) {
        console.error('Failed to replace verification question message:', err);
    }

    const message = await interaction.followUp({ ...options, flags: options.flags ?? Discord.MessageFlags.Ephemeral }).catch((err) => {
        console.error('Failed to send replacement verification question message:', err);
        return undefined;
    });
    return message?.id ?? session.questionMessageId;
}

async function sendOldVersionPromptIfNeeded(interaction, challenge, session) {
    if (!shouldSendOldVersionPrompt(session)) return undefined;

    const options = buildOldVersionFallbackOptions(challenge, session);

    if (session.oldVersionPromptMessageId) {
        const editedMessage = await interaction.webhook.editMessage(session.oldVersionPromptMessageId, sanitizeMessageEditOptions(options)).catch((err) => {
            console.error('Failed to edit verification old-version fallback prompt:', err);
            return undefined;
        });

        if (editedMessage?.id) return editedMessage.id;
    }

    const message = await interaction.followUp(options).catch((err) => {
        console.error('Failed to send verification old-version fallback prompt:', err);
        return undefined;
    });

    return message?.id ?? session.oldVersionPromptMessageId;
}

async function deactivateOldVersionPrompt(interaction, session) {
    if (!session.oldVersionPromptMessageId) return;

    await interaction.webhook.editMessage(
        session.oldVersionPromptMessageId,
        sanitizeMessageEditOptions({
            embeds: [
                new Discord.EmbedBuilder()
                    .setTitle('Old Version sent')
                    .setDescription('A legacy embed version of this verification challenge was sent below.'),
            ],
            components: [],
            flags: Discord.MessageFlags.Ephemeral,
        }),
    );
}

async function sendLegacyFollowUpPages(interaction, pages) {
    const messageIds = [];

    for (const page of pages.slice(1)) {
        const message = await interaction.followUp(page).catch((err) => {
            console.error('Failed to send verification legacy follow-up page:', err);
            return undefined;
        });
        if (message?.id) messageIds.push(message.id);
    }

    return messageIds;
}

async function resolveModalSubmitAfterScreenReplace(interaction, content = 'Answer accepted. Continuing verification...') {
    if (!interaction.isModalSubmit?.()) return;

    if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content }).catch(async (err) => {
            console.error('Failed to resolve verification modal reply:', err);
            await interaction.followUp({ content, flags: Discord.MessageFlags.Ephemeral }).catch((followErr) => {
                console.error('Failed to send verification modal follow-up:', followErr);
            });
        });
    }
}

async function deactivateQuestionMessage(interaction, session, message = 'Verification step completed.') {
    if (!session?.questionMessageId) return;

    await interaction.webhook.editMessage(session.questionMessageId, sanitizeMessageEditOptions(buildCompletedQuestionOptions(message))).catch((err) => {
        console.error('Failed to deactivate verification question message:', err);
    });
}

async function handleVerifyHelp(interaction) {
    return interaction.reply(buildVerificationPublicResponse('verificationHelpEmbed'));
}

async function completeVerification(interaction, session) {
    const verificationConfig = config.Warden?.verification;
    if (session) {
        await deactivateQuestionMessage(interaction, session, 'Verification completed.');
    }

    clearChallenge(interaction.user.id);
    clearCooldown(interaction.user.id);

    const unverifiedRoleId = verificationConfig?.unverifiedRoleId;
    if (unverifiedRoleId && interaction.member?.roles?.cache?.has(unverifiedRoleId)) {
        await interaction.member.roles.remove(unverifiedRoleId);
    }

    return sendInitialInteractionResponse(interaction, buildVerificationPublicResponse('successEmbed'));
}

async function logImageGenerationError(interaction, title, challengeId, err, screenIndex) {
    console.error(title, err);
    await botLog(interaction.guild, new Discord.EmbedBuilder()
        .setTitle('⛔ Verification image challenge generation failed')
        .setDescription([
            `Challenge: **${challengeId}**`,
            screenIndex === undefined ? undefined : `Screen: **${screenIndex + 1}**`,
            `User: <@${interaction.user.id}>`,
            '',
            '```',
            String(err.stack ?? err),
            '```',
        ].filter(Boolean).join('\n')),
        2,
        'error').catch((logErr) => console.error('Failed to log verification image challenge generation error:', logErr));
}

function getImageGenerationErrorMessage(err) {
    return err.code === GALLERY_IMAGE_FETCH_TIMEOUT_CODE
        ? 'Verification could not prepare the image challenge in time. Please click Verify again to retry.'
        : 'Verification could not generate the image challenge. Please contact staff or try again later.';
}

async function handleVerifyStart(interaction) {
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

    const cooldownRemaining = getCooldownRemaining(interaction.user.id);
    if (cooldownRemaining > 0) {
        const retryAt = Math.ceil((Date.now() + cooldownRemaining) / 1000);
        return sendInitialInteractionResponse(interaction, { content: `Please wait before trying verification again. You can retry <t:${retryAt}:R>.`, flags: Discord.MessageFlags.Ephemeral });
    }

    const challengeExpiryMs = resolveChallengeExpiryMs(verificationSettings);
    const existingChallenge = getChallenge(interaction.user.id, challengeExpiryMs);
    if (existingChallenge) {
        return sendInitialInteractionResponse(interaction, buildVerificationInProgressResponse(existingChallenge.expiresAt));
    }

    const challenge = selectVerificationChallenge(verificationSettings);
    const screens = buildQuestionScreens(challenge);
    const screenIssues = validateQuestionScreens(screens);
    if (screenIssues.length > 0) {
        const description = screenIssues.map((issue) => issue.message).join('\n');
        await botLog(interaction.guild, new Discord.EmbedBuilder()
            .setTitle('⛔ Verification challenge configuration invalid')
            .setDescription([`Challenge: **${challenge.id}**`, description].join('\n\n')),
            2,
            'error').catch((logErr) => console.error('Failed to log verification screen validation error:', logErr));
        return sendInitialInteractionResponse(interaction, {
            content: 'Verification is currently misconfigured. Please contact staff.',
            flags: Discord.MessageFlags.Ephemeral,
        });
    }
    const screenIndex = 0;
    const token = createSessionToken();
    const splitMessages = screens.length > 1 || screens.some((screen) => screen.separate === true);
    const createdTimestamp = Date.now();
    const expiresAt = createdTimestamp + challengeExpiryMs;
    const renderer = isComponentsV2Available() ? COMPONENTS_V2_RENDERER : LEGACY_RENDERER;
    const session = {
        challengeId: challenge.id,
        challenge,
        screenIndex,
        screens,
        screenAssets: {},
        completedScreens: [],
        answeredScreenIndexes: [],
        renderer,
        token,
        introMessageId: undefined,
        questionMessageId: undefined,
        v2QuestionMessageId: undefined,
        oldVersionPromptMessageId: undefined,
        legacyPageMessageIds: [],
        splitMessages,
        createdTimestamp,
        expiresAt,
        pending: true,
    };

    setChallenge(interaction.user.id, session, challengeExpiryMs);

    try {
        session.screenAssets = await prepareSessionScreenAssets(session, verificationSettings);
    }
    catch (err) {
        clearChallenge(interaction.user.id);
        await logImageGenerationError(interaction, 'Failed to generate verification image challenge:', challenge.id, err, screenIndex);
        return sendInitialInteractionResponse(interaction, { content: getImageGenerationErrorMessage(err), flags: Discord.MessageFlags.Ephemeral });
    }

    session.pending = false;
    setChallenge(interaction.user.id, session, challengeExpiryMs);

    if (splitMessages) {
        const introMessage = await interaction.editReply(buildChallengeIntroOptions(challenge, session, { renderer: session.renderer }));
        session.introMessageId = introMessage?.id;
        const questionMessage = await interaction.followUp(buildQuestionScreenOptions(challenge, getCurrentScreen(session), session.screenAssets, session, { renderer: session.renderer }));
        session.questionMessageId = questionMessage?.id;
        session.v2QuestionMessageId = session.renderer === COMPONENTS_V2_RENDERER
            ? questionMessage?.id
            : undefined;
    }
    else {
        const questionMessage = await interaction.editReply(buildQuestionScreenOptions(challenge, getCurrentScreen(session), session.screenAssets, session, { includeIntro: true, renderer: session.renderer }));
        session.questionMessageId = questionMessage?.id;
        session.v2QuestionMessageId = session.renderer === COMPONENTS_V2_RENDERER
            ? questionMessage?.id
            : undefined;
    }

    session.oldVersionPromptMessageId = await sendOldVersionPromptIfNeeded(interaction, challenge, session);

    setChallenge(interaction.user.id, session, challengeExpiryMs);
}

async function getActiveSessionOrReply(interaction, verificationSettings) {
    const session = getChallenge(interaction.user.id, resolveChallengeExpiryMs(verificationSettings));
    if (!session) {
        await sendInitialInteractionResponse(interaction, buildVerificationExpiredResponse());
        return undefined;
    }

    if (session.pending) {
        await sendInitialInteractionResponse(interaction, buildVerificationInProgressResponse(session.expiresAt));
        return undefined;
    }

    return session;
}

async function handleVerifyAnswer(interaction) {
    const verificationSettings = await getVerificationSettings(interaction.guild?.id);
    const session = await getActiveSessionOrReply(interaction, verificationSettings);
    if (!session) return;

    const clicked = parseAnswerCustomId(interaction.customId);
    if (isStaleScreenComponent(clicked, session)) {
        return interaction.reply(buildVerificationExpiredResponse('This challenge button is no longer current. Please use the latest verification challenge message.'));
    }

    const screen = getCurrentScreen(session);
    if (!screenRequiresAnswer(screen) || session.answeredScreenIndexes.includes(screen.index)) {
        return interaction.reply(buildVerificationExpiredResponse('This answer screen is no longer active. Please use the latest verification challenge message.'));
    }

    return interaction.showModal(buildAnswerModal(session));
}

async function handleVerifyNext(interaction) {
    const verificationSettings = await getVerificationSettings(interaction.guild?.id);
    const session = await getActiveSessionOrReply(interaction, verificationSettings);
    if (!session) return;

    const clicked = parseNextCustomId(interaction.customId);
    if (isStaleScreenComponent(clicked, session)) {
        return interaction.reply(buildVerificationExpiredResponse('This navigation button is no longer current. Please use the latest verification challenge message.'));
    }

    const screen = getCurrentScreen(session);
    if (screenRequiresAnswer(screen)) {
        return interaction.reply(buildVerificationExpiredResponse('This screen requires an answer. Please use the latest verification challenge message.'));
    }

    session.completedScreens = [...new Set([...(session.completedScreens ?? []), screen.index])];

    if (!hasNextScreen(session)) {
        return completeVerification(interaction, session);
    }

    await advanceToScreen(interaction, session, verificationSettings, session.screenIndex + 1);
}

async function handleVerifyBack(interaction) {
    const verificationSettings = await getVerificationSettings(interaction.guild?.id);
    const session = await getActiveSessionOrReply(interaction, verificationSettings);
    if (!session) return;

    const clicked = parseBackCustomId(interaction.customId);
    if (isStaleScreenComponent(clicked, session)) {
        return interaction.reply(buildVerificationExpiredResponse('This navigation button is no longer current. Please use the latest verification challenge message.'));
    }

    if (!screenAllowsBack(session, session.screenIndex - 1)) {
        return interaction.reply(buildVerificationExpiredResponse('You cannot go back to that verification screen.'));
    }

    await advanceToScreen(interaction, session, verificationSettings, session.screenIndex - 1);
}

async function handleVerifyOldVersion(interaction) {
    const verificationSettings = await getVerificationSettings(interaction.guild?.id);
    const session = await getActiveSessionOrReply(interaction, verificationSettings);
    if (!session) return;

    const clicked = parseOldVersionCustomId(interaction.customId);
    if (isStaleScreenComponent(clicked, session)) {
        return interaction.reply(buildVerificationExpiredResponse('This old version button is no longer current. Please use the latest verification challenge message.'));
    }

    const challenge = session.challenge ?? getActiveVerificationChallenge({ verification: verificationSettings });
    const legacySession = {
        ...session,
        challenge,
        renderer: LEGACY_RENDERER,
        token: createSessionToken(),
        v2QuestionMessageId: session.v2QuestionMessageId ?? session.questionMessageId,
        legacyPageMessageIds: [],
    };

    const pages = buildQuestionScreenLegacyPages(challenge, getCurrentScreen(legacySession), legacySession.screenAssets, legacySession, { includeIntro: true });

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
    }

    await deactivateOldVersionPrompt(interaction, legacySession).catch((err) => {
        console.error('Failed to deactivate verification old-version prompt:', err);
    });

    const firstLegacyMessage = await interaction.followUp(pages[0]);

    if (!firstLegacyMessage?.id) {
        throw new Error('Failed to send or store the legacy verification message.');
    }

    legacySession.questionMessageId = firstLegacyMessage.id;
    legacySession.legacyPageMessageIds = await sendLegacyFollowUpPages(interaction, pages);
    setChallenge(interaction.user.id, legacySession, resolveChallengeExpiryMs(verificationSettings));
}

async function advanceToScreen(interaction, session, verificationSettings, targetScreenIndex) {
    const challenge = session.challenge ?? getActiveVerificationChallenge({ verification: verificationSettings });
    session.screenIndex = targetScreenIndex;
    session.screenAssets = await prepareSessionScreenAssets(session, verificationSettings);
    session.token = createSessionToken();
    session.legacyPageMessageIds = [];

    if (session.renderer === LEGACY_RENDERER) {
        const pages = buildQuestionScreenLegacyPages(challenge, getCurrentScreen(session), session.screenAssets, session, { includeIntro: false });
        const questionMessageId = await replaceQuestionMessage(interaction, session, pages[0]);
        session.questionMessageId = questionMessageId;
        session.legacyPageMessageIds = await sendLegacyFollowUpPages(interaction, pages);
        await resolveModalSubmitAfterScreenReplace(interaction);
        setChallenge(interaction.user.id, session, resolveChallengeExpiryMs(verificationSettings));
        return;
    }

    const questionMessageId = await replaceQuestionMessage(interaction, session, buildQuestionScreenOptions(challenge, getCurrentScreen(session), session.screenAssets, session, { renderer: session.renderer }));
    session.questionMessageId = questionMessageId;
    await resolveModalSubmitAfterScreenReplace(interaction);
    session.oldVersionPromptMessageId = await sendOldVersionPromptIfNeeded(interaction, challenge, session);
    setChallenge(interaction.user.id, session, resolveChallengeExpiryMs(verificationSettings));
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

    const session = await getActiveSessionOrReply(interaction, verificationSettings);
    if (!session) return;

    const submitted = parseSubmitCustomId(interaction.customId);
    if (isStaleScreenComponent(submitted, session)) {
        return sendInitialInteractionResponse(interaction, buildVerificationExpiredResponse('This answer modal is no longer current. Please use the latest verification challenge message.'));
    }

    const screen = getCurrentScreen(session);
    const result = validateScreenAnswers(
        screen,
        buildSubmittedScreenValues(screen, interaction),
        buildScreenValidationAssets(session.screenAssets),
    );

    if (!result.ok) {
        const cooldownSeconds = resolveCooldownSeconds(verificationSettings);
        const retryAt = Date.now() + (cooldownSeconds * 1000);
        clearChallenge(interaction.user.id);
        setCooldown(interaction.user.id, retryAt);
        await deactivateQuestionMessage(interaction, session, 'Verification answer submitted. This screen is no longer active.');
        return sendInitialInteractionResponse(interaction, buildVerificationFailureResponse(cooldownSeconds, retryAt));
    }

    session.completedScreens = [...new Set([...(session.completedScreens ?? []), screen.index])];
    session.answeredScreenIndexes = [...new Set([...(session.answeredScreenIndexes ?? []), screen.index])];

    if (!hasNextScreen(session)) {
        return completeVerification(interaction, session);
    }

    await advanceToScreen(interaction, session, verificationSettings, session.screenIndex + 1);
}

function getVerificationRoute(interaction) {
    const customId = interaction.customId;

    if (interaction.isButton() && customId === 'wardenVerify-start') return { handler: handleVerifyStart, errorTitle: '⛔ Verification start error', userError: 'Verification could not be started. Please contact staff.', deferImmediately: true };
    if (interaction.isButton() && customId === 'wardenVerify-help') return { handler: handleVerifyHelp, errorTitle: '⛔ Verification help error', userError: 'Verification help could not be shown. Please contact staff.' };
    if (interaction.isButton() && customId.startsWith('wardenVerify-answer-')) return { handler: handleVerifyAnswer, errorTitle: '⛔ Verification answer modal error', userError: 'Verification answer modal could not be opened. Please contact staff.' };
    if (interaction.isButton() && customId.startsWith('wardenVerify-next-')) return { handler: handleVerifyNext, errorTitle: '⛔ Verification next error', userError: 'Verification could not continue. Please contact staff.' };
    if (interaction.isButton() && customId.startsWith('wardenVerify-back-')) return { handler: handleVerifyBack, errorTitle: '⛔ Verification back error', userError: 'Verification could not go back. Please contact staff.' };
    if (interaction.isButton() && customId.startsWith('wardenVerify-oldVersion-')) return { handler: handleVerifyOldVersion, errorTitle: '⛔ Verification old version error', userError: 'Verification old version could not be shown. Please contact staff.' };
    if (interaction.isModalSubmit() && customId.startsWith('wardenVerify-submit-')) return { handler: handleVerifySubmit, errorTitle: '⛔ Verification submission error', userError: 'Verification could not be submitted. Please contact staff.' };

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

function userErrorEmbed(message) {
    return buildVerificationErrorEmbed(message, { footer: { enabled: false }, timestamp: false });
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
        console.error(route.errorTitle, err);

        await botLog(interaction.guild, new Discord.EmbedBuilder()
            .setTitle(route.errorTitle)
            .setDescription(['```', String(err.stack ?? err), '```'].join('\n')),
            2,
            'error').catch((logErr) => console.error('Failed to log verification interaction error:', logErr));

        await sendVerificationErrorResponse(interaction, route.userError).catch((replyErr) => console.error('Failed to send verification error response:', replyErr));
    }

    return true;
}

module.exports = {
    handleVerificationInteraction,
    fetchVerificationMessage: async (interaction, messageId) => {
        const channels = await interaction.guild.channels.fetch();
        for (const channel of channels.values()) {
            if (!channel?.isTextBased?.()) continue;
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (message) return message;
        }
        return null;
    },
    resolveVerificationMode,
    VERIFICATION_MODES,
};
