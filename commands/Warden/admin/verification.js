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
const {
    VERIFICATION_MODES,
    getVerificationSettings,
    setVerificationMode,
    setActiveChallengeIds,
    setChallengeExpirySeconds,
    setCooldownSeconds,
    setAutokickSettings,
    setQuestionTextOverride,
    setQuestionImageTextOverride,
    setQuestionAnswerOverrides,
    setQuestionImageIds,
    clearQuestionImageIds,
    setQuestionImageDirections,
    clearQuestionImageDirections,
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

async function handleChallengeView(interaction, verificationSettings, enabledChallengeIds, idsInput = interaction.options.getString('ids')) {
    const challengeIds = parseIdList(idsInput);

    if (challengeIds.length > 1) {
        return interaction.editReply({ embeds: [userErrorEmbed('The `view` action accepts only one challenge ID. Use `active-set` for multiple IDs.')] });
    }

    const challengeId = challengeIds[0] ?? '';

    if (!challengeId) {
        return interaction.editReply(buildVerificationAdminConfiguration(
            'Challenges',
            'Configured verification challenges.',
            [
                { name: 'Active Challenge IDs', value: buildActiveChallengeIdsValue(verificationSettings), inline: false },
                { name: 'Available Challenge IDs', value: buildAvailableChallengeIdsValue(enabledChallengeIds), inline: false },
            ],
        ));
    }

    const challenge = verificationChallenges[challengeId];
    if (!challenge) return interaction.editReply({ embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });

    const fields = [
        { name: 'Challenge Title', value: challenge.title ?? 'Not set', inline: false },
        { name: 'Challenge Description', value: challenge.description ?? 'Not set', inline: false },
        { name: 'Questions', value: (challenge.questions ?? []).map((question, index) => `${index + 1}. ${question.id} — ${question.label ?? 'Question'}`).join('\n') || 'None', inline: false },
        ...buildChallengeAuditFields(challenge, verificationSettings, enabledChallengeIds),
    ];

    return interaction.editReply(buildVerificationAdminConfiguration(
        'Challenge View',
        `Challenge settings for **${challengeId}**.`,
        fields,
    ));
}

const QUESTION_CLEAR_FIELD_MAP = {
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

function roleIsRequiredForQuestion(question, role) {
    if (question.generatedImage?.type === 'gallery-standard') return ['solution', 'control'].includes(role);
    if (question.generatedImage?.type === 'gallery-rotation-alignment') return ['center', 'outer'].includes(role);
    return question.generatedImage?.requiresConfiguredImageIds === true;
}

function questionRequiresImageDirections(question) {
    return question.generatedImage?.type === 'gallery-rotation-alignment';
}

function formatList(values, empty = 'Not set') {
    return values?.length ? values.map((value) => `- ${value}`).join('\n') : empty;
}

function formatJson(value) {
    if (!value || (typeof value === 'object' && Object.keys(value).length < 1)) return 'Not set';
    return '```json\n' + JSON.stringify(value, null, 2).slice(0, 950) + '\n```';
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
        return interaction.editReply(buildQuestionListResponse(challengeId, challenge));
    }

    const { question, error: questionError } = getKnownQuestion(interaction, challenge);
    if (questionError) return interaction.editReply({ embeds: [questionError] });

    const override = getQuestionOverride(verificationSettings, challengeId, question.id);
    const effectiveQuestion = mergeQuestionConfig(question, override);

    if (subcommand === 'view') {
        return interaction.editReply(buildQuestionViewResponse(verificationSettings, challengeId, challenge, question));
    }

    if (subcommand === 'text-set') {
        const value = String(interaction.options.getString('value') ?? '').trim();
        if (!value) return interaction.editReply({ embeds: [userErrorEmbed('Please provide question text in `value`.')] });
        const updatedSettings = await setQuestionTextOverride(guildId, challengeId, question.id, value, interaction.user.id);
        return interaction.editReply(buildQuestionViewResponse(updatedSettings, challengeId, challenge, question));
    }

    if (subcommand === 'image-text-set') {
        if (effectiveQuestion.generatedImage?.type !== 'prompt-text') return interaction.editReply({ embeds: [userErrorEmbed('image-text-set is only valid for prompt-text questions.')] });
        const value = String(interaction.options.getString('value') ?? '').trim();
        if (!value) return interaction.editReply({ embeds: [userErrorEmbed('Please provide generated image text in `value`.')] });
        const updatedSettings = await setQuestionImageTextOverride(guildId, challengeId, question.id, value, interaction.user.id);
        return interaction.editReply(buildQuestionViewResponse(updatedSettings, challengeId, challenge, question));
    }

    if (subcommand === 'answers-set') {
        if (effectiveQuestion.answer?.required !== true || effectiveQuestion.answer?.type !== 'text') return interaction.editReply({ embeds: [userErrorEmbed('answers-set is only valid for required text-answer questions.')] });
        const answers = parseAnswerOverrideList(interaction.options.getString('answers'));
        if (answers.length < 1) return interaction.editReply({ embeds: [userErrorEmbed('Please provide answers separated by commas or new lines.')] });
        const updatedSettings = await setQuestionAnswerOverrides(guildId, challengeId, question.id, answers, interaction.user.id);
        return interaction.editReply(buildQuestionViewResponse(updatedSettings, challengeId, challenge, question));
    }

    if (subcommand === 'image-ids-set') {
        const role = String(interaction.options.getString('role') ?? '').trim();
        const imageIds = parseIdList(interaction.options.getString('ids'));
        if (!role) return interaction.editReply({ embeds: [userErrorEmbed('Please provide `role`. Leave `ids` blank to clear optional image IDs.')] });

        if (imageIds.length < 1) {
            if (!getAllowedRolesForQuestion(effectiveQuestion).includes(role)) return interaction.editReply({ embeds: [userErrorEmbed(`Role **${role}** is not valid for this question.`)] });
            if (roleIsRequiredForQuestion(effectiveQuestion, role)) return interaction.editReply({ embeds: [userErrorEmbed(`Role **${role}** image IDs are required for this question type. Provide IDs instead of clearing them.`)] });
            const updatedSettings = await clearQuestionImageIds(guildId, challengeId, question.id, role, interaction.user.id);
            return interaction.editReply(buildQuestionViewResponse(updatedSettings, challengeId, challenge, question));
        }

        const validationError = validatePendingQuestionImageIds(effectiveQuestion, role, imageIds);
        if (validationError) return interaction.editReply({ embeds: [userErrorEmbed(validationError)] });
        const updatedSettings = await setQuestionImageIds(guildId, challengeId, question.id, role, imageIds, interaction.user.id);
        return interaction.editReply(buildQuestionViewResponse(updatedSettings, challengeId, challenge, question));
    }

    if (subcommand === 'directions-set') {
        if (effectiveQuestion.generatedImage?.type !== 'gallery-rotation-alignment') return interaction.editReply({ embeds: [userErrorEmbed('directions-set is only valid for rotation-alignment questions.')] });
        const imageIds = parseIdList(interaction.options.getString('ids'));
        let degrees;
        try { degrees = parseDegreeList(interaction.options.getString('degrees')); }
        catch (err) { return interaction.editReply({ embeds: [userErrorEmbed(err.message)] }); }
        if (imageIds.length < 1) return interaction.editReply({ embeds: [userErrorEmbed('Please provide image IDs in `ids`. Leave `degrees` blank to clear optional directions.')] });

        const imagePool = getQuestionImagePool(effectiveQuestion);
        const unknownImageIds = imagePool ? validateImageIdsInPool(imageIds, imagePool) : imageIds;
        if (unknownImageIds.length > 0) return interaction.editReply({ embeds: [userErrorEmbed(`Unknown image ID${unknownImageIds.length === 1 ? '' : 's'}: ${unknownImageIds.join(', ')}`)] });
        const configuredRotationIds = new Set([
            ...(effectiveQuestion.generatedImage?.imageIds?.center ?? []),
            ...(effectiveQuestion.generatedImage?.imageIds?.outer ?? []),
        ]);
        const unconfiguredIds = imageIds.filter((imageId) => !configuredRotationIds.has(imageId));
        if (unconfiguredIds.length > 0) {
            return interaction.editReply({ embeds: [userErrorEmbed(`Configure image IDs as center or outer before setting directions: ${unconfiguredIds.join(', ')}`)] });
        }

        if (degrees.length < 1) {
            if (questionRequiresImageDirections(effectiveQuestion)) return interaction.editReply({ embeds: [userErrorEmbed('Image directions are required for this question type. Provide `degrees` instead of clearing them.')] });
            const updatedSettings = await clearQuestionImageDirections(guildId, challengeId, question.id, imageIds, interaction.user.id);
            return interaction.editReply(buildQuestionViewResponse(updatedSettings, challengeId, challenge, question));
        }

        const updatedSettings = await setQuestionImageDirections(guildId, challengeId, question.id, imageIds, degrees, interaction.user.id);
        return interaction.editReply(buildQuestionViewResponse(updatedSettings, challengeId, challenge, question));
    }

    if (subcommand === 'clear') {
        const field = String(interaction.options.getString('field') ?? '').trim();
        if (!field) return interaction.editReply({ embeds: [userErrorEmbed('Please choose a field to clear.')] });
        let updatedSettings = verificationSettings;
        if (field === 'all') {
            for (const clearField of Object.values(QUESTION_CLEAR_FIELD_MAP)) {
                updatedSettings = await clearQuestionOverrideField(guildId, challengeId, question.id, clearField, interaction.user.id);
            }
        }
        else {
            const mappedField = QUESTION_CLEAR_FIELD_MAP[field];
            if (!mappedField) return interaction.editReply({ embeds: [userErrorEmbed('Unknown clear field.')] });
            updatedSettings = await clearQuestionOverrideField(guildId, challengeId, question.id, mappedField, interaction.user.id);
        }
        return interaction.editReply(buildQuestionViewResponse(updatedSettings, challengeId, challenge, question));
    }

    return interaction.editReply({ embeds: [userErrorEmbed('Unknown question command.')] });
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

function buildTimerInput(customId, label) {
    const description = 'Leave empty if no change is required.';

    return setModalInputDescription(
        new Discord.TextInputBuilder()
            .setCustomId(customId)
            .setLabel(label)
            .setStyle(Discord.TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('90s, 2m, or 2 minutes'),
        description,
    );
}

async function showChallengeTimersModal(interaction, guildId) {
    const modal = new Discord.ModalBuilder()
        .setCustomId(`wardenVerificationAdmin:challengeTimers:${interaction.guild?.id ?? guildId}:${interaction.user.id}`)
        .setTitle('Verification Timers')
        .addComponents(
            new Discord.ActionRowBuilder().addComponents(buildTimerInput('expiry_timer', 'Expiry Timer')),
            new Discord.ActionRowBuilder().addComponents(buildTimerInput('retry_cooldown', 'Retry Cooldown')),
        );

    return interaction.showModal(modal);
}

function getModalTextInput(interaction, customId) {
    return String(interaction.fields.getTextInputValue(customId) ?? '').trim();
}

async function handleChallengeTimersModalSubmit(interaction) {
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

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

    const guildId = interaction.guild?.id;
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

async function sendVerificationAdminModalError(interaction) {
    const response = { embeds: [userErrorEmbed('Failed to update verification timers. Please try again later.')] };

    if (interaction.deferred) return interaction.editReply(response);
    if (interaction.replied) return interaction.followUp({ ...response, flags: Discord.MessageFlags.Ephemeral });
    return interaction.reply({ ...response, flags: Discord.MessageFlags.Ephemeral });
}

async function handleVerificationAdminModalSubmit(interaction) {
    if (!String(interaction.customId ?? '').startsWith('wardenVerificationAdmin:challengeTimers')) return false;

    try {
        await handleChallengeTimersModalSubmit(interaction);
    }
    catch (err) {
        console.error('Failed to handle verification admin modal submit:', err);
        await sendVerificationAdminModalError(interaction).catch((responseError) => {
            console.error('Failed to send verification admin modal error response:', responseError);
        });
    }

    return true;
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

function getQuestionForAutocomplete(interaction) {
    const challengeId = String(interaction.options.getString('challenge') ?? '').trim();
    const challenge = verificationChallenges[challengeId];
    if (!challenge) return undefined;
    return resolveQuestion(challenge, interaction.options.getString('question'));
}

async function buildQuestionIdsAutocompleteChoices(interaction, focusedValue) {
    const subcommand = interaction.options.getSubcommand(false);
    const challengeId = String(interaction.options.getString('challenge') ?? '').trim();
    const question = getQuestionForAutocomplete(interaction);
    if (!question) return [];

    const imagePool = getQuestionImagePool(question);
    if (!imagePool) return [];

    if (subcommand === 'directions-set') {
        const verificationSettings = await getVerificationSettings(interaction.guild?.id);
        const overrideIds = getQuestionOverride(verificationSettings, challengeId, question.id).generatedImage?.imageIds ?? {};
        const configuredIds = [...Object.values(overrideIds).flat(), ...Object.values(question.generatedImage?.imageIds ?? {}).flat()];
        if (configuredIds.length > 0) return buildDelimitedAutocompleteChoices(focusedValue, [...new Set(configuredIds)]);
    }

    return buildDelimitedAutocompleteChoices(focusedValue, getImagePoolIds(imagePool));
}

async function buildContextualIdsAutocompleteChoices(interaction, focusedValue) {
    const group = interaction.options.getSubcommandGroup(false);
    if (group === 'question') return buildQuestionIdsAutocompleteChoices(interaction, focusedValue);
    return buildChallengeIdsAutocompleteChoices(focusedValue);
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
            if (action === 'view') return interaction.respond(buildChallengeIdAutocompleteChoices(focusedOption.value));
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

        if (group === 'question' && focusedOption.name === 'ids') {
            return interaction.respond(await buildContextualIdsAutocompleteChoices(interaction, focusedOption.value));
        }
    }
    catch (err) {
        console.error('Failed to build verification autocomplete choices:', err);
    }

    return interaction.respond([]);
}


const IMAGE_ROLE_CHOICES = [
    { name: 'Solution', value: 'solution' },
    { name: 'Control', value: 'control' },
    { name: 'Center', value: 'center' },
    { name: 'Outer', value: 'outer' },
];

const QUESTION_CLEAR_FIELD_CHOICES = [
    { name: 'Text', value: 'text' },
    { name: 'Image text', value: 'image-text' },
    { name: 'Answers', value: 'answers' },
    { name: 'Image IDs', value: 'image-ids' },
    { name: 'Directions', value: 'directions' },
    { name: 'All', value: 'all' },
];

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
                        { name: 'Set active challenges', value: 'active-set' },
                        { name: 'Set challenge timers', value: 'timers' },
                    ],
                },
            ),
            'ids',
            'Challenge ID for view, or IDs for active-set',
            { required: false, autocomplete: true },
        ))
        .addSubcommandGroup(group => group
            .setName('question')
            .setDescription('Edit questions inside a challenge')
            .addSubcommand(subcommand => addQuestionOptions(subcommand.setName('list').setDescription('List configured questions'), { question: false }))
            .addSubcommand(subcommand => addQuestionOptions(subcommand.setName('view').setDescription('View question settings')))
            .addSubcommand(subcommand => addStringOption(addQuestionOptions(subcommand.setName('text-set').setDescription('Override question text')), 'value', 'Question text'))
            .addSubcommand(subcommand => addStringOption(addQuestionOptions(subcommand.setName('image-text-set').setDescription('Set generated prompt image text')), 'value', 'Prompt image text'))
            .addSubcommand(subcommand => addStringOption(addQuestionOptions(subcommand.setName('answers-set').setDescription('Set accepted answers')), 'answers', 'Answers separated by commas or new lines'))
            .addSubcommand(subcommand => addStringOption(addStringOption(addQuestionOptions(subcommand.setName('image-ids-set').setDescription('Set image IDs for a role')), 'role', 'Image role', { choices: IMAGE_ROLE_CHOICES }), 'ids', 'Image IDs, or leave blank to clear optional IDs', { required: false, autocomplete: true }))
            .addSubcommand(subcommand => addStringOption(addStringOption(addQuestionOptions(subcommand.setName('directions-set').setDescription('Set allowed image directions')), 'ids', 'Image IDs to update or clear', { autocomplete: true }), 'degrees', 'Degrees, or leave blank to clear optional directions', { required: false }))
            .addSubcommand(subcommand => addStringOption(addQuestionOptions(subcommand.setName('clear').setDescription('Clear question overrides')), 'field', 'Override field to clear', { choices: QUESTION_CLEAR_FIELD_CHOICES })),
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
};
