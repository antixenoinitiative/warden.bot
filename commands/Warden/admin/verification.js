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
} = require('../verification/verificationChallenges');
const { getVerificationImagePool } = require('../verification/verificationImages');
const ADMIN_CUSTOM_ID_PREFIX = 'wVA';
const ADMIN_CUSTOM_ID_MAX_LENGTH = 100;
const CHALLENGE_TITLE_MAX_LENGTH = 256;
const CHALLENGE_DESCRIPTION_MAX_LENGTH = 1024;
const adminCustomIdSessions = new Map();
let adminCustomIdSequence = 0;

function buildAdminSessionKey(action, parts) {
    adminCustomIdSequence = (adminCustomIdSequence + 1) % Number.MAX_SAFE_INTEGER;
    while (adminCustomIdSessions.size > 1000) {
        adminCustomIdSessions.delete(adminCustomIdSessions.keys().next().value);
    }
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

    const session = adminCustomIdSessions.get(parts[2]);
    if (session) return { action: session.action, parts: session.parts };

    return { expired: true };
}

function isAdminSessionOwner(interaction, sessionUserId) {
    return String(interaction.user?.id) === String(sessionUserId);
}

const {
    VERIFICATION_MODES,
    getVerificationSettings,
    setVerificationMode,
    setActiveChallengeIds,
    setChallengeExpirySeconds,
    setCooldownSeconds,
    setAutokickSettings,
    updateChallengeMetaOverrides,
    setQuestionCommonOverrides,
    setQuestionImageTextOverride,
    setQuestionAnswerOverrides,
    setQuestionImageIdOverrides,
    setQuestionImageDirectionOverrides,
    clearQuestionOverrideField,
} = require('../verification/verificationSettings');

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

async function handleVerificationModeCommand(interaction, guildId) {
    const mode = interaction.options.getString('mode', true);
    await setVerificationMode(guildId, mode, interaction.user.id);

    return interaction.editReply(buildVerificationAdminSettingUpdated(
        'Mode',
        `Verification mode set to **${mode}**.`,
    ));
}

async function handleVerificationConfigCommand(interaction, guildId, subcommand) {
    const verificationSettings = await getVerificationSettings(guildId);

    if (subcommand === 'status') {
        return handleConfigStatus(interaction, verificationSettings);
    }

    if (subcommand === 'mode-set') {
        return handleVerificationModeCommand(interaction, guildId);
    }


    if (subcommand === 'autokick-set') {
        const state = interaction.options.getString('state');
        if (!state) return interaction.editReply({ embeds: [userErrorEmbed('Please choose `state:on` or `state:off`.')] });

        const timerInput = interaction.options.getString('timer');
        const durationSeconds = timerInput ? parseDurationSeconds(timerInput) : undefined;
        if (timerInput && !durationSeconds) return interaction.editReply({ embeds: [userErrorEmbed('Please provide a valid autokick timer, such as `600s`, `10m`, or `10 minutes`.')] });

        const updatedSettings = await setAutokickSettings(guildId, state === 'on', durationSeconds, interaction.user.id);
        return interaction.editReply(buildVerificationAdminSettingUpdated(
            'Autokick',
            `Verification autokick is now **${updatedSettings.autokickEnabled ? 'ON' : 'OFF'}** with a timer of **${formatDuration(updatedSettings.autokickSeconds)}**.`,
        ));
    }

    return interaction.editReply({ embeds: [userErrorEmbed('Unknown config command.')] });
}

async function handleConfigStatus(interaction, verificationSettings) {
    return interaction.editReply(buildVerificationAdminConfiguration(
        'Configuration',
        'Current verification configuration.',
        [
            { name: 'Verification Mode', value: verificationSettings.mode, inline: true },
            { name: 'Active Challenge IDs', value: buildActiveChallengeIdsValue(verificationSettings), inline: false },
            { name: 'Expiry Timer', value: formatDuration(verificationSettings.challengeExpirySeconds), inline: true },
            { name: 'Retry Cooldown', value: formatDuration(verificationSettings.cooldownSeconds), inline: true },
            { name: 'Autokick', value: `**${verificationSettings.autokickEnabled ? 'ON' : 'OFF'}** after **${formatDuration(verificationSettings.autokickSeconds)}**`, inline: false },
        ],
        { templateOverrides: { title: 'Verification Configuration' } },
    ));
}

