const Discord = require('discord.js');
const crypto = require('crypto');
const config = require('../../../config.json');
const { botLog } = require('../../../functions');
const {
    VERIFICATION_MODES,
    applyVerificationConfigSafeguard,
    evaluateVerificationConfig,
    getVerificationSnapshot,
} = require('./verificationService');
const {
    buildQuestionScreens,
    validateQuestionScreens,
    screenRequiresAnswer,
    getScreenRequiredAnswerQuestions,
    screenAllowsBack,
    validateScreenAnswers,
} = require('./verificationChallenges/verificationChallenges');
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
    buildChallengeIntroOptions,
    buildQuestionScreenOptions,
    buildQuestionScreenLegacyPages,
    buildOldVersionFallbackOptions,
    buildAnswerModal,
    buildAnswerInputCustomId,
    buildCompletedQuestionOptions,
    isComponentsV2Available,
    parseAnswerCustomId,
    parseNextCustomId,
    parseBackCustomId,
    parseOldVersionCustomId,
    parseSubmitCustomId,
} = require('./verificationResponses');
const {
    deferEphemeralReply,
    deferSourceUpdate,
    sanitizeMessageEditOptions,
    sendEphemeralNotice,
    sendInitialInteractionResponse,
} = require('./verificationInteraction');

const DEFAULT_CHALLENGE_EXPIRY_MS = 10 * 60 * 1000;
const VERIFICATION_SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_ACTIVE_VERIFICATION_SESSIONS = 250;
const MAX_CACHED_SCREEN_ASSETS_PER_SESSION = 8;
const MAX_TIMEOUT_DELAY_MS = 0x7fffffff;
const activeChallenges = new Map();
const activeChallengeExpiryTimers = new Map();
const cooldowns = new Map();

function setChallenge(userId, challenge, expiryMs = DEFAULT_CHALLENGE_EXPIRY_MS) {
    if (!activeChallenges.has(userId) && activeChallenges.size >= MAX_ACTIVE_VERIFICATION_SESSIONS) {
        cleanupExpiredVerificationState();
        if (activeChallenges.size >= MAX_ACTIVE_VERIFICATION_SESSIONS) return false;
    }

    const createdTimestamp = challenge.createdTimestamp ?? Date.now();
    const session = {
        ...challenge,
        createdTimestamp,
        expiresAt: challenge.expiresAt ?? createdTimestamp + expiryMs,
    };
    activeChallenges.set(userId, session);
    scheduleChallengeExpiry(userId, session.expiresAt);
    return true;
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
    const expiryTimer = activeChallengeExpiryTimers.get(userId);
    if (expiryTimer) clearTimeout(expiryTimer);
    activeChallengeExpiryTimers.delete(userId);
    activeChallenges.delete(userId);
}

function scheduleChallengeExpiry(userId, expiresAt) {
    const existingTimer = activeChallengeExpiryTimers.get(userId);
    if (existingTimer) clearTimeout(existingTimer);

    const expire = () => {
        const remaining = Number(expiresAt) - Date.now();
        if (remaining > MAX_TIMEOUT_DELAY_MS) {
            const timer = setTimeout(expire, MAX_TIMEOUT_DELAY_MS);
            timer.unref?.();
            activeChallengeExpiryTimers.set(userId, timer);
            return;
        }

        expireChallengeIfDue(userId, expiresAt);
    };

    const timer = setTimeout(expire, Math.max(0, Math.min(Number(expiresAt) - Date.now(), MAX_TIMEOUT_DELAY_MS)));
    timer.unref?.();
    activeChallengeExpiryTimers.set(userId, timer);
}

