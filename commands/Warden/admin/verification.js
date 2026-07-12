const Discord = require('discord.js');
const { botLog } = require('../../../functions');
const verificationEmbedConfig = require('../verification/verificationEmbedConfig.json');
const {
    applyFieldToEmbed,
    buildVerificationAdminSettingUpdated,
    buildVerificationAdminStatus,
    buildVerificationAdminConfiguration,
    buildVerificationAdminActionCompleted,
    buildVerificationAdminSummary,
    buildVerificationErrorEmbed,
    buildVerificationPublicEmbed,
} = require('../verification/verificationResponses');
const {
    verificationChallenges,
    getEnabledVerificationChallenges,
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
    const mode = interaction.options.getString('setting', true);
    await setVerificationMode(guildId, mode, interaction.user.id);

    return interaction.editReply(buildVerificationAdminSettingUpdated(
        'Mode',
        `Verification mode set to **${mode}**.`,
    ));
}

async function handleVerificationAutokickCommand(interaction, guildId) {
    const action = interaction.options.getString('action', true);
    const verificationSettings = await getVerificationSettings(guildId);

    if (action === 'status') {
        return interaction.editReply(buildVerificationAdminStatus(
            'Autokick',
            `Verification autokick is currently **${verificationSettings.autokickEnabled ? 'ON' : 'OFF'}** with a timer of **${formatDuration(verificationSettings.autokickSeconds)}**.`,
        ));
    }

    if (action === 'set') {
        const state = interaction.options.getString('state');
        if (!state) return interaction.editReply({ embeds: [userErrorEmbed('Please choose `state:on` or `state:off` for `action:set`.')] });

        const timerInput = interaction.options.getString('timer');
        const durationSeconds = timerInput ? parseDurationSeconds(timerInput) : undefined;
        if (timerInput && !durationSeconds) return interaction.editReply({ embeds: [userErrorEmbed('Please provide a valid autokick timer, such as `600s`, `10m`, or `10 minutes`.')] });

        const updatedSettings = await setAutokickSettings(guildId, state === 'on', durationSeconds, interaction.user.id);
        return interaction.editReply(buildVerificationAdminSettingUpdated(
            'Autokick',
            `Verification autokick is now **${updatedSettings.autokickEnabled ? 'ON' : 'OFF'}** with a timer of **${formatDuration(updatedSettings.autokickSeconds)}**.`,
        ));
    }

    return interaction.editReply({ embeds: [userErrorEmbed('Unknown autokick command.')] });
}

async function handleChallengeList(interaction, verificationSettings, enabledChallengeIds) {
    return interaction.editReply(buildVerificationAdminConfiguration(
        'Challenge',
        'Configured verification challenge settings:',
        [
            { name: 'Active IDs', value: buildActiveChallengeIdsValue(verificationSettings), inline: false },
            { name: 'Available IDs', value: buildAvailableChallengeIdsValue(enabledChallengeIds), inline: false },
            { name: 'Prompt expiry', value: formatDuration(verificationSettings.challengeExpirySeconds), inline: true },
            { name: 'Retry cooldown', value: formatDuration(verificationSettings.cooldownSeconds), inline: true },
            { name: 'Autokick', value: `**${verificationSettings.autokickEnabled ? 'ON' : 'OFF'}** after **${formatDuration(verificationSettings.autokickSeconds)}**`, inline: false },
        ],
    ));
}

