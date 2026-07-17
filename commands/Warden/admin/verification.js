const Discord = require('discord.js');
const { botLog } = require('../../../functions');
const verificationEmbedConfig = require('../verification/verificationEmbedConfig.json');
const {
    applyFieldToEmbed,
    buildVerificationAdminConfiguration,
    buildVerificationAdminActionCompleted,
    buildVerificationAdminSummary,
    buildVerificationAdminNotice,
    buildVerificationAdminNeutralNotice,
    buildVerificationErrorEmbed,
    buildVerificationPublicEmbed,
    assertModalLabelSupport,
    buildModalTextLabel,
    buildExistingTextField,
    mergeVerificationAdminResponses,
    truncateModalLabel,
} = require('../verification/verificationResponses');
const { formatVerificationConfigIssues } = require('../verification/verificationLegacyUi');
const {
    acknowledgePanelSubmit: deferAdminPanelModalSubmit,
    deferEphemeralReply,
    deferSourceUpdate,
    sendAcknowledgedNotice: sendAdminModalErrorNotice,
    sendEphemeralNotice: sendAdminErrorNotice,
    updateSourcePanel,
} = require('../verification/verificationInteraction');
const { buildQuestionScreens } = require('../verification/verificationChallenges/verificationChallenges');
const {
    getVerificationImagePool,
    verificationImagePools,
} = require('../verification/verificationImages');
const {
    DEFAULT_ROTATION_ALIGNMENT_DEGREES,
} = require('../verification/verificationChallenges/questionTasks/shared/degrees');
const { evaluateChallengeConfigIssues } = require('../verification/verificationChallenges/verificationConfigIssues');
const {
    buildAdminCustomId,
    buildAdminFormCustomId,
    parseAdminCustomId,
} = require('./verificationAdminSessions');
const {
    parseAnswerOverrideList,
    resolveBaselineAnswersEdit,
    resolveBaselineEdit,
    resolveBaselineStringSetEdit,
    sameStringSet,
} = require('./verificationAdminFormState');
const SETTINGS_SELECT_MENU_MAX_OPTIONS = 25;
const CHALLENGE_SELECT_MENU_MAX_OPTIONS = 25;
const QUESTION_SELECT_MENU_MAX_OPTIONS = 25;
const CHALLENGE_TITLE_MAX_LENGTH = 256;
const CHALLENGE_DESCRIPTION_MAX_LENGTH = 4000;
const QUESTION_LABEL_MAX_LENGTH = 128;
const QUESTION_TEXT_MAX_LENGTH = 4000;
const SELECT_NONE = '__none__';

function buildAdminErrorPayload(payload = {}) {
    const sourceEmbed = payload.embeds?.[0];
    const embed = sourceEmbed?.toJSON?.() ?? sourceEmbed;
    const message = embed?.description ?? payload.content;
    if (!message) return payload;

    const adminPayload = buildVerificationAdminNotice(
        embed?.title ?? 'Verification Admin',
        message,
        'error',
        { fields: embed?.fields ?? [] },
    );
    return {
        ...payload,
        ...adminPayload,
        content: null,
    };
}

function respondAdminError(interaction, payload, options) {
    return sendAdminErrorNotice(interaction, buildAdminErrorPayload(payload), options);
}

function respondAdminModalError(interaction, acknowledgement, payload) {
    return sendAdminModalErrorNotice(interaction, acknowledgement, buildAdminErrorPayload(payload));
}

const NONE_OPTION = {
    label: 'None',
    value: SELECT_NONE,
    description: 'Assign no image pool.',
};

function isAdminSessionOwner(interaction, sessionUserId) {
    return String(interaction.user?.id) === String(sessionUserId);
}

function hasVerificationAdminPermission(interaction) {
    return interaction.memberPermissions?.has?.(Discord.PermissionFlagsBits.Administrator) === true;
}

async function sendAdminPermissionError(interaction) {
    return respondAdminError(interaction, {
        content: 'You need Administrator permission to use this verification admin panel.',
    });
}

const {
    VERIFICATION_MODES,
    applyVerificationConfigSafeguard,
    getVerificationAdminChallengeCatalog,
    getVerificationAdminChallenge,
    getCatalogQuestionChanges,
    getVerificationSettings,
    resolveVerificationAdminGuildId,
    normalizeVerificationAdminGuildId,
    saveVerificationGuildSettingsOnly,
    updateCatalogChallengeMetadata,
    updateCatalogQuestionFields,
    updateCatalogQuestionPrompt,
    updateCatalogQuestionAnswers,
    updateCatalogQuestionImageIds,
    updateCatalogQuestionImageDirections,
    updateCatalogQuestionOptions,
    resetCatalogQuestionFieldsToTemplate,
    createCustomChallenge,
    createCustomQuestion,
    deleteOrResetChallenge,
    deleteOrResetQuestion,
} = require('../verification/verificationService');


async function runAdminConfigSafeguard(interaction, { guildId, changedChallengeId, changedQuestionId, reason, source, committedSettings }) {
    return applyVerificationConfigSafeguard({
        guildId,
        guild: interaction.guild,
        committedSettings,
        source,
        actorId: interaction.user.id,
        changedChallengeId,
        changedQuestionId,
        reason,
        notifyStaff: false,
        deactivateUnsafeActiveChallenges: true,
    });
}

async function followUpAdminConfigWarning(interaction, safeguardResult, { changedChallengeId, changedQuestionId } = {}) {
    function issueMatchesChangedScope(issue) {
        return (!changedChallengeId || issue.challengeId === changedChallengeId)
            && (!changedQuestionId || issue.questionId === changedQuestionId);
    }

    function isBlockingIssue(issue) {
        return issue.severity === 'blocking';
    }

    if (safeguardResult.refreshError) {
        const refreshWarning = buildVerificationAdminNotice(
            'Verification Admin',
            'Your verification change was saved, but the refreshed catalog snapshot could not be loaded. Please reopen the panel before making another change.',
            'warning',
        );
        await interaction.followUp({
            ...refreshWarning,
            flags: refreshWarning.flags | Discord.MessageFlags.Ephemeral,
        }).catch((err) => console.error('Failed to send verification snapshot refresh warning to admin:', err));
    }

    const disabledChallengeIds = safeguardResult.disabledChallengeIds ?? [];
    const disabledSet = new Set(disabledChallengeIds.map(String));
    const originalIssues = safeguardResult.report?.issues ?? [];
    const finalIssues = safeguardResult.finalReport?.issues ?? [];

    const originalRelevantIssues = originalIssues
        .filter(isBlockingIssue)
        .filter((issue) => issue.active === true || disabledSet.has(String(issue.challengeId)))
        .filter(issueMatchesChangedScope);
    const finalRelevantIssues = finalIssues
        .filter(isBlockingIssue)
        .filter((issue) => issue.active === true)
        .filter(issueMatchesChangedScope);

    const issueMap = new Map();
    for (const issue of [...originalRelevantIssues, ...finalRelevantIssues]) {
        const key = [
            issue.challengeId,
            issue.questionId ?? '',
            issue.code ?? '',
            issue.field ?? '',
            issue.message ?? issue.label ?? '',
        ].join('|');
        issueMap.set(key, issue);
    }

    const issues = [...issueMap.values()];
    if (issues.length < 1 && disabledChallengeIds.length < 1) return undefined;
    const description = disabledChallengeIds.length > 0
        ? 'Your change left required verification configuration missing. Unsafe active challenges were automatically disabled when needed.'
        : 'Your change left required verification configuration missing for an active verification challenge.';
    const payload = buildVerificationAdminNotice('Verification configuration warning', description, 'warning', {
        fields: [
            ...(disabledChallengeIds.length > 0 ? [{ name: 'Auto-disabled active challenges', value: disabledChallengeIds.join(', '), inline: false }] : []),
            { name: 'Final active challenges', value: (safeguardResult.finalSettings?.activeChallengeIds ?? []).join(', ') || 'None', inline: false },
            { name: 'Required configuration issues', value: formatVerificationConfigIssues(issues).slice(0, 1024), inline: false },
        ],
    });
    payload.flags |= Discord.MessageFlags.Ephemeral;
    try {
        if (!interaction.deferred && !interaction.replied) {
            console.warn('[ADMIN UX] Skipped verification configuration warning follow-up because the primary interaction response was not finalized yet.');
            return undefined;
        }

        return await interaction.followUp(payload);
    }
    catch (err) {
        console.error('Failed to send verification configuration warning follow-up to admin:', err);
        return undefined;
    }
}


async function replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, source, reason, options = {}) {
    const { sourceMessageId = '', preferSourceUpdate = true, responseMode } = options;
    const safeguard = await runAdminConfigSafeguard(interaction, {
        guildId: context.guildId,
        changedChallengeId: context.challengeId,
        changedQuestionId: context.question.id,
        reason,
        source,
        committedSettings: updatedSettings,
    });
    if (safeguard.refreshError) {
        await followUpAdminConfigWarning(interaction, safeguard, {
            changedChallengeId: context.challengeId,
            changedQuestionId: context.question.id,
        });
        return undefined;
    }
    const effectiveChallenge = await getVerificationAdminChallenge(context.guildId, context.challengeId) ?? context.challenge;
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id) ?? context.question;
    const panelPayload = buildQuestionWorkspacePayload({
        mode: 'edit',
        guildId: context.guildId,
        ownerUserId: context.ownerUserId,
        challengeId: context.challengeId,
        challenge: effectiveChallenge,
        question: effectiveQuestion,
        expanded: true,
    });
    const response = await replyWithUpdatedAdminPanel(interaction, {
        panelPayload,
        sourceMessageId,
        title: 'Question Updated',
        description: reason,
        preferSourceUpdate,
        fallback: 'panel',
        responseMode,
    });

    await followUpAdminConfigWarning(interaction, safeguard, {
        changedChallengeId: context.challengeId,
        changedQuestionId: context.question.id,
    });

    return response;
}


const SETTINGS_MODE_OPTIONS = [
    { label: 'Challenge', value: VERIFICATION_MODES.challenge },
    { label: 'Halt', value: VERIFICATION_MODES.halt },
    { label: 'One-Click', value: VERIFICATION_MODES.oneClick },
];

const SETTINGS_AUTOKICK_OPTIONS = [
    { label: 'ON', value: 'on' },
    { label: 'OFF', value: 'off' },
];

function userErrorEmbed(message) {
    return buildVerificationErrorEmbed(message, { footer: { enabled: false }, timestamp: false });
}