function expireChallengeIfDue(userId, expiresAt) {
    const session = activeChallenges.get(userId);
    if (session?.expiresAt === expiresAt && Date.now() >= expiresAt) clearChallenge(userId);
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

function cleanupExpiredVerificationState() {
    const now = Date.now();

    for (const [userId, session] of activeChallenges.entries()) {
        const expiresAt = Number(session?.expiresAt ?? 0);
        if (expiresAt > 0 && now >= expiresAt) {
            clearChallenge(userId);
        }
    }

    for (const [userId, retryAt] of cooldowns.entries()) {
        if (Number(retryAt) <= now) {
            cooldowns.delete(userId);
        }
    }
}

const cleanupInterval = setInterval(cleanupExpiredVerificationState, VERIFICATION_SESSION_CLEANUP_INTERVAL_MS);
cleanupInterval.unref?.();

function getModalTextInputValue(interaction, customId) {
    try {
        return interaction.fields.getTextInputValue(customId);
    }
    catch (err) {
        if (err?.code !== 'ModalSubmitInteractionFieldNotFound') throw err;
        return '';
    }
}

function resolveVerificationMode(verificationSettings) {
    const configuredMode = verificationSettings?.mode;
    return Object.values(VERIFICATION_MODES).includes(configuredMode) ? configuredMode : VERIFICATION_MODES.challenge;
}

function resolveChallengeExpiryMs(verificationSettings) {
    const seconds = Number(verificationSettings?.challengeExpirySeconds);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_CHALLENGE_EXPIRY_MS;
}

function resolveCooldownSeconds(verificationSettings) {
    const seconds = Number(verificationSettings?.cooldownSeconds);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 60;
}

function selectVerificationChallenge(runtime) {
    const activeChallenges = runtime?.activeChallenges ?? [];
    if (activeChallenges.length < 2) {
        return activeChallenges[0];
    }

    return activeChallenges[Math.floor(Math.random() * activeChallenges.length)];
}

function createSessionToken() {
    return crypto.randomUUID().replaceAll('-', '');
}

function isStaleScreenComponent(parsed, session) {
    return !parsed
        || parsed.screenIndex !== session.screenIndex
        || parsed.token !== session.token;
}

// The fallback button deliberately has a different lifetime from ordinary
// screen controls. Screen controls are invalidated whenever the user moves;
// the fallback must continue to open whichever screen is current.
function isStaleOldVersionComponent(parsed, session) {
    const fallbackToken = parsed?.fallbackToken ?? parsed?.token;
    return !parsed || !fallbackToken || fallbackToken !== session.fallbackToken;
}

function getFallbackSession(session) {
    return {
        ...session,
        // `verificationResponses` owns the custom-id format. Keeping this
        // value separate from the rotating screen token lets both old and new
        // response implementations construct a stable fallback button.
        token: session.fallbackToken,
        fallbackToken: session.fallbackToken,
    };
}

function setSessionMessageHandle(session, role, id, renderer) {
    if (!id) return undefined;
    session.messageHandles ??= {};
    const handle = { id, role, renderer };
    session.messageHandles[role] = handle;

    if (role === 'intro') session.introMessageId = id;
    if (role === 'challenge') session.questionMessageId = id;
    if (role === 'v2-challenge') session.v2QuestionMessageId = id;
    if (role === 'fallback-prompt') session.oldVersionPromptMessageId = id;
    return handle;
}

function getSessionMessageHandle(session, role, fallbackId, fallbackRenderer) {
    const handle = session?.messageHandles?.[role];
    if (handle?.id) return handle;
    if (!fallbackId) return undefined;
    return { id: fallbackId, role, renderer: fallbackRenderer };
}

function getPayloadRenderer(options = {}) {
    if ((Number(options.flags ?? 0) & Discord.MessageFlags.IsComponentsV2) !== 0) {
        return COMPONENTS_V2_RENDERER;
    }
    if (Array.isArray(options.embeds)) return LEGACY_RENDERER;
    // Do not guess for an intentionally minimal payload. This keeps typed
    // handles protective in production while allowing no-op test/adapter
    // payloads that carry no renderer-specific fields.
    return undefined;
}

function assertRendererSafeEdit(handle, options) {
    if (!handle?.id) return;
    const payloadRenderer = getPayloadRenderer(options);
    if (payloadRenderer && handle.renderer !== payloadRenderer) {
        throw new Error(`Refusing to edit ${handle.role} message ${handle.id} with ${payloadRenderer}; it is a ${handle.renderer} message.`);
    }
}

async function editStoredVerificationMessage(interaction, handle, options) {
    if (!handle?.id) return undefined;
    assertRendererSafeEdit(handle, options);
    return interaction.webhook.editMessage(handle.id, sanitizeMessageEditOptions(options));
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
    return getScreenRequiredAnswerQuestions(screen).reduce((values, question, index) => {
        values[question.id] = getModalTextInputValue(interaction, buildAnswerInputCustomId(index));
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
    const screenIndex = session.screenIndex;
    session.screenAssetCache ??= new Map();
    session.screenAssetPreparationPromises ??= new Map();

    if (session.screenAssetCache.has(screenIndex)) {
        const cachedAssets = session.screenAssetCache.get(screenIndex);
        session.screenAssetCache.delete(screenIndex);
        session.screenAssetCache.set(screenIndex, cachedAssets);
        session.screenAssets = cachedAssets;
        return cachedAssets;
    }

    let preparation = session.screenAssetPreparationPromises.get(screenIndex);
    if (!preparation) {
        preparation = prepareQuestionAssets(getCurrentScreen(session), session.challengeId)
            .then((assets) => {
                // Re-inserting an existing key keeps the least recently used
                // entry at the beginning of the map.
                session.screenAssetCache.delete(screenIndex);
                session.screenAssetCache.set(screenIndex, assets);
                while (session.screenAssetCache.size > MAX_CACHED_SCREEN_ASSETS_PER_SESSION) {
                    const oldestScreenIndex = session.screenAssetCache.keys().next().value;
                    session.screenAssetCache.delete(oldestScreenIndex);
                }
                return assets;
            })
            .finally(() => session.screenAssetPreparationPromises.delete(screenIndex));
        session.screenAssetPreparationPromises.set(screenIndex, preparation);
    }

    const assets = await preparation;
    session.screenAssets = assets;
    return assets;
}

async function replaceQuestionMessage(interaction, session, options, { forceStoredMessage = false } = {}) {
    const editOptions = sanitizeMessageEditOptions({ ...options, flags: options.flags ?? Discord.MessageFlags.Ephemeral });
    const questionHandle = getSessionMessageHandle(
        session,
        'challenge',
        session.questionMessageId,
        session.renderer ?? getPayloadRenderer(editOptions),
    );
    if (questionHandle) assertRendererSafeEdit(questionHandle, editOptions);

    try {
        if (!forceStoredMessage && interaction.isButton?.() && !interaction.deferred && !interaction.replied) {
            await interaction.update(editOptions);
            return session.questionMessageId;
        }

        if (forceStoredMessage && interaction.isButton?.() && !interaction.deferred && !interaction.replied) {
            await deferSourceUpdate(interaction);
        }

        if (interaction.isModalSubmit?.() || forceStoredMessage) {
            const message = await interaction.webhook.editMessage(questionHandle?.id ?? '@original', editOptions);
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

    const options = buildOldVersionFallbackOptions(challenge, getFallbackSession(session));
    const promptHandle = getSessionMessageHandle(session, 'fallback-prompt', session.oldVersionPromptMessageId, LEGACY_RENDERER);

    if (promptHandle) {
        const editedMessage = await editStoredVerificationMessage(interaction, promptHandle, options).catch((err) => {
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
    const promptHandle = getSessionMessageHandle(session, 'fallback-prompt', session.oldVersionPromptMessageId, LEGACY_RENDERER);
    if (!promptHandle) return;

    await editStoredVerificationMessage(
        interaction,
        promptHandle,
        {
            embeds: [
                new Discord.EmbedBuilder()
                    .setTitle('Old Version sent')
                    .setDescription('A legacy embed version of this verification challenge was sent below.'),
            ],
            components: [],
            files: [],
            attachments: [],
            flags: Discord.MessageFlags.Ephemeral,
        },
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

async function deactivateLegacyFollowUpPages(interaction, session, message = 'This legacy verification page is no longer active. Please use the latest verification message.') {
    const messageIds = [...new Set(session?.legacyPageMessageIds ?? [])].filter(Boolean);
    if (messageIds.length < 1) return;

    await Promise.all(messageIds.map((messageId) => interaction.webhook.editMessage(
        messageId,
        sanitizeMessageEditOptions({
            content: message,
            embeds: [],
            components: [],
            files: [],
            attachments: [],
            flags: Discord.MessageFlags.Ephemeral,
        }),
    ).catch((err) => {
        console.error('Failed to deactivate stale verification legacy follow-up page:', err);
    })));
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
    const questionHandle = getSessionMessageHandle(
        session,
        'challenge',
        session?.questionMessageId,
        session?.renderer ?? COMPONENTS_V2_RENDERER,
    );
    if (!questionHandle) return;

    await editStoredVerificationMessage(
        interaction,
        questionHandle,
        buildCompletedQuestionOptions(message, { renderer: questionHandle.renderer }),
    ).catch((err) => {
        console.error('Failed to deactivate verification question message:', err);
    });
}

async function handleVerifyHelp(interaction) {
    return interaction.reply(buildVerificationPublicResponse('verificationHelpEmbed'));
}

async function completeVerification(interaction, session, options = {}) {
    const { successAsFollowUp = false } = options;
    const verificationConfig = config.Warden?.verification;
    if (session) {
        await deactivateQuestionMessage(interaction, session, 'Verification completed.');
        await deactivateLegacyFollowUpPages(interaction, session, 'Verification completed. This legacy page is no longer active.');
    }

    clearChallenge(interaction.user.id);
    clearCooldown(interaction.user.id);

    const unverifiedRoleId = verificationConfig?.unverifiedRoleId;
    if (unverifiedRoleId && interaction.member?.roles?.cache?.has(unverifiedRoleId)) {
        await interaction.member.roles.remove(unverifiedRoleId);
    }

    const successResponse = buildVerificationPublicResponse('successEmbed');

    if (successAsFollowUp) {
        return interaction.followUp(successResponse);
    }

    return sendInitialInteractionResponse(interaction, successResponse);
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
        await deferEphemeralReply(interaction);
    }

    const snapshot = await getVerificationSnapshot(interaction.guild?.id);
    const runtime = snapshot.runtime;
    const verificationMode = resolveVerificationMode(runtime);

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

    const challengeExpiryMs = resolveChallengeExpiryMs(runtime);
    const existingChallenge = getChallenge(interaction.user.id, challengeExpiryMs);
    if (existingChallenge) {
        return sendInitialInteractionResponse(interaction, buildVerificationInProgressResponse(existingChallenge.expiresAt));
    }

    const challenge = selectVerificationChallenge(runtime);
    const configReport = evaluateVerificationConfig(runtime);
    const challengeBlockingIssues = challenge
        ? configReport.blockingIssues.filter((issue) => issue.challengeId === challenge.id)
        : configReport.activeBlockingIssues;
    if (!challenge) {
        console.warn('[VERIFY START] No active verification challenge exists in the authoritative catalog.');
        await applyVerificationConfigSafeguard({
            guildId: interaction.guildId,
            guild: interaction.guild,
            source: 'runtime-verify-start',
            actorId: 'system',
            reason: 'Runtime verification start could not resolve an active catalog challenge.',
            notifyStaff: true,
            deactivateUnsafeActiveChallenges: true,
        });
        return sendInitialInteractionResponse(interaction, {
            content: 'Verification is temporarily unavailable. Please contact staff.',
            flags: Discord.MessageFlags.Ephemeral,
        });
    }
    if (challengeBlockingIssues.length > 0) {
        console.warn('[VERIFY START] Selected verification challenge has blocking configuration issues:', challengeBlockingIssues.map((issue) => issue.message).join(' | '));
        await applyVerificationConfigSafeguard({
            guildId: interaction.guildId,
            guild: interaction.guild,
            source: 'runtime-verify-start',
            actorId: 'system',
            reason: 'Runtime verification start found an unsafe active challenge.',
            notifyStaff: true,
            deactivateUnsafeActiveChallenges: true,
        });
        return sendInitialInteractionResponse(interaction, {
            content: 'Verification is temporarily unavailable. Please contact staff.',
            flags: Discord.MessageFlags.Ephemeral,
        });
    }
    const screens = buildQuestionScreens(challenge);
    const screenIssues = validateQuestionScreens(screens, challenge);
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
    const fallbackToken = createSessionToken();
    const splitMessages = screens.length > 1 || screens.some((screen) => screen.separate === true);
    const createdTimestamp = Date.now();
    const expiresAt = createdTimestamp + challengeExpiryMs;
    const renderer = COMPONENTS_V2_RENDERER;
    const session = {
        challengeId: challenge.id,
        challenge,
        screenIndex,
        screens,
        screenAssets: {},
        screenAssetCache: new Map(),
        screenAssetPreparationPromises: new Map(),
        completedScreens: [],
        answeredScreenIndexes: [],
        renderer,
        snapshotGeneration: snapshot.generation,
        challengeExpiryMs,
        cooldownSeconds: resolveCooldownSeconds(runtime),
        token,
        fallbackToken,
        introMessageId: undefined,
        questionMessageId: undefined,
        v2QuestionMessageId: undefined,
        oldVersionPromptMessageId: undefined,
        messageHandles: {},
        legacyPageMessageIds: [],
        splitMessages,
        createdTimestamp,
        expiresAt,
        pending: true,
    };

    if (!setChallenge(interaction.user.id, session, challengeExpiryMs)) {
        return sendInitialInteractionResponse(interaction, {
            content: 'Verification is temporarily busy. Please try again shortly.',
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    try {
        session.screenAssets = await prepareSessionScreenAssets(session);
    }
    catch (err) {
        clearChallenge(interaction.user.id);
        await logImageGenerationError(interaction, 'Failed to generate verification image challenge:', challenge.id, err, screenIndex);
        return sendInitialInteractionResponse(interaction, { content: getImageGenerationErrorMessage(err), flags: Discord.MessageFlags.Ephemeral });
    }

    session.pending = false;
    setChallenge(interaction.user.id, session, challengeExpiryMs);

    try {
        if (splitMessages) {
            const introMessage = await interaction.editReply(buildChallengeIntroOptions(challenge, session, {
                renderer: COMPONENTS_V2_RENDERER,
            }));
            setSessionMessageHandle(session, 'intro', introMessage?.id, COMPONENTS_V2_RENDERER);
            const questionMessage = await interaction.followUp(buildQuestionScreenOptions(challenge, getCurrentScreen(session), session.screenAssets, session, { renderer: session.renderer }));
            setSessionMessageHandle(session, 'challenge', questionMessage?.id, session.renderer);
            if (session.renderer === COMPONENTS_V2_RENDERER) setSessionMessageHandle(session, 'v2-challenge', questionMessage?.id, COMPONENTS_V2_RENDERER);
        }
        else {
            const questionMessage = await interaction.editReply(buildQuestionScreenOptions(challenge, getCurrentScreen(session), session.screenAssets, session, { includeIntro: true, renderer: session.renderer }));
            setSessionMessageHandle(session, 'challenge', questionMessage?.id, session.renderer);
            if (session.renderer === COMPONENTS_V2_RENDERER) setSessionMessageHandle(session, 'v2-challenge', questionMessage?.id, COMPONENTS_V2_RENDERER);
        }

        const oldVersionPromptMessageId = await sendOldVersionPromptIfNeeded(interaction, challenge, session);
        setSessionMessageHandle(session, 'fallback-prompt', oldVersionPromptMessageId, LEGACY_RENDERER);
        setChallenge(interaction.user.id, session, challengeExpiryMs);
    }
    catch (err) {
        clearChallenge(interaction.user.id);
        throw err;
    }
}

function getActiveSession(userId) {
    const session = activeChallenges.get(userId);
    if (!session) return undefined;

    const expiresAt = Number(session.expiresAt ?? 0);
    if (expiresAt > 0 && Date.now() > expiresAt) {
        clearChallenge(userId);
        return undefined;
    }

    return session;
}

async function getActiveSessionOrReplyFast(interaction) {
    const session = getActiveSession(interaction.user.id);

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
    const session = await getActiveSessionOrReplyFast(interaction);
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
    const session = await getActiveSessionOrReplyFast(interaction);
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
        await deferSourceUpdate(interaction);
        return completeVerification(interaction, session, { successAsFollowUp: true });
    }

    await deferSourceUpdate(interaction);
    await advanceToScreen(interaction, session, session.screenIndex + 1, { forceStoredMessage: true });
}

async function handleVerifyBack(interaction) {
    const session = await getActiveSessionOrReplyFast(interaction);
    if (!session) return;

    const clicked = parseBackCustomId(interaction.customId);
    if (isStaleScreenComponent(clicked, session)) {
        return interaction.reply(buildVerificationExpiredResponse('This navigation button is no longer current. Please use the latest verification challenge message.'));
    }

    if (!screenAllowsBack(session, session.screenIndex - 1)) {
        return interaction.reply(buildVerificationExpiredResponse('You cannot go back to that verification screen.'));
    }

    await deferSourceUpdate(interaction);
    await advanceToScreen(interaction, session, session.screenIndex - 1, { forceStoredMessage: true });
}

async function handleVerifyOldVersion(interaction) {
    const session = await getActiveSessionOrReplyFast(interaction);
    if (!session) return;

    const clicked = parseOldVersionCustomId(interaction.customId);
    if (session.renderer !== COMPONENTS_V2_RENDERER || isStaleOldVersionComponent(clicked, session)) {
        return interaction.reply(buildVerificationExpiredResponse('This old version button is no longer current. Please use the latest verification challenge message.'));
    }

    await deferSourceUpdate(interaction);
    const challenge = session.challenge;
    if (!challenge) throw new Error('The active verification session has no catalog challenge snapshot.');
    const legacySession = {
        ...session,
        challenge,
        renderer: LEGACY_RENDERER,
        token: createSessionToken(),
        fallbackToken: session.fallbackToken,
        v2QuestionMessageId: session.v2QuestionMessageId ?? session.questionMessageId,
        legacyPageMessageIds: [],
        messageHandles: { ...(session.messageHandles ?? {}) },
    };

    const pages = buildQuestionScreenLegacyPages(challenge, getCurrentScreen(legacySession), legacySession.screenAssets, legacySession, { includeIntro: true });

    // Do not commit the renderer switch until an interactive legacy message
    // exists. A failed follow-up must leave the V2 session usable.
    const firstLegacyMessage = await interaction.followUp(pages[0]);

    if (!firstLegacyMessage?.id) {
        throw new Error('Failed to send or store the legacy verification message.');
    }

    setSessionMessageHandle(legacySession, 'legacy-challenge', firstLegacyMessage.id, LEGACY_RENDERER);

    // The legacy page is now usable. Disable each pre-existing message using
    // the payload family it was originally created with; never cross-edit a
    // V2 message with embeds or a legacy fallback prompt with containers.
    await deactivateQuestionMessage(interaction, session, 'Old Version opened. Continue with the legacy verification message.');
    await deactivateOldVersionPrompt(interaction, session).catch((err) => {
        // The functioning legacy page remains the authoritative handoff even
        // when Discord refuses a best-effort prompt cleanup.
        console.error('Failed to deactivate verification old-version prompt:', err);
    });

    setSessionMessageHandle(legacySession, 'challenge', firstLegacyMessage.id, LEGACY_RENDERER);
    legacySession.legacyPageMessageIds = await sendLegacyFollowUpPages(interaction, pages);
    setChallenge(interaction.user.id, legacySession, session.challengeExpiryMs);
}

async function advanceToScreen(interaction, session, targetScreenIndex, options = {}) {
    const { forceStoredMessage = false } = options;
    const challenge = session.challenge;
    if (!challenge) throw new Error('The active verification session has no catalog challenge snapshot.');

    if (session.renderer === LEGACY_RENDERER) {
        await deactivateLegacyFollowUpPages(interaction, session);
    }

    session.screenIndex = targetScreenIndex;
    session.screenAssets = await prepareSessionScreenAssets(session);
    session.token = createSessionToken();

    if (session.renderer === LEGACY_RENDERER) {
        session.legacyPageMessageIds = [];
        const pages = buildQuestionScreenLegacyPages(challenge, getCurrentScreen(session), session.screenAssets, session, { includeIntro: false });
        const questionMessageId = await replaceQuestionMessage(interaction, session, pages[0], { forceStoredMessage });
        setSessionMessageHandle(session, 'challenge', questionMessageId, LEGACY_RENDERER);
        session.legacyPageMessageIds = await sendLegacyFollowUpPages(interaction, pages);
        await resolveModalSubmitAfterScreenReplace(interaction);
        setChallenge(interaction.user.id, session, session.challengeExpiryMs);
        return;
    }

    session.legacyPageMessageIds = [];
    const questionMessageId = await replaceQuestionMessage(interaction, session, buildQuestionScreenOptions(challenge, getCurrentScreen(session), session.screenAssets, session, { renderer: session.renderer }), { forceStoredMessage });
    setSessionMessageHandle(session, 'challenge', questionMessageId, COMPONENTS_V2_RENDERER);
    setSessionMessageHandle(session, 'v2-challenge', questionMessageId, COMPONENTS_V2_RENDERER);
    await resolveModalSubmitAfterScreenReplace(interaction);
    const oldVersionPromptMessageId = await sendOldVersionPromptIfNeeded(interaction, challenge, session);
    setSessionMessageHandle(session, 'fallback-prompt', oldVersionPromptMessageId, LEGACY_RENDERER);
    setChallenge(interaction.user.id, session, session.challengeExpiryMs);
}

async function handleVerifySubmit(interaction) {
    if (!interaction.deferred && !interaction.replied) {
        await deferEphemeralReply(interaction);
    }

    const session = await getActiveSessionOrReplyFast(interaction);
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
        const cooldownSeconds = session.cooldownSeconds ?? 60;
        const retryAt = Date.now() + (cooldownSeconds * 1000);
        clearChallenge(interaction.user.id);
        setCooldown(interaction.user.id, retryAt);
        await deactivateQuestionMessage(interaction, session, 'Verification answer submitted. This screen is no longer active.');
        await deactivateLegacyFollowUpPages(interaction, session, 'Verification answer submitted. This legacy page is no longer active.');
        return sendInitialInteractionResponse(interaction, buildVerificationFailureResponse(cooldownSeconds, retryAt));
    }

    session.completedScreens = [...new Set([...(session.completedScreens ?? []), screen.index])];
    session.answeredScreenIndexes = [...new Set([...(session.answeredScreenIndexes ?? []), screen.index])];

    if (!hasNextScreen(session)) {
        return completeVerification(interaction, session);
    }

    await advanceToScreen(interaction, session, session.screenIndex + 1);
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
    return sendEphemeralNotice(interaction, { content });
}

async function handleVerificationInteraction(interaction) {
    const route = getVerificationRoute(interaction);
    if (!route) return false;

    try {
        if (route.deferImmediately && !interaction.deferred && !interaction.replied) {
            await deferEphemeralReply(interaction);
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
    __testing: {
        getActiveChallengeCount: () => activeChallenges.size,
        getActiveChallenge: (userId) => activeChallenges.get(userId),
        setChallenge,
        clearChallenge,
        expireChallengeIfDue,
        cleanupExpiredVerificationState,
        MAX_ACTIVE_VERIFICATION_SESSIONS,
        MAX_CACHED_SCREEN_ASSETS_PER_SESSION,
    },
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
