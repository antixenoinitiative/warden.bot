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
const { getVerificationImagePool } = require('../verification/verificationImagePools');
const {
    VERIFICATION_MODES,
    getVerificationSettings,
    setVerificationMode,
    setActiveChallengeIds,
    setChallengeExpirySeconds,
    setCooldownSeconds,
    setAutokickSettings,
    setChallengePromptOverride,
    setChallengeAnswerOverrides,
    setChallengeSolutionImageIds,
    setChallengeControlImageIds,
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

function parseAnswerOverrideList(input) {
    return String(input ?? '')
        .split(',')
        .map((answer) => answer.trim())
        .filter(Boolean);
}

function formatDuration(seconds) {
    if (seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? '' : 's'}`;
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

function getSingleKnownChallengeId(interaction) {
    const challengeId = String(interaction.options.getString('id') ?? '').trim();

    if (!challengeId) {
        return { error: userErrorEmbed('Please provide a challenge ID in `id`.') };
    }

    if (!verificationChallenges[challengeId]) {
        return { error: userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`) };
    }

    return { challengeId };
}

function getChallengeOverrideSummary(verificationSettings, challengeId) {
    const override = verificationSettings.challengeOverrides?.[challengeId];
    return override?.updatedAt
        ? `Last updated: ${override.updatedAt}${override.updatedBy ? ` by <@${override.updatedBy}>` : ''}`
        : 'Last updated: never';
}

function getChallengeOverrideFields(verificationSettings, challengeId) {
    const override = verificationSettings.challengeOverrides?.[challengeId];
    const prompt = override?.prompt || 'Not set';
    const answers = override?.answers?.length
        ? override.answers.map((answer) => `- ${answer}`).join('\n')
        : 'Not set';
    const solutionImageIds = override?.solutionImageIds?.length
        ? override.solutionImageIds.map((imageId) => `- ${imageId}`).join('\n')
        : 'Not set';
    const controlImageIds = override?.controlImageIds?.length
        ? override.controlImageIds.map((imageId) => `- ${imageId}`).join('\n')
        : 'Not set';

    return [
        {
            name: 'Prompt',
            value: prompt,
            inline: false,
        },
        {
            name: 'Answers',
            value: answers,
            inline: false,
        },
        {
            name: 'Solution image IDs',
            value: solutionImageIds,
            inline: false,
        },
        {
            name: 'Control image IDs',
            value: controlImageIds,
            inline: false,
        },
    ];
}

function buildChallengeOverrideSummaryResponse(title, description, verificationSettings, challengeId, status) {
    return buildVerificationAdminSummary(
        title,
        description,
        getChallengeOverrideSummary(verificationSettings, challengeId),
        status,
        { fields: getChallengeOverrideFields(verificationSettings, challengeId) },
    );
}

function buildWelcomeEmbed(verificationSettings) {
    const embed = buildVerificationPublicEmbed('welcomeEmbed');

    if (verificationSettings?.autokickEnabled) {
        const autoKickWelcomeFieldConfig = verificationEmbedConfig.autoKickWelcomeField ?? {};
        const replacements = {
            autokickTimer: formatDuration(verificationSettings.autokickSeconds),
        };

        applyFieldToEmbed(embed, autoKickWelcomeFieldConfig, replacements);
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
    if (!channel?.isTextBased?.()) {
        return null;
    }

    return channel.messages.fetch(messageId).catch(() => null);
}

function addStringOption(commandBuilder, name, description, { required = true, choices, autocomplete = false } = {}) {
    return commandBuilder.addStringOption(option => {
        const configuredOption = option
            .setName(name)
            .setDescription(description)
            .setRequired(required);

        if (autocomplete) {
            configuredOption.setAutocomplete(true);
        }

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

        if (!state) {
            return interaction.editReply({ embeds: [userErrorEmbed('Please choose `state:on` or `state:off` for `action:set`.')] });
        }
        const timerInput = interaction.options.getString('timer');
        const durationSeconds = timerInput ? parseDurationSeconds(timerInput) : undefined;

        if (timerInput && !durationSeconds) {
            return interaction.editReply({ embeds: [userErrorEmbed('Please provide a valid autokick timer, such as `600s`, `10m`, or `10 minutes`.')] });
        }

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
            {
                name: 'Active IDs',
                value: buildActiveChallengeIdsValue(verificationSettings),
                inline: false,
            },
            {
                name: 'Available IDs',
                value: buildAvailableChallengeIdsValue(enabledChallengeIds),
                inline: false,
            },
            {
                name: 'Prompt expiry',
                value: formatDuration(verificationSettings.challengeExpirySeconds),
                inline: true,
            },
            {
                name: 'Retry cooldown',
                value: formatDuration(verificationSettings.cooldownSeconds),
                inline: true,
            },
            {
                name: 'Autokick',
                value: `**${verificationSettings.autokickEnabled ? 'ON' : 'OFF'}** after **${formatDuration(verificationSettings.autokickSeconds)}**`,
                inline: false,
            },
        ],
    ));
}