function respondAdminNoChanges(interaction, acknowledgement, message = 'The submitted values already match the current configuration.') {
    return respondAdminModalError(interaction, acknowledgement, buildVerificationAdminNeutralNotice('No changes made', message));
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

function getSingleModalSelectValue(interaction, customId, options, fieldLabel) {
    return getRequiredModalSingleSelect(interaction, customId, options, fieldLabel);
}

function isSelectNone(value) {
    return value === SELECT_NONE;
}

function assertSelectOptionLimit(options, label) {
    const optionCount = Array.isArray(options) ? options.length : Number(options);
    if (optionCount > 25) {
        throw new Error(`${label} has ${optionCount} options, but Discord select menus support up to 25. Add paging or reduce the configured entries.`);
    }
}

function formatDuration(seconds) {
    if (seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? '' : 's'}`;
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

function buildWelcomeEmbed(verificationSettings) {
    const embed = buildVerificationPublicEmbed('welcomeEmbed');

    if (verificationSettings?.autokickEnabled) {
        const autoKickWelcomeFieldConfig = verificationEmbedConfig.autoKickWelcomeField ?? {};
        applyFieldToEmbed(embed, autoKickWelcomeFieldConfig, {
            autokickTimer: formatDuration(verificationSettings.autokickSeconds),
        });
    }

    return embed;
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

async function fetchVerificationMessageFromChannel(channel, messageId) {
    if (!channel?.isTextBased?.()) return null;
    return channel.messages.fetch(messageId).catch(() => null);
}

function buildActiveChallengeIdsValue(verificationSettings) {
    return verificationSettings.activeChallengeIds?.length
        ? verificationSettings.activeChallengeIds.map((challengeId) => `- ${challengeId}`).join('\n')
        : 'None';
}

function buildAvailableChallengeIdsValue(challenges, enabledChallengeIds) {
    const challengeList = Object.values(challenges)
        .map(challenge => `- ${enabledChallengeIds.includes(challenge.id) ? '**' : ''}${challenge.id}${enabledChallengeIds.includes(challenge.id) ? '** [active]' : ''}`)
        .join('\n');

    return challengeList || 'None';
}

function buildSettingsStatusPanel(verificationSettings, components = []) {
    const missingActiveChallenges = verificationSettings.mode === VERIFICATION_MODES.challenge
        && !(verificationSettings.activeChallengeIds?.length > 0);
    return buildVerificationAdminConfiguration(
        'Settings',
        'Current verification settings.',
        [
            { name: 'Mode', value: verificationSettings.mode, inline: true },
            { name: `${missingActiveChallenges ? '⚠️ ' : ''}Active Challenges`, value: buildActiveChallengeIdsValue(verificationSettings), inline: false },
            { name: 'Expiry', value: formatDuration(verificationSettings.challengeExpirySeconds), inline: true },
            { name: 'Retry Cooldown', value: formatDuration(verificationSettings.cooldownSeconds), inline: true },
            { name: 'Autokick', value: `**${verificationSettings.autokickEnabled ? 'ON' : 'OFF'}** after **${formatDuration(verificationSettings.autokickSeconds)}**`, inline: false },
        ],
        { templateOverrides: { title: 'Verification Settings' }, components },
    );
}

function assertSettingsChallengeSelectMenuLimit(challenges) {
    const count = Object.values(challenges).length;
    if (count > SETTINGS_SELECT_MENU_MAX_OPTIONS) {
        throw new Error(`There are ${count} configured challenges, but this select-menu editor supports up to ${SETTINGS_SELECT_MENU_MAX_OPTIONS}. Add paging before editing active challenges through this panel.`);
    }
}

function getChallengeSelectOptions(challenges) {
    return Object.values(challenges).map((challenge) => ({
        label: challenge.id || challenge.title,
        value: String(challenge.id),
        description: challenge.title || challenge.id,
    }));
}

function buildSettingsActionRows(guildId, ownerUserId) {
    return [new Discord.ActionRowBuilder().addComponents(
        new Discord.ButtonBuilder()
            .setCustomId(buildAdminCustomId('settingsEditOptions', guildId, ownerUserId))
            .setLabel('Edit Settings')
            .setStyle(Discord.ButtonStyle.Primary),
        new Discord.ButtonBuilder()
            .setCustomId(buildAdminCustomId('settingsEditTimers', guildId, ownerUserId))
            .setLabel('Edit Timers')
            .setStyle(Discord.ButtonStyle.Secondary),
    )];
}

function buildSettingsPanelPayload({ verificationSettings, guildId, ownerUserId }) {
    return buildSettingsStatusPanel(
        verificationSettings,
        buildSettingsActionRows(guildId, ownerUserId),
    );
}

async function handleVerificationSettingsCommand(interaction, guildId) {
    const verificationSettings = await getVerificationSettings(guildId);
    return interaction.editReply(buildSettingsPanelPayload({
        verificationSettings,
        guildId,
        ownerUserId: interaction.user.id,
    }));
}

function buildChallengeListOverviewPanel(verificationSettings, challenges, enabledChallengeIds, options = {}) {
    return buildVerificationAdminConfiguration(
        'Challenges',
        'Configured verification challenges.',
        [
            { name: 'Active Challenge IDs', value: buildActiveChallengeIdsValue(verificationSettings), inline: false },
            { name: 'Available Challenge IDs', value: buildAvailableChallengeIdsValue(challenges, enabledChallengeIds), inline: false },
        ],
        options,
    );
}

function buildChallengePickerPanel(verificationSettings, challenges, enabledChallengeIds, components = []) {
    return buildVerificationAdminConfiguration(
        'Challenges',
        'Configured verification challenges.',
        [
            { name: 'Active Challenge IDs', value: buildActiveChallengeIdsValue(verificationSettings), inline: false },
            { name: 'Available Challenge IDs', value: buildAvailableChallengeIdsValue(challenges, enabledChallengeIds), inline: false },
            { name: 'Details', value: 'Select a challenge below to open its interactive challenge editor.', inline: false },
        ],
        { components },
    );
}

function assertChallengeSelectMenuLimit(challenges) {
    const count = Object.values(challenges).length;
    if (count > CHALLENGE_SELECT_MENU_MAX_OPTIONS) {
        throw new Error(`There are ${count} configured challenges, but this select-menu editor supports up to ${CHALLENGE_SELECT_MENU_MAX_OPTIONS}. Add paging before editing challenges through this panel.`);
    }
}

function buildChallengeSelectRow(guildId, ownerUserId, challenges) {
    assertChallengeSelectMenuLimit(challenges);
    return new Discord.ActionRowBuilder().addComponents(buildStringSelectComponent({
        customId: buildAdminCustomId('challengeSelect', guildId, ownerUserId),
        placeholder: 'Choose a challenge...',
        options: getChallengeSelectOptions(challenges),
    }));
}

function buildChallengesPanelPayload({ verificationSettings, challenges, enabledChallengeIds, guildId, ownerUserId }) {
    return buildChallengePickerPanel(
        verificationSettings,
        challenges,
        enabledChallengeIds,
        [
            buildChallengeSelectRow(guildId, ownerUserId, challenges),
            new Discord.ActionRowBuilder().addComponents(new Discord.ButtonBuilder()
                .setCustomId(buildAdminCustomId('challengeCreate', guildId, ownerUserId))
                .setLabel('Create Challenge')
                .setStyle(Discord.ButtonStyle.Success)),
        ],
    );
}

async function handleVerificationChallengesCommand(interaction, guildId) {
    const challenges = await getVerificationAdminChallengeCatalog(guildId);
    try { assertChallengeSelectMenuLimit(challenges); }
    catch (err) { return interaction.editReply(buildVerificationAdminNotice('Verification Admin', err.message, 'error')); }
    const verificationSettings = await getVerificationSettings(guildId);
    const enabledChallengeIds = verificationSettings.activeChallengeIds ?? [];
    return interaction.editReply(buildChallengesPanelPayload({
        verificationSettings,
        challenges,
        enabledChallengeIds,
        guildId,
        ownerUserId: interaction.user.id,
    }));
}

async function handleChallengeSelectMenu(interaction, parts) {
    const [guildId, ownerUserId] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminError(interaction, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    const challengeId = interaction.values?.[0];
    const challenge = await getVerificationAdminChallenge(guildId, challengeId);
    if (!challenge) return respondAdminError(interaction, { embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });
    await deferSourceUpdate(interaction);
    const verificationSettings = await getVerificationSettings(guildId);
    const enabledChallengeIds = verificationSettings.activeChallengeIds ?? [];
    return sendChallengeOverview(interaction, { guildId, verificationSettings, enabledChallengeIds, challengeId, mode: 'edit' });
}

function buildChallengeOverviewPanel(verificationSettings, enabledChallengeIds, challengeId, challenge, components = []) {
    const effectiveChallenge = challenge;
    const missingQuestions = (effectiveChallenge.questions?.length ?? 0) < 1;
    const fields = [
        { name: 'Title', value: truncateAdminFieldValue(effectiveChallenge.title ?? 'Not set'), inline: false },
        { name: 'Description', value: truncateAdminFieldValue(effectiveChallenge.description ?? 'Not set'), inline: false },
        { name: `${missingQuestions ? '⚠️ ' : ''}Questions`, value: (effectiveChallenge.questions ?? []).map((question, index) => `${index + 1}. ${question.id} — ${question.label ?? 'Question'}`).join('\n') || 'None', inline: false },
        ...buildChallengeAuditFields(challenge, enabledChallengeIds),
    ];

    return buildVerificationAdminConfiguration(
        'Challenge View',
        `Challenge settings for **${challengeId}**.`,
        fields,
        { components },
    );
}

function buildChallengeOverviewComponents(mode, guildId, userId, challengeId) {
    if (!challengeId) return [];

    const buttons = [];
    if (mode === 'edit') {
        buttons.push(new Discord.ButtonBuilder()
            .setCustomId(buildAdminCustomId('challengeEdit', guildId, userId, challengeId))
            .setLabel('Edit Challenge')
            .setStyle(Discord.ButtonStyle.Primary));
        buttons.push(new Discord.ButtonBuilder()
            .setCustomId(buildAdminCustomId('challengeDelete', mode, guildId, userId, challengeId))
            .setLabel('Delete / Reset')
            .setStyle(Discord.ButtonStyle.Danger));
    }

    buttons.push(new Discord.ButtonBuilder()
        .setCustomId(buildAdminCustomId('challengeQuestions', mode, guildId, userId, challengeId))
        .setLabel('Questions')
        .setStyle(Discord.ButtonStyle.Secondary));
    buttons.push(new Discord.ButtonBuilder()
        .setCustomId(buildAdminCustomId('challengesBack', guildId, userId))
        .setLabel('All Challenges')
        .setStyle(Discord.ButtonStyle.Secondary));

    return [new Discord.ActionRowBuilder().addComponents(...buttons)];
}

async function handleChallengesBackButton(interaction, parts) {
    const [guildId, ownerUserId] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminError(interaction, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    await deferSourceUpdate(interaction);
    const [verificationSettings, challenges] = await Promise.all([
        getVerificationSettings(guildId),
        getVerificationAdminChallengeCatalog(guildId),
    ]);
    return interaction.editReply(buildChallengesPanelPayload({
        verificationSettings,
        challenges,
        enabledChallengeIds: verificationSettings.activeChallengeIds ?? [],
        guildId,
        ownerUserId,
    }));
}

function buildChallengeQuestionsComponents(mode, guildId, userId, challengeId) {
    if (!challengeId) return [];

    const buttons = [
        new Discord.ButtonBuilder()
            .setCustomId(buildAdminCustomId('challengeOverview', mode, guildId, userId, challengeId))
            .setLabel('Challenge')
            .setStyle(Discord.ButtonStyle.Secondary),
    ];
    if (mode === 'edit') buttons.push(new Discord.ButtonBuilder()
            .setCustomId(buildAdminCustomId('questionCreate', mode, guildId, userId, challengeId))
            .setLabel('Create Question')
            .setStyle(Discord.ButtonStyle.Success));
    return [new Discord.ActionRowBuilder().addComponents(...buttons)];
}

function buildChallengeOverviewPanelPayload({ verificationSettings, enabledChallengeIds, mode, guildId, userId, challengeId, challenge }) {
    return buildChallengeOverviewPanel(
        verificationSettings,
        enabledChallengeIds,
        challengeId,
        challenge,
        buildChallengeOverviewComponents(mode, guildId, userId, challengeId),
    );
}

function buildChallengeQuestionsPanelPayload({ verificationSettings, challengeId, challenge, mode, guildId, userId }) {
    return buildQuestionWorkspacePayload({
        verificationSettings,
        mode,
        guildId,
        ownerUserId: userId,
        challengeId,
        challenge,
        question: null,
    });
}

async function sendChallengeOverview(interaction, {
    guildId,
    verificationSettings,
    enabledChallengeIds,
    challengeId,
    mode,
}) {
    if (!challengeId) {
        const challenges = await getVerificationAdminChallengeCatalog(guildId);
        return interaction.editReply(buildChallengeListOverviewPanel(verificationSettings, challenges, enabledChallengeIds));
    }

    const challenge = await getVerificationAdminChallenge(guildId, challengeId);
    if (!challenge) return respondAdminError(interaction, { embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });
    return interaction.editReply(buildChallengeOverviewPanelPayload({
        verificationSettings,
        enabledChallengeIds,
        mode,
        guildId,
        userId: interaction.user.id,
        challengeId,
        challenge,
    }));
}


const QUESTION_TASK_TYPE_OPTIONS = [
    { value: 'none', label: 'None', description: 'No task / plain text question' },
    { value: 'prompt-text', label: 'Prompt Text', description: 'Prompt image text' },
    { value: 'static-image', label: 'Static Image', description: 'Static reference image' },
    { value: 'gallery-standard', label: 'Standard Gallery', description: 'Pick solution image positions' },
    { value: 'gallery-rotation-alignment', label: 'Rotation Alignment', description: 'Pick aligned generated tiles' },
];
const QUESTION_ANSWER_TYPE_OPTIONS = [
    { value: 'none', label: 'No Answer', description: 'Do not require an answer for this question.' },
    { value: 'text', label: 'Text Answer', description: 'Require an accepted text answer.' },
    { value: 'positions', label: 'Position Answer', description: 'Require gallery image position(s).' },
];
const QUESTION_CREATE_ANSWER_TYPE_OPTIONS = QUESTION_ANSWER_TYPE_OPTIONS.filter((option) => option.value !== 'positions');
const POSITION_ANSWER_TASK_TYPES = new Set(['gallery-standard', 'gallery-rotation-alignment']);
const GENERATED_IMAGE_TASK_CONFIG_FIELDS = [
    'text',
    'imageIds',
    'imageDirections',
    'imagePoolId',
    'gallerySize',
    'compositeImageGallery',
    'solutionImageCount',
    'controlImageCount',
    'maxControlImageRepeats',
    'config',
    'url',
];

const BOOLEAN_SELECT_OPTIONS = [
    { label: 'True', value: 'true', description: 'Set to true.' },
    { label: 'False', value: 'false', description: 'Set to false.' },
];

const QUESTION_TASK_IMAGE_ROLE_CONFIG = {
    'gallery-standard': {
        label: 'Image IDs',
        roles: [
            { key: 'solution', label: 'Solution Images', description: 'Images that count as correct answers.' },
            { key: 'control', label: 'Control Images', description: 'Decoy/control images.' },
        ],
    },
    'gallery-rotation-alignment': {
        label: 'Rotation Image IDs',
        roles: [
            { key: 'center', label: 'Center Images', description: 'Center/source images for generated tiles.' },
            { key: 'outer', label: 'Outer Images', description: 'Outer/source images for generated tiles.' },
        ],
    },
};

function isQuestionTaskType(value) {
    return QUESTION_TASK_TYPE_OPTIONS.some((option) => option.value === value);
}

function normalizeTaskType(taskType) {
    const value = String(taskType ?? 'none').trim() || 'none';
    return isQuestionTaskType(value) ? value : 'none';
}

function getQuestionTaskType(question) {
    const generatedImage = question?.generatedImage ?? {};
    if (generatedImage.enabled !== true || generatedImage.type === 'none') return 'none';
    return normalizeTaskType(generatedImage.type);
}

function getQuestionTaskTypeLabel(taskType) {
    return QUESTION_TASK_TYPE_OPTIONS.find((option) => option.value === normalizeTaskType(taskType))?.label ?? 'None';
}

function getQuestionAnswerType(question) {
    if (question?.answer?.required !== true) return 'none';
    return question.answer?.type === 'positions' ? 'positions' : 'text';
}

function isAnswerTypeSupportedByTask(answerType, taskType) {
    return answerType !== 'positions' || POSITION_ANSWER_TASK_TYPES.has(normalizeTaskType(taskType));
}

function getQuestionNumber(challenge, question) {
    return (challenge.questions ?? []).findIndex((candidate) => candidate.id === question.id) + 1;
}

function resolveQuestion(challenge, value) {
    const questions = challenge?.questions ?? [];
    const rawValue = String(value ?? '').trim();
    if (!rawValue) return undefined;
    const index = Number(rawValue);
    if (Number.isInteger(index) && index >= 1 && index <= questions.length) return questions[index - 1];
    return questions.find((question) => question.id === rawValue);
}

function getQuestionImagePool(question) {
    const imagePoolId = question.generatedImage?.imagePoolId;
    return imagePoolId ? getVerificationImagePool(imagePoolId) : undefined;
}

function getImagePoolIds(imagePool) {
    return [...new Set((imagePool?.images ?? [])
        .map((image) => String(image.id ?? '').trim())
        .filter(Boolean))];
}

function validateImageIdsInPool(imageIds, imagePool) {
    const availableImageIds = new Set(getImagePoolIds(imagePool));
    return imageIds.filter((imageId) => !availableImageIds.has(imageId));
}

function getGallerySize(question) {
    const gallerySize = Number(question.generatedImage?.gallerySize ?? 0);
    return Number.isInteger(gallerySize) && gallerySize > 0 ? gallerySize : 9;
}

function getMinimumSolutionImageCount(question) {
    const imageCount = question.generatedImage?.solutionImageCount ?? {};
    const minimum = Number(imageCount.min ?? imageCount.max ?? 1);
    return Number.isInteger(minimum) && minimum > 0 ? minimum : 1;
}

function getMaximumControlImageCount(question) {
    const gallerySize = getGallerySize(question);
    const controlImageCount = question.generatedImage?.controlImageCount ?? {};
    const configuredMaximum = Number(controlImageCount.max ?? gallerySize);
    const controlMaximum = Number.isInteger(configuredMaximum) && configuredMaximum >= 0 ? configuredMaximum : gallerySize;
    return Math.max(0, Math.min(controlMaximum, gallerySize - getMinimumSolutionImageCount(question)));
}

function getMaxControlImageRepeats(question) {
    const repeatLimit = Number(question.generatedImage?.maxControlImageRepeats ?? 1);
    return Number.isInteger(repeatLimit) && repeatLimit > 0 ? repeatLimit : 1;
}

function findSharedImageIds(firstIds, secondIds) {
    const secondIdSet = new Set(secondIds);
    return firstIds.filter((imageId) => secondIdSet.has(imageId));
}

function getAllowedRolesForQuestion(question) {
    const taskType = getQuestionTaskType(question);
    if (taskType === 'gallery-standard') return ['solution', 'control'];
    if (taskType === 'gallery-rotation-alignment') return ['center', 'outer'];
    return [];
}

function formatList(values, empty = 'Not set') {
    return values?.length ? values.map((value) => `- ${value}`).join('\n') : empty;
}

function formatJson(value) {
    if (!value || (typeof value === 'object' && Object.keys(value).length < 1)) return 'Not set';
    return '```json\n' + JSON.stringify(value, null, 2).slice(0, 950) + '\n```';
}

function truncateAdminFieldValue(value, maxLength = 1024) {
    const text = String(value ?? 'Not set');
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function chunkQuestionListLines(lines, maxLength = 900) {
    const chunks = [];
    let chunk = [];
    let length = 0;
    for (const line of lines) {
        const normalizedLine = truncateAdminFieldValue(line, 180);
        const nextLength = length + normalizedLine.length + (chunk.length > 0 ? 1 : 0);
        if (chunk.length > 0 && nextLength > maxLength) {
            chunks.push(chunk);
            chunk = [];
            length = 0;
        }
        chunk.push(normalizedLine);
        length += normalizedLine.length + (chunk.length > 1 ? 1 : 0);
    }
    if (chunk.length > 0) chunks.push(chunk);
    return chunks;
}

function buildQuestionListResponse(challengeId, challenge, options = {}) {
    const questions = challenge.questions ?? [];
    const { compact = false, ...responseOptions } = options;
    const detailedFields = questions.map((question, index) => ({
        name: `${index + 1} ${question.id}`,
        value: [
            question.label ? `Label: ${question.label}` : undefined,
            question.text ? `Text: ${question.text}` : undefined,
            `Task: ${getQuestionTaskTypeLabel(getQuestionTaskType(question))}`,
            `Answer: ${question.answer?.required === true ? question.answer?.type ?? 'required' : 'none'}`,
        ].filter(Boolean).join('\n').slice(0, 1024) || 'No details',
        inline: false,
    }));
    const fields = compact
        ? chunkQuestionListLines(questions.map((question, index) => `${index + 1}. ${question.id} — ${question.label ?? 'Question'} (${getQuestionTaskTypeLabel(getQuestionTaskType(question))})`))
            .map((lines, index) => ({ name: `Questions ${index + 1}`, value: lines.join('\n'), inline: false }))
        : detailedFields;
    return buildVerificationAdminSummary(
        'Questions',
        `Questions for **${challengeId}**:`,
        `${fields.length} question${fields.length === 1 ? '' : 's'} configured.`,
        'info',
        { fields, ...responseOptions },
    );
}

function buildQuestionViewResponse(challengeId, challenge, question, options = {}) {
    const effectiveQuestion = question;
    const taskType = getQuestionTaskType(effectiveQuestion);
    const imageIds = effectiveQuestion.generatedImage?.imageIds ?? {};
    const imageDirections = effectiveQuestion.generatedImage?.imageDirections ?? {};
    const answers = effectiveQuestion.answer?.accepted ?? [];
    const configurationWarnings = new Set(evaluateChallengeConfigIssues(challenge)
        .filter((issue) => issue.questionId === question.id)
        .map((issue) => issue.field));
    const warningLabel = (label, field) => configurationWarnings.has(field) ? `⚠️ ${label}` : label;
    const fields = [
        { name: 'Challenge', value: challengeId, inline: true },
        { name: 'ID', value: question.id, inline: true },
        { name: 'Order', value: String(getQuestionNumber(challenge, question)), inline: true },
        { name: 'Label', value: effectiveQuestion.label ?? 'Not set', inline: true },
        { name: 'Separate', value: String(effectiveQuestion.separateStep === true), inline: true },
        { name: 'Task', value: getQuestionTaskTypeLabel(taskType), inline: true },
        { name: 'Text', value: effectiveQuestion.text ?? 'Not set', inline: false },
    ];

    if (taskType === 'prompt-text') {
        fields.push({ name: warningLabel('Task prompt', 'generatedImage.text'), value: effectiveQuestion.generatedImage?.text ?? 'Not set', inline: false });
    }
    if (taskType === 'static-image') {
        fields.push({ name: warningLabel('Image URL', 'generatedImage.url'), value: effectiveQuestion.generatedImage?.url ?? 'Not set', inline: false });
    }
    if (taskUsesImageIds(taskType)) {
        fields.push(
            { name: warningLabel('Image pool', 'generatedImage.imagePoolId'), value: effectiveQuestion.generatedImage?.imagePoolId ?? 'Not set', inline: false },
            { name: 'Image IDs by role', value: formatJson(imageIds), inline: false },
        );
    }
    if (taskUsesDirections(taskType)) fields.push({ name: 'Image directions', value: formatJson(imageDirections), inline: false });

    if (effectiveQuestion.answer?.required === true) {
        fields.push({ name: 'Answer type', value: getQuestionAnswerType(effectiveQuestion), inline: true });
        if (getQuestionAnswerType(effectiveQuestion) === 'text') fields.push({ name: warningLabel('Accepted answers', 'answer.accepted'), value: formatList(answers), inline: false });
    }
    else fields.push({ name: 'Answer', value: 'Not required', inline: true });

    if (question.updatedAt) fields.push({ name: 'Updated', value: `${question.updatedAt}${question.updatedBy ? ` by <@${question.updatedBy}>` : ''}`, inline: false });

    return buildVerificationAdminSummary(
        'Question',
        `Question **${question.id}** for challenge **${challengeId}**.`,
        'Question catalog configuration.',
        'info',
        {
            fields,
            ...options,
        },
    );
}

function validateQuestionImageIds(question, role, imageIds) {
    const allowedRoles = getAllowedRolesForQuestion(question);
    if (!allowedRoles.includes(role)) {
        return `Role **${role}** is not valid for ${getQuestionTaskTypeLabel(getQuestionTaskType(question))}. Use: ${allowedRoles.join(', ') || 'none'}.`;
    }

    const imagePool = getQuestionImagePool(question);
    if (!imagePool) return `Question **${question.id}** does not define an image pool.`;

    const unknownImageIds = validateImageIdsInPool(imageIds, imagePool);
    if (unknownImageIds.length > 0) {
        return `Unknown image ID${unknownImageIds.length === 1 ? '' : 's'} for pool **${imagePool.id}**: ${unknownImageIds.join(', ')}`;
    }

    return undefined;
}

function validatePendingQuestionImageIds(question, role, imageIds) {
    const validationError = validateQuestionImageIds(question, role, imageIds);
    if (validationError) return validationError;

    const pendingImageIds = {
        ...(question.generatedImage?.imageIds ?? {}),
        [role]: imageIds,
    };

    const taskType = getQuestionTaskType(question);
    if (taskType === 'gallery-standard') {
        const solutionIds = pendingImageIds.solution ?? [];
        const controlIds = pendingImageIds.control ?? [];
        const sharedIds = findSharedImageIds(solutionIds, controlIds);
        if (sharedIds.length > 0) {
            return `Image ID${sharedIds.length === 1 ? '' : 's'} cannot be both solution and control: ${sharedIds.join(', ')}`;
        }

        if (controlIds.length > 0) {
            const requiredControlCapacity = getMaximumControlImageCount({ ...question, generatedImage: { ...(question.generatedImage ?? {}), imageIds: pendingImageIds } });
            const availableControlCapacity = controlIds.length * getMaxControlImageRepeats(question);
            if (availableControlCapacity < requiredControlCapacity) {
                return `Control images can fill at most ${availableControlCapacity} gallery slot${availableControlCapacity === 1 ? '' : 's'}, but this question may need ${requiredControlCapacity}. Add more control IDs or increase maxControlImageRepeats.`;
            }
        }
    }

    if (taskType === 'gallery-rotation-alignment') {
        const centerIds = pendingImageIds.center ?? [];
        const outerIds = pendingImageIds.outer ?? [];
        const sharedIds = findSharedImageIds(centerIds, outerIds);
        if (sharedIds.length > 0) {
            return `Image ID${sharedIds.length === 1 ? '' : 's'} cannot be both center and outer: ${sharedIds.join(', ')}`;
        }
    }

    return undefined;
}

function getChallengeAuditIssues(challenge, enabledChallengeIds) {
    return [...new Set(evaluateChallengeConfigIssues(challenge, enabledChallengeIds)
        .map((issue) => issue.message ?? issue.label)
        .filter(Boolean))];
}


function buildChallengeAuditFields(challenge, enabledChallengeIds) {
    const effectiveChallenge = challenge;
    const screens = buildQuestionScreens(effectiveChallenge);
    const issues = getChallengeAuditIssues(challenge, enabledChallengeIds);

    return [
        { name: `${challenge.id} status`, value: enabledChallengeIds.includes(challenge.id) ? 'Active/enabled' : 'Not active', inline: true },
        { name: `${challenge.id} screens`, value: String(screens.length), inline: true },
        { name: `${challenge.id} issues`, value: formatList(issues, 'No issues found').slice(0, 1024), inline: false },
    ];
}

function getModalTextInput(interaction, customId) {
    return String(interaction.fields.getTextInputValue(customId) ?? '').trim();
}

function getModalSelectValues(interaction, customId) {
    if (typeof interaction.fields?.getStringSelectValues !== 'function') {
        throw new Error('This discord.js version cannot read modal select values. Upgrade discord.js before editing question task options.');
    }

    return interaction.fields.getStringSelectValues(customId)
        .map((value) => String(value).trim())
        .filter(Boolean);
}

function getModalSingleSelectValue(interaction, customId) {
    return getModalSelectValues(interaction, customId)[0];
}

function buildModalStringSelectLabel(label, select, { description } = {}) {
    assertModalLabelSupport();

    const modalLabel = new Discord.LabelBuilder()
        .setLabel(truncateModalLabel(label))
        .setStringSelectMenuComponent(select);

    if (description) modalLabel.setDescription(String(description).slice(0, 100));
    return modalLabel;
}

function normalizeSelectedValues(selectedValues) {
    return new Set([].concat(selectedValues ?? []).map((value) => String(value).trim()).filter(Boolean));
}

function buildStringSelectOption(option, selectedValues = []) {
    const selectOption = new Discord.StringSelectMenuOptionBuilder()
        .setLabel(truncateSelectText(option.label ?? option.value))
        .setValue(String(option.value));
    if (option.description) selectOption.setDescription(truncateSelectText(option.description));
    if (normalizeSelectedValues(selectedValues).has(String(option.value))) selectOption.setDefault(true);
    return selectOption;
}

function buildStringSelectComponent({ customId, placeholder, options, selectedValues = [], minValues = 1, maxValues = 1, required }) {
    const select = new Discord.StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(truncateSelectText(placeholder ?? 'Choose an option...'))
        .setMinValues(minValues)
        .setMaxValues(maxValues)
        .addOptions(options.map((option) => buildStringSelectOption(option, selectedValues)));
    if (required !== undefined) select.setRequired?.(required);
    return select;
}

function buildModalStringSelectField({ label, description, required = true, ...selectOptions }) {
    return buildModalStringSelectLabel(label, buildStringSelectComponent({ ...selectOptions, required }), { description });
}

function getAllowedOptionValues(options) {
    return new Set(options.map((option) => String(option.value)));
}

function getRequiredModalSingleSelect(interaction, customId, options, fieldLabel) {
    const value = getModalSingleSelectValue(interaction, customId);
    if (!value || !getAllowedOptionValues(options).has(String(value))) throw new Error(`Please select a valid ${fieldLabel}.`);
    return value;
}

function buildAdminModal(customId, title, ...labels) {
    assertModalLabelSupport();

    const modalLabels = labels.flat().filter(Boolean);
    if (modalLabels.length > 5) {
        throw new Error(`Too many modal fields for "${title}": ${modalLabels.length}/5.`);
    }

    return new Discord.ModalBuilder()
        .setCustomId(customId)
        .setTitle(String(title).slice(0, 45))
        .addLabelComponents(...modalLabels);
}

async function sendAdminPanelOwnerError(interaction) {
    return respondAdminError(interaction, {
        content: 'This admin panel belongs to another user.',
    });
}

function isMatchingAdminGuild(interaction, guildId) {
    return !interaction.guild?.id || String(interaction.guild.id) === String(guildId);
}

async function showSettingsOptionsModal(interaction, parts) {
    const [guildId, ownerUserId] = parts;

    if (!isAdminSessionOwner(interaction, ownerUserId)) {
        return sendAdminPanelOwnerError(interaction);
    }

    if (!isMatchingAdminGuild(interaction, guildId)) {
        return respondAdminError(interaction, {
            embeds: [userErrorEmbed('This admin panel belongs to another server.')],
        });
    }

    const challenges = await getVerificationAdminChallengeCatalog(guildId);

    try {
        assertSettingsChallengeSelectMenuLimit(challenges);
    }
    catch (err) {
        return respondAdminError(interaction, {
            embeds: [userErrorEmbed(err.message)],
        });
    }

    const verificationSettings = await getVerificationSettings(guildId);

    const settingsChallengeOptions = getChallengeSelectOptions(challenges);
    const modal = buildAdminModal(
        buildAdminFormCustomId('settingsOptionsModal', [guildId, ownerUserId, interaction.message?.id ?? ''], {
            mode: verificationSettings.mode,
            active_challenge_ids: [...(verificationSettings.activeChallengeIds ?? [])],
            autokick_enabled: verificationSettings.autokickEnabled === true ? 'on' : 'off',
        }),
        'Verification Settings',
        ...[
            { label: 'Mode', description: 'Choose the verification mode.', customId: 'mode', placeholder: 'Choose verification mode...', options: SETTINGS_MODE_OPTIONS, selectedValues: [verificationSettings.mode] },
            { label: 'Active Challenges', description: 'Choose active challenges. Challenge mode requires at least one; Halt and One-Click may be empty.', customId: 'active_challenge_ids', placeholder: 'Choose active challenges...', options: settingsChallengeOptions, selectedValues: verificationSettings.activeChallengeIds ?? [], minValues: 0, maxValues: Math.max(1, settingsChallengeOptions.length), required: false },
            { label: 'Autokick', description: 'Choose whether failed verification autokicks.', customId: 'autokick_enabled', placeholder: 'Choose autokick state...', options: SETTINGS_AUTOKICK_OPTIONS, selectedValues: [verificationSettings.autokickEnabled === true ? 'on' : 'off'] },
        ].map(buildModalStringSelectField),
    );

    return interaction.showModal(modal);
}

async function showSettingsTimersModal(interaction, parts) {
    const [guildId, ownerUserId] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminError(interaction, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    const verificationSettings = await getVerificationSettings(guildId);

    const modal = buildAdminModal(
        buildAdminFormCustomId('settingsTimersModal', [guildId, ownerUserId, interaction.message?.id ?? ''], {
            challengeExpirySeconds: String(verificationSettings.challengeExpirySeconds),
            cooldownSeconds: String(verificationSettings.cooldownSeconds),
            autokickSeconds: String(verificationSettings.autokickSeconds),
        }),
        'Verification Timers',
        buildExistingTextField({
            customId: 'challenge_expiry_timer',
            label: 'Challenge Expiry Timer',
            currentValue: `${verificationSettings.challengeExpirySeconds}s`,
            placeholder: '10m or 600s',
            description: 'Enter a parseable duration.',
            maxLength: 32,
        }),
        buildExistingTextField({
            customId: 'challenge_retry_cooldown',
            label: 'Challenge Retry Cooldown',
            currentValue: `${verificationSettings.cooldownSeconds}s`,
            placeholder: '60s or 1m',
            description: 'Enter a parseable duration.',
            maxLength: 32,
        }),
        buildExistingTextField({
            customId: 'autokick_timer',
            label: 'Autokick Timer',
            currentValue: `${verificationSettings.autokickSeconds}s`,
            placeholder: '10m or 600s',
            description: 'Enter a parseable duration.',
            maxLength: 32,
        }),
    );

    return interaction.showModal(modal);
}

async function replyWithUpdatedAdminPanel(interaction, {
    panelPayload,
    sourceMessageId,
    title = 'Updated',
    description = 'Admin panel updated.',
    preferSourceUpdate = true,
    fallback = 'panel',
    responseMode,
}) {
    return updateSourcePanel(interaction, markAdminPanelSuccess(panelPayload), {
        acknowledgement: responseMode,
        sourceMessageId,
        preferSourceUpdate,
        successPayload: buildVerificationAdminActionCompleted(title, description),
        fallbackPayload: fallback === 'ack'
            ? buildVerificationAdminActionCompleted(title, `${description} Re-run the command to view the refreshed panel.`)
            : undefined,
    });
}

function markAdminPanelSuccess(panelPayload) {
    const container = panelPayload?.components?.find((component) =>
        component?.data?.type === Discord.ComponentType.Container);
    const title = container?.components?.find((component) =>
        component?.data?.type === Discord.ComponentType.TextDisplay
        && String(component.data.content ?? '').startsWith('# '));
    if (title && !String(title.data.content).startsWith('# ✅ ')) {
        title.setContent(`# ✅ ${String(title.data.content).slice(2)}`);
    }
    return panelPayload;
}