async function handleChallengeActiveSet(interaction, guildId) {
    const idsInput = interaction.options.getString('ids');
    if (!idsInput?.trim()) return interaction.editReply({ embeds: [userErrorEmbed('Please provide one or more challenge IDs in `ids`.')] });

    const challengeIds = parseIdList(idsInput);
    if (challengeIds.length < 1) return interaction.editReply({ embeds: [userErrorEmbed('Please provide one or more challenge IDs in `ids`.')] });

    const unknownChallengeIds = challengeIds.filter((challengeId) => !verificationChallenges[challengeId]);
    if (unknownChallengeIds.length > 0) return interaction.editReply({ embeds: [userErrorEmbed(`Unknown verification challenge ID${unknownChallengeIds.length === 1 ? '' : 's'}: ${unknownChallengeIds.join(', ')}`)] });

    const updatedSettings = await setActiveChallengeIds(guildId, challengeIds, interaction.user.id);
    return interaction.editReply(buildVerificationAdminSettingUpdated(
        'Active Challenges',
        `Active verification challenges set to: ${updatedSettings.activeChallengeIds.join(', ')}`,
    ));
}

async function handleChallengeDurationSetting(interaction, guildId, { title, updateSettings, secondsKey, successMessage }) {
    const timeInput = interaction.options.getString('time');
    if (!timeInput?.trim()) return interaction.editReply({ embeds: [userErrorEmbed('Please provide a time value, such as `90s`, `2m`, or `2 minutes`.')] });

    const durationSeconds = parseDurationSeconds(timeInput);
    if (!durationSeconds) return interaction.editReply({ embeds: [userErrorEmbed('Please provide a valid time, such as `90s`, `2m`, or `2 minutes`.')] });

    const updatedSettings = await updateSettings(guildId, durationSeconds, interaction.user.id);
    return interaction.editReply(buildVerificationAdminSettingUpdated(title, successMessage(formatDuration(updatedSettings[secondsKey]))));
}

