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
    screenRequiresAnswer,
    validateScreenAnswers,
} = require('./verificationChallenges');
const {
    GALLERY_IMAGE_FETCH_TIMEOUT_CODE,
    prepareQuestionAssets,
    getQuestionAssetFiles,
    getQuestionDisplayItems,
} = require('./verificationImages');
const {
    buildVerificationPublicResponse,
    buildVerificationInProgressResponse,
    buildVerificationExpiredResponse,
    buildVerificationFailureResponse,
    buildVerificationErrorEmbed,
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

function buildChallengeComponentCustomId(prefix, challengeId, screenIndex = 0, token) {
    return `${prefix}${challengeId}-${screenIndex}${token ? `-${token}` : ''}`;
}

function parseChallengeComponentCustomId(customId, prefix) {
    if (!customId.startsWith(prefix)) return undefined;

    const payload = customId.slice(prefix.length);
    const tokenSeparatorIndex = payload.lastIndexOf('-');
    if (tokenSeparatorIndex < 1) return undefined;

    const token = payload.slice(tokenSeparatorIndex + 1);
    const challengeAndScreen = payload.slice(0, tokenSeparatorIndex);
    const screenSeparatorIndex = challengeAndScreen.lastIndexOf('-');
    if (screenSeparatorIndex < 1) return undefined;

    const challengeId = challengeAndScreen.slice(0, screenSeparatorIndex);
    const screenIndex = Number(challengeAndScreen.slice(screenSeparatorIndex + 1));
    if (!challengeId || !Number.isInteger(screenIndex) || screenIndex < 0 || !token) return undefined;

    return { challengeId, screenIndex, token };
}

function parseAnswerCustomId(customId) {
    return parseChallengeComponentCustomId(customId, 'wardenVerify-answer-');
}

function parseNextCustomId(customId) {
    return parseChallengeComponentCustomId(customId, 'wardenVerify-next-');
}

function parseBackCustomId(customId) {
    return parseChallengeComponentCustomId(customId, 'wardenVerify-back-');
}

function parseOldVersionCustomId(customId) {
    return parseChallengeComponentCustomId(customId, 'wardenVerify-oldVersion-');
}

function parseSubmitCustomId(customId) {
    return parseChallengeComponentCustomId(customId, 'wardenVerify-submit-');
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

function canGoBack(session) {
    const previousScreen = session.screens[session.screenIndex - 1];
    return Boolean(previousScreen && !screenRequiresAnswer(previousScreen) && !session.answeredScreenIndexes?.includes(previousScreen.index));
}

function buildExpiryLine(expiresAt) {
    if (!expiresAt) return undefined;
    return `This verification challenge expires <t:${Math.floor(expiresAt / 1000)}:R>.`;
}

function truncateEmbedText(value, fallback = 'Not set') {
    const text = String(value ?? '').trim() || fallback;
    return text.length > 4096 ? `${text.slice(0, 4093)}...` : text;
}

function applyQuestionFields(embed, question) {
    if (question.text) {
        embed.addFields({ name: question.label ?? question.id, value: truncateEmbedText(question.text), inline: false });
    }
}

function buildScreenComponents(session) {
    const screen = getCurrentScreen(session);
    const row = new Discord.ActionRowBuilder();

    if (canGoBack(session)) {
        row.addComponents(new Discord.ButtonBuilder()
            .setCustomId(buildChallengeComponentCustomId('wardenVerify-back-', session.challengeId, session.screenIndex, session.token))
            .setLabel('Back')
            .setStyle(Discord.ButtonStyle.Secondary));
    }

    if (screenRequiresAnswer(screen)) {
        row.addComponents(new Discord.ButtonBuilder()
            .setCustomId(buildChallengeComponentCustomId('wardenVerify-answer-', session.challengeId, session.screenIndex, session.token))
            .setLabel('Give Answer')
            .setStyle(Discord.ButtonStyle.Primary));
    }
    else {
        row.addComponents(new Discord.ButtonBuilder()
            .setCustomId(buildChallengeComponentCustomId('wardenVerify-next-', session.challengeId, session.screenIndex, session.token))
            .setLabel(hasNextScreen(session) ? 'Next' : 'Complete')
            .setStyle(Discord.ButtonStyle.Primary));
    }

    return row.components.length > 0 ? [row] : [];
}

function buildCompletedQuestionOptions(message = 'Verification step completed.') {
    return {
        embeds: [new Discord.EmbedBuilder().setTitle('Verification').setDescription(message)],
        components: [],
        files: [],
        flags: Discord.MessageFlags.Ephemeral,
    };
}

function buildQuestionMessageOptions(challenge, session, { includeIntro = false, completed = false } = {}) {
    const screen = getCurrentScreen(session);
    const screenAssets = session.screenAssets ?? {};
    const files = Object.values(screenAssets).flatMap(getQuestionAssetFiles);
    const displayItems = Object.values(screenAssets).flatMap(getQuestionDisplayItems);
    const embeds = [];

    const introLines = includeIntro
        ? [challenge.description, buildExpiryLine(session.expiresAt)].filter(Boolean)
        : [buildExpiryLine(session.expiresAt)].filter(Boolean);
    const introEmbed = new Discord.EmbedBuilder()
        .setTitle(challenge.title ?? 'Verification Challenge')
        .setDescription(truncateEmbedText(introLines.join('\n\n'), `Screen ${screen.index + 1} of ${session.screens.length}`));

    for (const field of challenge.fields ?? []) {
        const value = field.content ?? field.value ?? field.description;
        if (value) introEmbed.addFields({ name: field.title ?? field.name ?? 'Information', value: truncateEmbedText(value, 'Information'), inline: field.inline === true });
    }

    embeds.push(introEmbed);

    const screenEmbed = new Discord.EmbedBuilder()
        .setTitle(screen.questions.length > 1 ? `Questions ${screen.index + 1}` : (screen.questions[0]?.label ?? `Question ${screen.index + 1}`));

    for (const question of screen.questions) {
        applyQuestionFields(screenEmbed, question);
    }

    if (screenRequiresAnswer(screen)) {
        screenEmbed.setFooter({ text: 'Use the Give Answer button to submit your response.' });
    }
    else {
        screenEmbed.setFooter({ text: hasNextScreen(session) ? 'Use Next to continue.' : 'Use Complete to finish verification.' });
    }

    embeds.push(screenEmbed);

    for (const item of displayItems) {
        if (item.type !== 'image' || !item.displayUrl) continue;
        embeds.push(new Discord.EmbedBuilder()
            .setTitle(item.description ?? 'Verification image')
            .setImage(item.displayUrl));
    }

    return {
        embeds,
        components: completed ? [] : buildScreenComponents(session),
        files,
        flags: Discord.MessageFlags.Ephemeral,
    };
}

function buildIntroOptions(challenge, session) {
    return {
        embeds: [new Discord.EmbedBuilder()
            .setTitle(challenge.title ?? 'Verification Challenge')
            .setDescription([challenge.description, buildExpiryLine(session.expiresAt)].filter(Boolean).join('\n\n') || 'Complete the verification questions to continue.')],
        components: [],
        flags: Discord.MessageFlags.Ephemeral,
    };
}

function buildAnswerModal(session) {
    const screen = getCurrentScreen(session);
    const modal = new Discord.ModalBuilder()
        .setCustomId(buildChallengeComponentCustomId('wardenVerify-submit-', session.challengeId, session.screenIndex, session.token))
        .setTitle('Verify');

    for (const question of screen.questions) {
        const answer = question.answer ?? {};
        if (answer.required !== true || answer.type === 'none') continue;

        const input = new Discord.TextInputBuilder()
            .setCustomId(`q:${question.id}:${answer.type === 'positions' ? 'positions' : 'answer'}`)
            .setLabel(answer.inputLabel ?? (answer.type === 'positions' ? 'Image position(s)' : 'Verification answer'))
            .setPlaceholder(answer.inputPlaceholder ?? (answer.type === 'positions' ? 'If multiple, separate position numbers by commas or spaces' : 'Enter your answer here'))
            .setStyle(Discord.TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new Discord.ActionRowBuilder().addComponents(input));
    }

    return modal;
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

async function prepareSessionScreenAssets(session, verificationSettings) {
    return prepareQuestionAssets(getCurrentScreen(session), verificationSettings, session.challengeId);
}

async function replaceQuestionMessage(interaction, session, options) {
    const editOptions = { ...options, flags: Discord.MessageFlags.Ephemeral };

    try {
        if (interaction.isButton?.() && !interaction.deferred && !interaction.replied) {
            await interaction.update(editOptions);
            return session.questionMessageId;
        }

        if (interaction.isModalSubmit?.()) {
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

    const message = await interaction.followUp({ ...editOptions, flags: Discord.MessageFlags.Ephemeral }).catch((err) => {
        console.error('Failed to send replacement verification question message:', err);
        return undefined;
    });
    return message?.id ?? session.questionMessageId;
}

async function deactivateQuestionMessage(interaction, session, message = 'Verification step completed.') {
    if (!session?.questionMessageId) return;

    await interaction.webhook.editMessage(session.questionMessageId, buildCompletedQuestionOptions(message)).catch((err) => {
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
    const screenIndex = 0;
    const token = crypto.randomUUID();
    const splitMessages = screens.length > 1 || screens.some((screen) => screen.separate === true);
    const createdTimestamp = Date.now();
    const expiresAt = createdTimestamp + challengeExpiryMs;
    const session = {
        challengeId: challenge.id,
        screenIndex,
        screens,
        screenAssets: {},
        completedScreens: [],
        answeredScreenIndexes: [],
        renderer: 'embed',
        token,
        introMessageId: undefined,
        questionMessageId: undefined,
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
        const introMessage = await interaction.editReply(buildIntroOptions(challenge, session));
        session.introMessageId = introMessage?.id;
        const questionMessage = await interaction.followUp(buildQuestionMessageOptions(challenge, session));
        session.questionMessageId = questionMessage?.id;
    }
    else {
        const questionMessage = await interaction.editReply(buildQuestionMessageOptions(challenge, session, { includeIntro: true }));
        session.questionMessageId = questionMessage?.id;
    }

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

    if (!canGoBack(session)) {
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

    const challenge = getEnabledVerificationChallenges({ verification: verificationSettings }).find((candidate) => candidate.id === session.challengeId)
        ?? getActiveVerificationChallenge({ verification: verificationSettings });
    await interaction.reply(buildQuestionMessageOptions(challenge, session, { includeIntro: true }));
}

async function advanceToScreen(interaction, session, verificationSettings, targetScreenIndex) {
    const challenge = getEnabledVerificationChallenges({ verification: verificationSettings }).find((candidate) => candidate.id === session.challengeId)
        ?? getActiveVerificationChallenge({ verification: verificationSettings });
    session.screenIndex = targetScreenIndex;
    session.screenAssets = await prepareSessionScreenAssets(session, verificationSettings);
    session.token = crypto.randomUUID();

    const questionMessageId = await replaceQuestionMessage(interaction, session, buildQuestionMessageOptions(challenge, session));
    session.questionMessageId = questionMessageId;
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