async function replyWithUpdatedSettingsPanel(interaction, { guildId, ownerUserId, sourceMessageId, verificationSettings, title = 'Settings Updated', description = 'Verification settings were updated.', responseMode }) {
    return replyWithUpdatedAdminPanel(interaction, {
        panelPayload: buildSettingsPanelPayload({ verificationSettings, guildId, ownerUserId }),
        sourceMessageId,
        title,
        description,
        fallback: 'panel',
        responseMode,
    });
}

async function handleSettingsOptionsModalSubmit(interaction, parts = [], state = {}) {
    const [guildId, ownerUserId, sourceMessageId = ''] = parts;
    const responseMode = await deferAdminPanelModalSubmit(interaction);

    if (!isAdminSessionOwner(interaction, ownerUserId)) {
        return respondAdminModalError(interaction, responseMode, {
            content: 'This admin panel belongs to another user.',
        });
    }

    if (!isMatchingAdminGuild(interaction, guildId)) {
        return respondAdminModalError(interaction, responseMode, {
            embeds: [userErrorEmbed('This admin panel belongs to another server.')],
        });
    }

    const challenges = await getVerificationAdminChallengeCatalog(guildId);
    const challengeOptions = getChallengeSelectOptions(challenges);
    let selectedMode;
    let selectedChallengeIds;
    let selectedAutokickState;

    try {
        selectedMode = getRequiredModalSingleSelect(interaction, 'mode', SETTINGS_MODE_OPTIONS, 'verification mode');
        selectedChallengeIds = getModalSelectValues(interaction, 'active_challenge_ids');
        const allowedChallengeIds = getAllowedOptionValues(challengeOptions);
        if (selectedChallengeIds.some((challengeId) => !allowedChallengeIds.has(challengeId))) {
            throw new Error('One or more selected active challenges are no longer available.');
        }
        if (selectedMode === VERIFICATION_MODES.challenge && selectedChallengeIds.length < 1) {
            throw new Error('Challenge mode requires at least one active challenge.');
        }
        selectedAutokickState = getRequiredModalSingleSelect(interaction, 'autokick_enabled', SETTINGS_AUTOKICK_OPTIONS, 'autokick state');
    }
    catch (err) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(err.message)] });
    }

    const currentSettings = await getVerificationSettings(guildId);
    let modeEdit;
    let challengeIdsEdit;
    let autokickEdit;
    try {
        modeEdit = resolveBaselineEdit('mode', state.baseline, currentSettings.mode, selectedMode);
        challengeIdsEdit = resolveBaselineStringSetEdit(
            'active challenges',
            state.baseline?.active_challenge_ids,
            currentSettings.activeChallengeIds ?? [],
            selectedChallengeIds,
        );
        autokickEdit = resolveBaselineEdit(
            'autokick_enabled',
            state.baseline,
            currentSettings.autokickEnabled === true ? 'on' : 'off',
            selectedAutokickState,
        );
    }
    catch (err) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(err.message)] });
    }
    const effectiveMode = modeEdit.changed ? selectedMode : currentSettings.mode;
    const effectiveChallengeIds = challengeIdsEdit.changed ? selectedChallengeIds : currentSettings.activeChallengeIds ?? [];
    if (effectiveMode === VERIFICATION_MODES.challenge && effectiveChallengeIds.length < 1) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Challenge mode requires at least one active challenge.')] });
    }
    if (!modeEdit.changed && !challengeIdsEdit.changed && !autokickEdit.changed) return respondAdminNoChanges(interaction, responseMode);

    const nextSettings = {
        ...currentSettings,
        ...(modeEdit.changed ? { mode: selectedMode } : {}),
        ...(challengeIdsEdit.changed ? { activeChallengeIds: selectedChallengeIds } : {}),
        ...(autokickEdit.changed ? { autokickEnabled: selectedAutokickState === 'on' } : {}),
    };

    const updatedSettings = await saveVerificationGuildSettingsOnly(guildId, nextSettings, interaction.user.id);
    const safeguard = await runAdminConfigSafeguard(interaction, {
        guildId,
        reason: 'Settings options updated.',
        source: 'settings-options-modal',
        committedSettings: updatedSettings,
    });

    if (safeguard.refreshError) {
        await followUpAdminConfigWarning(interaction, safeguard);
        return undefined;
    }

    const response = await replyWithUpdatedSettingsPanel(interaction, {
        guildId,
        ownerUserId,
        sourceMessageId,
        verificationSettings: safeguard.finalSettings ?? updatedSettings,
        title: 'Settings Updated',
        description: 'Verification settings were updated.',
        responseMode,
    });

    await followUpAdminConfigWarning(interaction, safeguard);

    return response;
}