async function handleChallengeActiveSet(interaction, guildId) {
    const idsInput = interaction.options.getString('ids');
    if (!idsInput?.trim()) {
        return interaction.editReply({ embeds: [userErrorEmbed('Please provide one or more challenge IDs in `ids`.')] });
    }

    const challengeIds = parseIdList(idsInput);
    if (challengeIds.length < 1) {
        return interaction.editReply({ embeds: [userErrorEmbed('Please provide one or more challenge IDs in `ids`.')] });
    }

    const unknownChallengeIds = challengeIds.filter((challengeId) => !verificationChallenges[challengeId]);
    if (unknownChallengeIds.length > 0) {
        return interaction.editReply({ embeds: [userErrorEmbed(`Unknown verification challenge ID${unknownChallengeIds.length === 1 ? '' : 's'}: ${unknownChallengeIds.join(', ')}`)] });
    }

    const updatedSettings = await setActiveChallengeIds(guildId, challengeIds, interaction.user.id);
    return interaction.editReply(buildVerificationAdminSettingUpdated(
        'Active Challenges',
        `Active verification challenges set to: ${updatedSettings.activeChallengeIds.join(', ')}`,
    ));
}

async function handleChallengeDurationSetting(interaction, guildId, { title, updateSettings, secondsKey, successMessage }) {
    const timeInput = interaction.options.getString('time');
    if (!timeInput?.trim()) {
        return interaction.editReply({ embeds: [userErrorEmbed('Please provide a time value, such as `90s`, `2m`, or `2 minutes`.')] });
    }

    const durationSeconds = parseDurationSeconds(timeInput);
    if (!durationSeconds) {
        return interaction.editReply({ embeds: [userErrorEmbed('Please provide a valid time, such as `90s`, `2m`, or `2 minutes`.')] });
    }

    const updatedSettings = await updateSettings(guildId, durationSeconds, interaction.user.id);
    return interaction.editReply(buildVerificationAdminSettingUpdated(
        title,
        successMessage(formatDuration(updatedSettings[secondsKey])),
    ));
}

async function handleChallengeOverridesView(interaction, verificationSettings) {
    const { challengeId, error } = getSingleKnownChallengeId(interaction);
    if (error) {
        return interaction.editReply({ embeds: [error] });
    }

    return interaction.editReply(buildChallengeOverrideSummaryResponse(
        'Challenge Overrides',
        `Overrides for **${challengeId}**:`,
        verificationSettings,
        challengeId,
        'info',
    ));
}

async function handleChallengePrompt(interaction, guildId) {
    const { challengeId, error } = getSingleKnownChallengeId(interaction);
    if (error) {
        return interaction.editReply({ embeds: [error] });
    }

    const prompt = String(interaction.options.getString('prompt') ?? '').trim();
    if (!prompt) {
        return interaction.editReply({ embeds: [userErrorEmbed('Please provide non-empty prompt text in `prompt`.')] });
    }

    const updatedSettings = await setChallengePromptOverride(guildId, challengeId, prompt, interaction.user.id);
    return interaction.editReply(buildChallengeOverrideSummaryResponse(
        'Challenge Prompt Updated',
        `Prompt override updated for **${challengeId}**.`,
        updatedSettings,
        challengeId,
        'success',
    ));
}

function getChallengeImagePool(challengeId) {
    const challenge = verificationChallenges[challengeId];
    const step = challenge?.steps?.[0];
    const imagePoolId = step?.imagePoolId ?? challenge?.imagePoolId;

    if (!imagePoolId) {
        return { error: userErrorEmbed(`Challenge **${challengeId}** does not define an image pool.`) };
    }

    const imagePool = getVerificationImagePool(imagePoolId);

    if (!imagePool) {
        return { error: userErrorEmbed(`Unknown image pool **${imagePoolId}** for challenge **${challengeId}**.`) };
    }

    return { challenge, step, imagePool, imagePoolId };
}