async function handleChallengeActiveSet(interaction, guildId, idsInput = interaction.options.getString('ids')) {
    if (!idsInput?.trim()) return interaction.editReply({ embeds: [userErrorEmbed('Please provide at least one challenge ID in `ids`.')] });

    const challengeIds = parseIdList(idsInput);
    if (challengeIds.length < 1) return interaction.editReply({ embeds: [userErrorEmbed('Please provide at least one challenge ID in `ids`.')] });

    const unknownChallengeIds = challengeIds.filter((challengeId) => !verificationChallenges[challengeId]);
    if (unknownChallengeIds.length > 0) return interaction.editReply({ embeds: [userErrorEmbed(`Unknown verification challenge ID${unknownChallengeIds.length === 1 ? '' : 's'}: ${unknownChallengeIds.join(', ')}`)] });

    const updatedSettings = await setActiveChallengeIds(guildId, challengeIds, interaction.user.id);
    return interaction.editReply(buildVerificationAdminSettingUpdated(
        'Active Challenges',
        `Active verification challenges set to: ${updatedSettings.activeChallengeIds.join(', ')}`,
    ));
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

function buildChallengeViewComponents(mode, guildId, userId, challengeId) {
    if (!challengeId) return [];

    const buttons = [];
    if (mode === 'edit') {
        buttons.push(new Discord.ButtonBuilder()
            .setCustomId(buildAdminCustomId('challengeEdit', guildId, userId, challengeId))
            .setLabel('Edit Challenge')
            .setStyle(Discord.ButtonStyle.Secondary));
    }

    buttons.push(new Discord.ButtonBuilder()
        .setCustomId(buildAdminCustomId('challengeDetails', mode, guildId, userId, challengeId))
        .setLabel('Details')
        .setStyle(Discord.ButtonStyle.Primary));

    return [new Discord.ActionRowBuilder().addComponents(...buttons)];
}

function buildQuestionDetailComponents(mode, guildId, userId, challengeId, questionId) {
    if (mode !== 'edit') return [];
    return [new Discord.ActionRowBuilder().addComponents(
        new Discord.ButtonBuilder()
            .setCustomId(buildAdminCustomId('questionEditPanel', guildId, userId, challengeId, questionId))
            .setLabel('Edit Question')
            .setStyle(Discord.ButtonStyle.Primary),
    )];
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
    const effectiveChallenge = normalizeVerificationChallenge(challenge, verificationSettings);

    return interaction.editReply({
        embeds: [
            buildChallengeOverviewEmbed(verificationSettings, enabledChallengeIds, challengeId),
            buildQuestionListEmbed(challengeId, effectiveChallenge),
        ],
        components: buildChallengeViewComponents(mode, guildId, interaction.user.id, challengeId),
    });
}

async function handleChallengeView(interaction, verificationSettings, enabledChallengeIds, idsInput = interaction.options.getString('ids')) {
    const challengeIds = parseIdList(idsInput);

    if (challengeIds.length > 1) {
        return interaction.editReply({ embeds: [userErrorEmbed('The `view` action accepts only one challenge ID. Use `active-set` for multiple IDs.')] });
    }

    return sendChallengeOverview(interaction, {
        guildId: interaction.guild?.id,
        verificationSettings,
        enabledChallengeIds,
        challengeId: challengeIds[0] ?? '',
        mode: 'view',
    });
}

const QUESTION_CLEAR_FIELD_MAP = {
    label: 'label',
    'separate-step': 'separateStep',
    text: 'text',
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
    if (question.generatedImage?.type === 'gallery-standard') return ['solution', 'control'];
    if (question.generatedImage?.type === 'gallery-rotation-alignment') return ['center', 'outer'];
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
            `Image: ${question.generatedImage?.type ?? 'none'}`,
            `Answer: ${question.answer?.required === true ? question.answer?.type ?? 'required' : 'none'}`,
        ].filter(Boolean).join('\n').slice(0, 1024) || 'No details',
        inline: false,
    }));
    return buildVerificationAdminSummary(
        'Verification Questions',
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
        'Verification Question',
        `Question **${question.id}** for challenge **${challengeId}**.`,
        'Question config and overrides.',
        'info',
        {
            fields: [
                { name: 'Challenge ID', value: challengeId, inline: true },
                { name: 'Question ID', value: question.id, inline: true },
                { name: 'Question number', value: String(getQuestionNumber(challenge, question)), inline: true },
                { name: 'Label', value: effectiveQuestion.label ?? 'Not set', inline: true },
                { name: 'Separate step', value: String(effectiveQuestion.separateStep === true), inline: true },
                { name: 'Generated image type', value: effectiveQuestion.generatedImage?.type ?? 'none', inline: true },
                { name: 'Text', value: effectiveQuestion.text ?? 'Not set', inline: false },
                { name: 'Generated image text', value: imageTextStatus, inline: false },
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
        return `Role **${role}** is not valid for ${question.generatedImage?.type ?? 'this question'}. Use: ${allowedRoles.join(', ') || 'none'}.`;
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

    if (question.generatedImage?.type === 'gallery-standard') {
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

    if (question.generatedImage?.type === 'gallery-rotation-alignment') {
        const centerIds = pendingImageIds.center ?? [];
        const outerIds = pendingImageIds.outer ?? [];
        const sharedIds = findSharedImageIds(centerIds, outerIds);
        if (sharedIds.length > 0) {
            return `Image ID${sharedIds.length === 1 ? '' : 's'} cannot be both center and outer: ${sharedIds.join(', ')}`;
        }
    }

    return undefined;
}

async function handleVerificationQuestionCommand(interaction, guildId, subcommand) {
    const { challengeId, error } = getKnownChallengeId(interaction, 'challenge');
    if (error) return interaction.editReply({ embeds: [error] });

    const challenge = verificationChallenges[challengeId];
    const verificationSettings = await getVerificationSettings(guildId);

    if (subcommand === 'list') {
        const effectiveChallenge = normalizeVerificationChallenge(challenge, verificationSettings);
        return interaction.editReply(buildQuestionListResponse(challengeId, effectiveChallenge));
    }

    if (subcommand === 'view') {
        const { question, error: questionError } = getKnownQuestion(interaction, challenge);
        if (questionError) return interaction.editReply({ embeds: [questionError] });
        return interaction.editReply(buildQuestionViewResponse(verificationSettings, challengeId, challenge, question));
    }

    return interaction.editReply({ embeds: [userErrorEmbed('Unknown question command. Use `/verification challenge action:edit` for guided question editing.')] });
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

function setModalInputDescription(input, description) {
    if (typeof input.setDescription === 'function') return input.setDescription(description);
    return input;
}

function buildModalInputComponent(input, description) {
    if (Discord.LabelBuilder && typeof Discord.LabelBuilder === 'function') {
        const label = new Discord.LabelBuilder().setLabel(input.data?.label ?? 'Field');
        if (description && typeof label.setDescription === 'function') label.setDescription(description);
        if (typeof label.setTextInputComponent === 'function') return label.setTextInputComponent(input);
        if (typeof label.addComponents === 'function') return label.addComponents(input);
    }

    return new Discord.ActionRowBuilder().addComponents(setModalInputDescription(input, description));
}

function buildTimerInput(customId, label, currentValue) {
    return new Discord.TextInputBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(Discord.TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder(`Current: ${currentValue}`.slice(0, 100));
}

async function showChallengeTimersModal(interaction, guildId) {
    const verificationSettings = await getVerificationSettings(guildId);
    const expiryValue = formatDuration(verificationSettings.challengeExpirySeconds);
    const cooldownValue = formatDuration(verificationSettings.cooldownSeconds);
    const modal = new Discord.ModalBuilder()
        .setCustomId(buildAdminCustomId('challengeTimers', interaction.guild?.id ?? guildId, interaction.user.id))
        .setTitle('Verification Timers')
        .addComponents(
            buildModalInputComponent(buildTimerInput('expiry_timer', 'Expiry Timer', expiryValue), `Current Expiry Timer: ${expiryValue}. Leave empty for no change.`),
            buildModalInputComponent(buildTimerInput('retry_cooldown', 'Retry Cooldown', cooldownValue), `Current Retry Cooldown: ${cooldownValue}. Leave empty for no change.`),
        );

    return interaction.showModal(modal);
}

function getModalTextInput(interaction, customId) {
    return String(interaction.fields.getTextInputValue(customId) ?? '').trim();
}

async function handleChallengeTimersModalSubmit(interaction, parts = []) {
    const [guildId, ownerUserId] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    if (!isMatchingAdminGuild(interaction, guildId)) return interaction.editReply({ embeds: [userErrorEmbed('This admin panel belongs to another server.')] });

    const expiryInput = getModalTextInput(interaction, 'expiry_timer');
    const cooldownInput = getModalTextInput(interaction, 'retry_cooldown');

    if (!expiryInput && !cooldownInput) {
        return interaction.editReply({ embeds: [userErrorEmbed('No timer changes were submitted.')] });
    }

    const expirySeconds = expiryInput ? parseDurationSeconds(expiryInput) : undefined;
    if (expiryInput && !expirySeconds) {
        return interaction.editReply({ embeds: [userErrorEmbed('Invalid Expiry Timer. Use a value like `90s`, `2m`, or `2 minutes`.')] });
    }

    const cooldownSeconds = cooldownInput ? parseDurationSeconds(cooldownInput) : undefined;
    if (cooldownInput && !cooldownSeconds) {
        return interaction.editReply({ embeds: [userErrorEmbed('Invalid Retry Cooldown. Use a value like `90s`, `2m`, or `2 minutes`.')] });
    }

    if (expirySeconds) await setChallengeExpirySeconds(guildId, expirySeconds, interaction.user.id);
    if (cooldownSeconds) await setCooldownSeconds(guildId, cooldownSeconds, interaction.user.id);

    const updatedSettings = await getVerificationSettings(guildId);
    return interaction.editReply(buildVerificationAdminSummary(
        'Challenge Timers Updated',
        'Updated verification challenge timers.',
        'Current challenge timer settings.',
        'success',
        {
            fields: [
                { name: 'Expiry Timer', value: formatDuration(updatedSettings.challengeExpirySeconds), inline: true },
                { name: 'Retry Cooldown', value: formatDuration(updatedSettings.cooldownSeconds), inline: true },
            ],
        },
    ));
}

async function sendAdminPanelOwnerError(interaction) {
    return interaction.reply({ content: 'This admin panel belongs to another user.', flags: Discord.MessageFlags.Ephemeral });
}

function isMatchingAdminGuild(interaction, guildId) {
    return !interaction.guild?.id || String(interaction.guild.id) === String(guildId);
}

async function handleChallengeDetailsButton(interaction, parts) {
    const [mode, guildId, ownerUserId, challengeId] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return interaction.reply({ embeds: [userErrorEmbed('This admin panel belongs to another server.')], flags: Discord.MessageFlags.Ephemeral });

    const challenge = verificationChallenges[challengeId];
    if (!challenge) return interaction.reply({ embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)], flags: Discord.MessageFlags.Ephemeral });

    const verificationSettings = await getVerificationSettings(guildId);
    const questions = challenge.questions ?? [];

    if (mode === 'edit') {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
        await interaction.editReply({ content: questions.length ? `Sending editable question details for **${challengeId}**...` : `No questions are configured for **${challengeId}**.` });
        for (const question of questions) {
            await interaction.followUp({
                embeds: [buildQuestionDetailEmbed(verificationSettings, challengeId, challenge, question)],
                components: buildQuestionDetailComponents(mode, guildId, ownerUserId, challengeId, question.id),
                flags: Discord.MessageFlags.Ephemeral,
            });
        }
        return;
    }

    const embeds = questions.map((question) => buildQuestionDetailEmbed(verificationSettings, challengeId, challenge, question));
    if (embeds.length < 1) return interaction.reply({ content: `No questions are configured for **${challengeId}**.`, flags: Discord.MessageFlags.Ephemeral });
    if (embeds.length <= 10) return interaction.reply({ embeds, flags: Discord.MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    await interaction.editReply({ embeds: embeds.slice(0, 10) });
    for (let index = 10; index < embeds.length; index += 10) {
        await interaction.followUp({ embeds: embeds.slice(index, index + 10), flags: Discord.MessageFlags.Ephemeral });
    }
}

function buildChallengeTextInput(customId, label, currentValue, style, maxLength) {
    const input = setModalInputDescription(
        new Discord.TextInputBuilder()
            .setCustomId(customId)
            .setLabel(label)
            .setStyle(style)
            .setRequired(false)
            .setMaxLength(maxLength)
            .setPlaceholder('Leave empty for no change'),
        currentValue ? `Current: ${String(currentValue).slice(0, 90)}` : 'Leave empty for no change.',
    );

    return input;
}

async function showChallengeEditModalFromButton(interaction, parts) {
    const [guildId, ownerUserId, challengeId] = parts;
    if (!isAdminSessionOwner(interaction, ownerUserId)) return sendAdminPanelOwnerError(interaction);
    if (!isMatchingAdminGuild(interaction, guildId)) return interaction.reply({ embeds: [userErrorEmbed('This admin panel belongs to another server.')], flags: Discord.MessageFlags.Ephemeral });

    const challenge = verificationChallenges[challengeId];
    if (!challenge) return interaction.reply({ embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)], flags: Discord.MessageFlags.Ephemeral });

    const verificationSettings = await getVerificationSettings(guildId);
    const override = verificationSettings.challengeOverrides?.[challengeId] ?? {};
    const modal = new Discord.ModalBuilder()
        .setCustomId(buildAdminCustomId('challengeEditModal', guildId, ownerUserId, challengeId))
        .setTitle('Edit Challenge')
        .addComponents(
            new Discord.ActionRowBuilder().addComponents(buildChallengeTextInput('challenge_title', 'Challenge Title', override.title ?? challenge.title, Discord.TextInputStyle.Short, CHALLENGE_TITLE_MAX_LENGTH)),
            new Discord.ActionRowBuilder().addComponents(buildChallengeTextInput('challenge_description', 'Challenge Description', override.description ?? challenge.description, Discord.TextInputStyle.Paragraph, CHALLENGE_DESCRIPTION_MAX_LENGTH)),
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
        await interaction.reply({ embeds: [userErrorEmbed('This admin panel belongs to another server.')], flags: Discord.MessageFlags.Ephemeral });
        return { error: true };
    }
    if (!context.challenge) {
        await interaction.reply({ embeds: [userErrorEmbed(`Unknown verification challenge ID: ${context.challengeId}`)], flags: Discord.MessageFlags.Ephemeral });
        return { error: true };
    }
    if (!context.question) {
        await interaction.reply({ embeds: [userErrorEmbed(`Unknown question ID for **${context.challengeId}**: ${context.questionId}`)], flags: Discord.MessageFlags.Ephemeral });
        return { error: true };
    }
    return context;
}

function buildActionRows(buttons) {
    const rows = [];
    for (let index = 0; index < buttons.length; index += 5) {
        rows.push(new Discord.ActionRowBuilder().addComponents(...buttons.slice(index, index + 5)));
    }
    return rows;
}

function buildQuestionEditPanelComponents(guildId, userId, challengeId, questionId, effectiveQuestion) {
    const button = (action, label, style = Discord.ButtonStyle.Primary) => new Discord.ButtonBuilder()
        .setCustomId(buildAdminCustomId(action, guildId, userId, challengeId, questionId))
        .setLabel(label)
        .setStyle(style);

    const buttons = [button('questionEditText', 'Edit Text')];
    if (effectiveQuestion.generatedImage?.type === 'prompt-text') buttons.push(button('questionEditImageText', 'Edit Image Text'));
    if (effectiveQuestion.answer?.required === true && effectiveQuestion.answer?.type === 'text') buttons.push(button('questionEditAnswers', 'Edit Answers'));
    if (['gallery-standard', 'gallery-rotation-alignment'].includes(effectiveQuestion.generatedImage?.type)) buttons.push(button('questionEditImageIds', 'Edit Image IDs'));
    if (effectiveQuestion.generatedImage?.type === 'gallery-rotation-alignment') buttons.push(button('questionEditDirections', 'Edit Directions'));
    buttons.push(button('questionClearPanel', 'Clear Overrides', Discord.ButtonStyle.Danger));

    return buildActionRows(buttons);
}

function buildQuestionClearComponents(guildId, userId, challengeId, questionId) {
    const clearButtons = [
        ['label', 'Clear Label'],
        ['separate-step', 'Clear Separate Step'],
        ['text', 'Clear Text'],
        ['image-text', 'Clear Image Text'],
        ['answers', 'Clear Answers'],
        ['image-ids', 'Clear Image IDs'],
        ['directions', 'Clear Directions'],
        ['all', 'Clear All'],
    ].map(([field, label]) => new Discord.ButtonBuilder()
        .setCustomId(buildAdminCustomId('questionClear', field, guildId, userId, challengeId, questionId))
        .setLabel(label)
        .setStyle(field === 'all' ? Discord.ButtonStyle.Danger : Discord.ButtonStyle.Secondary));

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
    const verificationSettings = await getVerificationSettings(context.guildId);
    return interaction.reply({
        ...buildQuestionEditPanelPayload(
            verificationSettings,
            context.guildId,
            context.ownerUserId,
            context.challengeId,
            context.challenge,
            context.question,
        ),
        flags: Discord.MessageFlags.Ephemeral,
    });
}

async function sendQuestionClearPanel(interaction, parts) {
    const context = await validateQuestionAdminInteraction(interaction, parts);
    if (context.error) return;
    return interaction.reply({
        content: `Choose which overrides to clear for **${context.challengeId}/${context.question.id}**.`,
        components: buildQuestionClearComponents(context.guildId, context.ownerUserId, context.challengeId, context.question.id),
        flags: Discord.MessageFlags.Ephemeral,
    });
}

function buildOptionalTextInput(customId, label, {
    style = Discord.TextInputStyle.Short,
    placeholder,
    value,
    description,
    maxLength,
} = {}) {
    const input = new Discord.TextInputBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(style)
        .setRequired(false);

    if (placeholder && String(placeholder).length <= 100) input.setPlaceholder(String(placeholder));
    if (value && String(value).length <= (style === Discord.TextInputStyle.Short ? 100 : 3500)) input.setValue(String(value));
    if (maxLength) input.setMaxLength(maxLength);

    return setModalInputDescription(input, description ?? 'Leave empty for no change.');
}

function buildModalRow(input) {
    return new Discord.ActionRowBuilder().addComponents(input);
}

async function showQuestionModal(interaction, parts, buildModal) {
    const context = await validateQuestionAdminInteraction(interaction, parts);
    if (context.error) return;
    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveQuestion = mergeQuestionConfig(context.question, getQuestionOverride(verificationSettings, context.challengeId, context.question.id));
    const modal = buildModal(context, effectiveQuestion);
    return interaction.showModal(modal);
}

function showQuestionTextModal(interaction, parts) {
    return showQuestionModal(interaction, parts, (context, effectiveQuestion) => new Discord.ModalBuilder()
        .setCustomId(buildAdminCustomId('questionTextModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id))
        .setTitle('Edit Question Text')
        .addComponents(
            buildModalRow(buildOptionalTextInput('label', 'Label', { placeholder: effectiveQuestion.label ?? 'Leave empty for no change', description: effectiveQuestion.label ? `Current: ${effectiveQuestion.label}` : undefined, maxLength: 100 })),
            buildModalRow(buildOptionalTextInput('text', 'Question Text', { style: Discord.TextInputStyle.Paragraph, placeholder: 'Leave empty for no change', description: effectiveQuestion.text ? `Current: ${String(effectiveQuestion.text).slice(0, 90)}` : undefined })),
            buildModalRow(buildOptionalTextInput('separate_step', 'Separate Step', { placeholder: 'true, false, or leave empty', description: `Current: ${String(effectiveQuestion.separateStep === true)}`, maxLength: 5 })),
        ));
}

function showQuestionImageTextModal(interaction, parts) {
    return showQuestionModal(interaction, parts, (context, effectiveQuestion) => {
        if (effectiveQuestion.generatedImage?.type !== 'prompt-text') throw new Error('This question does not use generated prompt image text.');
        return new Discord.ModalBuilder()
            .setCustomId(buildAdminCustomId('questionImageTextModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id))
            .setTitle('Edit Prompt Image Text')
            .addComponents(buildModalRow(buildOptionalTextInput('image_text', 'Generated Image Text', {
                style: Discord.TextInputStyle.Paragraph,
                placeholder: effectiveQuestion.generatedImage?.text ?? 'Leave empty for no change',
                description: effectiveQuestion.generatedImage?.text ? `Current: ${String(effectiveQuestion.generatedImage.text).slice(0, 90)}` : undefined,
            })));
    });
}

function showQuestionAnswersModal(interaction, parts) {
    return showQuestionModal(interaction, parts, (context, effectiveQuestion) => {
        if (effectiveQuestion.answer?.required !== true || effectiveQuestion.answer?.type !== 'text') throw new Error('This question does not use editable text answers.');
        return new Discord.ModalBuilder()
            .setCustomId(buildAdminCustomId('questionAnswersModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id))
            .setTitle('Edit Accepted Answers')
            .addComponents(buildModalRow(buildOptionalTextInput('answers', 'Accepted Answers', {
                style: Discord.TextInputStyle.Paragraph,
                placeholder: 'answer1, answer2, answer3',
                description: 'Comma or newline separated accepted answers.',
            })));
    });
}

function showQuestionImageIdsModal(interaction, parts) {
    return showQuestionModal(interaction, parts, (context, effectiveQuestion) => {
        const type = effectiveQuestion.generatedImage?.type;
        if (!['gallery-standard', 'gallery-rotation-alignment'].includes(type)) throw new Error('This question does not use editable image IDs.');
        const roles = type === 'gallery-standard' ? ['solution', 'control'] : ['center', 'outer'];
        return new Discord.ModalBuilder()
            .setCustomId(buildAdminCustomId('questionImageIdsModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id))
            .setTitle(type === 'gallery-standard' ? 'Edit Image IDs' : 'Edit Rotation Image IDs')
            .addComponents(...roles.map((role) => buildModalRow(buildOptionalTextInput(`${role}_ids`, `${role[0].toUpperCase()}${role.slice(1)} IDs`, {
                style: Discord.TextInputStyle.Paragraph,
                placeholder: 'comma/space-separated image IDs',
                description: `Leave empty to keep current ${role} IDs.`,
            }))));
    });
}

function showQuestionDirectionsModal(interaction, parts) {
    return showQuestionModal(interaction, parts, (context, effectiveQuestion) => {
        if (effectiveQuestion.generatedImage?.type !== 'gallery-rotation-alignment') throw new Error('This question does not use image directions.');
        return new Discord.ModalBuilder()
            .setCustomId(buildAdminCustomId('questionDirectionsModal', context.guildId, context.ownerUserId, context.challengeId, context.question.id))
            .setTitle('Edit Image Directions')
            .addComponents(buildModalRow(buildOptionalTextInput('directions', 'Image Directions', {
                style: Discord.TextInputStyle.Paragraph,
                placeholder: 'image-a = 0,90\nimage-b = 180,270'.slice(0, 100),
                description: 'One line per image: imageId = 0,90,180',
            })));
    });
}

function parseBooleanInput(input) {
    const value = String(input ?? '').trim().toLowerCase();
    if (!value) return undefined;
    if (['true', 'yes', 'on', '1'].includes(value)) return true;
    if (['false', 'no', 'off', '0'].includes(value)) return false;
    throw new Error('Separate Step must be one of: true, false, yes, no, on, off, 1, 0.');
}

async function replyWithUpdatedQuestionPanel(interaction, guildId, ownerUserId, challengeId, challenge, question) {
    const updatedSettings = await getVerificationSettings(guildId);
    return interaction.editReply(buildQuestionEditPanelPayload(updatedSettings, guildId, ownerUserId, challengeId, challenge, question));
}

async function handleQuestionTextModalSubmit(interaction, parts) {
    const context = getQuestionAdminContext(parts);
    if (!isAdminSessionOwner(interaction, context.ownerUserId)) return sendAdminPanelOwnerError(interaction);
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    if (!isMatchingAdminGuild(interaction, context.guildId)) return interaction.editReply({ embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (!context.challenge || !context.question) return interaction.editReply({ embeds: [userErrorEmbed('Unknown challenge or question.')] });

    const label = getModalTextInput(interaction, 'label');
    const text = getModalTextInput(interaction, 'text');
    const separateStepInput = getModalTextInput(interaction, 'separate_step');
    let separateStep;
    try { separateStep = parseBooleanInput(separateStepInput); }
    catch (err) { return interaction.editReply({ embeds: [userErrorEmbed(err.message)] }); }

    if (!label && !text && separateStep === undefined) return interaction.editReply({ embeds: [userErrorEmbed('No question changes were submitted.')] });

    await setQuestionCommonOverrides(context.guildId, context.challengeId, context.question.id, {
        ...(label ? { label } : {}),
        ...(text ? { text } : {}),
        ...(separateStep !== undefined ? { separateStep } : {}),
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
    if (effectiveQuestion.generatedImage?.type !== 'prompt-text') return interaction.editReply({ embeds: [userErrorEmbed('This question does not use generated prompt image text.')] });
    const imageText = getModalTextInput(interaction, 'image_text');
    if (!imageText) return interaction.editReply({ embeds: [userErrorEmbed('No question changes were submitted.')] });

    await setQuestionImageTextOverride(context.guildId, context.challengeId, context.question.id, imageText, interaction.user.id);
    return replyWithUpdatedQuestionPanel(interaction, context.guildId, context.ownerUserId, context.challengeId, context.challenge, context.question);
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

    await setQuestionAnswerOverrides(context.guildId, context.challengeId, context.question.id, answers, interaction.user.id);
    return replyWithUpdatedQuestionPanel(interaction, context.guildId, context.ownerUserId, context.challengeId, context.challenge, context.question);
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
    const type = effectiveQuestion.generatedImage?.type;
    if (!['gallery-standard', 'gallery-rotation-alignment'].includes(type)) return interaction.editReply({ embeds: [userErrorEmbed('This question does not use editable image IDs.')] });

    const roles = type === 'gallery-standard' ? ['solution', 'control'] : ['center', 'outer'];
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

    await setQuestionImageIdOverrides(context.guildId, context.challengeId, context.question.id, updates, interaction.user.id);
    return replyWithUpdatedQuestionPanel(interaction, context.guildId, context.ownerUserId, context.challengeId, context.challenge, context.question);
}

function parseDirectionLines(input) {
    return String(input ?? '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
        let imageId;
        let degreesInput;
        const separatorMatch = line.match(/^([^:=\s]+)\s*[:=]\s*(.+)$/);
        if (separatorMatch) {
            [, imageId, degreesInput] = separatorMatch;
        }
        else {
            const spaceMatch = line.match(/^(\S+)\s+(.+)$/);
            if (!spaceMatch) throw new Error(`Invalid direction line: ${line}`);
            [, imageId, degreesInput] = spaceMatch;
        }
        const degrees = parseDegreeList(degreesInput);
        if (degrees.length < 1) throw new Error(`Please provide at least one direction degree for ${imageId}.`);
        return { imageId, degrees };
    });
}

async function handleQuestionDirectionsModalSubmit(interaction, parts) {
    const context = getQuestionAdminContext(parts);
    if (!isAdminSessionOwner(interaction, context.ownerUserId)) return sendAdminPanelOwnerError(interaction);
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    if (!isMatchingAdminGuild(interaction, context.guildId)) return interaction.editReply({ embeds: [userErrorEmbed('This admin panel belongs to another server.')] });
    if (!context.challenge || !context.question) return interaction.editReply({ embeds: [userErrorEmbed('Unknown challenge or question.')] });

    const verificationSettings = await getVerificationSettings(context.guildId);
    const effectiveQuestion = mergeQuestionConfig(context.question, getQuestionOverride(verificationSettings, context.challengeId, context.question.id));
    if (effectiveQuestion.generatedImage?.type !== 'gallery-rotation-alignment') return interaction.editReply({ embeds: [userErrorEmbed('This question does not use image directions.')] });

    const directionsInput = getModalTextInput(interaction, 'directions');
    if (!directionsInput) return interaction.editReply({ embeds: [userErrorEmbed('No question changes were submitted.')] });

    let directionUpdates;
    try { directionUpdates = parseDirectionLines(directionsInput); }
    catch (err) { return interaction.editReply({ embeds: [userErrorEmbed(err.message)] }); }
    if (directionUpdates.length < 1) return interaction.editReply({ embeds: [userErrorEmbed('Please provide at least one image direction line.')] });

    const imagePool = getQuestionImagePool(effectiveQuestion);
    const unknownImageIds = imagePool ? validateImageIdsInPool(directionUpdates.map(({ imageId }) => imageId), imagePool) : directionUpdates.map(({ imageId }) => imageId);
    if (unknownImageIds.length > 0) return interaction.editReply({ embeds: [userErrorEmbed(`Unknown image ID${unknownImageIds.length === 1 ? '' : 's'}: ${unknownImageIds.join(', ')}`)] });

    const configuredRotationIds = new Set([
        ...(effectiveQuestion.generatedImage?.imageIds?.center ?? []),
        ...(effectiveQuestion.generatedImage?.imageIds?.outer ?? []),
    ]);
    const unconfiguredIds = directionUpdates.map(({ imageId }) => imageId).filter((imageId) => !configuredRotationIds.has(imageId));
    if (unconfiguredIds.length > 0) return interaction.editReply({ embeds: [userErrorEmbed(`Configure image IDs as center or outer before setting directions: ${[...new Set(unconfiguredIds)].join(', ')}`)] });

    await setQuestionImageDirectionOverrides(
        context.guildId,
        context.challengeId,
        context.question.id,
        Object.fromEntries(directionUpdates.map(({ imageId, degrees }) => [imageId, degrees])),
        interaction.user.id,
    );
    return replyWithUpdatedQuestionPanel(interaction, context.guildId, context.ownerUserId, context.challengeId, context.challenge, context.question);
}

async function handleQuestionClearButton(interaction, parts) {
    const [field, ...contextParts] = parts;
    const context = await validateQuestionAdminInteraction(interaction, contextParts);
    if (context.error) return;
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

    const clearMap = {
        ...QUESTION_CLEAR_FIELD_MAP,
        label: 'label',
        'separate-step': 'separateStep',
    };

    let updatedSettings = await getVerificationSettings(context.guildId);
    if (field === 'all') {
        for (const clearField of Object.values(clearMap)) {
            updatedSettings = await clearQuestionOverrideField(context.guildId, context.challengeId, context.question.id, clearField, interaction.user.id);
        }
    }
    else {
        const mappedField = clearMap[field];
        if (!mappedField) return interaction.editReply({ embeds: [userErrorEmbed('Unknown clear field.')] });
        updatedSettings = await clearQuestionOverrideField(context.guildId, context.challengeId, context.question.id, mappedField, interaction.user.id);
    }

    return interaction.editReply(buildQuestionEditPanelPayload(updatedSettings, context.guildId, context.ownerUserId, context.challengeId, context.challenge, context.question));
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

async function handleVerificationAdminButtonInteraction(interaction) {
    const parsed = parseAdminCustomId(interaction.customId);
    if (!parsed) return false;
    if (parsed.expired) {
        await interaction.reply({ content: 'This admin panel has expired. Please run the command again.', flags: Discord.MessageFlags.Ephemeral });
        return true;
    }

    try {
        switch (parsed.action) {
            case 'challengeDetails':
                await handleChallengeDetailsButton(interaction, parsed.parts);
                return true;
            case 'challengeEdit':
                await showChallengeEditModalFromButton(interaction, parsed.parts);
                return true;
            case 'questionEditPanel':
                await sendQuestionEditPanel(interaction, parsed.parts);
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
                await showQuestionDirectionsModal(interaction, parsed.parts);
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
        const response = { embeds: [userErrorEmbed(err.message || 'Failed to handle verification admin button.')], flags: Discord.MessageFlags.Ephemeral };
        if (interaction.deferred) await interaction.editReply(response);
        else if (interaction.replied) await interaction.followUp(response);
        else await interaction.reply(response);
        return true;
    }
}

async function sendVerificationAdminModalError(interaction) {
    const response = { embeds: [userErrorEmbed('Failed to update verification admin settings. Please try again later.')] };

    if (interaction.deferred) return interaction.editReply(response);
    if (interaction.replied) return interaction.followUp({ ...response, flags: Discord.MessageFlags.Ephemeral });
    return interaction.reply({ ...response, flags: Discord.MessageFlags.Ephemeral });
}

async function handleVerificationAdminModalSubmit(interaction) {
    const parsed = parseAdminCustomId(interaction.customId);
    if (!parsed) return false;
    if (parsed.expired) {
        await interaction.reply({ content: 'This admin panel has expired. Please run the command again.', flags: Discord.MessageFlags.Ephemeral });
        return true;
    }

    try {
        switch (parsed.action) {
            case 'challengeTimers':
                await handleChallengeTimersModalSubmit(interaction, parsed.parts);
                return true;
            case 'challengeEditModal':
                await handleChallengeEditModalSubmit(interaction, parsed.parts);
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


async function handleVerificationChallengeCommand(interaction, guildId) {
    const action = interaction.options.getString('action', true);
    const idsInput = interaction.options.getString('ids');

    if (action === 'timers') {
        if (idsInput?.trim()) {
            const response = { embeds: [userErrorEmbed('The `timers` action does not use challenge IDs. Leave `ids` empty.')] };
            if (interaction.deferred) return interaction.editReply(response);
            return interaction.reply({ ...response, flags: Discord.MessageFlags.Ephemeral });
        }

        return showChallengeTimersModal(interaction, guildId);
    }

    const verificationSettings = await getVerificationSettings(guildId);
    const enabledChallengeIds = getEnabledVerificationChallenges({ verification: verificationSettings }).map((challenge) => challenge.id);

    if (action === 'active-set') return handleChallengeActiveSet(interaction, guildId, idsInput);

    if (action === 'view') return handleChallengeView(interaction, verificationSettings, enabledChallengeIds, idsInput);

    if (action === 'edit') {
        const challengeIds = parseIdList(idsInput);
        if (challengeIds.length < 1) return interaction.editReply({ embeds: [userErrorEmbed('Please provide one challenge ID in `ids` for the `edit` action.')] });
        if (challengeIds.length > 1) return interaction.editReply({ embeds: [userErrorEmbed('The `edit` action accepts only one challenge ID.')] });
        return sendChallengeOverview(interaction, {
            guildId,
            verificationSettings,
            enabledChallengeIds,
            challengeId: challengeIds[0],
            mode: 'edit',
        });
    }

    return interaction.editReply({ embeds: [userErrorEmbed('Unknown challenge action.')] });
}


async function handleVerificationPostCommand(interaction, guildId, subcommand) {
    const verificationSettings = await getVerificationSettings(guildId);
    if (verificationSettings.mode === VERIFICATION_MODES.halt) {
        return interaction.editReply({ embeds: [userErrorEmbed('Verification is halted in the Warden settings.')] });
    }

    const targetChannel = interaction.options.getChannel('channel', true);

    if (!targetChannel?.isTextBased?.()) {
        return interaction.editReply({ embeds: [userErrorEmbed('Please provide a valid text channel.')] });
    }

    const welcomeEmbed = buildWelcomeEmbed(verificationSettings);
    const components = buildVerificationPostComponents();

    if (subcommand === 'send') {
        const message = await targetChannel.send({ embeds: [welcomeEmbed], components });

        return interaction.editReply(buildVerificationAdminActionCompleted(
            'Post Posted',
            `Verification post posted successfully in ${String(targetChannel)}. ${message.url}`,
        ));
    }

    if (subcommand === 'refresh') {
        const messageId = interaction.options.getString('message_id');

        if (!messageId?.trim()) {
            return interaction.editReply({ embeds: [userErrorEmbed('Please provide `message_id` for `/verification post refresh`.')] });
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

    return interaction.editReply({ embeds: [userErrorEmbed('Unknown post command.')] });
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

function buildQuestionAutocompleteChoices(interaction, focusedValue) {
    const challengeId = String(interaction.options.getString('challenge') ?? '').trim();
    const challenge = verificationChallenges[challengeId];
    if (!challenge) return [];
    const search = String(focusedValue ?? '').trim().toLowerCase();

    return (challenge.questions ?? [])
        .map((question, index) => ({
            name: `${index + 1} ${question.id}`.slice(0, 100),
            value: question.id,
        }))
        .filter((choice) => !search || choice.name.toLowerCase().includes(search) || choice.value.toLowerCase().includes(search))
        .slice(0, 25);
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
    try {
        const group = interaction.options.getSubcommandGroup(false);
        const subcommand = interaction.options.getSubcommand(false);
        const focusedOption = interaction.options.getFocused(true);

        if (!group && subcommand === 'challenge' && focusedOption.name === 'ids') {
            const action = interaction.options.getString('action');
            if (action === 'view' || action === 'edit') return interaction.respond(buildChallengeIdAutocompleteChoices(focusedOption.value));
            if (action === 'active-set') return interaction.respond(buildChallengeIdsAutocompleteChoices(focusedOption.value));
            return interaction.respond([]);
        }

        if (focusedOption.name === 'challenge') {
            return interaction.respond(buildChallengeIdAutocompleteChoices(focusedOption.value));
        }

        if (group === 'question' && focusedOption.name === 'question') {
            return interaction.respond(buildQuestionAutocompleteChoices(interaction, focusedOption.value));
        }

        if (focusedOption.name === 'challenges') {
            return interaction.respond(buildChallengeIdsAutocompleteChoices(focusedOption.value));
        }

    }
    catch (err) {
        console.error('Failed to build verification autocomplete choices:', err);
    }

    return interaction.respond([]);
}




function addQuestionOptions(commandBuilder, { question = true } = {}) {
    let builder = addStringOption(commandBuilder, 'challenge', 'Challenge ID', { autocomplete: true });
    if (question) builder = addStringOption(builder, 'question', 'Question ID or 1-based number', { autocomplete: true });
    return builder;
}

module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName('verification')
        .setDescription('Manage Warden verification')
        .setDefaultMemberPermissions(Discord.PermissionFlagsBits.Administrator)
        .addSubcommandGroup(group => group
            .setName('config')
            .setDescription('Manage global verification settings')
            .addSubcommand(subcommand => subcommand
                .setName('status')
                .setDescription('Show current verification settings'),
            )
            .addSubcommand(subcommand => addStringOption(
                subcommand
                    .setName('mode-set')
                    .setDescription('Set the verification mode'),
                'mode',
                'Verification mode to use',
                {
                    choices: [
                        { name: 'Challenge', value: VERIFICATION_MODES.challenge },
                        { name: 'Halt', value: VERIFICATION_MODES.halt },
                        { name: 'One-Click', value: VERIFICATION_MODES.oneClick },
                    ],
                },
            ))
            .addSubcommand(subcommand => addStringOption(
                addStringOption(
                    subcommand
                        .setName('autokick-set')
                        .setDescription('Enable, disable, or update autokick'),
                    'state',
                    'Whether verification autokick is enabled',
                    {
                        choices: [
                            { name: 'On', value: 'on' },
                            { name: 'Off', value: 'off' },
                        ],
                    },
                ),
                'timer',
                'Autokick delay, such as 10m, 600s, or 10 minutes',
                { required: false },
            )),
        )
        .addSubcommandGroup(group => group
            .setName('post')
            .setDescription('Manage the public verification post')
            .addSubcommand(subcommand => subcommand
                .setName('send')
                .setDescription('Send a new verification post')
                .addChannelOption(option => option
                    .setName('channel')
                    .setDescription('Verification channel')
                    .addChannelTypes(Discord.ChannelType.GuildText, Discord.ChannelType.GuildAnnouncement)
                    .setRequired(true),
                ),
            )
            .addSubcommand(subcommand => subcommand
                .setName('refresh')
                .setDescription('Refresh an existing verification post')
                .addChannelOption(option => option
                    .setName('channel')
                    .setDescription('Verification channel')
                    .addChannelTypes(Discord.ChannelType.GuildText, Discord.ChannelType.GuildAnnouncement)
                    .setRequired(true),
                )
                .addStringOption(option => option
                    .setName('message_id')
                    .setDescription('Existing verification post message ID')
                    .setRequired(true),
                ),
            ),
        )
        .addSubcommand(subcommand => addStringOption(
            addStringOption(
                subcommand
                    .setName('challenge')
                    .setDescription('Manage verification challenges'),
                'action',
                'Challenge action to run',
                {
                    choices: [
                        { name: 'View challenges', value: 'view' },
                        { name: 'Edit challenge', value: 'edit' },
                        { name: 'Set active challenges', value: 'active-set' },
                        { name: 'Set challenge timers', value: 'timers' },
                    ],
                },
            ),
            'ids',
            'Challenge ID for view/edit, or IDs for active-set',
            { required: false, autocomplete: true },
        ))
        .addSubcommandGroup(group => group
            .setName('question')
            .setDescription('View questions inside a challenge')
            .addSubcommand(subcommand => addQuestionOptions(subcommand.setName('list').setDescription('List configured questions'), { question: false }))
            .addSubcommand(subcommand => addQuestionOptions(subcommand.setName('view').setDescription('View question settings'))),
        ),
    async autocomplete(interaction) {
        return handleVerificationAutocomplete(interaction);
    },
    async execute(interaction) {
        try {
            const group = interaction.options.getSubcommandGroup(false);
            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guild?.id;

            if (!group && subcommand === 'challenge') {
                const action = interaction.options.getString('action', true);
                if (action === 'timers') return handleVerificationChallengeCommand(interaction, guildId);
            }

            await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

            if (group === 'config') return handleVerificationConfigCommand(interaction, guildId, subcommand);
            if (group === 'post') return handleVerificationPostCommand(interaction, guildId, subcommand);
            if (!group && subcommand === 'challenge') return handleVerificationChallengeCommand(interaction, guildId);
            if (group === 'question') return handleVerificationQuestionCommand(interaction, guildId, subcommand);

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
    async handleButtonInteraction(interaction) {
        return handleVerificationAdminButtonInteraction(interaction);
    },
};