async function handleSettingsTimersModalSubmit(interaction, parts = [], state = {}) {
    const [guildId, ownerUserId, sourceMessageId = ''] = parts;
    const responseMode = await deferAdminPanelModalSubmit(interaction);
    if (!isAdminSessionOwner(interaction, ownerUserId)) {
        return respondAdminModalError(interaction, responseMode, {
            content: 'This admin panel belongs to another user.',
        });
    }
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });

    const expiryInput = getModalTextInput(interaction, 'challenge_expiry_timer');
    const cooldownInput = getModalTextInput(interaction, 'challenge_retry_cooldown');
    const autokickInput = getModalTextInput(interaction, 'autokick_timer');
    if (!expiryInput && !cooldownInput && !autokickInput) return respondAdminNoChanges(interaction, responseMode);

    const expirySeconds = expiryInput ? parseDurationSeconds(expiryInput) : undefined;
    if (expiryInput && !expirySeconds) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Invalid Challenge Expiry Timer. Use a value like `90s`, `2m`, or `2 minutes`.')] });
    const cooldownSeconds = cooldownInput ? parseDurationSeconds(cooldownInput) : undefined;
    if (cooldownInput && !cooldownSeconds) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Invalid Challenge Retry Cooldown. Use a value like `90s`, `2m`, or `2 minutes`.')] });
    const autokickSeconds = autokickInput ? parseDurationSeconds(autokickInput) : undefined;
    if (autokickInput && !autokickSeconds) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Invalid Autokick Timer. Use a value like `90s`, `2m`, or `2 minutes`.')] });

    const currentSettings = await getVerificationSettings(guildId);

    let expiryEdit;
    let cooldownEdit;
    let autokickEdit;
    try {
        expiryEdit = resolveBaselineEdit('challengeExpirySeconds', state.baseline, String(currentSettings.challengeExpirySeconds), String(expirySeconds ?? currentSettings.challengeExpirySeconds));
        cooldownEdit = resolveBaselineEdit('cooldownSeconds', state.baseline, String(currentSettings.cooldownSeconds), String(cooldownSeconds ?? currentSettings.cooldownSeconds));
        autokickEdit = resolveBaselineEdit('autokickSeconds', state.baseline, String(currentSettings.autokickSeconds), String(autokickSeconds ?? currentSettings.autokickSeconds));
    }
    catch (err) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(err.message)] });
    }
    if (!expiryEdit.changed && !cooldownEdit.changed && !autokickEdit.changed) return respondAdminNoChanges(interaction, responseMode);

    const nextSettings = {
        ...currentSettings,
        ...(expiryEdit.changed ? { challengeExpirySeconds: expiryEdit.value } : {}),
        ...(cooldownEdit.changed ? { cooldownSeconds: cooldownEdit.value } : {}),
        ...(autokickEdit.changed ? { autokickSeconds: autokickEdit.value } : {}),
    };

    const updatedSettings = await saveVerificationGuildSettingsOnly(guildId, nextSettings, interaction.user.id);

    return replyWithUpdatedSettingsPanel(interaction, {
        guildId,
        ownerUserId,
        sourceMessageId,
        verificationSettings: updatedSettings,
        title: 'Timers Updated',
        description: 'Verification timers were updated.',
        responseMode,
    });
}

async function validateChallengeAdminInteraction(interaction, parts) {
    const [mode, guildId, ownerUserId, challengeId] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) {
        await sendAdminPanelOwnerError(interaction);
        return { error: true };
    }
    if (!isMatchingAdminGuild(interaction, guildId)) {
        await respondAdminError(interaction, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
        return { error: true };
    }
    const challenge = await getVerificationAdminChallenge(guildId, challengeId);
    if (!challenge) {
        await respondAdminError(interaction, { embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });
        return { error: true };
    }
    return { mode, guildId, ownerUserId, challengeId, challenge };
}

async function handleChallengeQuestionsButton(interaction, parts) {
    const context = await validateChallengeAdminInteraction(interaction, parts);
    if (context.error) return;
    await deferSourceUpdate(interaction);
    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveChallenge = context.challenge;
    return interaction.editReply(buildChallengeQuestionsPanelPayload({
        verificationSettings,
        challengeId: context.challengeId,
        challenge: effectiveChallenge,
        mode: context.mode,
        guildId: context.guildId,
        userId: context.ownerUserId,
    }));
}

async function handleChallengeOverviewButton(interaction, parts) {
    const context = await validateChallengeAdminInteraction(interaction, parts);
    if (context.error) return;
    await deferSourceUpdate(interaction);
    const verificationSettings = await getVerificationSettings(context.guildId);
    const enabledChallengeIds = verificationSettings.activeChallengeIds ?? [];
    return interaction.editReply(buildChallengeOverviewPanelPayload({
        verificationSettings,
        enabledChallengeIds,
        mode: context.mode,
        guildId: context.guildId,
        userId: context.ownerUserId,
        challengeId: context.challengeId,
        challenge: context.challenge,
    }));
}

async function handleQuestionSelectOpenButton(interaction, parts) {
    const [mode, guildId, ownerUserId, challengeId] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminError(interaction, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    const challenge = await getVerificationAdminChallenge(guildId, challengeId);
    if (!challenge) return respondAdminError(interaction, { embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });

    try {
        assertQuestionSelectMenuLimit(challenge);
    }
    catch (err) {
        return respondAdminError(interaction, { embeds: [userErrorEmbed(err.message)] });
    }
    if (getChallengeQuestions(challenge).length < 1) return respondAdminError(interaction, { content: `No questions are configured for **${challengeId}**.` });

    await deferSourceUpdate(interaction);
    const effectiveChallenge = challenge;
    return interaction.editReply(buildQuestionWorkspacePayload({
        mode,
        guildId,
        ownerUserId,
        challengeId,
        challenge: effectiveChallenge,
        question: null,
        expanded: false,
    }));
}

async function handleQuestionSelectMenu(interaction, parts) {
    const [mode, guildId, ownerUserId, challengeId] = parts;
    const selectedQuestionId = interaction.values?.[0];
    if (!selectedQuestionId) return respondAdminError(interaction, { embeds: [userErrorEmbed('Please select a question.')] });
    const context = await validateQuestionAdminInteraction(interaction, [guildId, ownerUserId, challengeId, selectedQuestionId]);
    if (context.error) return;
    await deferSourceUpdate(interaction);
    const effectiveChallenge = context.challenge;
    const effectiveQuestion = resolveQuestion(effectiveChallenge, selectedQuestionId) ?? context.question;
    return interaction.editReply(buildQuestionWorkspacePayload({
        mode,
        guildId: context.guildId,
        ownerUserId: context.ownerUserId,
        challengeId: context.challengeId,
        challenge: effectiveChallenge,
        question: effectiveQuestion,
        expanded: false,
    }));
}

async function handleQuestionEditToolsButton(interaction, parts) {
    const [mode, guildId, ownerUserId, challengeId, questionId] = parts;
    const context = await validateQuestionAdminInteraction(interaction, [guildId, ownerUserId, challengeId, questionId]);
    if (context.error) return;
    if (mode !== 'edit') {
        return respondAdminError(interaction, { embeds: [userErrorEmbed('This question workspace is read-only. Run `/verification challenges` to edit questions.')] });
    }
    await deferSourceUpdate(interaction);
    const effectiveChallenge = context.challenge;
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id) ?? context.question;
    return interaction.editReply(buildQuestionWorkspacePayload({
        mode,
        guildId: context.guildId,
        ownerUserId: context.ownerUserId,
        challengeId: context.challengeId,
        challenge: effectiveChallenge,
        question: effectiveQuestion,
        expanded: true,
    }));
}

async function showChallengeEditModalFromButton(interaction, parts) {
    const [guildId, ownerUserId, challengeId] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminError(interaction, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });

    const challenge = await getVerificationAdminChallenge(guildId, challengeId);
    if (!challenge) return respondAdminError(interaction, { embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });

    const modal = buildAdminModal(
        buildAdminFormCustomId('challengeEditModal', [guildId, ownerUserId, challengeId, interaction.message?.id ?? ''], {
            challenge_title: challenge.title ?? '',
            challenge_description: challenge.description ?? '',
        }),
        'Edit Challenge',
        buildExistingTextField({
            customId: 'challenge_title',
            label: 'Challenge Title',
            currentValue: challenge.title ?? '',
            maxLength: CHALLENGE_TITLE_MAX_LENGTH,
        }),
        buildExistingTextField({
            customId: 'challenge_description',
            label: 'Challenge Description',
            currentValue: challenge.description ?? '',
            style: Discord.TextInputStyle.Paragraph,
            maxLength: CHALLENGE_DESCRIPTION_MAX_LENGTH,
        }),
    );

    return interaction.showModal(modal);
}

async function getQuestionAdminContext(parts) {
    const [guildId, ownerUserId, challengeId, questionId] = parts;
    const challenge = await getVerificationAdminChallenge(guildId, challengeId);
    const question = challenge ? resolveQuestion(challenge, questionId) : undefined;
    return { guildId, ownerUserId, challengeId, questionId, challenge, question };
}

async function validateQuestionAdminInteraction(interaction, parts) {
    const context = await getQuestionAdminContext(parts);
    if (!isAdminSessionOwner(interaction, context.ownerUserId)) {
        await sendAdminPanelOwnerError(interaction);
        return { error: true };
    }
    if (!isMatchingAdminGuild(interaction, context.guildId)) {
        await respondAdminError(interaction, {
            embeds: [userErrorEmbed('This admin panel belongs to another server.')],
        });
        return { error: true };
    }
    if (!context.challenge) {
        await respondAdminError(interaction, {
            embeds: [userErrorEmbed(`Unknown verification challenge ID: ${context.challengeId}`)],
        });
        return { error: true };
    }
    if (!context.question) {
        await respondAdminError(interaction, {
            embeds: [userErrorEmbed(`Unknown question ID for **${context.challengeId}**: ${context.questionId}`)],
        });
        return { error: true };
    }
    return context;
}

function buildActionRows(buttons, options = {}) {
    const { maxRows = 5, maxButtonsPerRow = 5 } = options;
    const maxButtons = maxRows * maxButtonsPerRow;
    if (buttons.length > maxButtons) {
        throw new Error(`Too many buttons for one Discord message: ${buttons.length}/${maxButtons}. Use pagination or reduce the configured items.`);
    }

    const rows = [];
    for (let index = 0; index < buttons.length; index += maxButtonsPerRow) {
        rows.push(new Discord.ActionRowBuilder().addComponents(...buttons.slice(index, index + maxButtonsPerRow)));
    }
    return rows;
}