function getImagePoolIds(imagePool) {
    return [...new Set((imagePool.images ?? [])
        .map((image) => String(image.id ?? '').trim())
        .filter(Boolean))];
}

function validateImageIdsInPool(imageIds, imagePool) {
    const validImageIds = new Set(getImagePoolIds(imagePool));
    return imageIds.filter((imageId) => !validImageIds.has(imageId));
}

function findImageIdOverlap(leftIds, rightIds) {
    const right = new Set(rightIds);
    return leftIds.filter((id) => right.has(id));
}

function validateGalleryImageCapacity(challenge, step, solutionImageIds, controlImageIds) {
    const gallerySize = Number(step?.gallerySize ?? challenge.gallerySize ?? 6);
    const solutionRange = step?.solutionImageCount ?? challenge.solutionImageCount ?? { min: 1, max: 1 };
    const solutionMin = Math.ceil(Number(solutionRange.min ?? 1));
    const solutionMax = Math.floor(Number(solutionRange.max ?? 1));
    const maxControlImageRepeats = Math.floor(Number(step?.maxControlImageRepeats ?? challenge.maxControlImageRepeats ?? 1));

    if (!Number.isInteger(gallerySize) || gallerySize < 1) {
        return `Invalid gallery size for challenge **${challenge.id}**.`;
    }

    if (solutionImageIds.length < 1) {
        return 'Please provide at least one solution image ID.';
    }

    if (controlImageIds.length < 1) {
        return 'Please provide at least one control image ID.';
    }

    if (!Number.isInteger(solutionMin) || !Number.isInteger(solutionMax) || solutionMin < 1 || solutionMax < solutionMin) {
        return `Invalid solution image count range for challenge **${challenge.id}**.`;
    }

    if (!Number.isInteger(maxControlImageRepeats) || maxControlImageRepeats < 1) {
        return `Invalid maxControlImageRepeats for challenge **${challenge.id}**.`;
    }

    const maxRequiredControlSlots = gallerySize - solutionMin;
    const controlCapacity = controlImageIds.length * maxControlImageRepeats;

    if (controlCapacity < maxRequiredControlSlots) {
        return `Not enough control image capacity. This challenge may need up to **${maxRequiredControlSlots}** control slots, but the configured controls provide only **${controlCapacity}** slots with maxControlImageRepeats=${maxControlImageRepeats}.`;
    }

    return undefined;
}

async function handleChallengeAnswers(interaction, guildId) {
    const { challengeId, error } = getSingleKnownChallengeId(interaction);
    if (error) {
        return interaction.editReply({ embeds: [error] });
    }

    const answers = parseAnswerOverrideList(interaction.options.getString('answers'));
    if (answers.length < 1) {
        return interaction.editReply({ embeds: [userErrorEmbed('Please provide at least one answer. Multiple answers can be separated by commas.')] });
    }

    const updatedSettings = await setChallengeAnswerOverrides(guildId, challengeId, answers, interaction.user.id);
    return interaction.editReply(buildChallengeOverrideSummaryResponse(
        'Challenge Answers Updated',
        `Answer overrides set for **${challengeId}**.`,
        updatedSettings,
        challengeId,
        'success',
    ));
}


