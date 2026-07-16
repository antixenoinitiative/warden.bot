const Discord = require('discord.js');
const { botLog } = require('../../../functions');
const verificationEmbedConfig = require('../verification/verificationEmbedConfig.json');
const {
    applyFieldToEmbed,
    buildVerificationAdminConfiguration,
    buildVerificationAdminActionCompleted,
    buildVerificationAdminSummary,
    buildVerificationErrorEmbed,
    buildVerificationPublicEmbed,
    assertModalLabelSupport,
    buildModalTextLabel,
    mergeVerificationAdminResponses,
    truncateModalLabel,
} = require('../verification/verificationResponses');
const { buildVerificationConfigWarningEmbed } = require('../verification/verificationLegacyUi');
const {
    acknowledgePanelSubmit: deferAdminPanelModalSubmit,
    deferEphemeralReply,
    deferSourceUpdate,
    sendAcknowledgedNotice: respondAdminModalError,
    sendEphemeralNotice: respondAdminError,
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
const ADMIN_CUSTOM_ID_PREFIX = 'wVA';
const ADMIN_CUSTOM_ID_MAX_LENGTH = 100;
const ADMIN_CUSTOM_ID_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const SETTINGS_SELECT_MENU_MAX_OPTIONS = 25;
const CHALLENGE_SELECT_MENU_MAX_OPTIONS = 25;
const QUESTION_SELECT_MENU_MAX_OPTIONS = 25;
const QUESTION_DETAIL_SELECTOR_PAGE_SIZE = 20;
const CHALLENGE_TITLE_MAX_LENGTH = 256;
const CHALLENGE_DESCRIPTION_MAX_LENGTH = 1024;
const SELECT_UNCHANGED = '__unchanged__';
const SELECT_NONE = '__none__';

const UNCHANGED_OPTION = {
    label: 'Leave unchanged',
    value: SELECT_UNCHANGED,
    description: 'Do not change this override entry.',
};

const NONE_OPTION = {
    label: 'None',
    value: SELECT_NONE,
    description: 'Clear this override entry / assign no value.',
};

const adminCustomIdSessions = new Map();
let adminCustomIdSequence = 0;

function pruneAdminCustomIdSessions() {
    const now = Date.now();
    for (const [key, session] of adminCustomIdSessions.entries()) {
        if (now - Number(session.createdAt ?? 0) > ADMIN_CUSTOM_ID_SESSION_TTL_MS) {
            adminCustomIdSessions.delete(key);
        }
    }

    while (adminCustomIdSessions.size > 1000) {
        adminCustomIdSessions.delete(adminCustomIdSessions.keys().next().value);
    }
}

function buildAdminSessionKey(action, parts) {
    pruneAdminCustomIdSessions();
    adminCustomIdSequence = (adminCustomIdSequence + 1) % Number.MAX_SAFE_INTEGER;
    const key = `${Date.now().toString(36)}${adminCustomIdSequence.toString(36)}`;
    adminCustomIdSessions.set(key, { action: String(action), parts: parts.map(String), createdAt: Date.now() });
    return key;
}

function buildAdminCustomId(action, ...parts) {
    const key = buildAdminSessionKey(action, parts);
    const customId = [ADMIN_CUSTOM_ID_PREFIX, action, key].map(String).join(':');
    if (customId.length > ADMIN_CUSTOM_ID_MAX_LENGTH) {
        throw new Error(`Verification admin custom ID exceeded Discord's ${ADMIN_CUSTOM_ID_MAX_LENGTH}-character limit.`);
    }
    return customId;
}

function parseAdminCustomId(customId) {
    const parts = String(customId ?? '').split(':');
    if (parts[0] !== ADMIN_CUSTOM_ID_PREFIX) return null;

    pruneAdminCustomIdSessions();
    const session = adminCustomIdSessions.get(parts[2]);
    if (session) return { action: session.action, parts: session.parts };

    return { expired: true };
}

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
    getVerificationSettings,
    resolveVerificationAdminGuildId,
    normalizeVerificationAdminGuildId,
    saveVerificationGuildSettingsOnly,
    updateChallengeMetaOverrides,
    setQuestionCommonOverrides,
    setQuestionImageTextOverride,
    setQuestionAnswerOverrides,
    setQuestionImageIdOverrides,
    setQuestionImageDirectionOverrides,
    updateQuestionOptionOverrides,
    clearQuestionOverrideFields,
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
        await interaction.followUp({
            flags: Discord.MessageFlags.Ephemeral,
            embeds: [userErrorEmbed('Your verification change was saved, but the refreshed catalog snapshot could not be loaded. Please reopen the panel before making another change.')],
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
    const embed = buildVerificationConfigWarningEmbed({
        report: { issues },
        disabledChallengeIds,
        fallbackApplied: safeguardResult.fallbackApplied === true,
        source: 'Admin change',
        actorId: interaction.user.id,
        finalActiveChallengeIds: safeguardResult.finalSettings?.activeChallengeIds ?? [],
        description: disabledChallengeIds.length > 0
            ? 'Your change left required verification configuration missing. Unsafe active challenges were automatically disabled when needed.'
            : 'Your change left required verification configuration missing for an active verification challenge.',
    });
    const payload = { flags: Discord.MessageFlags.Ephemeral, embeds: [embed] };
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
    const finalSettings = safeguard.finalSettings ?? updatedSettings;
    const effectiveChallenge = await getVerificationAdminChallenge(context.guildId, context.challengeId) ?? context.challenge;
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id) ?? context.question;
    const panelPayload = buildQuestionWorkspacePayload({
        verificationSettings: finalSettings,
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

function sameStringSet(leftValues = [], rightValues = []) {
    const left = [...new Set(leftValues.map(String))].sort();
    const right = [...new Set(rightValues.map(String))].sort();
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function buildUnchangedFirstOptions(options = []) {
    return [UNCHANGED_OPTION, ...options];
}

function buildUnchangedAndNoneOptions(options = []) {
    return [UNCHANGED_OPTION, NONE_OPTION, ...options];
}

function getSingleModalSelectValue(interaction, customId, options, fieldLabel) {
    return getRequiredModalSingleSelect(interaction, customId, options, fieldLabel);
}

function isSelectUnchanged(value) {
    return value === SELECT_UNCHANGED;
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

function parseAnswerOverrideList(input) {
    return String(input ?? '')
        .split(/[\n,]+/)
        .map((answer) => answer.trim())
        .filter(Boolean);
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

function addStringOption(commandBuilder, name, description, { required = true, choices, autocomplete = false } = {}) {
    return commandBuilder.addStringOption(option => {
        const configuredOption = option
            .setName(name)
            .setDescription(description)
            .setRequired(required);

        if (autocomplete) configuredOption.setAutocomplete(true);
        return choices ? configuredOption.addChoices(...choices) : configuredOption;
    });
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
    return buildVerificationAdminConfiguration(
        'Settings',
        'Current verification settings.',
        [
            { name: 'Verification Mode', value: verificationSettings.mode, inline: true },
            { name: 'Active Challenge IDs', value: buildActiveChallengeIdsValue(verificationSettings), inline: false },
            { name: 'Challenge Expiry Timer', value: formatDuration(verificationSettings.challengeExpirySeconds), inline: true },
            { name: 'Challenge Retry Cooldown', value: formatDuration(verificationSettings.cooldownSeconds), inline: true },
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
        [buildChallengeSelectRow(guildId, ownerUserId, challenges)],
    );
}

async function handleVerificationChallengesCommand(interaction, guildId) {
    const challenges = await getVerificationAdminChallengeCatalog(guildId);
    try { assertChallengeSelectMenuLimit(challenges); }
    catch (err) { return interaction.editReply({ embeds: [userErrorEmbed(err.message)] }); }
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
    const fields = [
        { name: 'Challenge Title', value: truncateAdminFieldValue(effectiveChallenge.title ?? 'Not set'), inline: false },
        { name: 'Challenge Description', value: truncateAdminFieldValue(effectiveChallenge.description ?? 'Not set'), inline: false },
        { name: 'Questions', value: (effectiveChallenge.questions ?? []).map((question, index) => `${index + 1}. ${question.id} — ${question.label ?? 'Question'}`).join('\n') || 'None', inline: false },
        ...buildChallengeAuditFields(challenge, verificationSettings, enabledChallengeIds),
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
    }

    buttons.push(new Discord.ButtonBuilder()
        .setCustomId(buildAdminCustomId('challengeQuestions', mode, guildId, userId, challengeId))
        .setLabel('Questions')
        .setStyle(Discord.ButtonStyle.Secondary));

    return [new Discord.ActionRowBuilder().addComponents(...buttons)];
}

function buildChallengeQuestionsComponents(mode, guildId, userId, challengeId) {
    if (!challengeId) return [];

    return [new Discord.ActionRowBuilder().addComponents(
        new Discord.ButtonBuilder()
            .setCustomId(buildAdminCustomId('questionSelectOpen', mode, guildId, userId, challengeId))
            .setLabel('Select Question')
            .setStyle(Discord.ButtonStyle.Primary),
        new Discord.ButtonBuilder()
            .setCustomId(buildAdminCustomId('challengeOverview', mode, guildId, userId, challengeId))
            .setLabel('Challenge')
            .setStyle(Discord.ButtonStyle.Secondary),
    )];
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

function buildChallengeQuestionsPanelPayload({ challengeId, challenge, mode, guildId, userId }) {
    return buildQuestionListResponse(challengeId, challenge, {
        components: buildChallengeQuestionsComponents(mode, guildId, userId, challengeId),
    });
}

function buildQuestionDetailComponents(mode, guildId, userId, challengeId, questionId, options = {}) {
    const { pageIndex = 0, includeBack = false } = options;
    const buttons = [];
    if (mode === 'edit') {
        buttons.push(new Discord.ButtonBuilder()
            .setCustomId(buildAdminCustomId('questionEditTools', mode, guildId, userId, challengeId, questionId))
            .setLabel('Edit')
            .setStyle(Discord.ButtonStyle.Primary));
    }

    if (includeBack) {
        buttons.push(new Discord.ButtonBuilder()
            .setCustomId(buildAdminCustomId('questionDetailBack', mode, guildId, userId, challengeId, String(pageIndex)))
            .setLabel('Back to Questions')
            .setStyle(Discord.ButtonStyle.Secondary));
    }

    return buildActionRows(buttons);
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
    UNCHANGED_OPTION,
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

function getDefaultAnswerTypeForTask(taskType) {
    return POSITION_ANSWER_TASK_TYPES.has(normalizeTaskType(taskType)) ? 'positions' : 'text';
}

function getKnownChallengeId(interaction, optionName = 'challenge') {
    const challengeId = String(interaction.options.getString(optionName) ?? '').trim();
    if (!challengeId) return { error: userErrorEmbed(`Please provide a challenge ID in \`${optionName}\`.`) };
    // Catalog-backed admin choices are loaded asynchronously by panel handlers.
    if (!challengeId) return { error: userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`) };
    return { challengeId };
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

function getKnownQuestion(interaction, challenge, required = true) {
    const questionInput = interaction.options.getString('question');
    const question = resolveQuestion(challenge, questionInput);
    if (!question && required) {
        return { error: userErrorEmbed('Please provide a valid `question` ID or number.') };
    }
    return { question };
}

function getQuestionOverride(verificationSettings, challengeId, questionId) {
    return verificationSettings.challengeOverrides?.[challengeId]?.questions?.[questionId] ?? {};
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

function buildQuestionListResponse(challengeId, challenge, options = {}) {
    const questions = challenge.questions ?? [];
    const fields = questions.map((question, index) => ({
        name: `${index + 1} ${question.id}`,
        value: [
            question.label ? `Label: ${question.label}` : undefined,
            question.text ? `Text: ${question.text}` : undefined,
            `Task: ${getQuestionTaskTypeLabel(getQuestionTaskType(question))}`,
            `Answer: ${question.answer?.required === true ? question.answer?.type ?? 'required' : 'none'}`,
        ].filter(Boolean).join('\n').slice(0, 1024) || 'No details',
        inline: false,
    }));
    return buildVerificationAdminSummary(
        'Questions',
        `Questions for **${challengeId}**:`,
        `${fields.length} question${fields.length === 1 ? '' : 's'} configured.`,
        'info',
        { fields, ...options },
    );
}

function buildQuestionViewResponse(verificationSettings, challengeId, challenge, question, options = {}) {
    const override = getQuestionOverride(verificationSettings, challengeId, question.id);
    const effectiveQuestion = question;
    const imageIds = effectiveQuestion.generatedImage?.imageIds ?? {};
    const imageDirections = effectiveQuestion.generatedImage?.imageDirections ?? {};
    const imageTextStatus = effectiveQuestion.generatedImage?.text
        ? (override.generatedImage?.text
            ? `Override: ${override.generatedImage.text}`
            : `Configured: ${effectiveQuestion.generatedImage.text}`)
        : 'Not set';
    const answers = effectiveQuestion.answer?.accepted ?? [];

    return buildVerificationAdminSummary(
        'Question',
        `Question **${question.id}** for challenge **${challengeId}**.`,
        'Question config and overrides.',
        'info',
        {
            fields: [
                { name: 'Challenge ID', value: challengeId, inline: true },
                { name: 'Question ID', value: question.id, inline: true },
                { name: 'Order number', value: String(getQuestionNumber(challenge, question)), inline: true },
                { name: 'Label', value: effectiveQuestion.label ?? 'Not set', inline: true },
                { name: 'Separate step', value: String(effectiveQuestion.separateStep === true), inline: true },
                { name: 'Task type', value: getQuestionTaskTypeLabel(getQuestionTaskType(effectiveQuestion)), inline: true },
                { name: 'Text', value: effectiveQuestion.text ?? 'Not set', inline: false },
                { name: 'Task prompt text', value: imageTextStatus, inline: false },
                { name: 'Answer required', value: String(effectiveQuestion.answer?.required === true), inline: true },
                { name: 'Answer type', value: effectiveQuestion.answer?.type ?? 'none', inline: true },
                { name: 'Accepted answers', value: formatList(answers), inline: false },
                { name: 'Image pool', value: effectiveQuestion.generatedImage?.imagePoolId ?? 'Not set', inline: false },
                { name: 'Image IDs by role', value: formatJson(imageIds), inline: false },
                { name: 'Image directions', value: formatJson(imageDirections), inline: false },
                { name: 'Updated', value: override.updatedAt ? `${override.updatedAt}${override.updatedBy ? ` by <@${override.updatedBy}>` : ''}` : 'Not tracked', inline: false },
            ],
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

function getChallengeAuditIssues(challenge, verificationSettings) {
    return [...new Set(evaluateChallengeConfigIssues(challenge, verificationSettings)
        .map((issue) => issue.message ?? issue.label)
        .filter(Boolean))];
}


function buildChallengeAuditFields(challenge, verificationSettings, enabledChallengeIds) {
    const effectiveChallenge = challenge;
    const screens = buildQuestionScreens(effectiveChallenge);
    const issues = getChallengeAuditIssues(challenge, verificationSettings);

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

function getRequiredModalMultiSelect(interaction, customId, options, fieldLabel) {
    const values = getModalSelectValues(interaction, customId);
    const allowedValues = getAllowedOptionValues(options);
    const invalidValues = values.filter((value) => !allowedValues.has(String(value)));
    if (values.length < 1) throw new Error(`Please select at least one ${fieldLabel}.`);
    if (invalidValues.length > 0) throw new Error(`Unknown ${fieldLabel}${invalidValues.length === 1 ? '' : 's'}: ${invalidValues.join(', ')}`);
    return values;
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
        buildAdminCustomId('settingsOptionsModal', guildId, ownerUserId, interaction.message?.id ?? ''),
        'Verification Settings',
        ...[
            { label: 'Mode', description: 'Choose the verification mode.', customId: 'mode', placeholder: 'Choose verification mode...', options: SETTINGS_MODE_OPTIONS, selectedValues: [verificationSettings.mode] },
            { label: 'Active Challenges', description: 'Choose which challenges are active.', customId: 'active_challenge_ids', placeholder: 'Choose active challenges...', options: settingsChallengeOptions, selectedValues: verificationSettings.activeChallengeIds ?? [], maxValues: Math.max(1, settingsChallengeOptions.length) },
            { label: 'Autokick', description: 'Choose whether failed verification autokicks.', customId: 'autokick_enabled', placeholder: 'Choose autokick state...', options: SETTINGS_AUTOKICK_OPTIONS, selectedValues: [verificationSettings.autokickEnabled === true ? 'on' : 'off'] },
        ].map(buildModalStringSelectField),
    );

    return interaction.showModal(modal);
}

function showSettingsTimersModal(interaction, parts) {
    const [guildId, ownerUserId] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminError(interaction, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });

    const modal = buildAdminModal(
        buildAdminCustomId('settingsTimersModal', guildId, ownerUserId, interaction.message?.id ?? ''),
        'Verification Timers',
        buildModalTextLabel('challenge_expiry_timer', 'Challenge Expiry Timer', {
            placeholder: '10m, 600s, or leave empty',
            description: 'Leave empty for no change.',
            maxLength: 32,
        }),
        buildModalTextLabel('challenge_retry_cooldown', 'Challenge Retry Cooldown', {
            placeholder: '60s, 1m, or leave empty',
            description: 'Leave empty for no change.',
            maxLength: 32,
        }),
        buildModalTextLabel('autokick_timer', 'Autokick Timer', {
            placeholder: '10m, 600s, or leave empty',
            description: 'Leave empty for no change.',
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
    return updateSourcePanel(interaction, panelPayload, {
        acknowledgement: responseMode,
        sourceMessageId,
        preferSourceUpdate,
        successPayload: buildVerificationAdminActionCompleted(title, description),
        fallbackPayload: fallback === 'ack'
            ? buildVerificationAdminActionCompleted(title, `${description} Re-run the command to view the refreshed panel.`)
            : undefined,
    });
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

async function handleSettingsOptionsModalSubmit(interaction, parts = []) {
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
        selectedChallengeIds = getRequiredModalMultiSelect(interaction, 'active_challenge_ids', challengeOptions, 'active challenge');
        selectedAutokickState = getRequiredModalSingleSelect(interaction, 'autokick_enabled', SETTINGS_AUTOKICK_OPTIONS, 'autokick state');
    }
    catch (err) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(err.message)] });
    }

    const currentSettings = await getVerificationSettings(guildId);
    const nextSettings = {
        ...currentSettings,
        mode: selectedMode,
        activeChallengeIds: selectedChallengeIds,
        autokickEnabled: selectedAutokickState === 'on',
    };

    if (
        currentSettings.mode === nextSettings.mode &&
        sameStringSet(currentSettings.activeChallengeIds ?? [], nextSettings.activeChallengeIds ?? []) &&
        currentSettings.autokickEnabled === nextSettings.autokickEnabled
    ) {
        return respondAdminModalError(interaction, responseMode, {
            embeds: [userErrorEmbed('No verification settings changes were submitted.')],
        });
    }

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

async function handleSettingsTimersModalSubmit(interaction, parts = []) {
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
    if (!expiryInput && !cooldownInput && !autokickInput) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('No timer changes were submitted.')] });

    const expirySeconds = expiryInput ? parseDurationSeconds(expiryInput) : undefined;
    if (expiryInput && !expirySeconds) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Invalid Challenge Expiry Timer. Use a value like `90s`, `2m`, or `2 minutes`.')] });
    const cooldownSeconds = cooldownInput ? parseDurationSeconds(cooldownInput) : undefined;
    if (cooldownInput && !cooldownSeconds) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Invalid Challenge Retry Cooldown. Use a value like `90s`, `2m`, or `2 minutes`.')] });
    const autokickSeconds = autokickInput ? parseDurationSeconds(autokickInput) : undefined;
    if (autokickInput && !autokickSeconds) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Invalid Autokick Timer. Use a value like `90s`, `2m`, or `2 minutes`.')] });

    const currentSettings = await getVerificationSettings(guildId);

    const nextSettings = {
        ...currentSettings,
        ...(expirySeconds ? { challengeExpirySeconds: expirySeconds } : {}),
        ...(cooldownSeconds ? { cooldownSeconds } : {}),
        ...(autokickSeconds ? { autokickSeconds } : {}),
    };

    const changed =
        nextSettings.challengeExpirySeconds !== currentSettings.challengeExpirySeconds ||
        nextSettings.cooldownSeconds !== currentSettings.cooldownSeconds ||
        nextSettings.autokickSeconds !== currentSettings.autokickSeconds;

    if (!changed) {
        return respondAdminModalError(interaction, responseMode, {
            embeds: [userErrorEmbed('No timer changes were submitted.')],
        });
    }

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
    const effectiveChallenge = context.challenge;
    return interaction.editReply(buildChallengeQuestionsPanelPayload({
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
    const verificationSettings = await getVerificationSettings(guildId);
    const effectiveChallenge = challenge;
    return interaction.editReply(buildQuestionWorkspacePayload({
        verificationSettings,
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
    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveChallenge = context.challenge;
    const effectiveQuestion = resolveQuestion(effectiveChallenge, selectedQuestionId) ?? context.question;
    return interaction.editReply(buildQuestionWorkspacePayload({
        verificationSettings,
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
    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveChallenge = context.challenge;
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id) ?? context.question;
    return interaction.editReply(buildQuestionWorkspacePayload({
        verificationSettings,
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
        buildAdminCustomId('challengeEditModal', guildId, ownerUserId, challengeId, interaction.message?.id ?? ''),
        'Edit Challenge',
        buildModalTextLabel('challenge_title', 'Challenge Title', {
            placeholder: challenge.title ?? 'Leave empty for no change',
            description: 'Leave empty for no change.',
            maxLength: CHALLENGE_TITLE_MAX_LENGTH,
        }),
        buildModalTextLabel('challenge_description', 'Challenge Description', {
            style: Discord.TextInputStyle.Paragraph,
            placeholder: 'Leave empty for no change',
            description: 'Leave empty for no change.',
            value: challenge.description,
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

function truncateButtonLabel(label, maxLength = 80) {
    const text = String(label ?? '');
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function truncateSelectText(text, maxLength = 100) {
    const value = String(text ?? '').trim() || 'Question';
    return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function getChallengeQuestions(challenge) {
    return Array.isArray(challenge?.questions) ? challenge.questions : [];
}

function buildQuestionSelectorPanel(challengeId, challenge, selectedQuestion, components = []) {
    const questions = getChallengeQuestions(challenge);
    const fields = [
        { name: 'Challenge', value: String(challengeId), inline: true },
        { name: 'Questions', value: String(questions.length), inline: true },
    ];

    if (selectedQuestion?.id) fields.push({ name: 'Selected', value: selectedQuestion.id, inline: true });

    return buildVerificationAdminSummary(
        'Choose a Question',
        selectedQuestion?.id
            ? `Selected: **${selectedQuestion.id}**. Select a question below to view its current configuration and edit actions.`
            : 'Select a question below to view its current configuration and edit actions.',
        'Question selector/editor workspace.',
        'info',
        { fields, components },
    );
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

function buildQuestionWorkspacePayload({ verificationSettings, mode, guildId, ownerUserId, challengeId, challenge, question, expanded = false }) {
    const responses = [buildQuestionSelectorPanel(
        challengeId,
        challenge,
        question,
        [buildQuestionSelectRow(mode, guildId, ownerUserId, challengeId, challenge, question?.id)],
    )];

    if (question) {
        const components = mode === 'edit'
            ? (expanded
                ? buildQuestionEditPanelComponents(guildId, ownerUserId, challengeId, question.id, question)
                : buildQuestionCollapsedEditComponents(mode, guildId, ownerUserId, challengeId, question.id))
            : [];
        responses.push(buildQuestionViewResponse(
            verificationSettings,
            challengeId,
            challenge,
            question,
            { components },
        ));
    }

    return mergeVerificationAdminResponses(responses);
}

function buildQuestionDetailSelectorComponents(mode, guildId, ownerUserId, challengeId, questions, pageIndex) {
    const totalPages = Math.max(1, Math.ceil(questions.length / QUESTION_DETAIL_SELECTOR_PAGE_SIZE));
    const safePageIndex = Math.min(Math.max(Number(pageIndex) || 0, 0), totalPages - 1);
    const start = safePageIndex * QUESTION_DETAIL_SELECTOR_PAGE_SIZE;
    const questionButtons = questions.slice(start, start + QUESTION_DETAIL_SELECTOR_PAGE_SIZE).map((question, index) => new Discord.ButtonBuilder()
        .setCustomId(buildAdminCustomId('questionDetailView', mode, guildId, ownerUserId, challengeId, question.id, String(safePageIndex)))
        .setLabel(truncateButtonLabel(`${start + index + 1} ${question.id}`))
        .setStyle(Discord.ButtonStyle.Secondary));

    const navButtons = [];
    if (totalPages > 1 && safePageIndex > 0) {
        navButtons.push(new Discord.ButtonBuilder()
            .setCustomId(buildAdminCustomId('questionDetailPage', mode, guildId, ownerUserId, challengeId, String(safePageIndex - 1)))
            .setLabel('Previous')
            .setStyle(Discord.ButtonStyle.Primary));
    }
    if (totalPages > 1 && safePageIndex + 1 < totalPages) {
        navButtons.push(new Discord.ButtonBuilder()
            .setCustomId(buildAdminCustomId('questionDetailPage', mode, guildId, ownerUserId, challengeId, String(safePageIndex + 1)))
            .setLabel('Next')
            .setStyle(Discord.ButtonStyle.Primary));
    }

    return buildActionRows([...questionButtons, ...navButtons]);
}

async function sendQuestionDetailSelectorPage(interaction, mode, guildId, ownerUserId, challengeId, challenge, questions, pageIndex) {
    if (questions.length < 1) {
        return interaction.editReply(buildVerificationAdminSummary(
            'Questions',
            `No questions are configured for **${challengeId}**.`,
            'Question detail selector.',
        ));
    }

    const totalPages = Math.max(1, Math.ceil(questions.length / QUESTION_DETAIL_SELECTOR_PAGE_SIZE));
    const safePageIndex = Math.min(Math.max(Number(pageIndex) || 0, 0), totalPages - 1);
    const start = safePageIndex * QUESTION_DETAIL_SELECTOR_PAGE_SIZE;
    const end = Math.min(start + QUESTION_DETAIL_SELECTOR_PAGE_SIZE, questions.length);

    return interaction.editReply(buildVerificationAdminSummary(
        'Question Details',
        `Choose a question to view for **${challengeId}** (${start + 1}-${end} of ${questions.length}).`,
        `Page ${safePageIndex + 1} of ${totalPages}.`,
        'info',
        { components: buildQuestionDetailSelectorComponents(mode, guildId, ownerUserId, challengeId, questions, safePageIndex) },
    ));
}

async function handleQuestionDetailPageButton(interaction, parts) {
    const [mode, guildId, ownerUserId, challengeId, pageIndex = '0'] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminError(interaction, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    const challenge = await getVerificationAdminChallenge(guildId, challengeId);
    if (!challenge) return respondAdminError(interaction, { embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });
    await deferSourceUpdate(interaction);
    const effectiveChallenge = challenge;
    return sendQuestionDetailSelectorPage(interaction, mode, guildId, ownerUserId, challengeId, effectiveChallenge, effectiveChallenge.questions ?? [], Number(pageIndex) || 0);
}

async function handleQuestionDetailViewButton(interaction, parts) {
    const [mode, guildId, ownerUserId, challengeId, questionId, pageIndex = '0'] = parts;
    const context = await validateQuestionAdminInteraction(interaction, [guildId, ownerUserId, challengeId, questionId]);
    if (context.error) return;
    await deferSourceUpdate(interaction);
    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveChallenge = context.challenge;
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id) ?? context.question;
    return interaction.editReply(buildQuestionViewResponse(
        verificationSettings,
        context.challengeId,
        effectiveChallenge,
        effectiveQuestion,
        { components: buildQuestionDetailComponents(mode, context.guildId, context.ownerUserId, context.challengeId, context.question.id, { pageIndex: Number(pageIndex) || 0, includeBack: true }) },
    ));
}

async function handleQuestionDetailBackButton(interaction, parts) {
    const [mode, guildId, ownerUserId, challengeId, pageIndex = '0'] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminError(interaction, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    const challenge = await getVerificationAdminChallenge(guildId, challengeId);
    if (!challenge) return respondAdminError(interaction, { embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });
    await deferSourceUpdate(interaction);
    const effectiveChallenge = challenge;
    return sendQuestionDetailSelectorPage(interaction, mode, guildId, ownerUserId, challengeId, effectiveChallenge, effectiveChallenge.questions ?? [], Number(pageIndex) || 0);
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
        button('questionClearSelector', 'Clear Selector', Discord.ButtonStyle.Danger),
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

function getQuestionClearDefinitions(effectiveQuestion, questionOverride = {}) {
    const definitions = [];
    const add = (field, label, paths) => definitions.push({ field, label, paths: Array.isArray(paths) ? paths : [paths] });
    const generatedImageOverride = questionOverride.generatedImage ?? {};
    const answerOverride = questionOverride.answer ?? {};
    const taskType = getQuestionTaskType(effectiveQuestion);

    if (hasOwnValue(questionOverride, 'order')) add('order', 'Clear Order', 'order');
    if (hasOwnValue(questionOverride, 'separateStep')) add('separate-step', 'Clear Separate Step', 'separateStep');
    if (hasOwnValue(questionOverride, 'label')) add('label', 'Clear Label', 'label');
    if (hasOwnValue(questionOverride, 'text')) add('text', 'Clear Text', 'text');
    if (hasAnyOwnValue(generatedImageOverride, ['enabled', 'type', 'gallerySize', 'compositeImageGallery', 'solutionImageCount', 'controlImageCount', 'maxControlImageRepeats', 'config', 'url'])) {
        add('task', 'Clear Task Override', ['generatedImage.enabled', 'generatedImage.type', 'generatedImage.gallerySize', 'generatedImage.compositeImageGallery', 'generatedImage.solutionImageCount', 'generatedImage.controlImageCount', 'generatedImage.maxControlImageRepeats', 'generatedImage.config', 'generatedImage.url', 'answer.type']);
    }
    if (hasOwnValue(generatedImageOverride, 'imagePoolId') || hasOwnValue(generatedImageOverride.config, 'imagePoolId')) {
        add('image-pool', 'Clear Image Pool', ['generatedImage.imagePoolId', 'generatedImage.config.imagePoolId']);
    }
    if (taskType === 'prompt-text' && hasOwnValue(generatedImageOverride, 'text')) add('image-text', 'Clear Prompt Text', 'generatedImage.text');
    if (['gallery-standard', 'gallery-rotation-alignment'].includes(taskType) && hasOwnValue(generatedImageOverride, 'imageIds')) add('image-ids', 'Clear Image IDs', 'generatedImage.imageIds');
    if (taskType === 'gallery-rotation-alignment' && hasOwnValue(generatedImageOverride, 'imageDirections')) add('directions', 'Clear Directions', 'generatedImage.imageDirections');
    if (hasOwnValue(answerOverride, 'required')) add('answer-required', 'Clear Answer Required', 'answer.required');
    if (effectiveQuestion.answer?.type === 'text' && Array.isArray(answerOverride.accepted) && answerOverride.accepted.length > 0) add('answers', 'Clear Answers', 'answer.accepted');

    if (definitions.length >= 2) {
        definitions.push({ field: 'all-visible', label: 'Clear Shown Overrides', paths: [...new Set(definitions.flatMap((definition) => definition.paths))] });
    }
    return definitions;
}

function getQuestionClearSelectOptions(definitions) {
    return definitions.map((definition) => ({
        label: definition.label,
        value: definition.field,
        description: definition.paths.length === 1 ? definition.paths[0] : `${definition.paths.length} override entries`,
    }));
}


async function handleQuestionEditDoneButton(interaction, parts) {
    const context = await validateQuestionAdminInteraction(interaction, parts);
    if (context.error) return;

    await deferSourceUpdate(interaction);

    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveChallenge = context.challenge;
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id) ?? context.question;

    return interaction.editReply(buildQuestionWorkspacePayload({
        verificationSettings,
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
    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveChallenge = context.challenge;
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id) ?? context.question;
    const questionOverride = getQuestionOverride(verificationSettings, context.challengeId, context.question.id);
    const definitions = getQuestionClearDefinitions(effectiveQuestion, questionOverride);

    if (definitions.length < 1) {
        return respondAdminError(interaction, {
            content: `There are no clearable DB-configured overrides for **${context.challengeId}/${context.question.id}**.`,
        });
    }

    const modal = buildAdminModal(
        buildAdminCustomId('questionClearModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id, interaction.message?.id ?? ''),
        'Clear Question Override',
        buildModalStringSelectField({
            label: 'Override entry to clear',
            description: 'Select one DB-configured override entry to clear for this selected Question.',
            customId: 'clear_field',
            placeholder: 'Choose an override entry to clear...',
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

    return orderOptions.length >= 25
        ? orderOptions
        : buildUnchangedFirstOptions(orderOptions);
}

function buildQuestionOrderSelectField(effectiveChallenge, selectedQuestionId) {
    const options = getQuestionOrderSelectOptions(effectiveChallenge, selectedQuestionId);
    assertSelectOptionLimit(options, 'Question order options');
    const supportsUnchanged = options.some((option) => option.value === SELECT_UNCHANGED);
    const currentOrderValue = String(getChallengeQuestions(effectiveChallenge).findIndex((question) => question.id === selectedQuestionId) + 1);

    return buildModalStringSelectField({
        label: 'Order Number',
        description: supportsUnchanged
            ? 'Choose the question slot, or leave unchanged.'
            : 'Choose the question slot; current order means no change.',
        customId: 'order_number',
        placeholder: 'Choose order number...',
        options,
        selectedValues: supportsUnchanged ? [SELECT_UNCHANGED] : [currentOrderValue],
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
        description: `Current value: ${currentValue === true ? 'true' : 'false'}. Choose a value or leave unchanged.`,
        customId,
        placeholder: `Choose ${label.toLowerCase()}...`,
        options: getBooleanSelectOptions(),
        selectedValues: [SELECT_UNCHANGED],
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
    const options = buildUnchangedAndNoneOptions(getImagePoolSelectOptions());
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

async function showQuestionModal(interaction, parts, buildModal) {
    const context = await validateQuestionAdminInteraction(interaction, parts);
    if (context.error) return;
    const modal = await buildModal(context, context.question, interaction);
    if (!modal) return;
    return interaction.showModal(modal);
}

function showQuestionTextModal(interaction, parts) {
    return showQuestionModal(interaction, parts, (context, question, sourceInteraction) => buildAdminModal(
        buildAdminCustomId('questionTextModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id, sourceInteraction.message?.id ?? ''),
        'Edit Question Text',
        buildModalTextLabel('label', 'Label', {
            placeholder: question.label ?? 'Leave empty for no change',
            description: 'Leave empty for no change.',
            maxLength: 100,
        }),
        buildModalTextLabel('text', 'Question Text', {
            style: Discord.TextInputStyle.Paragraph,
            placeholder: 'Leave empty for no change',
            description: 'Leave empty for no change.',
        }),
    ));
}

function showQuestionOptionsModal(interaction, parts) {
    return showQuestionModal(interaction, parts, async (context, question, sourceInteraction) => {
        const effectiveChallenge = context.challenge;
        const effectiveQuestion = question;
        return buildAdminModal(
            buildAdminCustomId('questionOptionsModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id, sourceInteraction.message?.id ?? ''),
            'Question Options',
            buildQuestionOrderSelectField(effectiveChallenge, context.question.id),
            buildBooleanSelectField('separate_step', 'Separate Step', effectiveQuestion.separateStep === true),
            buildBooleanSelectField('answer_required', 'Answer Required', effectiveQuestion.answer?.required === true),
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
            buildAdminCustomId('questionImageTextModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id, sourceInteraction.message?.id ?? ''),
            'Edit Prompt Image Text',
            buildModalTextLabel('image_text', 'Prompt Image Text', {
                style: Discord.TextInputStyle.Paragraph,
                placeholder: 'Leave empty for no change',
                description: 'Leave empty for no change.',
            }),
        );
    });
}

function showQuestionAnswersModal(interaction, parts) {
    return showQuestionModal(interaction, parts, (context, question, sourceInteraction) => {
        const answerType = parts[4] ?? question.answer?.type;
        if (answerType !== 'text') throw new Error('This question does not use editable text answers.');
        return buildAdminModal(
            buildAdminCustomId('questionAnswersModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id, sourceInteraction.message?.id ?? ''),
            'Edit Accepted Answers',
            buildModalTextLabel('answers', 'Accepted Answers', {
                style: Discord.TextInputStyle.Paragraph,
                placeholder: 'answer1, answer2, answer3',
                description: 'Comma or newline separated accepted answers.',
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
            buildAdminCustomId('questionImageIdsModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id, sourceInteraction.message?.id ?? ''),
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
            buildAdminCustomId('questionDirectionsModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id, sourceInteraction.message?.id ?? ''),
            'Edit Image Directions',
            buildImageDirectionImageSelectField(effectiveQuestion, imagePool),
            buildDirectionDegreesSelectField(),
        );
    });
}

function parseUnchangedBooleanSelect(value) {
    if (isSelectUnchanged(value)) return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error('Boolean select must be True, False, or Leave unchanged.');
}

function parseUnchangedOrderSelect(value) {
    if (isSelectUnchanged(value)) return undefined;
    const order = Number(value);
    if (!Number.isInteger(order) || order < 1) throw new Error('Please select a valid order number.');
    return order;
}

function parseImagePoolSelect(value) {
    if (isSelectUnchanged(value)) return undefined;
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

    return { generatedImage, answer: { type: getDefaultAnswerTypeForTask(normalizedTaskType) }, imageIdsKeepRoles };
}

async function handleQuestionOptionsModalSubmit(interaction, parts) {
    const responseMode = await deferAdminPanelModalSubmit(interaction);
    const context = await getQuestionModalSubmitContext(parts);
    if (!isAdminSessionOwner(interaction, context.ownerUserId)) {
        return respondAdminModalError(interaction, responseMode, {
            content: 'This admin panel belongs to another user.',
        });
    }
    if (!isMatchingAdminGuild(interaction, context.guildId)) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (!context.challenge || !context.question) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Unknown challenge or question.')] });

    const currentSettings = await getVerificationSettings(context.guildId);
    const effectiveChallenge = context.challenge;
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id);

    let orderNumber;
    let separateStep;
    let answerRequired;
    let selectedImagePoolId;
    try {
        orderNumber = parseUnchangedOrderSelect(getSingleModalSelectValue(interaction, 'order_number', getQuestionOrderSelectOptions(effectiveChallenge, context.question.id), 'order number'));
        separateStep = parseUnchangedBooleanSelect(getSingleModalSelectValue(interaction, 'separate_step', getBooleanSelectOptions(), 'Separate Step'));
        answerRequired = parseUnchangedBooleanSelect(getSingleModalSelectValue(interaction, 'answer_required', getBooleanSelectOptions(), 'Answer Required'));
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
    const taskChanged = selectedTaskType !== currentTaskType;
    const currentImagePoolId = getEffectiveImagePoolId(effectiveQuestion);
    const imagePoolChanged = selectedImagePoolId !== undefined
        && String(selectedImagePoolId ?? '') !== String(currentImagePoolId ?? '');

    const selectedTaskUsesImagePool = taskUsesImagePool(selectedTaskType);
    if (selectedImagePoolId && imagePoolChanged && !verificationImagePools[selectedImagePoolId]) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(`Unknown image pool selected: ${selectedImagePoolId}`)] });
    }
    if (selectedImagePoolId && imagePoolChanged && !selectedTaskUsesImagePool) {
        return respondAdminModalError(interaction, responseMode, {
            embeds: [userErrorEmbed('Choose a gallery/image Task type before assigning an Image Pool.')],
        });
    }

    const currentOrder = getQuestionNumber(effectiveChallenge, effectiveQuestion);
    if (orderNumber === currentOrder) orderNumber = undefined;

    if (orderNumber === undefined && separateStep === undefined && answerRequired === undefined && !taskChanged && !imagePoolChanged) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('No question option changes were submitted.')] });
    }

    const patches = orderNumber === undefined
        ? {}
        : buildQuestionOrderPatchMap(effectiveChallenge, context.question.id, orderNumber);
    const selectedPatch = {
        ...(patches[context.question.id] ?? {}),
        ...(separateStep !== undefined ? { separateStep } : {}),
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
    if (answerRequired !== undefined) selectedPatch.answer = { ...(selectedPatch.answer ?? {}), required: answerRequired };
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

    const updatedSettings = await updateQuestionOptionOverrides(context.guildId, context.challengeId, patches, interaction.user.id);
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-options-modal', 'Question options updated.', { sourceMessageId: context.sourceMessageId, responseMode });
}

async function handleQuestionTextModalSubmit(interaction, parts) {
    const responseMode = await deferAdminPanelModalSubmit(interaction);
    const context = await getQuestionModalSubmitContext(parts);
    if (!isAdminSessionOwner(interaction, context.ownerUserId)) {
        return respondAdminModalError(interaction, responseMode, {
            content: 'This admin panel belongs to another user.',
        });
    }
    if (!isMatchingAdminGuild(interaction, context.guildId)) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (!context.challenge || !context.question) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Unknown challenge or question.')] });

    const label = getModalTextInput(interaction, 'label');
    const text = getModalTextInput(interaction, 'text');
    if (!label && !text) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('No question text changes were submitted.')] });

    const updatedSettings = await setQuestionCommonOverrides(context.guildId, context.challengeId, context.question.id, {
        ...(label ? { label } : {}),
        ...(text ? { text } : {}),
    }, interaction.user.id);
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-text-modal', 'Question text updated.', { sourceMessageId: context.sourceMessageId, responseMode });
}

async function handleQuestionImageTextModalSubmit(interaction, parts) {
    const responseMode = await deferAdminPanelModalSubmit(interaction);
    const context = await getQuestionModalSubmitContext(parts);
    if (!isAdminSessionOwner(interaction, context.ownerUserId)) {
        return respondAdminModalError(interaction, responseMode, {
            content: 'This admin panel belongs to another user.',
        });
    }
    if (!isMatchingAdminGuild(interaction, context.guildId)) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (!context.challenge || !context.question) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Unknown challenge or question.')] });

    const effectiveQuestion = context.question;
    if (getQuestionTaskType(effectiveQuestion) !== 'prompt-text') return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This question does not use prompt image text.')] });
    const imageText = getModalTextInput(interaction, 'image_text');
    if (!imageText) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('No question changes were submitted.')] });

    const updatedSettings = await setQuestionImageTextOverride(context.guildId, context.challengeId, context.question.id, imageText, interaction.user.id);
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-image-text-modal', 'Question prompt text updated.', { sourceMessageId: context.sourceMessageId, responseMode });
}

async function handleQuestionAnswersModalSubmit(interaction, parts) {
    const responseMode = await deferAdminPanelModalSubmit(interaction);
    const context = await getQuestionModalSubmitContext(parts);
    if (!isAdminSessionOwner(interaction, context.ownerUserId)) {
        return respondAdminModalError(interaction, responseMode, {
            content: 'This admin panel belongs to another user.',
        });
    }
    if (!isMatchingAdminGuild(interaction, context.guildId)) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (!context.challenge || !context.question) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Unknown challenge or question.')] });

    const effectiveQuestion = context.question;
    if (effectiveQuestion.answer?.required !== true || effectiveQuestion.answer?.type !== 'text') return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This question does not use editable text answers.')] });
    const answersInput = getModalTextInput(interaction, 'answers');
    if (!answersInput) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('No question changes were submitted.')] });
    const answers = parseAnswerOverrideList(answersInput);
    if (answers.length < 1) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Please provide at least one accepted answer.')] });

    const updatedSettings = await setQuestionAnswerOverrides(context.guildId, context.challengeId, context.question.id, answers, interaction.user.id);
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

async function handleQuestionImageIdsModalSubmit(interaction, parts) {
    const responseMode = await deferAdminPanelModalSubmit(interaction);
    const context = await getQuestionModalSubmitContext(parts);
    if (!isAdminSessionOwner(interaction, context.ownerUserId)) {
        return respondAdminModalError(interaction, responseMode, {
            content: 'This admin panel belongs to another user.',
        });
    }
    if (!isMatchingAdminGuild(interaction, context.guildId)) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (!context.challenge || !context.question) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Unknown challenge or question.')] });

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
        if (!sameStringSet(currentIds, selectedIds)) updates[role.key] = selectedIds;
    }
    if (Object.keys(updates).length < 1) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('No image ID changes were submitted.')] });

    const pendingQuestion = applyPendingImageIds(effectiveQuestion, updates);
    for (const role of Object.keys(updates)) {
        const validationError = validatePendingQuestionImageIds(pendingQuestion, role, updates[role]);
        if (validationError) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(validationError)] });
    }

    const updatedSettings = await setQuestionImageIdOverrides(context.guildId, context.challengeId, context.question.id, updates, interaction.user.id);
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-image-ids-modal', 'Question image IDs updated.', { sourceMessageId: context.sourceMessageId, responseMode });
}

async function handleQuestionDirectionsModalSubmit(interaction, parts) {
    const responseMode = await deferAdminPanelModalSubmit(interaction);
    const context = await getQuestionModalSubmitContext(parts);
    if (!isAdminSessionOwner(interaction, context.ownerUserId)) {
        return respondAdminModalError(interaction, responseMode, {
            content: 'This admin panel belongs to another user.',
        });
    }
    if (!isMatchingAdminGuild(interaction, context.guildId)) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (!context.challenge || !context.question) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Unknown challenge or question.')] });

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

    const updatedSettings = await setQuestionImageDirectionOverrides(
        context.guildId,
        context.challengeId,
        context.question.id,
        Object.fromEntries(imageIds.map((imageId) => [imageId, degrees])),
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

async function handleQuestionClearModalSubmit(interaction, parts = []) {
    const responseMode = await deferAdminPanelModalSubmit(interaction);
    const context = await getQuestionModalSubmitContext(parts);
    if (!isAdminSessionOwner(interaction, context.ownerUserId)) {
        return respondAdminModalError(interaction, responseMode, {
            content: 'This admin panel belongs to another user.',
        });
    }

    if (!isMatchingAdminGuild(interaction, context.guildId)) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (!context.challenge || !context.question) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('Unknown challenge or question.')] });

    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveChallenge = context.challenge;
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id) ?? context.question;
    const questionOverride = getQuestionOverride(verificationSettings, context.challengeId, context.question.id);
    const definitions = getQuestionClearDefinitions(effectiveQuestion, questionOverride);
    const clearMap = Object.fromEntries(definitions.map((definition) => [definition.field, definition.paths]));

    let selectedField;
    try {
        selectedField = getRequiredModalSingleSelect(interaction, 'clear_field', getQuestionClearSelectOptions(definitions), 'override entry to clear');
    }
    catch (err) {
        return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed(err.message)] });
    }

    const paths = clearMap[selectedField];
    if (!paths) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('That clear action is no longer available for this question’s current Task/Answer.')] });

    const updatedSettings = await clearQuestionOverrideFields(context.guildId, context.challengeId, context.question.id, paths, interaction.user.id);
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-clear-modal', 'Question override cleared.', {
        sourceMessageId: context.sourceMessageId,
        responseMode,
    });
}


async function updateChallengeMetaFromModal(guildId, challengeId, submittedTitle, submittedDescription, userId) {
    const patch = {};
    if (submittedTitle) patch.title = submittedTitle;
    if (submittedDescription) patch.description = submittedDescription;
    return updateChallengeMetaOverrides(guildId, challengeId, patch, userId);
}

async function handleChallengeEditModalSubmit(interaction, parts) {
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
    if (!title && !description) return respondAdminModalError(interaction, responseMode, { embeds: [userErrorEmbed('No challenge changes were submitted.')] });

    const updatedSettings = await updateChallengeMetaFromModal(guildId, challengeId, title, description, interaction.user.id);
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
        switch (parsed.action) {
            case 'settingsEditOptions':
                await showSettingsOptionsModal(interaction, parsed.parts);
                return true;
            case 'settingsEditTimers':
                await showSettingsTimersModal(interaction, parsed.parts);
                return true;
            case 'challengeSelect':
                await handleChallengeSelectMenu(interaction, parsed.parts);
                return true;
            case 'challengeQuestions':
                await handleChallengeQuestionsButton(interaction, parsed.parts);
                return true;
            case 'challengeOverview':
                await handleChallengeOverviewButton(interaction, parsed.parts);
                return true;
            case 'questionSelectOpen':
                await handleQuestionSelectOpenButton(interaction, parsed.parts);
                return true;
            case 'questionSelect':
                await handleQuestionSelectMenu(interaction, parsed.parts);
                return true;
            case 'questionEditTools':
                await handleQuestionEditToolsButton(interaction, parsed.parts);
                return true;
            case 'challengeEdit':
                await showChallengeEditModalFromButton(interaction, parsed.parts);
                return true;
            case 'questionEditDone':
                await handleQuestionEditDoneButton(interaction, parsed.parts);
                return true;
            case 'questionEditOptions':
                await showQuestionOptionsModal(interaction, parsed.parts);
                return true;
            case 'questionEditText':
                await showQuestionTextModal(interaction, parsed.parts);
                return true;
            case 'questionEditImageText':
                await showQuestionImageTextModal(interaction, parsed.parts);
                return true;
            case 'questionEditAnswers':
                await showQuestionAnswersModal(interaction, parsed.parts);
                return true;
            case 'questionEditImageIds':
                await showQuestionImageIdsModal(interaction, parsed.parts);
                return true;
            case 'questionEditDirections':
                await handleQuestionEditDirectionsButton(interaction, parsed.parts);
                return true;
            case 'questionDetailPage':
                await handleQuestionDetailPageButton(interaction, parsed.parts);
                return true;
            case 'questionDetailView':
                await handleQuestionDetailViewButton(interaction, parsed.parts);
                return true;
            case 'questionDetailBack':
                await handleQuestionDetailBackButton(interaction, parsed.parts);
                return true;
            case 'questionClearSelector':
                await showQuestionClearSelectorModal(interaction, parsed.parts);
                return true;
            default:
                return false;
        }
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
        switch (parsed.action) {
            case 'settingsOptionsModal':
                await handleSettingsOptionsModalSubmit(interaction, parsed.parts);
                return true;
            case 'settingsTimersModal':
                await handleSettingsTimersModalSubmit(interaction, parsed.parts);
                return true;
            case 'challengeEditModal':
                await handleChallengeEditModalSubmit(interaction, parsed.parts);
                return true;
            case 'questionOptionsModal':
                await handleQuestionOptionsModalSubmit(interaction, parsed.parts);
                return true;
            case 'questionTextModal':
                await handleQuestionTextModalSubmit(interaction, parsed.parts);
                return true;
            case 'questionImageTextModal':
                await handleQuestionImageTextModalSubmit(interaction, parsed.parts);
                return true;
            case 'questionAnswersModal':
                await handleQuestionAnswersModalSubmit(interaction, parsed.parts);
                return true;
            case 'questionImageIdsModal':
                await handleQuestionImageIdsModalSubmit(interaction, parsed.parts);
                return true;
            case 'questionDirectionsModal':
                await handleQuestionDirectionsModalSubmit(interaction, parsed.parts);
                return true;
            case 'questionClearModal':
                await handleQuestionClearModalSubmit(interaction, parsed.parts);
                return true;
            default:
                return false;
        }
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
        return interaction.editReply({ embeds: [userErrorEmbed('Verification is halted in the Warden settings.')] });
    }

    const targetChannel = interaction.options.getChannel('channel', true);

    if (!targetChannel?.isTextBased?.()) {
        return interaction.editReply({ embeds: [userErrorEmbed('Please provide a valid text channel or thread.')] });
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
            return interaction.editReply({ embeds: [userErrorEmbed('Please provide `message_id` when using `/verification post action:refresh`.')] });
        }

        const message = await fetchVerificationMessageFromChannel(targetChannel, messageId);

        if (!message) {
            return interaction.editReply({ embeds: [userErrorEmbed('Could not find that verification post in the selected channel. Please check the channel and message ID.')] });
        }

        await message.edit({ embeds: [welcomeEmbed], components });

        return interaction.editReply(buildVerificationAdminActionCompleted(
            'Post Refreshed',
            `Verification post refreshed successfully: ${message.url}`,
        ));
    }

    return interaction.editReply({ embeds: [userErrorEmbed('Unknown verification post action.')] });
}

function getChallengeIdChoices() {
    return [];
}

function buildChallengeIdAutocompleteChoices(focusedValue) {
    const search = String(focusedValue ?? '').trim().toLowerCase();

    return getChallengeIdChoices()
        .filter((challengeId) => !search || challengeId.toLowerCase().includes(search))
        .slice(0, 25)
        .map((challengeId) => ({
            name: challengeId,
            value: challengeId,
        }));
}

function buildChallengeIdsAutocompleteChoices(focusedValue) {
    return buildDelimitedAutocompleteChoices(focusedValue, getChallengeIdChoices());
}

function buildDelimitedAutocompleteChoices(focusedValue, candidates) {
    const rawValue = String(focusedValue ?? '');
    const match = rawValue.match(/^(.*?)([^,\s]*)$/);
    const prefix = match?.[1] ?? '';
    const currentToken = match?.[2] ?? rawValue;
    const normalizedCurrentToken = currentToken.trim().toLowerCase();

    const existingIds = new Set(
        rawValue
            .slice(0, rawValue.length - currentToken.length)
            .split(/[\s,]+/)
            .map((challengeId) => challengeId.trim())
            .filter(Boolean),
    );

    return candidates
        .filter((id) => !existingIds.has(id))
        .filter((id) => !normalizedCurrentToken || id.toLowerCase().includes(normalizedCurrentToken))
        .slice(0, 25)
        .map((id) => {
            const value = `${prefix}${id}`;
            return {
                name: value,
                value,
            };
        });
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
            catch (err) {
                return interaction.editReply({ embeds: [userErrorEmbed('Verification settings require a real guild context.')] });
            }

            if (!group && subcommand === 'post') return handleVerificationPostCommand(interaction, guildId);
            if (!group && subcommand === 'settings') return handleVerificationSettingsCommand(interaction, guildId);
            if (!group && subcommand === 'challenges') return handleVerificationChallengesCommand(interaction, guildId);

            return interaction.editReply({ embeds: [userErrorEmbed('Unknown verification command.')] });
        }
        catch (err) {
            console.log(err);

            await botLog(interaction.guild, new Discord.EmbedBuilder()
                .setTitle('⛔ Verification command failed')
                .setDescription('```' + err.stack + '```')
                , 2, 'error'
            ).catch((logErr) => console.error('Failed to log verification command error:', logErr));

            const errorResponse = { embeds: [userErrorEmbed('Failed to run the verification command. Please try again later.')] };
            if (interaction.deferred) return interaction.editReply(errorResponse);
            if (interaction.replied) return interaction.followUp({ ...errorResponse, flags: Discord.MessageFlags.Ephemeral });
            return interaction.reply({ ...errorResponse, flags: Discord.MessageFlags.Ephemeral });
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