function truncateSelectText(text, maxLength = 100) {
    const value = String(text ?? '').trim() || 'Question';
    return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function getChallengeQuestions(challenge) {
    return Array.isArray(challenge?.questions) ? challenge.questions : [];
}

function assertQuestionSelectMenuLimit(challenge) {
    const questions = getChallengeQuestions(challenge);
    if (questions.length > QUESTION_SELECT_MENU_MAX_OPTIONS) {
        throw new Error(`This challenge has ${questions.length} questions. The select-menu editor currently supports up to ${QUESTION_SELECT_MENU_MAX_OPTIONS} questions. Split the challenge or add selector paging before editing through this panel.`);
    }
}

function buildQuestionSelectRow(mode, guildId, ownerUserId, challengeId, challenge, selectedQuestionId) {
    const questions = getChallengeQuestions(challenge);
    assertQuestionSelectMenuLimit(challenge);

    const selectMenu = new Discord.StringSelectMenuBuilder()
        .setCustomId(buildAdminCustomId('questionSelect', mode, guildId, ownerUserId, challengeId))
        .setPlaceholder('Choose a question...')
        .addOptions(questions.map((question, index) => {
            if (String(question.id ?? '').length > 100) {
                throw new Error(`Question ID is too long for a select-menu value: ${question.id}`);
            }
            const labelBase = `${index + 1}. ${question.label || question.id}`;
            const option = new Discord.StringSelectMenuOptionBuilder()
                .setLabel(truncateSelectText(labelBase))
                .setValue(String(question.id))
                .setDescription(truncateSelectText(question.id || getQuestionTaskTypeLabel(getQuestionTaskType(question)) || 'Question'));
            if (selectedQuestionId && String(question.id) === String(selectedQuestionId)) option.setDefault(true);
            return option;
        }));

    return new Discord.ActionRowBuilder().addComponents(selectMenu);
}

function buildQuestionCollapsedEditComponents(mode, guildId, ownerUserId, challengeId, questionId) {
    return [new Discord.ActionRowBuilder().addComponents(
        new Discord.ButtonBuilder()
            .setCustomId(buildAdminCustomId('questionEditTools', mode, guildId, ownerUserId, challengeId, questionId))
            .setLabel('Edit')
            .setStyle(Discord.ButtonStyle.Primary),
    )];
}

function buildQuestionWorkspaceListComponents(mode, guildId, ownerUserId, challengeId, challenge, selectedQuestionId) {
    const selector = getChallengeQuestions(challenge).length > 0
        ? [buildQuestionSelectRow(mode, guildId, ownerUserId, challengeId, challenge, selectedQuestionId)]
        : [];
    return [
        ...selector,
        ...buildChallengeQuestionsComponents(mode, guildId, ownerUserId, challengeId),
    ];
}

function buildQuestionWorkspacePayload({ mode, guildId, ownerUserId, challengeId, challenge, question, expanded = false }) {
    const responses = [buildQuestionListResponse(
        challengeId,
        challenge,
        { compact: true, components: buildQuestionWorkspaceListComponents(mode, guildId, ownerUserId, challengeId, challenge, question?.id) },
    )];

    if (question) {
        const components = mode === 'edit'
            ? (expanded
                ? buildQuestionEditPanelComponents(guildId, ownerUserId, challengeId, question.id, question)
                : buildQuestionCollapsedEditComponents(mode, guildId, ownerUserId, challengeId, question.id))
            : [];
        responses.push(buildQuestionViewResponse(
            challengeId,
            challenge,
            question,
            { components },
        ));
    }

    return mergeVerificationAdminResponses(responses);
}

function buildQuestionEditPanelComponents(guildId, userId, challengeId, questionId, effectiveQuestion) {
    const button = (action, label, style = Discord.ButtonStyle.Secondary, ...extraParts) => new Discord.ButtonBuilder()
        .setCustomId(buildAdminCustomId(action, guildId, userId, challengeId, questionId, ...extraParts))
        .setLabel(label)
        .setStyle(style);

    const taskType = getQuestionTaskType(effectiveQuestion);
    const answerType = effectiveQuestion.answer?.type;
    const actionButtons = [
        button('questionEditOptions', 'Options'),
        button('questionEditText', 'Text'),
    ];

    if (taskUsesPromptText(taskType)) actionButtons.push(button('questionEditImageText', 'Prompt Text', Discord.ButtonStyle.Secondary, taskType));
    if (effectiveQuestion.answer?.required === true && answerType === 'text') actionButtons.push(button('questionEditAnswers', 'Answers', Discord.ButtonStyle.Secondary, answerType));
    if (taskUsesImageIds(taskType)) actionButtons.push(button('questionEditImageIds', 'Image IDs', Discord.ButtonStyle.Secondary, taskType));
    if (taskUsesDirections(taskType)) actionButtons.push(button('questionEditDirections', 'Directions', Discord.ButtonStyle.Secondary, taskType));

    const rows = buildActionRows(actionButtons, { maxRows: 4 });
    rows.push(new Discord.ActionRowBuilder().addComponents(
        button('questionClearSelector', 'Reset to Template', Discord.ButtonStyle.Danger),
        button('questionEditDone', 'Done', Discord.ButtonStyle.Success),
    ));
    return rows;
}

function hasOwnValue(object, key) {
    return Object.prototype.hasOwnProperty.call(object ?? {}, key);
}

function hasAnyOwnValue(object, keys) {
    return keys.some((key) => hasOwnValue(object, key));
}

function getQuestionResetDefinitions(effectiveQuestion, catalogChanges = {}) {
    const definitions = [];
    const add = (field, label, paths) => definitions.push({ field, label, paths: Array.isArray(paths) ? paths : [paths] });
    const generatedImageChanges = catalogChanges.generatedImage ?? {};
    const answerChanges = catalogChanges.answer ?? {};
    const taskType = getQuestionTaskType(effectiveQuestion);

    if (hasOwnValue(catalogChanges, 'order')) add('order', 'Reset Order', 'order');
    if (hasOwnValue(catalogChanges, 'separateStep')) add('separate-step', 'Reset Separate Step', 'separateStep');
    if (hasOwnValue(catalogChanges, 'label')) add('label', 'Reset Label', 'label');
    if (hasOwnValue(catalogChanges, 'text')) add('text', 'Reset Text', 'text');
    if (hasAnyOwnValue(generatedImageChanges, ['enabled', 'type', 'gallerySize', 'compositeImageGallery', 'solutionImageCount', 'controlImageCount', 'maxControlImageRepeats', 'config', 'url'])) {
        add('task', 'Reset Task Fields', ['generatedImage.enabled', 'generatedImage.type', 'generatedImage.gallerySize', 'generatedImage.compositeImageGallery', 'generatedImage.solutionImageCount', 'generatedImage.controlImageCount', 'generatedImage.maxControlImageRepeats', 'generatedImage.config', 'generatedImage.url', 'generatedImage.text', 'generatedImage.imagePoolId', 'generatedImage.imageIds', 'generatedImage.imageDirections']);
    }
    if (hasOwnValue(generatedImageChanges, 'imagePoolId') || hasOwnValue(generatedImageChanges.config, 'imagePoolId')) {
        add('image-pool', 'Reset Image Pool', ['generatedImage.imagePoolId', 'generatedImage.config.imagePoolId']);
    }
    if (taskType === 'prompt-text' && hasOwnValue(generatedImageChanges, 'text')) add('image-text', 'Reset Prompt Text', 'generatedImage.text');
    if (['gallery-standard', 'gallery-rotation-alignment'].includes(taskType) && hasOwnValue(generatedImageChanges, 'imageIds')) add('image-ids', 'Reset Image IDs', 'generatedImage.imageIds');
    if (taskType === 'gallery-rotation-alignment' && hasOwnValue(generatedImageChanges, 'imageDirections')) add('directions', 'Reset Directions', 'generatedImage.imageDirections');
    if (hasOwnValue(answerChanges, 'required') || hasOwnValue(answerChanges, 'type')) add('answer-mode', 'Reset Answer Mode', ['answer.required', 'answer.type', 'answer.inputLabel', 'answer.inputPlaceholder', 'answer.accepted']);
    if (effectiveQuestion.answer?.type === 'text' && hasOwnValue(answerChanges, 'accepted')) add('answers', 'Reset Answers', 'answer.accepted');

    if (definitions.length >= 2) {
        definitions.push({ field: 'all-visible', label: 'Reset All Visible Fields', paths: [...new Set(definitions.flatMap((definition) => definition.paths))] });
    }
    return definitions;
}

function buildQuestionResetRevision(questionChanges = {}, question = {}) {
    return JSON.stringify({
        updatedAt: questionChanges.updatedAt ?? question.updatedAt ?? null,
        updatedBy: questionChanges.updatedBy ?? question.updatedBy ?? null,
        changes: questionChanges.changes ?? {},
    });
}

function getQuestionClearSelectOptions(definitions) {
    return definitions.map((definition) => ({
        label: definition.label,
        value: definition.field,
        description: definition.paths.length === 1 ? definition.paths[0] : `${definition.paths.length} catalog fields`,
    }));
}


async function handleQuestionEditDoneButton(interaction, parts) {
    const context = await validateQuestionAdminInteraction(interaction, parts);
    if (context.error) return;

    await deferSourceUpdate(interaction);

    const effectiveChallenge = context.challenge;
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id) ?? context.question;

    return interaction.editReply(buildQuestionWorkspacePayload({
        mode: 'edit',
        guildId: context.guildId,
        ownerUserId: context.ownerUserId,
        challengeId: context.challengeId,
        challenge: effectiveChallenge,
        question: effectiveQuestion,
        expanded: false,
    }));
}

async function showQuestionClearSelectorModal(interaction, parts) {
    const context = await validateQuestionAdminInteraction(interaction, parts);
    if (context.error) return;
    const effectiveChallenge = context.challenge;
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id) ?? context.question;
    const questionChanges = await getCatalogQuestionChanges(context.guildId, context.challengeId, context.question.id);
    const definitions = getQuestionResetDefinitions(effectiveQuestion, questionChanges?.changes);

    if (definitions.length < 1) {
        return respondAdminError(interaction, {
            content: `There are no catalog fields to reset to template values for **${context.challengeId}/${context.question.id}**.`,
        });
    }

    const modal = buildAdminModal(
        buildAdminFormCustomId('questionClearModal', [context.guildId, context.ownerUserId, context.challengeId, context.question.id, interaction.message?.id ?? ''], {
            reset_revision: buildQuestionResetRevision(questionChanges, effectiveQuestion),
        }),
        'Reset Question Fields',
        buildModalStringSelectField({
            label: 'Catalog field to reset',
            description: 'Select catalog fields to restore from the protected template for this Question.',
            customId: 'clear_field',
            placeholder: 'Choose catalog fields to reset...',
            options: getQuestionClearSelectOptions(definitions),
            selectedValues: [],
            minValues: 1,
            maxValues: 1,
            required: true,
        }),
    );

    return interaction.showModal(modal);
}


function getQuestionOrderSelectOptions(effectiveChallenge, selectedQuestionId) {
    const questions = getChallengeQuestions(effectiveChallenge);
    const orderOptions = questions.map((question, index) => ({
        label: String(index + 1),
        value: String(index + 1),
        description: question.id === selectedQuestionId
            ? `Current position: ${question.id}`
            : question.id,
    }));

    return orderOptions;
}

function buildQuestionOrderSelectField(effectiveChallenge, selectedQuestionId) {
    const options = getQuestionOrderSelectOptions(effectiveChallenge, selectedQuestionId);
    assertSelectOptionLimit(options, 'Question order options');
    const currentOrderValue = String(getChallengeQuestions(effectiveChallenge).findIndex((question) => question.id === selectedQuestionId) + 1);

    return buildModalStringSelectField({
        label: 'Order Number',
        description: 'Current order is preselected. Change it only to reorder this question.',
        customId: 'order_number',
        placeholder: 'Choose order number...',
        options,
        selectedValues: [currentOrderValue],
        minValues: 1,
        maxValues: 1,
        required: true,
    });
}

function getBooleanSelectOptions() {
    return BOOLEAN_SELECT_OPTIONS;
}

function buildBooleanSelectField(customId, label, currentValue) {
    return buildModalStringSelectField({
        label,
        description: `Current value is preselected: ${currentValue === true ? 'true' : 'false'}.`,
        customId,
        placeholder: `Choose ${label.toLowerCase()}...`,
        options: getBooleanSelectOptions(),
        selectedValues: [currentValue === true ? 'true' : 'false'],
        minValues: 1,
        maxValues: 1,
        required: true,
    });
}

function getImagePoolSelectOptions() {
    return Object.values(verificationImagePools ?? {})
        .map((pool) => ({
            label: pool.id,
            value: pool.id,
            description: pool.description || `${pool.images?.length ?? 0} image(s)`,
        }))
        .sort((left, right) => left.label.localeCompare(right.label));
}

function getImagePoolModalOptions() {
    const options = [NONE_OPTION, ...getImagePoolSelectOptions()];
    assertSelectOptionLimit(options, 'Verification image pools');
    return options;
}

function buildQuestionImagePoolSelectField(effectiveQuestion) {
    const currentImagePoolId = effectiveQuestion.generatedImage?.imagePoolId;
    const selectedValue = currentImagePoolId || SELECT_NONE;

    return buildModalStringSelectField({
        label: 'Assigned Image Pool',
        description: 'Choose the image pool for image/gallery tasks.',
        customId: 'image_pool_id',
        placeholder: 'Choose assigned image pool...',
        options: getImagePoolModalOptions(),
        selectedValues: [selectedValue],
        minValues: 1,
        maxValues: 1,
        required: true,
    });
}

function getTaskImageRoleConfig(taskType) {
    return QUESTION_TASK_IMAGE_ROLE_CONFIG[normalizeTaskType(taskType)];
}

function buildImagePoolImageOptions(imagePool) {
    return (imagePool?.images ?? []).map((image) => ({
        label: image.id,
        value: image.id,
        description: image.generatedRole || image.fileName || image.url || image.description || image.id,
    }));
}

function buildRoleImageIdSelectField({ role, effectiveQuestion, imagePool }) {
    const options = buildImagePoolImageOptions(imagePool);
    assertSelectOptionLimit(options, `${imagePool.id} image IDs`);

    const selectedValues = (effectiveQuestion.generatedImage?.imageIds?.[role.key] ?? [])
        .map(String)
        .filter((imageId) => options.some((option) => option.value === imageId));

    return buildModalStringSelectField({
        label: role.label,
        description: role.description,
        customId: `${role.key}_ids`,
        placeholder: `Choose ${role.key} image IDs...`,
        options,
        selectedValues,
        minValues: 1,
        maxValues: Math.max(1, options.length),
        required: true,
    });
}

function buildDirectionDegreeOptions() {
    return DEFAULT_ROTATION_ALIGNMENT_DEGREES.map((degrees) => ({
        label: `${degrees}°`,
        value: String(degrees),
        description: `${degrees} degree orientation`,
    }));
}

function buildImageDirectionImageSelectField(effectiveQuestion, imagePool) {
    const options = buildImagePoolImageOptions(imagePool);
    assertSelectOptionLimit(options, `${imagePool.id} image IDs`);

    return buildModalStringSelectField({
        label: 'Image IDs',
        description: 'Choose one or multiple images.',
        customId: 'direction_image_ids',
        placeholder: 'Choose image IDs...',
        options,
        selectedValues: [],
        minValues: 1,
        maxValues: Math.max(1, options.length),
        required: true,
    });
}

function buildDirectionDegreesSelectField() {
    const options = buildDirectionDegreeOptions();

    return buildModalStringSelectField({
        label: 'Direction / Orientation',
        description: 'Select from degree steps on a compass.',
        customId: 'direction_degrees',
        placeholder: 'Choose directions...',
        options,
        selectedValues: [],
        minValues: 1,
        maxValues: options.length,
        required: true,
    });
}

function taskUsesPromptText(taskType) {
    return taskType === 'prompt-text';
}

function taskUsesImageIds(taskType) {
    return ['gallery-standard', 'gallery-rotation-alignment'].includes(taskType);
}

function taskUsesDirections(taskType) {
    return taskType === 'gallery-rotation-alignment';
}

function taskUsesImagePool(taskType) {
    return taskUsesImageIds(taskType);
}

function buildQuestionTaskSelectComponent(currentTaskType) {
    const normalizedCurrentTaskType = normalizeTaskType(currentTaskType);

    return buildStringSelectComponent({
        customId: 'task_type',
        placeholder: `Task: ${getQuestionTaskTypeLabel(normalizedCurrentTaskType)}`,
        options: QUESTION_TASK_TYPE_OPTIONS,
        selectedValues: [normalizedCurrentTaskType],
        minValues: 1,
        maxValues: 1,
        required: true,
    });
}

function buildQuestionTaskSelectModalLabel(currentTaskType) {
    return buildModalStringSelectLabel(
        'Task',
        buildQuestionTaskSelectComponent(currentTaskType),
        { description: 'Current task is preselected. Change only if needed.' },
    );
}

function buildQuestionAnswerTypeSelectModalLabel(currentAnswerType, options = QUESTION_ANSWER_TYPE_OPTIONS) {
    const normalizedAnswerType = options.some((option) => option.value === currentAnswerType)
        ? currentAnswerType
        : 'none';
    return buildModalStringSelectLabel(
        'Answer Mode',
        buildStringSelectComponent({
            customId: 'answer_type',
            placeholder: `Answer: ${QUESTION_ANSWER_TYPE_OPTIONS.find((option) => option.value === normalizedAnswerType)?.label ?? 'No Answer'}`,
            options,
            selectedValues: [normalizedAnswerType],
            minValues: 1,
            maxValues: 1,
            required: true,
        }),
        { description: options === QUESTION_CREATE_ANSWER_TYPE_OPTIONS ? 'Gallery tasks can enable position answers later.' : 'Position answers require a gallery task.' },
    );
}

async function showQuestionModal(interaction, parts, buildModal) {
    const context = await validateQuestionAdminInteraction(interaction, parts);
    if (context.error) return;
    const modal = await buildModal(context, context.question, interaction);
    if (!modal) return;
    return interaction.showModal(modal);
}

