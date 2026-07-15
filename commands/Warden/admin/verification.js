const Discord = require('discord.js');
const { botLog } = require('../../../functions');
const verificationEmbedConfig = require('../verification/verificationEmbedConfig.json');
const {
    applyFieldToEmbed,
    buildVerificationAdminSettingUpdated,
    buildVerificationAdminConfiguration,
    buildVerificationAdminActionCompleted,
    buildVerificationAdminSummary,
    buildVerificationErrorEmbed,
    buildVerificationPublicEmbed,
} = require('../verification/verificationResponses');
const {
    verificationChallenges,
    getEnabledVerificationChallenges,
    normalizeVerificationChallenge,
    buildQuestionScreens,
    validateQuestionScreens,
} = require('../verification/verificationChallenges/verificationChallenges');
const { getVerificationImagePool } = require('../verification/verificationImages');
const {
    applyVerificationConfigSafeguard,
    buildVerificationConfigWarningEmbed,
} = require('../verification/verificationConfigSafeguards');
const ADMIN_CUSTOM_ID_PREFIX = 'wVA';
const ADMIN_CUSTOM_ID_MAX_LENGTH = 100;
const ADMIN_CUSTOM_ID_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const SETTINGS_SELECT_MENU_MAX_OPTIONS = 25;
const CHALLENGE_SELECT_MENU_MAX_OPTIONS = 25;
const QUESTION_SELECT_MENU_MAX_OPTIONS = 25;
const QUESTION_DETAIL_SELECTOR_PAGE_SIZE = 20;
const DIRECTION_PAGE_SIZE = 5;
const MAX_DIRECTION_PAGE_BUTTONS = 25;
const MAX_DIRECTION_IMAGE_IDS_PER_LAUNCHER = DIRECTION_PAGE_SIZE * MAX_DIRECTION_PAGE_BUTTONS;
const CHALLENGE_TITLE_MAX_LENGTH = 256;
const CHALLENGE_DESCRIPTION_MAX_LENGTH = 1024;
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

function withoutEphemeralFlags(payload = {}) {
    const response = { ...payload };

    if (response.flags === Discord.MessageFlags.Ephemeral) {
        delete response.flags;
    }

    return response;
}

async function respondAdminError(interaction, payload) {
    const response = { flags: Discord.MessageFlags.Ephemeral, ...payload };

    if (interaction.deferred) {
        return interaction.editReply(withoutEphemeralFlags(response));
    }

    if (interaction.replied) return interaction.followUp(response);
    return interaction.reply(response);
}

async function sendAdminPermissionError(interaction) {
    return respondAdminError(interaction, {
        content: 'You need Administrator permission to use this verification admin panel.',
    });
}

const {
    VERIFICATION_MODES,
    getVerificationSettings,
    saveVerificationGuildSettingsOnly,
    updateChallengeMetaOverrides,
    setQuestionCommonOverrides,
    setQuestionImageTextOverride,
    setQuestionAnswerOverrides,
    setQuestionImageIdOverrides,
    setQuestionImageDirectionOverrides,
    updateQuestionOptionOverrides,
    clearQuestionOverrideField,
    clearQuestionOverrideFields,
} = require('../verification/verificationSettings');


async function runAdminConfigSafeguard(interaction, { guildId, settings, changedChallengeId, changedQuestionId, reason, source }) {
    return applyVerificationConfigSafeguard({
        guildId,
        guild: interaction.guild,
        settings,
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
    const issues = (safeguardResult.finalReport?.issues ?? safeguardResult.report?.issues ?? [])
        .filter((issue) => !changedChallengeId || issue.challengeId === changedChallengeId)
        .filter((issue) => !changedQuestionId || issue.questionId === changedQuestionId);
    if (issues.length < 1 && (safeguardResult.disabledChallengeIds?.length ?? 0) < 1) return undefined;
    const embed = buildVerificationConfigWarningEmbed({
        report: { issues },
        disabledChallengeIds: safeguardResult.disabledChallengeIds ?? [],
        fallbackApplied: safeguardResult.fallbackApplied === true,
        source: 'Admin change',
        actorId: interaction.user.id,
        finalActiveChallengeIds: safeguardResult.finalSettings?.activeChallengeIds ?? [],
        description: 'Your change left required verification configuration missing. Unsafe active challenges were automatically disabled when needed.',
    });
    return respondAdminError(interaction, { embeds: [embed] }).catch((err) => {
        console.error('Failed to send verification configuration warning to admin:', err);
    });
}

async function replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, source, reason) {
    const safeguard = await runAdminConfigSafeguard(interaction, {
        guildId: context.guildId,
        settings: updatedSettings,
        changedChallengeId: context.challengeId,
        changedQuestionId: context.question.id,
        reason,
        source,
    });
    await followUpAdminConfigWarning(interaction, safeguard, { changedChallengeId: context.challengeId, changedQuestionId: context.question.id });
    const finalSettings = safeguard.finalSettings ?? updatedSettings;
    const effectiveChallenge = normalizeVerificationChallenge(context.challenge, finalSettings);
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id);
    return interaction.editReply(buildQuestionWorkspacePayload({
        verificationSettings: finalSettings,
        mode: 'edit',
        guildId: context.guildId,
        ownerUserId: context.ownerUserId,
        challengeId: context.challengeId,
        challenge: effectiveChallenge,
        question: effectiveQuestion,
        expanded: true,
    }));
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

function parseIdList(input) {
    return [...new Set(String(input ?? '')
        .split(/[\s,]+/)
        .map((challengeId) => challengeId.trim())
        .filter(Boolean))];
}

function sameStringSet(leftValues = [], rightValues = []) {
    const left = [...new Set(leftValues.map(String))].sort();
    const right = [...new Set(rightValues.map(String))].sort();
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeDegreeValue(value) {
    const numeric = Number(value);

    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 360 || numeric % 45 !== 0) {
        throw new Error(`Invalid degree "${value}". Use 0,45,90,135,180,225,270,315.`);
    }

    return numeric === 360 ? 0 : numeric;
}

function parseDegreeList(input) {
    const values = String(input ?? '')
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean)
        .map(normalizeDegreeValue);

    return [...new Set(values)].sort((left, right) => left - right);
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

function buildAvailableChallengeIdsValue(enabledChallengeIds) {
    const challengeList = Object.values(verificationChallenges)
        .map(challenge => `- ${enabledChallengeIds.includes(challenge.id) ? '**' : ''}${challenge.id}${enabledChallengeIds.includes(challenge.id) ? '** [active]' : ''}`)
        .join('\n');

    return challengeList || 'None';
}

function buildSettingsStatusEmbed(verificationSettings) {
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
        { templateOverrides: { title: 'Verification Settings' } },
    ).embeds[0];
}

function assertSettingsChallengeSelectMenuLimit() {
    const count = Object.values(verificationChallenges).length;
    if (count > SETTINGS_SELECT_MENU_MAX_OPTIONS) {
        throw new Error(`There are ${count} configured challenges, but this select-menu editor supports up to ${SETTINGS_SELECT_MENU_MAX_OPTIONS}. Add paging before editing active challenges through this panel.`);
    }
}