async function handleChallengeView(interaction, verificationSettings, enabledChallengeIds) {
    const challengeId = String(interaction.options.getString('id') ?? '').trim();
    const fields = [
        { name: 'Guild mode', value: verificationSettings.mode, inline: true },
        { name: 'Active challenge IDs', value: buildActiveChallengeIdsValue(verificationSettings), inline: false },
        { name: 'Prompt expiry', value: formatDuration(verificationSettings.challengeExpirySeconds), inline: true },
        { name: 'Retry cooldown', value: formatDuration(verificationSettings.cooldownSeconds), inline: true },
        { name: 'Autokick', value: `**${verificationSettings.autokickEnabled ? 'ON' : 'OFF'}** after **${formatDuration(verificationSettings.autokickSeconds)}**`, inline: false },
        { name: 'Available challenge IDs', value: buildAvailableChallengeIdsValue(enabledChallengeIds), inline: false },
    ];

    if (challengeId) {
        const challenge = verificationChallenges[challengeId];
        if (!challenge) return interaction.editReply({ embeds: [userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`)] });
        fields.push(
            { name: 'Challenge title', value: challenge.title ?? 'Not set', inline: false },
            { name: 'Challenge description', value: challenge.description ?? 'Not set', inline: false },
            { name: 'Questions', value: (challenge.questions ?? []).map((question, index) => `${index + 1}. ${question.id} — ${question.label ?? 'Question'}`).join('\n') || 'None', inline: false },
        );
    }

    return interaction.editReply(buildVerificationAdminConfiguration(
        'Challenge View',
        challengeId ? `Challenge settings for **${challengeId}**.` : 'Global verification challenge settings.',
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
        return { error: userErrorEmbed('Please provide a valid question ID or 1-based question number.') };
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

function buildQuestionListResponse(challengeId, challenge) {
    const fields = (challenge.questions ?? []).map((question, index) => ({
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

async function handleVerificationQuestionCommand(interaction, guildId) {
    const action = interaction.options.getString('action', true);
    const { challengeId, error } = getKnownChallengeId(interaction, 'challenge');
    if (error) return interaction.editReply({ embeds: [error] });

    const challenge = verificationChallenges[challengeId];
    const verificationSettings = await getVerificationSettings(guildId);

    if (action === 'list') {
        return interaction.editReply(buildQuestionListResponse(challengeId, challenge));
    }

    const { question, error: questionError } = getKnownQuestion(interaction, challenge);
    if (questionError) return interaction.editReply({ embeds: [questionError] });

    const override = getQuestionOverride(verificationSettings, challengeId, question.id);
    const effectiveQuestion = mergeQuestionConfig(question, override);

    if (action === 'view') {
        return interaction.editReply(buildQuestionViewResponse(verificationSettings, challengeId, challenge, question));
    }

    if (action === 'set-text') {
        const value = String(interaction.options.getString('value') ?? '').trim();
        if (!value) return interaction.editReply({ embeds: [userErrorEmbed('Please provide question text in `value`.')] });
        const updatedSettings = await setQuestionTextOverride(guildId, challengeId, question.id, value, interaction.user.id);
        return interaction.editReply(buildQuestionViewResponse(updatedSettings, challengeId, challenge, question));
    }

    if (action === 'set-image-text') {
        if (effectiveQuestion.generatedImage?.type !== 'prompt-text') return interaction.editReply({ embeds: [userErrorEmbed('set-image-text is only valid for prompt-text questions.')] });
        const value = String(interaction.options.getString('value') ?? '').trim();
        if (!value) return interaction.editReply({ embeds: [userErrorEmbed('Please provide generated image text in `value`.')] });
        const updatedSettings = await setQuestionImageTextOverride(guildId, challengeId, question.id, value, interaction.user.id);
        return interaction.editReply(buildQuestionViewResponse(updatedSettings, challengeId, challenge, question));
    }

    if (action === 'set-answers') {
        if (effectiveQuestion.answer?.required !== true || effectiveQuestion.answer?.type !== 'text') return interaction.editReply({ embeds: [userErrorEmbed('set-answers is only valid for required text-answer questions.')] });
        const answers = parseAnswerOverrideList(interaction.options.getString('answers'));
        if (answers.length < 1) return interaction.editReply({ embeds: [userErrorEmbed('Please provide answers separated by commas or new lines.')] });
        const updatedSettings = await setQuestionAnswerOverrides(guildId, challengeId, question.id, answers, interaction.user.id);
        return interaction.editReply(buildQuestionViewResponse(updatedSettings, challengeId, challenge, question));
    }

    if (action === 'set-image-ids') {
        const role = String(interaction.options.getString('role') ?? '').trim();
        const imageIds = parseIdList(interaction.options.getString('ids'));
        if (!role || imageIds.length < 1) return interaction.editReply({ embeds: [userErrorEmbed('Please provide `role` and one or more IDs in `ids`.')] });
        const validationError = validatePendingQuestionImageIds(effectiveQuestion, role, imageIds);
        if (validationError) return interaction.editReply({ embeds: [userErrorEmbed(validationError)] });
        const updatedSettings = await setQuestionImageIds(guildId, challengeId, question.id, role, imageIds, interaction.user.id);
        return interaction.editReply(buildQuestionViewResponse(updatedSettings, challengeId, challenge, question));
    }

    if (action === 'clear-image-ids') {
        const role = String(interaction.options.getString('role') ?? '').trim();
        if (!role) return interaction.editReply({ embeds: [userErrorEmbed('Please provide an image role to clear.')] });
        if (!getAllowedRolesForQuestion(effectiveQuestion).includes(role)) return interaction.editReply({ embeds: [userErrorEmbed(`Role **${role}** is not valid for this question.`)] });
        const updatedSettings = await clearQuestionImageIds(guildId, challengeId, question.id, role, interaction.user.id);
        return interaction.editReply(buildQuestionViewResponse(updatedSettings, challengeId, challenge, question));
    }

    if (action === 'set-directions') {
        if (effectiveQuestion.generatedImage?.type !== 'gallery-rotation-alignment') return interaction.editReply({ embeds: [userErrorEmbed('set-directions is only valid for rotation-alignment questions.')] });
        const imageIds = parseIdList(interaction.options.getString('ids'));
        let degrees;
        try { degrees = parseDegreeList(interaction.options.getString('degrees')); }
        catch (err) { return interaction.editReply({ embeds: [userErrorEmbed(err.message)] }); }
        if (imageIds.length < 1 || degrees.length < 1) return interaction.editReply({ embeds: [userErrorEmbed('Please provide image IDs and valid degrees.')] });
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
        const updatedSettings = await setQuestionImageDirections(guildId, challengeId, question.id, imageIds, degrees, interaction.user.id);
        return interaction.editReply(buildQuestionViewResponse(updatedSettings, challengeId, challenge, question));
    }

    if (action === 'clear-directions') {
        if (effectiveQuestion.generatedImage?.type !== 'gallery-rotation-alignment') return interaction.editReply({ embeds: [userErrorEmbed('clear-directions is only valid for rotation-alignment questions.')] });
        const imageIds = parseIdList(interaction.options.getString('ids'));
        if (imageIds.length < 1) return interaction.editReply({ embeds: [userErrorEmbed('Please provide image IDs in `ids`.')] });
        const updatedSettings = await clearQuestionImageDirections(guildId, challengeId, question.id, imageIds, interaction.user.id);
        return interaction.editReply(buildQuestionViewResponse(updatedSettings, challengeId, challenge, question));
    }

    if (action === 'clear-field') {
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

    return interaction.editReply({ embeds: [userErrorEmbed('Unknown question action.')] });
}

const CHALLENGE_DURATION_COMMANDS = {
    timer: {
        title: 'Challenge Timer',
        updateSettings: setChallengeExpirySeconds,
        secondsKey: 'challengeExpirySeconds',
        successMessage: (duration) => `Updated challenge expiry timer to **${duration}**.`,
    },
    cooldown: {
        title: 'Retry Cooldown',
        updateSettings: setCooldownSeconds,
        secondsKey: 'cooldownSeconds',
        successMessage: (duration) => `Updated verification retry cooldown to **${duration}**.`,
    },
};

async function handleVerificationChallengeCommand(interaction, guildId) {
    const action = interaction.options.getString('action', true);
    const verificationSettings = await getVerificationSettings(guildId);
    const enabledChallengeIds = getEnabledVerificationChallenges({ verification: verificationSettings }).map((challenge) => challenge.id);

    switch (action) {
        case 'list':
            return handleChallengeList(interaction, verificationSettings, enabledChallengeIds);
        case 'active-set':
            return handleChallengeActiveSet(interaction, guildId);
        case 'timer':
        case 'cooldown':
            return handleChallengeDurationSetting(interaction, guildId, CHALLENGE_DURATION_COMMANDS[action]);
        case 'view':
            return handleChallengeView(interaction, verificationSettings, enabledChallengeIds);
        default:
            return interaction.editReply({ embeds: [userErrorEmbed('Unknown challenge action.')] });
    }
}

async function handleVerificationPostCommand(interaction, guildId) {
    const verificationSettings = await getVerificationSettings(guildId);
    if (verificationSettings.mode === VERIFICATION_MODES.halt) {
        return interaction.editReply({ embeds: [userErrorEmbed('Verification is halted in the Warden settings.')] });
    }

    const action = interaction.options.getString('action', true);
    const targetChannel = interaction.options.getChannel('channel', true);

    if (!targetChannel?.isTextBased?.()) {
        return interaction.editReply({ embeds: [userErrorEmbed('Please provide a valid text channel.')] });
    }

    const welcomeEmbed = buildWelcomeEmbed(verificationSettings);
    const components = buildVerificationPostComponents();

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
            return interaction.editReply({ embeds: [userErrorEmbed('Please provide `message_id` for `action:refresh`.')] });
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

    return interaction.editReply({ embeds: [userErrorEmbed('Unknown post action.')] });
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
    const action = interaction.options.getString('action');
    const challengeId = String(interaction.options.getString('challenge') ?? '').trim();
    const question = getQuestionForAutocomplete(interaction);
    if (!question) return [];

    const imagePool = getQuestionImagePool(question);
    if (!imagePool) return [];

    if (action === 'set-directions' || action === 'clear-directions') {
        const verificationSettings = await getVerificationSettings(interaction.guild?.id);
        const overrideIds = getQuestionOverride(verificationSettings, challengeId, question.id).generatedImage?.imageIds ?? {};
        const configuredIds = [...Object.values(overrideIds).flat(), ...Object.values(question.generatedImage?.imageIds ?? {}).flat()];
        if (configuredIds.length > 0) return buildDelimitedAutocompleteChoices(focusedValue, [...new Set(configuredIds)]);
    }

    return buildDelimitedAutocompleteChoices(focusedValue, getImagePoolIds(imagePool));
}

async function buildContextualIdsAutocompleteChoices(interaction, focusedValue) {
    const subcommand = interaction.options.getSubcommand(false);
    if (subcommand === 'question') return buildQuestionIdsAutocompleteChoices(interaction, focusedValue);
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
        const subcommand = interaction.options.getSubcommand(false);
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'challenge' || focusedOption.name === 'id') {
            return interaction.respond(buildChallengeIdAutocompleteChoices(focusedOption.value));
        }

        if (subcommand === 'question' && focusedOption.name === 'question') {
            return interaction.respond(buildQuestionAutocompleteChoices(interaction, focusedOption.value));
        }

        if (focusedOption.name === 'ids') {
            return interaction.respond(await buildContextualIdsAutocompleteChoices(interaction, focusedOption.value));
        }
    }
    catch (err) {
        console.error('Failed to build verification autocomplete choices:', err);
    }

    return interaction.respond([]);
}

module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName('verification')
        .setDescription('Manage Warden verification')
        .setDefaultMemberPermissions(Discord.PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand => subcommand
            .setName('post')
            .setDescription('Send or refresh a verification post')
            .addStringOption(option => option
                .setName('action')
                .setDescription('Post action to run')
                .setRequired(true)
                .addChoices(
                    { name: 'Send new verification post', value: 'send' },
                    { name: 'Refresh existing verification post', value: 'refresh' },
                ),
            )
            .addChannelOption(option => option
                .setName('channel')
                .setDescription('Verification channel')
                .addChannelTypes(
                    Discord.ChannelType.GuildText,
                    Discord.ChannelType.GuildAnnouncement,
                )
                .setRequired(true),
            )
            .addStringOption(option => option
                .setName('message_id')
                .setDescription('Existing verification post message ID to refresh')
                .setRequired(false),
            ),
        )
        .addSubcommand(subcommand => addStringOption(
            subcommand
                .setName('mode')
                .setDescription('Set the persisted verification mode'),
            'setting',
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
                addStringOption(
                    subcommand
                        .setName('autokick')
                        .setDescription('Manage verification autokick'),
                    'action',
                    'Autokick action to run',
                    {
                        choices: [
                            { name: 'Show current status', value: 'status' },
                            { name: 'Set autokick state', value: 'set' },
                        ],
                    },
                ),
                'state',
                'Whether verification autokick is enabled',
                {
                    required: false,
                    choices: [
                        { name: 'On', value: 'on' },
                        { name: 'Off', value: 'off' },
                    ],
                },
            ),
            'timer',
            'Autokick delay, such as 10m, 600s, or 10 minutes',
            { required: false },
        ))
        .addSubcommand(subcommand => {
            let builder = subcommand
                .setName('challenge')
                .setDescription('Manage verification challenges');

            builder = addStringOption(builder, 'action', 'Challenge setting to inspect or update', {
                choices: [
                    { name: 'List configured challenge info', value: 'list' },
                    { name: 'Set active challenge list', value: 'active-set' },
                    { name: 'Set prompt expiry timer', value: 'timer' },
                    { name: 'Set retry cooldown timer', value: 'cooldown' },
                    { name: 'View challenge settings', value: 'view' },
                ],
            });
            builder = addStringOption(builder, 'id', 'Challenge ID', { required: false, autocomplete: true });
            builder = addStringOption(builder, 'ids', 'Challenge IDs for active-set. Separate with commas or spaces.', { required: false, autocomplete: true });
            builder = addStringOption(builder, 'time', 'Duration such as 90s, 2m, or 2 minutes', { required: false });

            return builder;
        })

        .addSubcommand(subcommand => {
            let builder = subcommand
                .setName('question')
                .setDescription('Manage verification question config');

            builder = addStringOption(builder, 'action', 'Question action to run', {
                choices: [
                    { name: 'List questions', value: 'list' },
                    { name: 'View question', value: 'view' },
                    { name: 'Set question text', value: 'set-text' },
                    { name: 'Set prompt image text', value: 'set-image-text' },
                    { name: 'Set accepted answers', value: 'set-answers' },
                    { name: 'Set image IDs', value: 'set-image-ids' },
                    { name: 'Clear image IDs', value: 'clear-image-ids' },
                    { name: 'Set image directions', value: 'set-directions' },
                    { name: 'Clear image directions', value: 'clear-directions' },
                    { name: 'Clear override field', value: 'clear-field' },
                ],
            });
            builder = addStringOption(builder, 'challenge', 'Challenge ID', { autocomplete: true });
            builder = addStringOption(builder, 'question', 'Question ID or 1-based number', { required: false, autocomplete: true });
            builder = addStringOption(builder, 'field', 'Override field to clear', {
                required: false,
                choices: [
                    { name: 'Text', value: 'text' },
                    { name: 'Image text', value: 'image-text' },
                    { name: 'Answers', value: 'answers' },
                    { name: 'Image IDs', value: 'image-ids' },
                    { name: 'Directions', value: 'directions' },
                    { name: 'All', value: 'all' },
                ],
            });
            builder = addStringOption(builder, 'role', 'Image role', {
                required: false,
                choices: [
                    { name: 'Solution', value: 'solution' },
                    { name: 'Control', value: 'control' },
                    { name: 'Center', value: 'center' },
                    { name: 'Outer', value: 'outer' },
                ],
            });
            builder = addStringOption(builder, 'ids', 'Image IDs separated by commas or spaces', { required: false, autocomplete: true });
            builder = addStringOption(builder, 'value', 'Text value for the selected action', { required: false });
            builder = addStringOption(builder, 'answers', 'Answers separated by commas or new lines', { required: false });
            builder = addStringOption(builder, 'degrees', 'Degrees like 0,45,90,135,180,225,270,315', { required: false });
            return builder;
        }),
    async autocomplete(interaction) {
        return handleVerificationAutocomplete(interaction);
    },
    async execute(interaction) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

        try {
            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guild?.id;

            if (subcommand === 'mode') {
                return handleVerificationModeCommand(interaction, guildId);
            }

            if (subcommand === 'autokick') {
                return handleVerificationAutokickCommand(interaction, guildId);
            }

            if (subcommand === 'challenge') {
                return handleVerificationChallengeCommand(interaction, guildId);
            }

            if (subcommand === 'post') {
                return handleVerificationPostCommand(interaction, guildId);
            }

            if (subcommand === 'question') {
                return handleVerificationQuestionCommand(interaction, guildId);
            }

            return interaction.editReply({ embeds: [userErrorEmbed('Unknown verification command.')] });
        }
        catch (err) {
            console.log(err);

            await botLog(interaction.guild, new Discord.EmbedBuilder()
                .setTitle('⛔ Verification command failed')
                .setDescription('```' + err.stack + '```')
                , 2, 'error'
            ).catch((logErr) => console.error('Failed to log verification command error:', logErr));

            return interaction.editReply({ embeds: [userErrorEmbed('Failed to run the verification command. Please try again later.')] });
        }
    },
};