function showQuestionTextModal(interaction, parts) {
    return showQuestionModal(interaction, parts, (context, question, sourceInteraction) => buildAdminModal(
        buildAdminFormCustomId('questionTextModal', [context.guildId, context.ownerUserId, context.challengeId, context.question.id, sourceInteraction.message?.id ?? ''], {
            label: question.label ?? '',
            text: question.text ?? '',
        }),
        'Edit Question Text',
        buildExistingTextField({
            customId: 'label',
            label: 'Label',
            currentValue: question.label ?? '',
            maxLength: QUESTION_LABEL_MAX_LENGTH,
        }),
        buildExistingTextField({
            customId: 'text',
            label: 'Question Text',
            currentValue: question.text ?? '',
            style: Discord.TextInputStyle.Paragraph,
            maxLength: QUESTION_TEXT_MAX_LENGTH,
        }),
    ));
}

function showQuestionOptionsModal(interaction, parts) {
    return showQuestionModal(interaction, parts, async (context, question, sourceInteraction) => {
        const effectiveChallenge = context.challenge;
        const effectiveQuestion = question;
        return buildAdminModal(
            buildAdminFormCustomId('questionOptionsModal', [context.guildId, context.ownerUserId, context.challengeId, context.question.id, sourceInteraction.message?.id ?? ''], {
                order_number: String(getQuestionNumber(effectiveChallenge, effectiveQuestion)),
                separate_step: effectiveQuestion.separateStep === true ? 'true' : 'false',
                answer_type: getQuestionAnswerType(effectiveQuestion),
                task_type: getQuestionTaskType(effectiveQuestion),
                image_pool_id: getEffectiveImagePoolId(effectiveQuestion) ?? SELECT_NONE,
            }),
            'Question Options',
            buildQuestionOrderSelectField(effectiveChallenge, context.question.id),
            buildBooleanSelectField('separate_step', 'Separate Step', effectiveQuestion.separateStep === true),
            buildQuestionAnswerTypeSelectModalLabel(getQuestionAnswerType(effectiveQuestion)),
            buildQuestionTaskSelectModalLabel(getQuestionTaskType(effectiveQuestion)),
            buildQuestionImagePoolSelectField(effectiveQuestion),
        );
    });
}

function showQuestionImageTextModal(interaction, parts) {
    return showQuestionModal(interaction, parts, (context, question, sourceInteraction) => {
        const taskType = parts[4] ?? getQuestionTaskType(question);
        if (taskType !== 'prompt-text') throw new Error('This question does not use prompt image text.');
        return buildAdminModal(
            buildAdminFormCustomId('questionImageTextModal', [context.guildId, context.ownerUserId, context.challengeId, context.question.id, sourceInteraction.message?.id ?? ''], {
                image_text: question.generatedImage?.text ?? '',
            }),
            'Edit Prompt Image Text',
            buildExistingTextField({
                customId: 'image_text',
                label: 'Prompt Image Text',
                currentValue: question.generatedImage?.text ?? '',
                style: Discord.TextInputStyle.Paragraph,
                maxLength: QUESTION_TEXT_MAX_LENGTH,
            }),
        );
    });
}

function showQuestionAnswersModal(interaction, parts) {
    return showQuestionModal(interaction, parts, (context, question, sourceInteraction) => {
        const answerType = parts[4] ?? question.answer?.type;
        if (answerType !== 'text') throw new Error('This question does not use editable text answers.');
        return buildAdminModal(
            buildAdminFormCustomId('questionAnswersModal', [context.guildId, context.ownerUserId, context.challengeId, context.question.id, sourceInteraction.message?.id ?? ''], {
                answers: (question.answer?.accepted ?? []).join('\n'),
            }),
            'Edit Accepted Answers',
            buildExistingTextField({
                customId: 'answers',
                label: 'Accepted Answers',
                currentValue: (question.answer?.accepted ?? []).join('\n'),
                style: Discord.TextInputStyle.Paragraph,
                description: 'Comma or newline separated accepted answers.',
                maxLength: QUESTION_TEXT_MAX_LENGTH,
            }),
        );
    });
}

function showQuestionImageIdsModal(interaction, parts) {
    return showQuestionModal(interaction, parts, async (context, question, sourceInteraction) => {
        const effectiveQuestion = question;
        const taskType = parts[4] ?? getQuestionTaskType(effectiveQuestion);
        const roleConfig = getTaskImageRoleConfig(taskType);

        if (!roleConfig) throw new Error('This question does not use editable image IDs.');

        const imagePool = getQuestionImagePool(effectiveQuestion);
        if (!imagePool) {
            await respondAdminError(sourceInteraction, {
                embeds: [userErrorEmbed('Assign an Image Pool in Question Options before editing Image IDs.')],
            });
            return undefined;
        }

        const labels = roleConfig.roles.map((role) => buildRoleImageIdSelectField({
            role,
            effectiveQuestion,
            imagePool,
        }));

        return buildAdminModal(
            buildAdminFormCustomId('questionImageIdsModal', [context.guildId, context.ownerUserId, context.challengeId, context.question.id, sourceInteraction.message?.id ?? ''], {
                image_ids: Object.fromEntries(roleConfig.roles.map((role) => [
                    role.key,
                    [...(effectiveQuestion.generatedImage?.imageIds?.[role.key] ?? [])],
                ])),
            }),
            taskType === 'gallery-standard' ? 'Edit Image IDs' : 'Edit Rotation Image IDs',
            labels,
        );
    });
}

async function handleQuestionEditDirectionsButton(interaction, parts) {
    const [guildId, ownerUserId, challengeId, questionId, taskType] = parts;
    const context = await validateQuestionAdminInteraction(interaction, [guildId, ownerUserId, challengeId, questionId]);
    if (context.error) return;
    if ((taskType ?? 'gallery-rotation-alignment') !== 'gallery-rotation-alignment') {
        return respondAdminError(interaction, { embeds: [userErrorEmbed('This question does not use image directions.')] });
    }
    return showQuestionDirectionsModal(interaction, parts);
}

function showQuestionDirectionsModal(interaction, parts) {
    return showQuestionModal(interaction, parts, async (context, question, sourceInteraction) => {
        const effectiveQuestion = question;
        const taskType = parts[4] ?? getQuestionTaskType(effectiveQuestion);

        if (taskType !== 'gallery-rotation-alignment') throw new Error('This question does not use image directions.');

        const imagePool = getQuestionImagePool(effectiveQuestion);
        if (!imagePool) {
            await respondAdminError(sourceInteraction, {
                embeds: [userErrorEmbed('Assign an Image Pool in Question Options before editing Image Directions.')],
            });
            return undefined;
        }

        return buildAdminModal(
            buildAdminFormCustomId('questionDirectionsModal', [context.guildId, context.ownerUserId, context.challengeId, context.question.id, sourceInteraction.message?.id ?? ''], {
                image_directions: Object.fromEntries(Object.entries(effectiveQuestion.generatedImage?.imageDirections ?? {})
                    .map(([imageId, values]) => [imageId, Array.isArray(values) ? [...values] : []])),
            }),
            'Assign Image Directions',
            buildImageDirectionImageSelectField(effectiveQuestion, imagePool),
            buildDirectionDegreesSelectField(),
        );
    });
}

function parseBooleanSelect(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error('Boolean select must be True or False.');
}

function parseOrderSelect(value) {
    const order = Number(value);
    if (!Number.isInteger(order) || order < 1) throw new Error('Please select a valid order number.');
    return order;
}

function parseImagePoolSelect(value) {
    if (isSelectNone(value)) return null;
    return String(value);
}

function getEffectiveImagePoolId(question) {
    return question.generatedImage?.imagePoolId || null;
}

function setGeneratedImagePatchValue(selectedPatch, key, value) {
    selectedPatch.generatedImage = {
        ...(selectedPatch.generatedImage ?? {}),
        [key]: value,
    };
}

function buildQuestionOrderPatchMap(effectiveChallenge, selectedQuestionId, targetOrder) {
    const questions = getChallengeQuestions(effectiveChallenge);
    const questionIds = questions.map((question) => question.id);
    const currentIndex = questionIds.indexOf(selectedQuestionId);
    if (currentIndex < 0) throw new Error(`Unknown question ID: ${selectedQuestionId}`);
    const reorderedIds = [...questionIds];
    const [movedQuestionId] = reorderedIds.splice(currentIndex, 1);
    reorderedIds.splice(targetOrder - 1, 0, movedQuestionId);
    return Object.fromEntries(reorderedIds.map((questionId, index) => [questionId, { order: index + 1 }]));
}

function clearGeneratedImageFields(generatedImage, fields) {
    for (const field of fields) generatedImage[field] = null;
}

function buildTaskTypePatch(taskType) {
    const normalizedTaskType = normalizeTaskType(taskType);
    const imageIdsKeepRoles = normalizedTaskType === 'gallery-standard'
        ? new Set(['solution', 'control'])
        : normalizedTaskType === 'gallery-rotation-alignment'
            ? new Set(['center', 'outer'])
            : undefined;
    const generatedImage = {
        enabled: normalizedTaskType !== 'none',
        type: normalizedTaskType,
    };

    if (normalizedTaskType === 'none') {
        clearGeneratedImageFields(generatedImage, GENERATED_IMAGE_TASK_CONFIG_FIELDS);
    }
    else if (normalizedTaskType === 'prompt-text') {
        clearGeneratedImageFields(generatedImage, GENERATED_IMAGE_TASK_CONFIG_FIELDS.filter((field) => field !== 'text'));
    }
    else if (normalizedTaskType === 'static-image') {
        clearGeneratedImageFields(generatedImage, GENERATED_IMAGE_TASK_CONFIG_FIELDS.filter((field) => field !== 'url'));
    }
    else if (normalizedTaskType === 'gallery-standard') {
        clearGeneratedImageFields(generatedImage, ['text', 'imageDirections', 'url']);
    }
    else if (normalizedTaskType === 'gallery-rotation-alignment') {
        clearGeneratedImageFields(generatedImage, ['text', 'url']);
    }

    return { generatedImage, imageIdsKeepRoles };
}

async function beginQuestionModalSubmission(interaction, parts) {
    const responseMode = await deferAdminPanelModalSubmit(interaction);
    const context = await getQuestionModalSubmitContext(parts);
    if (!isAdminSessionOwner(interaction, context.ownerUserId)) {
        await respondAdminModalError(interaction, responseMode, {
            content: 'This admin panel belongs to another user.',
        });
        return { failed: true };
    }
    if (!isMatchingAdminGuild(interaction, context.guildId)) {
        await respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
        return { failed: true };
    }
    if (!context.challenge || !context.question) {
        await respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Unknown challenge or question.')] });
        return { failed: true };
    }
    return { responseMode, context };
}

async function handleQuestionOptionsModalSubmit(interaction, parts, state = {}) {
    const submission = await beginQuestionModalSubmission(interaction, parts);
    if (submission.failed) return undefined;
    const { responseMode, context } = submission;

    const effectiveChallenge = context.challenge;
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id);

    let orderNumber;
    let separateStep;
    let selectedAnswerType;
    let selectedImagePoolId;
    try {
        orderNumber = parseOrderSelect(getSingleModalSelectValue(interaction, 'order_number', getQuestionOrderSelectOptions(effectiveChallenge, context.question.id), 'order number'));
        separateStep = parseBooleanSelect(getSingleModalSelectValue(interaction, 'separate_step', getBooleanSelectOptions(), 'Separate Step'));
        selectedAnswerType = getRequiredModalSingleSelect(interaction, 'answer_type', QUESTION_ANSWER_TYPE_OPTIONS, 'answer mode');
        selectedImagePoolId = parseImagePoolSelect(getSingleModalSelectValue(interaction, 'image_pool_id', getImagePoolModalOptions(), 'Assigned Image Pool'));
    }
    catch (err) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(err.message)] });
    }

    const currentTaskType = getQuestionTaskType(effectiveQuestion);
    const selectedTaskType = getModalSingleSelectValue(interaction, 'task_type') ?? currentTaskType;
    if (!isQuestionTaskType(selectedTaskType)) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Unknown task type selected.')] });
    }
    const currentAnswerType = getQuestionAnswerType(effectiveQuestion);
    if (!QUESTION_ANSWER_TYPE_OPTIONS.some((option) => option.value === selectedAnswerType)) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Unknown answer mode selected.')] });
    }
    const currentImagePoolId = getEffectiveImagePoolId(effectiveQuestion);
    let orderEdit;
    let separateStepEdit;
    let answerTypeEdit;
    let taskTypeEdit;
    let imagePoolEdit;
    try {
        orderEdit = resolveBaselineEdit('order_number', state.baseline, String(getQuestionNumber(effectiveChallenge, effectiveQuestion)), String(orderNumber));
        separateStepEdit = resolveBaselineEdit('separate_step', state.baseline, effectiveQuestion.separateStep === true ? 'true' : 'false', String(separateStep));
        answerTypeEdit = resolveBaselineEdit('answer_type', state.baseline, currentAnswerType, selectedAnswerType);
        taskTypeEdit = resolveBaselineEdit('task_type', state.baseline, currentTaskType, selectedTaskType);
        imagePoolEdit = resolveBaselineEdit('image_pool_id', state.baseline, currentImagePoolId ?? SELECT_NONE, selectedImagePoolId ?? SELECT_NONE);
    }
    catch (err) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(err.message)] });
    }
    const taskChanged = taskTypeEdit.changed;
    const answerTypeChanged = answerTypeEdit.changed;
    const imagePoolChanged = imagePoolEdit.changed;
    // A stale form may deliberately preserve a field changed by another
    // administrator. All dependent validation must use that preserved value,
    // never the value selected when this modal opened.
    const effectiveTargetTaskType = taskChanged ? selectedTaskType : currentTaskType;
    const effectiveTargetAnswerType = answerTypeChanged ? selectedAnswerType : currentAnswerType;

    if (!isAnswerTypeSupportedByTask(effectiveTargetAnswerType, effectiveTargetTaskType)) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Position answers require a gallery task. Choose Standard Gallery or Rotation Alignment first.')] });
    }

    const selectedTaskUsesImagePool = taskUsesImagePool(effectiveTargetTaskType);
    if (selectedImagePoolId && imagePoolChanged && !verificationImagePools[selectedImagePoolId]) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(`Unknown image pool selected: ${selectedImagePoolId}`)] });
    }
    if (selectedImagePoolId && imagePoolChanged && !selectedTaskUsesImagePool) {
        return respondAdminModalError(interaction, responseMode, {
            embeds: [userErrorEmbed('Choose a gallery/image Task type before assigning an Image Pool.')],
        });
    }

    if (!orderEdit.changed && !separateStepEdit.changed && !answerTypeChanged && !taskChanged && !imagePoolChanged) {
        return respondAdminNoChanges(interaction, responseMode);
    }

    const patches = !orderEdit.changed
        ? {}
        : buildQuestionOrderPatchMap(effectiveChallenge, context.question.id, orderNumber);
    const selectedPatch = {
        ...(patches[context.question.id] ?? {}),
        ...(separateStepEdit.changed ? { separateStep } : {}),
    };
    if (taskChanged) {
        const taskPatch = buildTaskTypePatch(selectedTaskType);
        const currentImageIds = effectiveQuestion.generatedImage?.imageIds ?? {};
        if (taskPatch.imageIdsKeepRoles) {
            taskPatch.generatedImage.imageIds = Object.fromEntries(Object.entries(currentImageIds).filter(([role]) => taskPatch.imageIdsKeepRoles.has(role)));
            if (selectedTaskType === 'gallery-rotation-alignment') {
                const retainedImageIds = new Set(Object.values(taskPatch.generatedImage.imageIds).flat().map(String));
                const currentDirections = effectiveQuestion.generatedImage?.imageDirections ?? {};
                taskPatch.generatedImage.imageDirections = Object.fromEntries(
                    Object.entries(currentDirections).filter(([imageId]) => retainedImageIds.has(String(imageId))),
                );
            }
        }
        delete taskPatch.imageIdsKeepRoles;
        Object.assign(selectedPatch, taskPatch);
    }
    if (answerTypeChanged) {
        selectedPatch.answer = {
            ...(selectedPatch.answer ?? {}),
            required: selectedAnswerType !== 'none',
            type: selectedAnswerType,
        };
    }
    // The modal is static, so the Image Pool select can submit the current pool even when
    // the admin only changed Task. Only apply imagePoolId when it actually changed.
    if (selectedImagePoolId !== undefined && imagePoolChanged) {
        if (selectedImagePoolId === null || selectedTaskUsesImagePool) {
            setGeneratedImagePatchValue(selectedPatch, 'imagePoolId', selectedImagePoolId);
            setGeneratedImagePatchValue(selectedPatch, 'imageIds', null);
            setGeneratedImagePatchValue(selectedPatch, 'imageDirections', null);
        }
    }
    patches[context.question.id] = selectedPatch;

    const updatedSettings = await updateCatalogQuestionOptions(context.guildId, context.challengeId, patches, interaction.user.id);
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-options-modal', 'Question options updated.', { sourceMessageId: context.sourceMessageId, responseMode });
}