function getChallengeSelectOptions() {
    return Object.values(verificationChallenges).map((challenge) => ({
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
    return {
        embeds: [buildSettingsStatusEmbed(verificationSettings)],
        components: buildSettingsActionRows(guildId, ownerUserId),
    };
}

async function handleVerificationSettingsCommand(interaction, guildId) {
    const verificationSettings = await getVerificationSettings(guildId);
    return interaction.editReply(buildSettingsPanelPayload({
        verificationSettings,
        guildId,
        ownerUserId: interaction.user.id,
    }));
}

function buildChallengeListOverviewEmbed(verificationSettings, enabledChallengeIds) {
    return buildVerificationAdminConfiguration(
        'Challenges',
        'Configured verification challenges.',
        [
            { name: 'Active Challenge IDs', value: buildActiveChallengeIdsValue(verificationSettings), inline: false },
            { name: 'Available Challenge IDs', value: buildAvailableChallengeIdsValue(enabledChallengeIds), inline: false },
        ],
    ).embeds[0];
}

function buildChallengePickerEmbed(verificationSettings, enabledChallengeIds) {
    const embed = buildChallengeListOverviewEmbed(verificationSettings, enabledChallengeIds);
    embed.addFields({ name: 'Details', value: 'Select a challenge below to open its interactive challenge editor.', inline: false });
    return embed;
}

function assertChallengeSelectMenuLimit() {
    const count = Object.values(verificationChallenges).length;
    if (count > CHALLENGE_SELECT_MENU_MAX_OPTIONS) {
        throw new Error(`There are ${count} configured challenges, but this select-menu editor supports up to ${CHALLENGE_SELECT_MENU_MAX_OPTIONS}. Add paging before editing challenges through this panel.`);
    }
}

function buildChallengeSelectRow(guildId, ownerUserId) {
    assertChallengeSelectMenuLimit();
    return new Discord.ActionRowBuilder().addComponents(buildStringSelectComponent({
        customId: buildAdminCustomId('challengeSelect', guildId, ownerUserId),
        placeholder: 'Choose a challenge...',
        options: getChallengeSelectOptions(),
    }));
}

function buildChallengesPanelPayload({ verificationSettings, enabledChallengeIds, guildId, ownerUserId }) {
    return {
        embeds: [buildChallengePickerEmbed(verificationSettings, enabledChallengeIds)],
        components: [buildChallengeSelectRow(guildId, ownerUserId)],
    };
}

async function handleVerificationChallengesCommand(interaction, guildId) {
    try { assertChallengeSelectMenuLimit(); }
    catch (err) { return interaction.editReply({ embeds: [userErrorEmbed(err.message)] }); }
    const verificationSettings = await getVerificationSettings(guildId);
    const enabledChallengeIds = getEnabledVerificationChallenges({ verification: verificationSettings }).map((challenge) => challenge.id);
    return interaction.editReply(buildChallengesPanelPayload({
        verificationSettings,
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
    if (!verificationChallenges[challengeId]) return respondAdminError(interaction, { embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    const verificationSettings = await getVerificationSettings(guildId);
    const enabledChallengeIds = getEnabledVerificationChallenges({ verification: verificationSettings }).map((challenge) => challenge.id);
    return sendChallengeOverview(interaction, { guildId, verificationSettings, enabledChallengeIds, challengeId, mode: 'edit' });
}

function buildChallengeOverviewEmbed(verificationSettings, enabledChallengeIds, challengeId) {
    const challenge = verificationChallenges[challengeId];
    const effectiveChallenge = normalizeVerificationChallenge(challenge, verificationSettings);
    const fields = [
        { name: 'Challenge Title', value: truncateEmbedFieldValue(effectiveChallenge.title ?? 'Not set'), inline: false },
        { name: 'Challenge Description', value: truncateEmbedFieldValue(effectiveChallenge.description ?? 'Not set'), inline: false },
        { name: 'Questions', value: (effectiveChallenge.questions ?? []).map((question, index) => `${index + 1}. ${question.id} — ${question.label ?? 'Question'}`).join('\n') || 'None', inline: false },
        ...buildChallengeAuditFields(challenge, verificationSettings, enabledChallengeIds),
    ];

    return buildVerificationAdminConfiguration(
        'Challenge View',
        `Challenge settings for **${challengeId}**.`,
        fields,
    ).embeds[0];
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

function buildChallengeOverviewPanelPayload({ verificationSettings, enabledChallengeIds, mode, guildId, userId, challengeId }) {
    return {
        embeds: [buildChallengeOverviewEmbed(verificationSettings, enabledChallengeIds, challengeId)],
        components: buildChallengeOverviewComponents(mode, guildId, userId, challengeId),
    };
}

function buildChallengeQuestionsPanelPayload({ challengeId, challenge, mode, guildId, userId }) {
    return {
        embeds: [buildQuestionListEmbed(challengeId, challenge)],
        components: buildChallengeQuestionsComponents(mode, guildId, userId, challengeId),
    };
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
        return interaction.editReply({ embeds: [buildChallengeListOverviewEmbed(verificationSettings, enabledChallengeIds)], components: [] });
    }

    const challenge = verificationChallenges[challengeId];
    if (!challenge) return interaction.editReply({ embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)], components: [] });
    return interaction.editReply(buildChallengeOverviewPanelPayload({
        verificationSettings,
        enabledChallengeIds,
        mode,
        guildId,
        userId: interaction.user.id,
        challengeId,
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

function normalizeTaskType(taskType) {
    const value = String(taskType ?? 'none').trim() || 'none';
    return QUESTION_TASK_TYPE_OPTIONS.some((option) => option.value === value) ? value : 'none';
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

const QUESTION_CLEAR_FIELD_MAP = {
    order: 'order',
    label: 'label',
    'separate-step': 'separateStep',
    text: 'text',
    task: [
        'generatedImage.enabled',
        'generatedImage.type',
        'generatedImage.text',
        'generatedImage.imageIds',
        'generatedImage.imageDirections',
        'generatedImage.imagePoolId',
        'generatedImage.gallerySize',
        'generatedImage.compositeImageGallery',
        'generatedImage.solutionImageCount',
        'generatedImage.controlImageCount',
        'generatedImage.maxControlImageRepeats',
        'generatedImage.config',
        'generatedImage.url',
        'answer.type',
    ],
    'answer-required': 'answer.required',
    'image-text': 'generatedImage.text',
    answers: 'answer.accepted',
    'image-ids': 'generatedImage.imageIds',
    directions: 'generatedImage.imageDirections',
};

function getKnownChallengeId(interaction, optionName = 'challenge') {
    const challengeId = String(interaction.options.getString(optionName) ?? '').trim();
    if (!challengeId) return { error: userErrorEmbed(`Please provide a challenge ID in \`${optionName}\`.`) };
    if (!verificationChallenges[challengeId]) return { error: userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`) };
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

function mergeQuestionConfig(question, override = {}) {
    return {
        ...question,
        ...override,
        generatedImage: {
            ...(question.generatedImage ?? {}),
            ...(override.generatedImage ?? {}),
        },
        answer: {
            ...(question.answer ?? {}),
            ...(override.answer ?? {}),
        },
    };
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

function truncateEmbedFieldValue(value, maxLength = 1024) {
    const text = String(value ?? 'Not set');
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function buildQuestionListResponse(challengeId, challenge) {
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
        { fields },
    );
}

function buildQuestionListEmbed(challengeId, challenge) {
    return buildQuestionListResponse(challengeId, challenge).embeds[0];
}

function buildQuestionViewResponse(verificationSettings, challengeId, challenge, question) {
    const override = getQuestionOverride(verificationSettings, challengeId, question.id);
    const effectiveQuestion = mergeQuestionConfig(question, override);
    const imageIds = effectiveQuestion.generatedImage?.imageIds ?? {};
    const imageDirections = effectiveQuestion.generatedImage?.imageDirections ?? {};
    const imageTextStatus = override.generatedImage?.text
        ? `Override: ${override.generatedImage.text}`
        : (question.generatedImage?.text ? `Static: ${question.generatedImage.text}` : 'Not set');
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
        },
    );
}

function buildQuestionDetailEmbed(verificationSettings, challengeId, challenge, question) {
    return buildQuestionViewResponse(verificationSettings, challengeId, challenge, question).embeds[0];
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

const ALLOWED_IMAGE_DIRECTION_DEGREES = new Set([0, 45, 90, 135, 180, 225, 270, 315]);

function getConfiguredRoleIds(generatedImage, role) {
    return Array.isArray(generatedImage?.imageIds?.[role]) ? generatedImage.imageIds[role] : [];
}

function getInvalidConfiguredDirections(directions) {
    return (Array.isArray(directions) ? directions : [])
        .filter((degrees) => !Number.isInteger(Number(degrees)) || !ALLOWED_IMAGE_DIRECTION_DEGREES.has(Number(degrees)));
}

function getChallengeAuditIssues(challenge) {
    const issues = validateQuestionScreens(buildQuestionScreens(challenge)).map((issue) => issue.message);

    for (const question of challenge.questions ?? []) {
        const generatedImage = question.generatedImage ?? {};
        const answer = question.answer ?? {};
        const prefix = `${challenge.id}/${question.id}`;

        if (generatedImage.requiresConfiguredText && !generatedImage.text) {
            issues.push(`${prefix}: generated image text`);
        }

        if (answer.requiresConfiguredAnswers && answer.required === true && !answer.accepted?.length) {
            issues.push(`${prefix}: accepted answers`);
        }

        if (generatedImage.type === 'gallery-standard'
            && (generatedImage.requiresConfiguredImageIds || getConfiguredRoleIds(generatedImage, 'solution').length < 1 || getConfiguredRoleIds(generatedImage, 'control').length < 1)) {
            if (getConfiguredRoleIds(generatedImage, 'solution').length < 1) issues.push(`${prefix}: solution image IDs`);
            if (getConfiguredRoleIds(generatedImage, 'control').length < 1) issues.push(`${prefix}: control image IDs`);
        }

        if (generatedImage.type === 'gallery-rotation-alignment'
            && (generatedImage.requiresConfiguredImageIds || getConfiguredRoleIds(generatedImage, 'center').length < 1 || getConfiguredRoleIds(generatedImage, 'outer').length < 1)) {
            if (getConfiguredRoleIds(generatedImage, 'center').length < 1) issues.push(`${prefix}: center image IDs`);
            if (getConfiguredRoleIds(generatedImage, 'outer').length < 1) issues.push(`${prefix}: outer image IDs`);
        }

        if (generatedImage.type === 'gallery-rotation-alignment'
            && (generatedImage.requiresConfiguredImageDirections || getConfiguredRoleIds(generatedImage, 'center').length > 0 || getConfiguredRoleIds(generatedImage, 'outer').length > 0)) {
            const directions = generatedImage.imageDirections ?? {};
            const imageIds = [...new Set([...getConfiguredRoleIds(generatedImage, 'center'), ...getConfiguredRoleIds(generatedImage, 'outer')])];
            const missingDirectionIds = imageIds.filter((imageId) => !Array.isArray(directions[imageId]) || directions[imageId].length < 1);

            if (missingDirectionIds.length > 0) {
                issues.push(`${prefix}: image directions (${missingDirectionIds.join(', ')})`);
            }

            const invalidDirectionIds = imageIds.filter((imageId) => getInvalidConfiguredDirections(directions[imageId]).length > 0);
            if (invalidDirectionIds.length > 0) {
                issues.push(`${prefix}: invalid image directions (${invalidDirectionIds.join(', ')})`);
            }
        }
    }

    return [...new Set(issues)];
}

function buildChallengeAuditFields(challenge, verificationSettings, enabledChallengeIds) {
    const effectiveChallenge = normalizeVerificationChallenge(challenge, verificationSettings);
    const screens = buildQuestionScreens(effectiveChallenge);
    const issues = getChallengeAuditIssues(effectiveChallenge);

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

function assertModalLabelSupport() {
    if (typeof Discord.LabelBuilder !== 'function') {
        throw new Error('This discord.js version cannot safely render labeled verification admin modals. Upgrade discord.js before using this verification admin editor.');
    }
}

function buildModalTextInputComponent(customId, {
    style = Discord.TextInputStyle.Short,
    placeholder,
    value,
    required = false,
    minLength,
    maxLength,
} = {}) {
    const input = new Discord.TextInputBuilder()
        .setCustomId(customId)
        .setStyle(style)
        .setRequired(required);

    if (placeholder && String(placeholder).length <= 100) input.setPlaceholder(String(placeholder));

    if (value !== undefined && value !== null && String(value).length > 0) {
        const textValue = String(value);
        const maxValueLength = style === Discord.TextInputStyle.Short ? 100 : 3500;
        if (textValue.length <= maxValueLength) input.setValue(textValue);
    }

    if (minLength !== undefined) input.setMinLength(minLength);
    if (maxLength !== undefined) input.setMaxLength(maxLength);

    return input;
}

function buildModalTextLabel(customId, label, {
    description,
    style = Discord.TextInputStyle.Short,
    placeholder,
    value,
    required = false,
    minLength,
    maxLength,
} = {}) {
    assertModalLabelSupport();

    const modalLabel = new Discord.LabelBuilder()
        .setLabel(truncateModalLabel(label))
        .setTextInputComponent(buildModalTextInputComponent(customId, {
            style,
            placeholder,
            value,
            required,
            minLength,
            maxLength,
        }));

    if (description) modalLabel.setDescription(String(description).slice(0, 100));
    return modalLabel;
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

    try {
        assertSettingsChallengeSelectMenuLimit();
    }
    catch (err) {
        return respondAdminError(interaction, {
            embeds: [userErrorEmbed(err.message)],
        });
    }

    const verificationSettings = await getVerificationSettings(guildId);

    const settingsChallengeOptions = getChallengeSelectOptions();
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
}) {
    let sourceUpdated = false;
    const handleEditError = (err) => {
        if (err?.code === 10008) {
            console.warn('[ADMIN UX] Source admin panel message was no longer editable; using fallback response.');
            return;
        }
        console.error('Failed to update admin panel message:', err);
    };

    if (preferSourceUpdate && interaction.message) {
        await interaction.message.edit(panelPayload).then(() => { sourceUpdated = true; }).catch(handleEditError);
    }
    else if (preferSourceUpdate && sourceMessageId && typeof interaction.webhook?.editMessage === 'function') {
        await interaction.webhook.editMessage(sourceMessageId, panelPayload).then(() => { sourceUpdated = true; }).catch(handleEditError);
    }

    if (sourceUpdated) return interaction.editReply(buildVerificationAdminActionCompleted(title, description));
    if (fallback === 'ack') return interaction.editReply(buildVerificationAdminActionCompleted(title, `${description} Re-run the command to view the refreshed panel.`));
    return interaction.editReply(panelPayload);
}

async function replyWithUpdatedSettingsPanel(interaction, { guildId, ownerUserId, sourceMessageId, verificationSettings, title = 'Settings Updated', description = 'Verification settings were updated.' }) {
    return replyWithUpdatedAdminPanel(interaction, {
        panelPayload: buildSettingsPanelPayload({ verificationSettings, guildId, ownerUserId }),
        sourceMessageId,
        title,
        description,
        fallback: 'panel',
    });
}

async function handleSettingsOptionsModalSubmit(interaction, parts = []) {
    const [guildId, ownerUserId, sourceMessageId = ''] = parts;

    if (!isAdminSessionOwner(interaction, ownerUserId)) {
        return sendAdminPanelOwnerError(interaction);
    }

    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

    if (!isMatchingAdminGuild(interaction, guildId)) {
        return interaction.editReply({
            embeds: [userErrorEmbed('This admin panel belongs to another server.')],
        });
    }

    let selectedMode;
    let selectedChallengeIds;
    let selectedAutokickState;

    try {
        selectedMode = getRequiredModalSingleSelect(interaction, 'mode', SETTINGS_MODE_OPTIONS, 'verification mode');
        selectedChallengeIds = getRequiredModalMultiSelect(interaction, 'active_challenge_ids', getChallengeSelectOptions(), 'active challenge');
        selectedAutokickState = getRequiredModalSingleSelect(interaction, 'autokick_enabled', SETTINGS_AUTOKICK_OPTIONS, 'autokick state');
    }
    catch (err) {
        return interaction.editReply({ embeds: [userErrorEmbed(err.message)] });
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
        return interaction.editReply({
            embeds: [userErrorEmbed('No verification settings changes were submitted.')],
        });
    }

    const updatedSettings = await saveVerificationGuildSettingsOnly(guildId, nextSettings, interaction.user.id);
    const safeguard = await runAdminConfigSafeguard(interaction, { guildId, settings: updatedSettings, reason: 'Settings options updated.', source: 'settings-options-modal' });
    await followUpAdminConfigWarning(interaction, safeguard);

    return replyWithUpdatedSettingsPanel(interaction, {
        guildId,
        ownerUserId,
        sourceMessageId,
        verificationSettings: safeguard.finalSettings ?? updatedSettings,
        title: 'Settings Updated',
        description: 'Verification settings were updated.',
    });
}

async function handleSettingsTimersModalSubmit(interaction, parts = []) {
    const [guildId, ownerUserId, sourceMessageId = ''] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    if (!isMatchingAdminGuild(interaction, guildId)) return interaction.editReply({ embeds: [userErrorEmbed('This admin panel belongs to another server.')] });

    const expiryInput = getModalTextInput(interaction, 'challenge_expiry_timer');
    const cooldownInput = getModalTextInput(interaction, 'challenge_retry_cooldown');
    const autokickInput = getModalTextInput(interaction, 'autokick_timer');
    if (!expiryInput && !cooldownInput && !autokickInput) return interaction.editReply({ embeds: [userErrorEmbed('No timer changes were submitted.')] });

    const expirySeconds = expiryInput ? parseDurationSeconds(expiryInput) : undefined;
    if (expiryInput && !expirySeconds) return interaction.editReply({ embeds: [userErrorEmbed('Invalid Challenge Expiry Timer. Use a value like `90s`, `2m`, or `2 minutes`.')] });
    const cooldownSeconds = cooldownInput ? parseDurationSeconds(cooldownInput) : undefined;
    if (cooldownInput && !cooldownSeconds) return interaction.editReply({ embeds: [userErrorEmbed('Invalid Challenge Retry Cooldown. Use a value like `90s`, `2m`, or `2 minutes`.')] });
    const autokickSeconds = autokickInput ? parseDurationSeconds(autokickInput) : undefined;
    if (autokickInput && !autokickSeconds) return interaction.editReply({ embeds: [userErrorEmbed('Invalid Autokick Timer. Use a value like `90s`, `2m`, or `2 minutes`.')] });

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
        return interaction.editReply({
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
    const challenge = verificationChallenges[challengeId];
    if (!challenge) {
        await respondAdminError(interaction, { embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });
        return { error: true };
    }
    return { mode, guildId, ownerUserId, challengeId, challenge };
}

async function handleChallengeQuestionsButton(interaction, parts) {
    const context = await validateChallengeAdminInteraction(interaction, parts);
    if (context.error) return;
    await interaction.deferUpdate();
    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveChallenge = normalizeVerificationChallenge(context.challenge, verificationSettings);
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
    await interaction.deferUpdate();
    const verificationSettings = await getVerificationSettings(context.guildId);
    const enabledChallengeIds = getEnabledVerificationChallenges({ verification: verificationSettings }).map((challenge) => challenge.id);
    return interaction.editReply(buildChallengeOverviewPanelPayload({
        verificationSettings,
        enabledChallengeIds,
        mode: context.mode,
        guildId: context.guildId,
        userId: context.ownerUserId,
        challengeId: context.challengeId,
    }));
}

async function handleQuestionSelectOpenButton(interaction, parts) {
    const [mode, guildId, ownerUserId, challengeId] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminError(interaction, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    const challenge = verificationChallenges[challengeId];
    if (!challenge) return respondAdminError(interaction, { embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });

    try {
        assertQuestionSelectMenuLimit(challenge);
    }
    catch (err) {
        return respondAdminError(interaction, { embeds: [userErrorEmbed(err.message)] });
    }
    if (getChallengeQuestions(challenge).length < 1) return respondAdminError(interaction, { content: `No questions are configured for **${challengeId}**.` });

    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    const verificationSettings = await getVerificationSettings(guildId);
    const effectiveChallenge = normalizeVerificationChallenge(challenge, verificationSettings);
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
    await interaction.deferUpdate();
    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveChallenge = normalizeVerificationChallenge(context.challenge, verificationSettings);
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
    await interaction.deferUpdate();
    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveChallenge = normalizeVerificationChallenge(context.challenge, verificationSettings);
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

async function handleChallengeDetailsButton(interaction, parts) {
    const [mode, guildId, ownerUserId, challengeId] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminError(interaction, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });

    const challenge = verificationChallenges[challengeId];
    if (!challenge) return respondAdminError(interaction, { embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });

    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    const verificationSettings = await getVerificationSettings(guildId);
    const effectiveChallenge = normalizeVerificationChallenge(challenge, verificationSettings);
    const questions = effectiveChallenge.questions ?? [];

    if (mode === 'edit') {
        return sendQuestionDetailSelectorPage(interaction, mode, guildId, ownerUserId, challengeId, effectiveChallenge, questions, 0);
    }

    const embeds = questions.map((question) => buildQuestionDetailEmbed(verificationSettings, challengeId, effectiveChallenge, question));
    if (embeds.length < 1) return interaction.editReply({ content: `No questions are configured for **${challengeId}**.` });
    if (embeds.length <= 10) return interaction.editReply({ embeds });

    return sendQuestionDetailSelectorPage(interaction, mode, guildId, ownerUserId, challengeId, effectiveChallenge, questions, 0);
}

async function showChallengeEditModalFromButton(interaction, parts) {
    const [guildId, ownerUserId, challengeId] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminError(interaction, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });

    const challenge = verificationChallenges[challengeId];
    if (!challenge) return respondAdminError(interaction, { embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });

    const modal = buildAdminModal(
        buildAdminCustomId('challengeEditModal', guildId, ownerUserId, challengeId),
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

function getQuestionAdminContext(parts) {
    const [guildId, ownerUserId, challengeId, questionId] = parts;
    const challenge = verificationChallenges[challengeId];
    const question = challenge ? resolveQuestion(challenge, questionId) : undefined;
    return { guildId, ownerUserId, challengeId, questionId, challenge, question };
}

async function validateQuestionAdminInteraction(interaction, parts) {
    const context = getQuestionAdminContext(parts);
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

function buildQuestionSelectorEmbed(challengeId, challenge, selectedQuestion) {
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
        { fields },
    ).embeds[0];
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
    const components = [buildQuestionSelectRow(mode, guildId, ownerUserId, challengeId, challenge, question?.id)];
    const embeds = [buildQuestionSelectorEmbed(challengeId, challenge, question)];

    if (question) {
        embeds.push(buildQuestionDetailEmbed(verificationSettings, challengeId, challenge, question));

        if (mode === 'edit') {
            const effectiveQuestion = mergeQuestionConfig(question, getQuestionOverride(verificationSettings, challengeId, question.id));
            components.push(...(expanded
                ? buildQuestionEditPanelComponents(guildId, ownerUserId, challengeId, question.id, effectiveQuestion)
                : buildQuestionCollapsedEditComponents(mode, guildId, ownerUserId, challengeId, question.id)));
        }
    }

    return { embeds, components };
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
        return interaction.editReply({ content: `No questions are configured for **${challengeId}**.`, components: [] });
    }

    const totalPages = Math.max(1, Math.ceil(questions.length / QUESTION_DETAIL_SELECTOR_PAGE_SIZE));
    const safePageIndex = Math.min(Math.max(Number(pageIndex) || 0, 0), totalPages - 1);
    const start = safePageIndex * QUESTION_DETAIL_SELECTOR_PAGE_SIZE;
    const end = Math.min(start + QUESTION_DETAIL_SELECTOR_PAGE_SIZE, questions.length);

    return interaction.editReply({
        content: `Choose a question to view for **${challengeId}** (${start + 1}-${end} of ${questions.length}).`,
        components: buildQuestionDetailSelectorComponents(mode, guildId, ownerUserId, challengeId, questions, safePageIndex),
    });
}

async function handleQuestionDetailPageButton(interaction, parts) {
    const [mode, guildId, ownerUserId, challengeId, pageIndex = '0'] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminError(interaction, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    const challenge = verificationChallenges[challengeId];
    if (!challenge) return respondAdminError(interaction, { embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });
    await interaction.deferUpdate();
    const verificationSettings = await getVerificationSettings(guildId);
    const effectiveChallenge = normalizeVerificationChallenge(challenge, verificationSettings);
    return sendQuestionDetailSelectorPage(interaction, mode, guildId, ownerUserId, challengeId, effectiveChallenge, effectiveChallenge.questions ?? [], Number(pageIndex) || 0);
}

async function handleQuestionDetailViewButton(interaction, parts) {
    const [mode, guildId, ownerUserId, challengeId, questionId, pageIndex = '0'] = parts;
    const context = await validateQuestionAdminInteraction(interaction, [guildId, ownerUserId, challengeId, questionId]);
    if (context.error) return;
    await interaction.deferUpdate();
    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveChallenge = normalizeVerificationChallenge(context.challenge, verificationSettings);
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id) ?? context.question;
    return interaction.editReply({
        embeds: [buildQuestionDetailEmbed(verificationSettings, context.challengeId, effectiveChallenge, effectiveQuestion)],
        components: buildQuestionDetailComponents(mode, context.guildId, context.ownerUserId, context.challengeId, context.question.id, { pageIndex: Number(pageIndex) || 0, includeBack: true }),
    });
}

async function handleQuestionDetailBackButton(interaction, parts) {
    const [mode, guildId, ownerUserId, challengeId, pageIndex = '0'] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return respondAdminError(interaction, { embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    const challenge = verificationChallenges[challengeId];
    if (!challenge) return respondAdminError(interaction, { embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });
    await interaction.deferUpdate();
    const verificationSettings = await getVerificationSettings(guildId);
    const effectiveChallenge = normalizeVerificationChallenge(challenge, verificationSettings);
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

    if (taskType === 'prompt-text') actionButtons.push(button('questionEditImageText', 'Prompt Text', Discord.ButtonStyle.Secondary, taskType));
    if (effectiveQuestion.answer?.required === true && answerType === 'text') actionButtons.push(button('questionEditAnswers', 'Answers', Discord.ButtonStyle.Secondary, answerType));
    if (['gallery-standard', 'gallery-rotation-alignment'].includes(taskType)) actionButtons.push(button('questionEditImageIds', 'Image IDs', Discord.ButtonStyle.Secondary, taskType));
    if (taskType === 'gallery-rotation-alignment') {
        const directionImageIds = getConfiguredDirectionImageIds(effectiveQuestion);
        actionButtons.push(button('questionEditDirections', 'Directions', Discord.ButtonStyle.Secondary, taskType, ...directionImageIds));
    }

    const rows = buildActionRows(actionButtons, { maxRows: 4 });
    rows.push(new Discord.ActionRowBuilder().addComponents(
        button('questionClearPanel', 'Clear Overrides', Discord.ButtonStyle.Danger),
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
    if (hasAnyOwnValue(generatedImageOverride, ['enabled', 'type', 'imagePoolId', 'gallerySize', 'compositeImageGallery', 'solutionImageCount', 'controlImageCount', 'maxControlImageRepeats', 'config', 'url'])) {
        add('task', 'Clear Task Override', ['generatedImage.enabled', 'generatedImage.type', 'generatedImage.imagePoolId', 'generatedImage.gallerySize', 'generatedImage.compositeImageGallery', 'generatedImage.solutionImageCount', 'generatedImage.controlImageCount', 'generatedImage.maxControlImageRepeats', 'generatedImage.config', 'generatedImage.url', 'answer.type']);
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

function buildQuestionClearComponents(guildId, userId, challengeId, questionId, definitions) {
    const clearButtons = definitions.map(({ field, label }) => new Discord.ButtonBuilder()
        .setCustomId(buildAdminCustomId('questionClear', field, guildId, userId, challengeId, questionId))
        .setLabel(label)
        .setStyle(field === 'all-visible' ? Discord.ButtonStyle.Danger : Discord.ButtonStyle.Secondary));

    return buildActionRows(clearButtons);
}

function buildQuestionEditPanelPayload(verificationSettings, guildId, userId, challengeId, challenge, question) {
    const effectiveQuestion = mergeQuestionConfig(question, getQuestionOverride(verificationSettings, challengeId, question.id));
    return {
        embeds: [buildQuestionDetailEmbed(verificationSettings, challengeId, challenge, question)],
        components: buildQuestionEditPanelComponents(guildId, userId, challengeId, question.id, effectiveQuestion),
    };
}

async function sendQuestionEditPanel(interaction, parts) {
    const context = await validateQuestionAdminInteraction(interaction, parts);
    if (context.error) return;
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    const verificationSettings = await getVerificationSettings(context.guildId);
    return interaction.editReply({
        ...buildQuestionEditPanelPayload(
            verificationSettings,
            context.guildId,
            context.ownerUserId,
            context.challengeId,
            context.challenge,
            context.question,
        ),
    });
}

async function handleQuestionEditDoneButton(interaction, parts) {
    const context = await validateQuestionAdminInteraction(interaction, parts);
    if (context.error) return;

    await interaction.deferUpdate();

    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveChallenge = normalizeVerificationChallenge(context.challenge, verificationSettings);
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

async function sendQuestionClearPanel(interaction, parts) {
    const context = await validateQuestionAdminInteraction(interaction, parts);
    if (context.error) return;
    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveChallenge = normalizeVerificationChallenge(context.challenge, verificationSettings);
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id) ?? context.question;
    const questionOverride = getQuestionOverride(verificationSettings, context.challengeId, context.question.id);
    const definitions = getQuestionClearDefinitions(effectiveQuestion, questionOverride);
    if (definitions.length < 1) {
        return interaction.reply({
            content: `There are no clearable overrides for **${context.challengeId}/${context.question.id}**.`,
            flags: Discord.MessageFlags.Ephemeral,
        });
    }
    return interaction.reply({
        content: `Choose which overrides to clear for selected question **${context.challengeId}/${context.question.id}**. Only overrides relevant to this question's current Task/Answer are shown.`,
        components: buildQuestionClearComponents(context.guildId, context.ownerUserId, context.challengeId, context.question.id, definitions),
        flags: Discord.MessageFlags.Ephemeral,
    });
}

function truncateModalLabel(label) {
    const text = String(label ?? 'Image ID');
    return text.length <= 45 ? text : `${text.slice(0, 44)}…`;
}

function getConfiguredDirectionImageIds(question) {
    return [...new Set([
        ...(question.generatedImage?.imageIds?.center ?? []),
        ...(question.generatedImage?.imageIds?.outer ?? []),
    ].map((imageId) => String(imageId ?? '').trim()).filter(Boolean))];
}

function buildQuestionDirectionsPageComponents(guildId, userId, challengeId, questionId, directionImageIds, taskType = 'gallery-rotation-alignment') {
    const buttons = [];
    for (let index = 0; index < directionImageIds.length; index += DIRECTION_PAGE_SIZE) {
        const pageImageIds = directionImageIds.slice(index, index + DIRECTION_PAGE_SIZE);
        buttons.push(new Discord.ButtonBuilder()
            .setCustomId(buildAdminCustomId('questionDirectionsPage', guildId, userId, challengeId, questionId, taskType, ...pageImageIds))
            .setLabel(`Directions ${index + 1}-${index + pageImageIds.length}`)
            .setStyle(Discord.ButtonStyle.Secondary));
    }
    return buildActionRows(buttons);
}

function sanitizeDirectionImageIds(imageIds) {
    return imageIds.map((imageId) => String(imageId ?? '').trim()).filter(Boolean);
}

function parseQuestionDirectionsParts(parts) {
    const [guildId, ownerUserId, challengeId, questionId, taskType, ...imageIds] = parts;
    return {
        guildId,
        ownerUserId,
        challengeId,
        questionId,
        taskType,
        imageIds: sanitizeDirectionImageIds(imageIds),
    };
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
    const modal = await buildModal(context, context.question);
    if (!modal) return;
    return interaction.showModal(modal);
}

function showQuestionTextModal(interaction, parts) {
    return showQuestionModal(interaction, parts, (context, question) => buildAdminModal(
        buildAdminCustomId('questionTextModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id),
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
    return showQuestionModal(interaction, parts, async (context, question) => {
        const verificationSettings = await getVerificationSettings(context.guildId);
        const effectiveQuestion = mergeQuestionConfig(question, getQuestionOverride(verificationSettings, context.challengeId, question.id));
        return buildAdminModal(
            buildAdminCustomId('questionOptionsModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id),
            'Question Options',
            buildModalTextLabel('order_number', 'Order Number', {
                placeholder: '1, 2, 3, or leave empty',
                description: 'Leave empty for no change.',
                maxLength: 4,
            }),
            buildModalTextLabel('separate_step', 'Separate Step', {
                placeholder: 'true, false, or leave empty',
                description: 'Leave empty for no change.',
                maxLength: 5,
            }),
            buildModalTextLabel('answer_required', 'Answer Required', {
                placeholder: 'true, false, or leave empty',
                description: 'Leave empty for no change.',
                maxLength: 5,
            }),
            buildQuestionTaskSelectModalLabel(getQuestionTaskType(effectiveQuestion)),
        );
    });
}

function showQuestionImageTextModal(interaction, parts) {
    return showQuestionModal(interaction, parts, (context, question) => {
        const taskType = parts[4] ?? getQuestionTaskType(question);
        if (taskType !== 'prompt-text') throw new Error('This question does not use prompt image text.');
        return buildAdminModal(
            buildAdminCustomId('questionImageTextModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id),
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
    return showQuestionModal(interaction, parts, (context, question) => {
        const answerType = parts[4] ?? question.answer?.type;
        if (answerType !== 'text') throw new Error('This question does not use editable text answers.');
        return buildAdminModal(
            buildAdminCustomId('questionAnswersModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id),
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
    return showQuestionModal(interaction, parts, (context, question) => {
        const type = parts[4] ?? getQuestionTaskType(question);
        if (!['gallery-standard', 'gallery-rotation-alignment'].includes(type)) throw new Error('This question does not use editable image IDs.');
        const roles = type === 'gallery-standard' ? ['solution', 'control'] : ['center', 'outer'];
        const labels = roles.map((role) => buildModalTextLabel(`${role}_ids`, `${role[0].toUpperCase()}${role.slice(1)} IDs`, {
            style: Discord.TextInputStyle.Paragraph,
            placeholder: 'comma/space-separated image IDs',
            description: `Leave empty to keep current ${role} IDs.`,
        }));
        return buildAdminModal(
            buildAdminCustomId('questionImageIdsModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id),
            type === 'gallery-standard' ? 'Edit Image IDs' : 'Edit Rotation Image IDs',
            labels,
        );
    });
}

async function sendQuestionDirectionsPageLauncher(interaction, parsedDirections) {
    const { guildId, ownerUserId, challengeId, questionId, taskType, imageIds } = parsedDirections;
    if (imageIds.length > MAX_DIRECTION_IMAGE_IDS_PER_LAUNCHER) {
        return interaction.editReply({
            embeds: [userErrorEmbed(
                `This question has ${imageIds.length} direction image IDs, but the editor can show up to ${MAX_DIRECTION_IMAGE_IDS_PER_LAUNCHER} at once. Reduce the configured center/outer image IDs or split this question.`,
            )],
            components: [],
        });
    }

    return interaction.editReply({
        content: `Choose a direction page to edit for **${challengeId}/${questionId}**.`,
        components: buildQuestionDirectionsPageComponents(guildId, ownerUserId, challengeId, questionId, imageIds, taskType),
    });
}

async function handleQuestionEditDirectionsButton(interaction, parts) {
    const parsedDirections = parseQuestionDirectionsParts(parts);
    const { guildId, ownerUserId, challengeId, questionId, taskType, imageIds } = parsedDirections;
    const context = await validateQuestionAdminInteraction(interaction, [guildId, ownerUserId, challengeId, questionId]);
    if (context.error) return;
    if (taskType !== 'gallery-rotation-alignment') {
        return respondAdminError(interaction, { embeds: [userErrorEmbed('This question does not use image directions.')] });
    }
    if (imageIds.length < 1) {
        return respondAdminError(interaction, { embeds: [userErrorEmbed('Configure center or outer image IDs before setting directions.')] });
    }
    if (imageIds.length <= DIRECTION_PAGE_SIZE) {
        return showQuestionDirectionsModal(interaction, parts);
    }

    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    return sendQuestionDirectionsPageLauncher(interaction, parsedDirections);
}

function showQuestionDirectionsModal(interaction, parts) {
    return showQuestionModal(interaction, parts, (context, question) => {
        const parsedDirections = parseQuestionDirectionsParts(parts);
        const taskType = parsedDirections.taskType ?? getQuestionTaskType(question);
        if (taskType !== 'gallery-rotation-alignment') throw new Error('This question does not use image directions.');
        const directionImageIds = parsedDirections.imageIds;
        if (directionImageIds.length < 1) {
            throw new Error('This direction page has expired. Please open the directions launcher again.');
        }

        const labels = directionImageIds.map((imageId, index) => buildModalTextLabel(`dir_${index}`, truncateModalLabel(imageId), {
            style: Discord.TextInputStyle.Short,
            placeholder: '0,90,180',
            description: 'Leave empty for no change.',
        }));

        return buildAdminModal(
            buildAdminCustomId('questionDirectionsModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id, taskType, ...directionImageIds),
            'Edit Image Directions',
            labels,
        );
    });
}

function parseBooleanInput(input, fieldLabel = 'Value') {
    const value = String(input ?? '').trim().toLowerCase();
    if (!value) return undefined;
    if (['true', 'yes', 'on', '1'].includes(value)) return true;
    if (['false', 'no', 'off', '0'].includes(value)) return false;
    throw new Error(`${fieldLabel} must be one of: true, false, yes, no, on, off, 1, 0.`);
}

function parseQuestionOrderInput(input, questionCount) {
    const value = String(input ?? '').trim();
    if (!value) return undefined;
    const order = Number(value);
    if (!Number.isInteger(order) || order < 1 || order > questionCount) throw new Error(`Order Number must be a whole number from 1 to ${questionCount}.`);
    return order;
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

async function replyWithUpdatedQuestionPanel(interaction, guildId, ownerUserId, challengeId, challenge, question) {
    const updatedSettings = await getVerificationSettings(guildId);
    return interaction.editReply(buildQuestionEditPanelPayload(updatedSettings, guildId, ownerUserId, challengeId, challenge, question));
}

async function handleQuestionOptionsModalSubmit(interaction, parts) {
    const context = getQuestionAdminContext(parts);
    if (!isAdminSessionOwner(interaction, context.ownerUserId)) return sendAdminPanelOwnerError(interaction);
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    if (!isMatchingAdminGuild(interaction, context.guildId)) return interaction.editReply({ embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (!context.challenge || !context.question) return interaction.editReply({ embeds: [userErrorEmbed('Unknown challenge or question.')] });

    const currentSettings = await getVerificationSettings(context.guildId);
    const effectiveChallenge = normalizeVerificationChallenge(context.challenge, currentSettings);
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id);
    const questionCount = getChallengeQuestions(effectiveChallenge).length;

    let orderNumber;
    let separateStep;
    let answerRequired;
    try {
        orderNumber = parseQuestionOrderInput(getModalTextInput(interaction, 'order_number'), questionCount);
        separateStep = parseBooleanInput(getModalTextInput(interaction, 'separate_step'), 'Separate Step');
        answerRequired = parseBooleanInput(getModalTextInput(interaction, 'answer_required'), 'Answer Required');
    }
    catch (err) {
        return interaction.editReply({ embeds: [userErrorEmbed(err.message)] });
    }

    const currentTaskType = getQuestionTaskType(effectiveQuestion);
    const selectedTaskType = getModalSingleSelectValue(interaction, 'task_type') ?? currentTaskType;
    if (!QUESTION_TASK_TYPE_OPTIONS.some((option) => option.value === selectedTaskType)) {
        return interaction.editReply({ embeds: [userErrorEmbed('Unknown task type selected.')] });
    }
    const taskChanged = selectedTaskType !== currentTaskType;

    if (orderNumber === undefined && separateStep === undefined && answerRequired === undefined && !taskChanged) {
        return interaction.editReply({ embeds: [userErrorEmbed('No question option changes were submitted.')] });
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
    patches[context.question.id] = selectedPatch;

    const updatedSettings = await updateQuestionOptionOverrides(context.guildId, context.challengeId, patches, interaction.user.id);
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-options-modal', 'Question options updated.');
}

async function handleQuestionTextModalSubmit(interaction, parts) {
    const context = getQuestionAdminContext(parts);
    if (!isAdminSessionOwner(interaction, context.ownerUserId)) return sendAdminPanelOwnerError(interaction);
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    if (!isMatchingAdminGuild(interaction, context.guildId)) return interaction.editReply({ embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (!context.challenge || !context.question) return interaction.editReply({ embeds: [userErrorEmbed('Unknown challenge or question.')] });

    const label = getModalTextInput(interaction, 'label');
    const text = getModalTextInput(interaction, 'text');
    if (!label && !text) return interaction.editReply({ embeds: [userErrorEmbed('No question text changes were submitted.')] });

    await setQuestionCommonOverrides(context.guildId, context.challengeId, context.question.id, {
        ...(label ? { label } : {}),
        ...(text ? { text } : {}),
    }, interaction.user.id);
    return replyWithUpdatedQuestionPanel(interaction, context.guildId, context.ownerUserId, context.challengeId, context.challenge, context.question);
}

async function handleQuestionImageTextModalSubmit(interaction, parts) {
    const context = getQuestionAdminContext(parts);
    if (!isAdminSessionOwner(interaction, context.ownerUserId)) return sendAdminPanelOwnerError(interaction);
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    if (!isMatchingAdminGuild(interaction, context.guildId)) return interaction.editReply({ embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (!context.challenge || !context.question) return interaction.editReply({ embeds: [userErrorEmbed('Unknown challenge or question.')] });

    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveQuestion = mergeQuestionConfig(context.question, getQuestionOverride(verificationSettings, context.challengeId, context.question.id));
    if (getQuestionTaskType(effectiveQuestion) !== 'prompt-text') return interaction.editReply({ embeds: [userErrorEmbed('This question does not use prompt image text.')] });
    const imageText = getModalTextInput(interaction, 'image_text');
    if (!imageText) return interaction.editReply({ embeds: [userErrorEmbed('No question changes were submitted.')] });

    const updatedSettings = await setQuestionImageTextOverride(context.guildId, context.challengeId, context.question.id, imageText, interaction.user.id);
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-image-text-modal', 'Question prompt text updated.');
}

async function handleQuestionAnswersModalSubmit(interaction, parts) {
    const context = getQuestionAdminContext(parts);
    if (!isAdminSessionOwner(interaction, context.ownerUserId)) return sendAdminPanelOwnerError(interaction);
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    if (!isMatchingAdminGuild(interaction, context.guildId)) return interaction.editReply({ embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (!context.challenge || !context.question) return interaction.editReply({ embeds: [userErrorEmbed('Unknown challenge or question.')] });

    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveQuestion = mergeQuestionConfig(context.question, getQuestionOverride(verificationSettings, context.challengeId, context.question.id));
    if (effectiveQuestion.answer?.required !== true || effectiveQuestion.answer?.type !== 'text') return interaction.editReply({ embeds: [userErrorEmbed('This question does not use editable text answers.')] });
    const answersInput = getModalTextInput(interaction, 'answers');
    if (!answersInput) return interaction.editReply({ embeds: [userErrorEmbed('No question changes were submitted.')] });
    const answers = parseAnswerOverrideList(answersInput);
    if (answers.length < 1) return interaction.editReply({ embeds: [userErrorEmbed('Please provide at least one accepted answer.')] });

    const updatedSettings = await setQuestionAnswerOverrides(context.guildId, context.challengeId, context.question.id, answers, interaction.user.id);
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-answers-modal', 'Question accepted answers updated.');
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
    const context = getQuestionAdminContext(parts);
    if (!isAdminSessionOwner(interaction, context.ownerUserId)) return sendAdminPanelOwnerError(interaction);
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    if (!isMatchingAdminGuild(interaction, context.guildId)) return interaction.editReply({ embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (!context.challenge || !context.question) return interaction.editReply({ embeds: [userErrorEmbed('Unknown challenge or question.')] });

    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveQuestion = mergeQuestionConfig(context.question, getQuestionOverride(verificationSettings, context.challengeId, context.question.id));
    const taskType = getQuestionTaskType(effectiveQuestion);
    if (!['gallery-standard', 'gallery-rotation-alignment'].includes(taskType)) return interaction.editReply({ embeds: [userErrorEmbed('This question does not use editable image IDs.')] });

    const roles = taskType === 'gallery-standard' ? ['solution', 'control'] : ['center', 'outer'];
    const updates = {};
    for (const role of roles) {
        const raw = getModalTextInput(interaction, `${role}_ids`);
        if (raw) {
            const imageIds = parseIdList(raw);
            if (imageIds.length < 1) return interaction.editReply({ embeds: [userErrorEmbed(`Please provide at least one ${role} image ID, or leave that field empty for no change.`)] });
            updates[role] = imageIds;
        }
    }
    if (Object.keys(updates).length < 1) return interaction.editReply({ embeds: [userErrorEmbed('No question changes were submitted.')] });

    const pendingQuestion = applyPendingImageIds(effectiveQuestion, updates);
    for (const role of Object.keys(updates)) {
        const validationError = validatePendingQuestionImageIds(pendingQuestion, role, updates[role]);
        if (validationError) return interaction.editReply({ embeds: [userErrorEmbed(validationError)] });
    }

    const updatedSettings = await setQuestionImageIdOverrides(context.guildId, context.challengeId, context.question.id, updates, interaction.user.id);
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-image-ids-modal', 'Question image IDs updated.');
}

async function handleQuestionDirectionsModalSubmit(interaction, parts) {
    const context = getQuestionAdminContext(parts);
    if (!isAdminSessionOwner(interaction, context.ownerUserId)) return sendAdminPanelOwnerError(interaction);
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    if (!isMatchingAdminGuild(interaction, context.guildId)) return interaction.editReply({ embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (!context.challenge || !context.question) return interaction.editReply({ embeds: [userErrorEmbed('Unknown challenge or question.')] });

    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveQuestion = mergeQuestionConfig(context.question, getQuestionOverride(verificationSettings, context.challengeId, context.question.id));
    if (getQuestionTaskType(effectiveQuestion) !== 'gallery-rotation-alignment') return interaction.editReply({ embeds: [userErrorEmbed('This question does not use image directions.')] });

    const submittedImageIds = parseQuestionDirectionsParts(parts).imageIds;
    const directionUpdates = [];
    for (const [index, imageId] of submittedImageIds.entries()) {
        const directionsInput = getModalTextInput(interaction, `dir_${index}`);
        if (!directionsInput) continue;
        let degrees;
        try { degrees = parseDegreeList(directionsInput); }
        catch (err) { return interaction.editReply({ embeds: [userErrorEmbed(err.message)] }); }
        if (degrees.length < 1) return interaction.editReply({ embeds: [userErrorEmbed(`Please provide at least one direction degree for ${imageId}.`)] });
        directionUpdates.push({ imageId, degrees });
    }
    if (directionUpdates.length < 1) return interaction.editReply({ embeds: [userErrorEmbed('No question changes were submitted.')] });

    const imagePool = getQuestionImagePool(effectiveQuestion);
    const unknownImageIds = imagePool ? validateImageIdsInPool(directionUpdates.map(({ imageId }) => imageId), imagePool) : directionUpdates.map(({ imageId }) => imageId);
    if (unknownImageIds.length > 0) return interaction.editReply({ embeds: [userErrorEmbed(`Unknown image ID${unknownImageIds.length === 1 ? '' : 's'}: ${unknownImageIds.join(', ')}`)] });

    const configuredRotationIds = new Set(getConfiguredDirectionImageIds(effectiveQuestion));
    const unconfiguredIds = directionUpdates.map(({ imageId }) => imageId).filter((imageId) => !configuredRotationIds.has(imageId));
    if (unconfiguredIds.length > 0) return interaction.editReply({ embeds: [userErrorEmbed(`Configure image IDs as center or outer before setting directions: ${[...new Set(unconfiguredIds)].join(', ')}`)] });

    const updatedSettings = await setQuestionImageDirectionOverrides(
        context.guildId,
        context.challengeId,
        context.question.id,
        Object.fromEntries(directionUpdates.map(({ imageId, degrees }) => [imageId, degrees])),
        interaction.user.id,
    );
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-directions-modal', 'Question image directions updated.');
}

async function handleQuestionClearButton(interaction, parts) {
    const [field, ...contextParts] = parts;
    const context = await validateQuestionAdminInteraction(interaction, contextParts);
    if (context.error) return;
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveChallenge = normalizeVerificationChallenge(context.challenge, verificationSettings);
    const effectiveQuestion = resolveQuestion(effectiveChallenge, context.question.id) ?? context.question;
    const questionOverride = getQuestionOverride(verificationSettings, context.challengeId, context.question.id);
    const definitions = getQuestionClearDefinitions(effectiveQuestion, questionOverride);
    const clearMap = Object.fromEntries(definitions.map((definition) => [definition.field, definition.paths]));
    const paths = clearMap[field];
    if (!paths) return interaction.editReply({ embeds: [userErrorEmbed('That clear action is not available for this question\'s current Task/Answer.')] });

    const updatedSettings = await clearQuestionOverrideFields(context.guildId, context.challengeId, context.question.id, paths, interaction.user.id);
    return replyWithSafeguardedQuestionPanel(interaction, context, updatedSettings, 'question-clear-button', 'Question override cleared.');
}


async function updateChallengeMetaFromModal(guildId, challengeId, submittedTitle, submittedDescription, userId) {
    const patch = {};
    if (submittedTitle) patch.title = submittedTitle;
    if (submittedDescription) patch.description = submittedDescription;
    return updateChallengeMetaOverrides(guildId, challengeId, patch, userId);
}

async function handleChallengeEditModalSubmit(interaction, parts) {
    const [guildId, ownerUserId, challengeId] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

    if (!isMatchingAdminGuild(interaction, guildId)) return interaction.editReply({ embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (!verificationChallenges[challengeId]) return interaction.editReply({ embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });

    const title = getModalTextInput(interaction, 'challenge_title');
    const description = getModalTextInput(interaction, 'challenge_description');
    if (!title && !description) return interaction.editReply({ embeds: [userErrorEmbed('No challenge changes were submitted.')] });

    const updatedSettings = await updateChallengeMetaFromModal(guildId, challengeId, title, description, interaction.user.id);
    const enabledChallengeIds = getEnabledVerificationChallenges({ verification: updatedSettings }).map((challenge) => challenge.id);
    return interaction.editReply({ embeds: [buildChallengeOverviewEmbed(updatedSettings, enabledChallengeIds, challengeId)] });
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
            case 'challengeDetails':
                await handleChallengeDetailsButton(interaction, parsed.parts);
                return true;
            case 'challengeEdit':
                await showChallengeEditModalFromButton(interaction, parsed.parts);
                return true;
            case 'questionEditPanel':
                await sendQuestionEditPanel(interaction, parsed.parts);
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
            case 'questionDirectionsPage':
                await showQuestionDirectionsModal(interaction, parsed.parts);
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
            case 'questionClearPanel':
                await sendQuestionClearPanel(interaction, parsed.parts);
                return true;
            case 'questionClear':
                await handleQuestionClearButton(interaction, parsed.parts);
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
    return respondAdminError(interaction, {
        embeds: [userErrorEmbed('Failed to update verification admin settings. Please try again later.')],
    });
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
    return Object.values(verificationChallenges)
        .map((challenge) => challenge.id)
        .filter(Boolean);
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
            const guildId = interaction.guild?.id;

            await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

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
