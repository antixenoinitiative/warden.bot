const Discord = require('discord.js');
const config = require('../../../config.json');
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

function parseChallengeIdList(input) {
    return String(input ?? '')
        .split(/[\s,]+/)
        .map((challengeId) => challengeId.trim())
        .filter(Boolean);
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
            timer: formatDuration(verificationSettings.autokickSeconds),
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

    const challengeIds = parseChallengeIdList(idsInput);
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
        default:
            return interaction.editReply({ embeds: [userErrorEmbed('Unknown challenge action.')] });
    }
}

async function handleVerificationPostCommand(interaction, guildId, verificationConfig) {
    const verificationSettings = await getVerificationSettings(guildId);
    if (verificationSettings.mode === VERIFICATION_MODES.halt) {
        return interaction.editReply({ embeds: [userErrorEmbed('Verification is halted in the Warden settings.')] });
    }

    const configuredChannelId = verificationConfig?.channelId;
    const optionChannel = interaction.options.getChannel('channel');
    const messageId = interaction.options.getString('message_id');

    const welcomeEmbed = buildWelcomeEmbed(verificationSettings);
    const components = buildVerificationPostComponents();

    if (messageId) {
        const message = await fetchVerificationMessage(interaction, messageId);
        if (!message) {
            return interaction.editReply({ embeds: [userErrorEmbed('Could not find that verification post. Please check the message ID.')] });
        }

        await message.edit({ embeds: [welcomeEmbed], components });
        return interaction.editReply(buildVerificationAdminActionCompleted(
            'Post Refreshed',
            `Verification post refreshed successfully: ${message.url}`,
        ));
    }

    const targetChannelId = optionChannel?.id ?? configuredChannelId;
    if (!targetChannelId) {
        return interaction.editReply({ embeds: [userErrorEmbed('No verification channel is configured. Please provide a channel option.')] });
    }

    const targetChannel = optionChannel ?? await interaction.guild.channels.fetch(targetChannelId);
    if (!targetChannel || !targetChannel.isTextBased()) {
        return interaction.editReply({ embeds: [userErrorEmbed('The verification channel could not be found or is not a text channel.')] });
    }

    const message = await targetChannel.send({ embeds: [welcomeEmbed], components });

    return interaction.editReply(buildVerificationAdminActionCompleted(
        'Post Posted',
        `Verification post posted successfully in ${String(targetChannel)}. ${message.url}`,
    ));
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

    return getChallengeIdChoices()
        .filter((challengeId) => !existingIds.has(challengeId))
        .filter((challengeId) => !normalizedCurrentToken || challengeId.toLowerCase().includes(normalizedCurrentToken))
        .slice(0, 25)
        .map((challengeId) => {
            const value = `${prefix}${challengeId}`;
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
            return interaction.respond(buildChallengeIdsAutocompleteChoices(focusedOption.value));
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
        .addSubcommand(subcommand => addStringOption(
            subcommand
                .setName('post')
                .setDescription('Post a new verification post or refresh one by message ID')
                .addChannelOption(option => option
                    .setName('channel')
                    .setDescription('Channel to post the verification post in')
                    .addChannelTypes(
                        Discord.ChannelType.GuildText,
                        Discord.ChannelType.GuildAnnouncement,
                    )
                    .setRequired(false),
                ),
            'message_id',
            'Existing verification post message ID to refresh',
            { required: false },
        ))
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
                                    ],
                                },
                            ),
                            'id',
                            'Challenge ID',
                            { required: false, autocomplete: true },
                        ),
                        'ids',
                        'Challenge IDs separated by commas or spaces',
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
            const verificationConfig = config.Warden?.verification;
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
                return handleVerificationPostCommand(interaction, guildId, verificationConfig);
            }

            return interaction.editReply({ embeds: [userErrorEmbed('Unknown verification command.')] });
        }
        catch (err) {
            console.log(err);
            botLog(interaction.guild, new Discord.EmbedBuilder()
                .setTitle('⛔ Verification command failed')
                .setDescription('```' + err.stack + '```')
                , 2, 'error'
            );

            return interaction.editReply({ embeds: [userErrorEmbed('Failed to run the verification command. Please try again later.')] });
        }
    },
};