async function handleQuestionTextModalSubmit(interaction, parts, state = {}) {
    const submission = await beginQuestionModalSubmission(interaction, parts);
    if (submission.failed) return undefined;
    const { responseMode, context } = submission;

    const label = getModalTextInput(interaction, 'label');
    const text = getModalTextInput(interaction, 'text');
    if (!label || !text) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Question label and text cannot be blank. Use the explicit reset action when applicable.')] });
    let labelEdit;
    let textEdit;
    try {
        labelEdit = resolveBaselineEdit('label', state.baseline, context.question.label, label);
        textEdit = resolveBaselineEdit('text', state.baseline, context.question.text, text);
    }
    catch (err) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(err.message)] });
    }
    if (!labelEdit.changed && !textEdit.changed) return respondAdminNoChanges(interaction, responseMode);

    const updatedSettings = await updateCatalogQuestionFields(context.guildId, context.challengeId, context.question.id, {
        ...(labelEdit.changed ? { label: labelEdit.value } : {}),
        ...(textEdit.changed ? { text: textEdit.value } : {}),
    }, interaction.user.id);
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-text-modal', 'Question text updated.', { sourceMessageId: context.sourceMessageId, responseMode });
}

async function handleQuestionImageTextModalSubmit(interaction, parts, state = {}) {
    const submission = await beginQuestionModalSubmission(interaction, parts);
    if (submission.failed) return undefined;
    const { responseMode, context } = submission;

    const effectiveQuestion = context.question;
    if (getQuestionTaskType(effectiveQuestion) !== 'prompt-text') return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This question does not use prompt image text.')] });
    const imageText = getModalTextInput(interaction, 'image_text');
    if (!imageText) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Prompt image text cannot be blank. Use the explicit reset action when applicable.')] });
    let imageTextEdit;
    try {
        imageTextEdit = resolveBaselineEdit('image_text', state.baseline, effectiveQuestion.generatedImage?.text, imageText);
    }
    catch (err) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(err.message)] });
    }
    if (!imageTextEdit.changed) return respondAdminNoChanges(interaction, responseMode);

    const updatedSettings = await updateCatalogQuestionPrompt(context.guildId, context.challengeId, context.question.id, imageTextEdit.value, interaction.user.id);
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-image-text-modal', 'Question prompt text updated.', { sourceMessageId: context.sourceMessageId, responseMode });
}

async function handleQuestionAnswersModalSubmit(interaction, parts, state = {}) {
    const submission = await beginQuestionModalSubmission(interaction, parts);
    if (submission.failed) return undefined;
    const { responseMode, context } = submission;

    const effectiveQuestion = context.question;
    if (effectiveQuestion.answer?.required !== true || effectiveQuestion.answer?.type !== 'text') return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This question does not use editable text answers.')] });
    const answersInput = getModalTextInput(interaction, 'answers');
    const answers = parseAnswerOverrideList(answersInput);
    if (answers.length < 1) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Please provide at least one accepted answer.')] });
    let answersEdit;
    try {
        answersEdit = resolveBaselineAnswersEdit(state.baseline, effectiveQuestion.answer?.accepted, answers);
    }
    catch (err) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(err.message)] });
    }
    if (!answersEdit.changed) return respondAdminNoChanges(interaction, responseMode);

    const updatedSettings = await updateCatalogQuestionAnswers(context.guildId, context.challengeId, context.question.id, answersEdit.value, interaction.user.id);
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-answers-modal', 'Question accepted answers updated.', { sourceMessageId: context.sourceMessageId, responseMode });
}

function applyPendingImageIds(question, updates) {
    return {
        ...question,
        generatedImage: {
            ...(question.generatedImage ?? {}),
            imageIds: {
                ...(question.generatedImage?.imageIds ?? {}),
                ...updates,
            },
        },
    };
}

async function handleQuestionImageIdsModalSubmit(interaction, parts, state = {}) {
    const submission = await beginQuestionModalSubmission(interaction, parts);
    if (submission.failed) return undefined;
    const { responseMode, context } = submission;

    const effectiveQuestion = context.question;
    const taskType = getQuestionTaskType(effectiveQuestion);
    const roleConfig = getTaskImageRoleConfig(taskType);
    if (!roleConfig) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This question does not use editable image IDs.')] });

    const imagePool = getQuestionImagePool(effectiveQuestion);
    if (!imagePool) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Assign an Image Pool in Question Options before editing Image IDs.')] });

    const updates = {};
    for (const role of roleConfig.roles) {
        const selectedIds = getModalSelectValues(interaction, `${role.key}_ids`);
        if (selectedIds.length < 1) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(`Select at least one ${role.key} image ID.`)] });

        const unknownImageIds = validateImageIdsInPool(selectedIds, imagePool);
        if (unknownImageIds.length > 0) {
            return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(`Unknown image ID${unknownImageIds.length === 1 ? '' : 's'} for pool **${imagePool.id}**: ${unknownImageIds.join(', ')}`)] });
        }

        const currentIds = effectiveQuestion.generatedImage?.imageIds?.[role.key] ?? [];
        let imageIdsEdit;
        try {
            imageIdsEdit = resolveBaselineStringSetEdit(
                `${role.label} image IDs`,
                state.baseline?.image_ids?.[role.key],
                currentIds,
                selectedIds,
            );
        }
        catch (err) {
            return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(err.message)] });
        }
        if (imageIdsEdit.changed) updates[role.key] = imageIdsEdit.value;
    }
    if (Object.keys(updates).length < 1) return respondAdminNoChanges(interaction, responseMode);

    const pendingQuestion = applyPendingImageIds(effectiveQuestion, updates);
    for (const role of Object.keys(updates)) {
        const validationError = validatePendingQuestionImageIds(pendingQuestion, role, updates[role]);
        if (validationError) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(validationError)] });
    }

    const updatedSettings = await updateCatalogQuestionImageIds(context.guildId, context.challengeId, context.question.id, updates, interaction.user.id);
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-image-ids-modal', 'Question image IDs updated.', { sourceMessageId: context.sourceMessageId, responseMode });
}

async function handleQuestionDirectionsModalSubmit(interaction, parts, state = {}) {
    const submission = await beginQuestionModalSubmission(interaction, parts);
    if (submission.failed) return undefined;
    const { responseMode, context } = submission;

    const effectiveQuestion = context.question;
    if (getQuestionTaskType(effectiveQuestion) !== 'gallery-rotation-alignment') return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This question does not use image directions.')] });

    const imagePool = getQuestionImagePool(effectiveQuestion);
    if (!imagePool) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Assign an Image Pool in Question Options before editing Image Directions.')] });

    const imageIds = getModalSelectValues(interaction, 'direction_image_ids');
    const degrees = getModalSelectValues(interaction, 'direction_degrees').map(Number);
    if (imageIds.length < 1) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Select at least one image ID.')] });
    if (degrees.length < 1) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Select at least one direction/orientation.')] });

    const unknownImageIds = validateImageIdsInPool(imageIds, imagePool);
    if (unknownImageIds.length > 0) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(`Unknown image ID${unknownImageIds.length === 1 ? '' : 's'} for pool **${imagePool.id}**: ${unknownImageIds.join(', ')}`)] });
    }

    const directionOptions = new Set(DEFAULT_ROTATION_ALIGNMENT_DEGREES.map(String));
    const invalidDegrees = degrees.filter((degree) => !directionOptions.has(String(degree)));
    if (invalidDegrees.length > 0) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(`Invalid direction degree${invalidDegrees.length === 1 ? '' : 's'}: ${invalidDegrees.join(', ')}`)] });
    }

    const submittedDirections = degrees.map(String);
    const currentDirections = effectiveQuestion.generatedImage?.imageDirections ?? {};
    const openingDirections = state.baseline?.image_directions ?? {};
    const directionUpdates = {};
    for (const imageId of imageIds) {
        const currentValues = (currentDirections[imageId] ?? []).map(String);
        const openingValues = (openingDirections[imageId] ?? []).map(String);
        if (sameStringSet(submittedDirections, openingValues) || sameStringSet(submittedDirections, currentValues)) continue;
        if (!sameStringSet(currentValues, openingValues)) {
            return respondAdminModalError(interaction, responseMode, {
                embeds: [userErrorEmbed(`The directions for image ID **${imageId}** were changed by another administrator. Reopen the editor and apply your change again.`)],
            });
        }
        directionUpdates[imageId] = degrees;
    }
    if (Object.keys(directionUpdates).length < 1) return respondAdminNoChanges(interaction, responseMode);

    const updatedSettings = await updateCatalogQuestionImageDirections(
        context.guildId,
        context.challengeId,
        context.question.id,
        directionUpdates,
        interaction.user.id,
    );
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-directions-modal', 'Question image directions updated.', { sourceMessageId: context.sourceMessageId, responseMode });
}

async function getQuestionModalSubmitContext(parts) {
    const [guildId, ownerUserId, challengeId, questionId, sourceMessageId = ''] = parts;
    return {
        ...await getQuestionAdminContext([guildId, ownerUserId, challengeId, questionId]),
        sourceMessageId,
    };
}

async function handleQuestionClearModalSubmit(interaction, parts = [], state = {}) {
    const submission = await beginQuestionModalSubmission(interaction, parts);
    if (submission.failed) return undefined;
    const { responseMode, context } = submission;

    const effectiveChallenge = context.challenge;
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id) ?? context.question;
    const questionChanges = await getCatalogQuestionChanges(context.guildId, context.challengeId, context.question.id);
    if (state.baseline?.reset_revision && state.baseline.reset_revision !== buildQuestionResetRevision(questionChanges, effectiveQuestion)) {
        return respondAdminModalError(interaction, responseMode, {
            embeds: [userErrorEmbed('This question changed after the reset editor opened. Reopen it and confirm the current catalog fields before resetting.')],
        });
    }
    const definitions = getQuestionResetDefinitions(effectiveQuestion, questionChanges?.changes);
    const clearMap = Object.fromEntries(definitions.map((definition) => [definition.field, definition.paths]));

    let selectedField;
    try {
        selectedField = getRequiredModalSingleSelect(interaction, 'clear_field', getQuestionClearSelectOptions(definitions), 'catalog field to reset');
    }
    catch (err) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(err.message)] });
    }

    const paths = clearMap[selectedField];
    if (!paths) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('That clear action is no longer available for this question’s current Task/Answer.')] });

    const updatedSettings = await resetCatalogQuestionFieldsToTemplate(context.guildId, context.challengeId, context.question.id, paths, interaction.user.id);
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-reset-modal', 'Question fields restored from the template.', {
        sourceMessageId: context.sourceMessageId,
        responseMode,
    });
}


async function updateChallengeMetaFromModal(guildId, challengeId, submittedTitle, submittedDescription, userId) {
    const patch = {};
    if (submittedTitle !== undefined) patch.title = submittedTitle;
    if (submittedDescription !== undefined) patch.description = submittedDescription;
    return updateCatalogChallengeMetadata(guildId, challengeId, patch, userId);
}

async function handleChallengeEditModalSubmit(interaction, parts, state = {}) {
    const [guildId, ownerUserId, challengeId, sourceMessageId = ''] = parts;
    const responseMode = await deferAdminPanelModalSubmit(interaction);
    if (!isAdminSessionOwner(interaction, ownerUserId)) {
        return respondAdminModalError(interaction, responseMode, {
            content: 'This admin panel belongs to another user.',
        });
    }

    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    const challenge = await getVerificationAdminChallenge(guildId, challengeId);
    if (!challenge) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });

    const title = getModalTextInput(interaction, 'challenge_title');
    const description = getModalTextInput(interaction, 'challenge_description');
    if (!title || !description) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Challenge title and description cannot be blank. Use the explicit reset action when applicable.')] });
    let titleEdit;
    let descriptionEdit;
    try {
        titleEdit = resolveBaselineEdit('challenge_title', state.baseline, challenge.title, title);
        descriptionEdit = resolveBaselineEdit('challenge_description', state.baseline, challenge.description, description);
    }
    catch (err) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(err.message)] });
    }
    if (!titleEdit.changed && !descriptionEdit.changed) return respondAdminNoChanges(interaction, responseMode);

    const updatedSettings = await updateChallengeMetaFromModal(
        guildId,
        challengeId,
        titleEdit.changed ? titleEdit.value : undefined,
        descriptionEdit.changed ? descriptionEdit.value : undefined,
        interaction.user.id,
    );
    const updatedChallenge = await getVerificationAdminChallenge(guildId, challengeId) ?? challenge;
    const enabledChallengeIds = updatedSettings.activeChallengeIds ?? [];
    return replyWithUpdatedAdminPanel(interaction, {
        panelPayload: buildChallengeOverviewPanelPayload({
            verificationSettings: updatedSettings,
            enabledChallengeIds,
            mode: 'edit',
            guildId,
            userId: ownerUserId,
            challengeId,
            challenge: updatedChallenge,
        }),
        sourceMessageId,
        title: 'Challenge Updated',
        description: 'Challenge metadata was updated.',
        fallback: 'panel',
        responseMode,
    });
}

function showCreateChallengeModal(interaction, parts) {
    const [guildId, ownerUserId] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminError(interaction, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    return interaction.showModal(buildAdminModal(
        buildAdminCustomId('challengeCreateModal', guildId, ownerUserId, interaction.message?.id ?? ''),
        'Create Challenge',
        buildModalTextLabel('challenge_id', 'Challenge ID', { placeholder: 'lowercase-kebab-case (max 100)', maxLength: 100, required: true }),
        buildModalTextLabel('challenge_title', 'Challenge Title', { maxLength: 256, required: true }),
        buildModalTextLabel('challenge_description', 'Description', { required: false, maxLength: 4000 }),
    ));
}

function showCreateQuestionModal(interaction, parts) {
    const [mode, guildId, ownerUserId, challengeId] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminError(interaction, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (mode !== 'edit') return respondAdminError(interaction, { embeds: [userErrorEmbed('Questions can only be created from an editable challenge panel.')] });
    return interaction.showModal(buildAdminModal(
        buildAdminCustomId('questionCreateModal', mode, guildId, ownerUserId, challengeId, interaction.message?.id ?? ''),
        'Create Question',
        buildModalTextLabel('question_id', 'Question ID', { placeholder: 'lowercase-kebab-case (max 100)', maxLength: 100, required: true }),
        buildModalTextLabel('question_label', 'Question Label', { maxLength: 128, required: true }),
        buildModalTextLabel('question_text', 'Question Text', { maxLength: 4000, required: true }),
        buildQuestionAnswerTypeSelectModalLabel('none', QUESTION_CREATE_ANSWER_TYPE_OPTIONS),
    ));
}

async function showCatalogDeleteModal(interaction, parts, type) {
    const [mode, guildId, ownerUserId, challengeId, questionId] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminError(interaction, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (mode !== 'edit') return respondAdminError(interaction, { embeds: [userErrorEmbed('Catalog entries can only be changed from an editable panel.')] });
    const challenge = await getVerificationAdminChallenge(guildId, challengeId);
    if (!challenge || (type === 'question' && !challenge.questions?.some((question) => question.id === questionId))) {
        return respondAdminError(interaction, { embeds: [userErrorEmbed('This catalog entry no longer exists. Refresh the panel.')] });
    }
    const targetId = type === 'question' ? questionId : challengeId;
    return interaction.showModal(buildAdminModal(
        buildAdminCustomId(`${type}DeleteModal`, mode, guildId, ownerUserId, challengeId, questionId ?? '', interaction.message?.id ?? ''),
        `${type === 'question' ? 'Delete / Reset Question' : 'Delete / Reset Challenge'}`,
        buildModalTextLabel('confirmation', `Type ${targetId} to confirm`, { maxLength: 128, required: true }),
    ));
}

async function handleCreateChallengeModal(interaction, parts) {
    const [guildId, ownerUserId, sourceMessageId = ''] = parts;
    const responseMode = await deferAdminPanelModalSubmit(interaction);
    if (!isAdminSessionOwner(interaction, ownerUserId)) return respondAdminModalError(interaction, responseMode, { content: 'This admin panel belongs to another user.' });
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    let created;
    try {
        created = await createCustomChallenge(guildId, {
            id: getModalTextInput(interaction, 'challenge_id'),
            title: getModalTextInput(interaction, 'challenge_title'),
            description: getModalTextInput(interaction, 'challenge_description'),
        }, interaction.user.id);
    }
    catch (err) { return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(err.message)] }); }
    const safeguard = await runAdminConfigSafeguard(interaction, { guildId, changedChallengeId: created.result.id,
        reason: 'Custom challenge created.', source: 'challenge-create-modal', committedSettings: created.committedSettings });
    if (safeguard.refreshError) { await followUpAdminConfigWarning(interaction, safeguard); return undefined; }
    const settings = safeguard.finalSettings ?? created.committedSettings;
    const challenges = await getVerificationAdminChallengeCatalog(guildId, { fresh: true });
    const response = await replyWithUpdatedAdminPanel(interaction, {
        panelPayload: buildChallengesPanelPayload({ verificationSettings: settings,
            challenges, enabledChallengeIds: settings.activeChallengeIds ?? [], guildId, ownerUserId }),
        sourceMessageId, title: 'Challenge Created', description: 'The custom challenge was created inactive.', responseMode,
    });
    await followUpAdminConfigWarning(interaction, safeguard);
    return response;
}