async function handleChallengeImageIds(interaction, guildId, imageRole) {
    const { challengeId, error } = getSingleKnownChallengeId(interaction);
    if (error) {
        return interaction.editReply({ embeds: [error] });
    }

    const idsInput = interaction.options.getString('ids');
    if (!idsInput?.trim()) {
        return interaction.editReply({ embeds: [userErrorEmbed(`Please provide one or more ${imageRole} image IDs in \`ids\`.`)] });
    }

    const imageIds = parseIdList(idsInput);
    if (imageIds.length < 1) {
        return interaction.editReply({ embeds: [userErrorEmbed(`Please provide one or more ${imageRole} image IDs in \`ids\`.`)] });
    }

    const { challenge, step, imagePool, error: poolError } = getChallengeImagePool(challengeId);
    if (poolError) {
        return interaction.editReply({ embeds: [poolError] });
    }

    const unknownImageIds = validateImageIdsInPool(imageIds, imagePool);
    if (unknownImageIds.length > 0) {
        return interaction.editReply({ embeds: [userErrorEmbed(`Unknown image ID${unknownImageIds.length === 1 ? '' : 's'} for this challenge image pool: ${unknownImageIds.join(', ')}`)] });
    }

    const currentSettings = await getVerificationSettings(guildId);
    const currentOverride = currentSettings.challengeOverrides?.[challengeId] ?? {};
    const currentSolutionImageIds = currentOverride.solutionImageIds ?? [];
    const currentControlImageIds = currentOverride.controlImageIds ?? [];

    const nextSolutionImageIds = imageRole === 'solution'
        ? imageIds
        : currentSolutionImageIds;

    const nextControlImageIds = imageRole === 'control'
        ? imageIds
        : currentControlImageIds;

    const overlap = findImageIdOverlap(nextSolutionImageIds, nextControlImageIds);
    if (overlap.length > 0) {
        return interaction.editReply({ embeds: [userErrorEmbed(`Image ID${overlap.length === 1 ? '' : 's'} cannot be both solution and control: ${overlap.join(', ')}`)] });
    }

    if (nextSolutionImageIds.length > 0 && nextControlImageIds.length > 0) {
        const capacityError = validateGalleryImageCapacity(challenge, step, nextSolutionImageIds, nextControlImageIds);
        if (capacityError) {
            return interaction.editReply({ embeds: [userErrorEmbed(capacityError)] });
        }
    }

    const updatedSettings = imageRole === 'solution'
        ? await setChallengeSolutionImageIds(guildId, challengeId, imageIds, interaction.user.id)
        : await setChallengeControlImageIds(guildId, challengeId, imageIds, interaction.user.id);

    return interaction.editReply(buildChallengeOverrideSummaryResponse(
        imageRole === 'solution' ? 'Challenge Solution Images Updated' : 'Challenge Control Images Updated',
        `${imageRole === 'solution' ? 'Solution' : 'Control'} image IDs updated for **${challengeId}**.`,
        updatedSettings,
        challengeId,
        'success',
    ));
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
        case 'overrides-view':
            return handleChallengeOverridesView(interaction, verificationSettings);
        case 'prompt':
            return handleChallengePrompt(interaction, guildId);
        case 'answers':
            return handleChallengeAnswers(interaction, guildId);
        case 'solution-images':
            return handleChallengeImageIds(interaction, guildId, 'solution');
        case 'control-images':
            return handleChallengeImageIds(interaction, guildId, 'control');
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

function buildContextualIdsAutocompleteChoices(interaction, focusedValue) {
    const action = interaction.options.getString('action');

    if (action === 'solution-images' || action === 'control-images') {
        const challengeId = String(interaction.options.getString('id') ?? '').trim();
        if (!challengeId || !verificationChallenges[challengeId]) {
            return [];
        }

        const { imagePool } = getChallengeImagePool(challengeId);
        if (!imagePool) {
            return [];
        }

        return buildDelimitedAutocompleteChoices(focusedValue, getImagePoolIds(imagePool));
    }

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
        if (subcommand !== 'challenge') {
            return interaction.respond([]);
        }

        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'id') {
            return interaction.respond(buildChallengeIdAutocompleteChoices(focusedOption.value));
        }

        if (focusedOption.name === 'ids') {
            return interaction.respond(buildContextualIdsAutocompleteChoices(interaction, focusedOption.value));
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
        .addSubcommand(subcommand => addStringOption(
            addStringOption(
                addStringOption(
                    addStringOption(
                        addStringOption(
                            addStringOption(
                                subcommand
                                    .setName('challenge')
                                    .setDescription('Manage verification challenges'),
                                'action',
                                'Challenge setting to inspect or update',
                                {
                                    choices: [
                                        { name: 'List configured challenge info', value: 'list' },
                                        { name: 'Set active challenge list', value: 'active-set' },
                                        { name: 'Set prompt expiry timer', value: 'timer' },
                                        { name: 'Set retry cooldown timer', value: 'cooldown' },
                                        { name: 'View prompt and answer entries', value: 'overrides-view' },
                                        { name: 'Set prompt entry', value: 'prompt' },
                                        { name: 'Set answer entry', value: 'answers' },
                                        { name: 'Set solution image IDs', value: 'solution-images' },
                                        { name: 'Set control image IDs', value: 'control-images' },
                                    ],
                                },
                            ),
                            'id',
                            'Challenge ID',
                            { required: false, autocomplete: true },
                        ),
                        'ids',
                        'Comma/space IDs. active-set: challenges; image actions: images.',
                        { required: false, autocomplete: true },
                    ),
                    'time',
                    'Duration such as 90s, 2m, or 2 minutes',
                    { required: false },
                ),
                'prompt',
                'Configured prompt text',
                { required: false },
            ),
            'answers',
            'One answer, or multiple answers separated by commas',
            { required: false },
        )),
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