async function handleCreateQuestionModal(interaction, parts) {
    const [mode, guildId, ownerUserId, challengeId, sourceMessageId = ''] = parts;
    const responseMode = await deferAdminPanelModalSubmit(interaction);
    if (!isAdminSessionOwner(interaction, ownerUserId)) return respondAdminModalError(interaction, responseMode, { content: 'This admin panel belongs to another user.' });
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (mode !== 'edit') return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Questions can only be created from an editable challenge panel.')] });
    let created;
    try {
        created = await createCustomQuestion(guildId, challengeId, {
            id: getModalTextInput(interaction, 'question_id'), label: getModalTextInput(interaction, 'question_label'),
            text: getModalTextInput(interaction, 'question_text'),
            answerType: getRequiredModalSingleSelect(interaction, 'answer_type', QUESTION_CREATE_ANSWER_TYPE_OPTIONS, 'answer mode'),
        }, interaction.user.id);
    }
    catch (err) { return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(err.message)] }); }
    const safeguard = await runAdminConfigSafeguard(interaction, { guildId, changedChallengeId: challengeId,
        changedQuestionId: created.result.id, reason: 'Custom question created.', source: 'question-create-modal',
        committedSettings: created.committedSettings });
    if (safeguard.refreshError) { await followUpAdminConfigWarning(interaction, safeguard); return undefined; }
    const challenge = await getVerificationAdminChallenge(guildId, challengeId, { fresh: true });
    const response = await replyWithUpdatedAdminPanel(interaction, {
        panelPayload: buildChallengeQuestionsPanelPayload({ verificationSettings: safeguard.finalSettings ?? created.committedSettings,
            challengeId, challenge, mode, guildId, userId: ownerUserId }),
        sourceMessageId, title: 'Question Created', description: 'The custom question was appended.', responseMode,
    });
    await followUpAdminConfigWarning(interaction, safeguard);
    return response;
}

async function handleCatalogDeleteModal(interaction, parts, type) {
    const [mode, guildId, ownerUserId, challengeId, questionId = '', sourceMessageId = ''] = parts;
    const responseMode = await deferAdminPanelModalSubmit(interaction);
    if (!isAdminSessionOwner(interaction, ownerUserId)) return respondAdminModalError(interaction, responseMode, { content: 'This admin panel belongs to another user.' });
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (mode !== 'edit') return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Catalog entries can only be changed from an editable panel.')] });
    const targetId = type === 'question' ? questionId : challengeId;
    if (getModalTextInput(interaction, 'confirmation') !== targetId) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(`Confirmation must exactly match \`${targetId}\`.`)] });
    }
    let changed;
    try {
        changed = type === 'question'
            ? await deleteOrResetQuestion(guildId, challengeId, questionId, interaction.user.id)
            : await deleteOrResetChallenge(guildId, challengeId, interaction.user.id);
    }
    catch (err) { return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(err.message)] }); }
    const safeguard = await runAdminConfigSafeguard(interaction, { guildId, changedChallengeId: challengeId,
        ...(type === 'question' ? { changedQuestionId: questionId } : {}), reason: `Catalog ${type} ${changed.result.action}.`,
        source: `${type}-delete-modal`, committedSettings: changed.committedSettings });
    if (safeguard.refreshError) { await followUpAdminConfigWarning(interaction, safeguard); return undefined; }
    const settings = safeguard.finalSettings ?? changed.committedSettings;
    const result = changed.result;
    const challenges = await getVerificationAdminChallengeCatalog(guildId, { fresh: true });
    const panelPayload = type === 'question'
        ? buildChallengeQuestionsPanelPayload({ verificationSettings: settings, challengeId, challenge: challenges[challengeId], mode, guildId, userId: ownerUserId })
        : (result.action === 'deleted'
            ? buildChallengesPanelPayload({ verificationSettings: settings, challenges,
                enabledChallengeIds: settings.activeChallengeIds ?? [], guildId, ownerUserId })
            : buildChallengeOverviewPanelPayload({ verificationSettings: settings, enabledChallengeIds: settings.activeChallengeIds ?? [],
                mode, guildId, userId: ownerUserId, challengeId, challenge: challenges[challengeId] }));
    const response = await replyWithUpdatedAdminPanel(interaction, { panelPayload, sourceMessageId,
        title: result.action === 'reset' ? 'Template Reset' : `${type === 'question' ? 'Question' : 'Challenge'} Deleted`,
        description: result.action === 'reset' ? 'Protected template values were restored; custom children were preserved.' : 'The custom catalog entry was deleted.',
        responseMode });
    await followUpAdminConfigWarning(interaction, safeguard);
    return response;
}

const ADMIN_COMPONENT_ACTIONS = Object.freeze({
    settingsEditOptions: showSettingsOptionsModal,
    settingsEditTimers: showSettingsTimersModal,
    challengeSelect: handleChallengeSelectMenu,
    challengeCreate: showCreateChallengeModal,
    questionCreate: showCreateQuestionModal,
    challengeDelete: (interaction, parts) => showCatalogDeleteModal(interaction, parts, 'challenge'),
    questionDelete: (interaction, parts) => showCatalogDeleteModal(interaction, parts, 'question'),
    challengeQuestions: handleChallengeQuestionsButton,
    challengeOverview: handleChallengeOverviewButton,
    challengesBack: handleChallengesBackButton,
    questionSelectOpen: handleQuestionSelectOpenButton,
    questionSelect: handleQuestionSelectMenu,
    questionEditTools: handleQuestionEditToolsButton,
    challengeEdit: showChallengeEditModalFromButton,
    questionEditDone: handleQuestionEditDoneButton,
    questionEditOptions: showQuestionOptionsModal,
    questionEditText: showQuestionTextModal,
    questionEditImageText: showQuestionImageTextModal,
    questionEditAnswers: showQuestionAnswersModal,
    questionEditImageIds: showQuestionImageIdsModal,
    questionEditDirections: handleQuestionEditDirectionsButton,
    questionClearSelector: showQuestionClearSelectorModal,
});

const ADMIN_MODAL_ACTIONS = Object.freeze({
    settingsOptionsModal: handleSettingsOptionsModalSubmit,
    settingsTimersModal: handleSettingsTimersModalSubmit,
    challengeEditModal: handleChallengeEditModalSubmit,
    challengeCreateModal: handleCreateChallengeModal,
    questionCreateModal: handleCreateQuestionModal,
    challengeDeleteModal: (interaction, parts) => handleCatalogDeleteModal(interaction, parts, 'challenge'),
    questionDeleteModal: (interaction, parts) => handleCatalogDeleteModal(interaction, parts, 'question'),
    questionOptionsModal: handleQuestionOptionsModalSubmit,
    questionTextModal: handleQuestionTextModalSubmit,
    questionImageTextModal: handleQuestionImageTextModalSubmit,
    questionAnswersModal: handleQuestionAnswersModalSubmit,
    questionImageIdsModal: handleQuestionImageIdsModalSubmit,
    questionDirectionsModal: handleQuestionDirectionsModalSubmit,
    questionClearModal: handleQuestionClearModalSubmit,
});

async function handleVerificationAdminComponentInteraction(interaction) {
    const parsed = parseAdminCustomId(interaction.customId);
    if (!parsed) return false;
    if (!hasVerificationAdminPermission(interaction)) {
        await sendAdminPermissionError(interaction);
        return true;
    }
    if (parsed.expired) {
        await respondAdminError(interaction, {
            content: 'This verification admin panel has expired. Please run `/verification settings` or `/verification challenges` again.',
        });
        return true;
    }

    try {
        const handler = ADMIN_COMPONENT_ACTIONS[parsed.action];
        if (!handler) return false;
        await handler(interaction, parsed.parts, parsed.state);
        return true;
    }
    catch (err) {
        await respondAdminError(interaction, { embeds: [userErrorEmbed(err.message || 'Failed to handle verification admin button.')] });
        return true;
    }
}

async function sendVerificationAdminModalError(interaction) {
    const payload = {
        flags: Discord.MessageFlags.Ephemeral,
        embeds: [userErrorEmbed('Failed to update verification admin settings. Please try again later.')],
    };

    return respondAdminError(interaction, payload);
}

async function handleVerificationAdminModalSubmit(interaction) {
    const parsed = parseAdminCustomId(interaction.customId);
    if (!parsed) return false;
    if (!hasVerificationAdminPermission(interaction)) {
        await sendAdminPermissionError(interaction);
        return true;
    }
    if (parsed.expired) {
        await respondAdminError(interaction, {
            content: 'This verification admin panel has expired. Please run `/verification settings` or `/verification challenges` again.',
        });
        return true;
    }

    try {
        const handler = ADMIN_MODAL_ACTIONS[parsed.action];
        if (!handler) return false;
        await handler(interaction, parsed.parts, parsed.state);
        return true;
    }
    catch (err) {
        console.error('Failed to handle verification admin modal submit:', err);
        await sendVerificationAdminModalError(interaction).catch((responseError) => {
            console.error('Failed to send verification admin modal error response:', responseError);
        });
        return true;
    }
}


async function handleVerificationPostCommand(interaction, guildId) {
    const verificationSettings = await getVerificationSettings(guildId);
    if (verificationSettings.mode === VERIFICATION_MODES.halt) {
        return interaction.editReply(buildVerificationAdminNotice('Verification Admin', 'Verification is halted in the Warden settings.', 'error'));
    }

    const targetChannel = interaction.options.getChannel('channel', true);

    if (!targetChannel?.isTextBased?.()) {
        return interaction.editReply(buildVerificationAdminNotice('Verification Admin', 'Please provide a valid text channel or thread.', 'error'));
    }

    const welcomeEmbed = buildWelcomeEmbed(verificationSettings);
    const components = buildVerificationPostComponents();

    const action = interaction.options.getString('action', true);

    if (action === 'send') {
        const message = await targetChannel.send({ embeds: [welcomeEmbed], components });

        return interaction.editReply(buildVerificationAdminActionCompleted(
            'Post Posted',
            `Verification post posted successfully in ${String(targetChannel)}. ${message.url}`,
        ));
    }

    if (action === 'refresh') {
        const messageId = interaction.options.getString('message_id');

        if (!messageId?.trim()) {
            return interaction.editReply(buildVerificationAdminNotice('Verification Admin', 'Please provide `message_id` when using `/verification post action:refresh`.', 'error'));
        }

        const message = await fetchVerificationMessageFromChannel(targetChannel, messageId);

        if (!message) {
            return interaction.editReply(buildVerificationAdminNotice('Verification Admin', 'Could not find that verification post in the selected channel. Please check the channel and message ID.', 'error'));
        }

        await message.edit({ embeds: [welcomeEmbed], components });

        return interaction.editReply(buildVerificationAdminActionCompleted(
            'Post Refreshed',
            `Verification post refreshed successfully: ${message.url}`,
        ));
    }

    return interaction.editReply(buildVerificationAdminNotice('Verification Admin', 'Unknown verification post action.', 'error'));
}

async function handleVerificationAutocomplete(interaction) {
    return interaction.respond([]);
}



module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName('verification')
        .setDescription('Manage Warden verification')
        .setDefaultMemberPermissions(Discord.PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand => subcommand
            .setName('settings')
            .setDescription('Show and edit verification settings'))
        .addSubcommand(subcommand => subcommand
            .setName('challenges')
            .setDescription('Browse and edit verification challenges'))
        .addSubcommand(subcommand => subcommand
            .setName('post')
            .setDescription('Send or refresh the public verification post')
            .addStringOption(option => option
                .setName('action')
                .setDescription('Choose whether to send a new post or refresh an existing post')
                .setRequired(true)
                .addChoices(
                    { name: 'Send', value: 'send' },
                    { name: 'Refresh', value: 'refresh' },
                ))
            .addChannelOption(option => option
                .setName('channel')
                .setDescription('Text channel or thread for the verification post')
                .addChannelTypes(
                    Discord.ChannelType.GuildText,
                    Discord.ChannelType.GuildAnnouncement,
                    Discord.ChannelType.PublicThread,
                    Discord.ChannelType.PrivateThread,
                    Discord.ChannelType.AnnouncementThread,
                )
                .setRequired(true))
            .addStringOption(option => option
                .setName('message_id')
                .setDescription('Existing verification post message ID; required only for action:refresh')
                .setRequired(false))),
    async autocomplete(interaction) {
        return handleVerificationAutocomplete(interaction);
    },
    async execute(interaction) {
        try {
            const group = interaction.options.getSubcommandGroup(false);
            const subcommand = interaction.options.getSubcommand();
            let guildId;

            await deferEphemeralReply(interaction);

            try {
                guildId = normalizeVerificationAdminGuildId(resolveVerificationAdminGuildId(interaction));
            }
            catch (_err) {
                return interaction.editReply(buildVerificationAdminNotice('Verification Admin', 'Verification settings require a real guild context.', 'error'));
            }

            if (!group && subcommand === 'post') return handleVerificationPostCommand(interaction, guildId);
            if (!group && subcommand === 'settings') return handleVerificationSettingsCommand(interaction, guildId);
            if (!group && subcommand === 'challenges') return handleVerificationChallengesCommand(interaction, guildId);

            return interaction.editReply(buildVerificationAdminNotice('Verification Admin', 'Unknown verification command.', 'error'));
        }
        catch (err) {
            console.log(err);

            await botLog(interaction.guild, new Discord.EmbedBuilder()
                .setTitle('⛔ Verification command failed')
                .setDescription('```' + err.stack + '```')
                , 2, 'error'
            ).catch((logErr) => console.error('Failed to log verification command error:', logErr));

            const errorResponse = buildVerificationAdminNotice('Verification Admin', 'Failed to run the verification command. Please try again later.', 'error');
            if (interaction.deferred) return interaction.editReply(errorResponse);
            if (interaction.replied) return interaction.followUp({ ...errorResponse, flags: errorResponse.flags | Discord.MessageFlags.Ephemeral });
            return interaction.reply({ ...errorResponse, flags: errorResponse.flags | Discord.MessageFlags.Ephemeral });
        }
    },
    async handleModalSubmit(interaction) {
        return handleVerificationAdminModalSubmit(interaction);
    },
    async handleComponentInteraction(interaction) {
        return handleVerificationAdminComponentInteraction(interaction);
    },
    async handleButtonInteraction(interaction) {
        return handleVerificationAdminComponentInteraction(interaction);
    },
};
