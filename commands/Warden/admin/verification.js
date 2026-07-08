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
    clearChallengePromptOverride,
    setChallengeAnswerOverrides,
    clearChallengeAnswerOverrides,
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
        return { error: userErrorEmbed('Please provide a challenge ID.') };
    }

    if (!verificationChallenges[challengeId]) {
        return { error: userErrorEmbed(`Unknown verification challenge ID: ${challengeId}`) };
    }

    return { challengeId };
}

async function sendVerificationStaffWarning(guild, title, description) {
    await botLog(guild, new Discord.EmbedBuilder()
        .setTitle(title)
        .setDescription(description),
    1, 'staff').catch((err) => console.error('Failed to send verification staff warning:', err));
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

function addStringOption(commandBuilder, name, description, { required = true, choices } = {}) {
    return commandBuilder.addStringOption(option => {
        const configuredOption = option
            .setName(name)
            .setDescription(description)
            .setRequired(required);

        return choices ? configuredOption.addChoices(...choices) : configuredOption;
    });
}

function addChallengeIdOption(commandBuilder) {
    return addStringOption(commandBuilder, 'id', 'Challenge ID');
}

function addDurationOption(commandBuilder) {
    return addStringOption(commandBuilder, 'time', 'Duration such as 90s, 2m, or 2 minutes');
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

async function handleVerificationAutokickCommand(interaction, subcommand, guildId) {
    const verificationSettings = await getVerificationSettings(guildId);

    if (subcommand === 'status') {
        return interaction.editReply(buildVerificationAdminStatus(
            'Autokick',
            `Verification autokick is currently **${verificationSettings.autokickEnabled ? 'ON' : 'OFF'}** with a timer of **${formatDuration(verificationSettings.autokickSeconds)}**.`,
        ));
    }

    if (subcommand === 'set') {
        const state = interaction.options.getString('state', true);
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
    const challengeIds = parseChallengeIdList(interaction.options.getString('ids', true));
    if (challengeIds.length < 1) {
        return interaction.editReply({ embeds: [userErrorEmbed('Please provide at least one challenge ID. To stop serving challenges, use `/verification mode halt` or `/verification mode one-click` instead.')] });
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
    const durationSeconds = parseDurationSeconds(interaction.options.getString('time', true));
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

async function handleChallengePromptSet(interaction, guildId) {
    const { challengeId, error } = getSingleKnownChallengeId(interaction);
    if (error) {
        return interaction.editReply({ embeds: [error] });
    }

    const prompt = String(interaction.options.getString('prompt', true) ?? '').trim();
    if (!prompt) {
        return interaction.editReply({ embeds: [userErrorEmbed('Please provide prompt text for `prompt-set`.')] });
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

async function handleChallengePromptClear(interaction, guildId) {
    const { challengeId, error } = getSingleKnownChallengeId(interaction);
    if (error) {
        return interaction.editReply({ embeds: [error] });
    }

    const updatedSettings = await clearChallengePromptOverride(guildId, challengeId, interaction.user.id);
    await sendVerificationStaffWarning(
        interaction.guild,
        'Verification challenge prompt cleared',
        `The prompt of **${challengeId}** was cleared by ${interaction.user}. If this challenge requires a configured prompt, set it again with \`/verification challenge prompt-set id:${challengeId}\`.`,
    );
    return interaction.editReply(buildChallengeOverrideSummaryResponse(
        'Challenge Prompt Cleared',
        `Prompt override cleared for **${challengeId}**. Staff warning sent.`,
        updatedSettings,
        challengeId,
        'warning',
    ));
}

async function handleChallengeAnswersSet(interaction, guildId) {
    const { challengeId, error } = getSingleKnownChallengeId(interaction);
    if (error) {
        return interaction.editReply({ embeds: [error] });
    }

    const answers = parseAnswerOverrideList(interaction.options.getString('answers', true));
    if (answers.length < 1) {
        return interaction.editReply({ embeds: [userErrorEmbed('Please provide a complete answer list for `answers-set`, separated by commas. Spaces inside an answer are allowed.')] });
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

async function handleChallengeAnswersClear(interaction, guildId) {
    const { challengeId, error } = getSingleKnownChallengeId(interaction);
    if (error) {
        return interaction.editReply({ embeds: [error] });
    }

    const updatedSettings = await clearChallengeAnswerOverrides(guildId, challengeId, interaction.user.id);
    await sendVerificationStaffWarning(
        interaction.guild,
        'Verification challenge answer list cleared',
        `Answer list for **${challengeId}** was cleared by ${interaction.user}. If this challenge requires configured answers, set them again with \`/verification challenge answers-set id:${challengeId}\`.`,
    );
    return interaction.editReply(buildChallengeOverrideSummaryResponse(
        'Challenge Answers Cleared',
        `Answer list cleared for **${challengeId}**. Staff warning sent.`,
        updatedSettings,
        challengeId,
        'warning',
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

async function handleVerificationChallengeCommand(interaction, subcommand, guildId) {
    const verificationSettings = await getVerificationSettings(guildId);
    const enabledChallengeIds = getEnabledVerificationChallenges({ verification: verificationSettings }).map((challenge) => challenge.id);

    switch (subcommand) {
        case 'list':
            return handleChallengeList(interaction, verificationSettings, enabledChallengeIds);
        case 'active-set':
            return handleChallengeActiveSet(interaction, guildId);
        case 'timer':
        case 'cooldown':
            return handleChallengeDurationSetting(interaction, guildId, CHALLENGE_DURATION_COMMANDS[subcommand]);
        case 'overrides-view':
            return handleChallengeOverridesView(interaction, verificationSettings);
        case 'prompt-set':
            return handleChallengePromptSet(interaction, guildId);
        case 'prompt-clear':
            return handleChallengePromptClear(interaction, guildId);
        case 'answers-set':
            return handleChallengeAnswersSet(interaction, guildId);
        case 'answers-clear':
            return handleChallengeAnswersClear(interaction, guildId);
        default:
            return interaction.editReply({ embeds: [userErrorEmbed('Unknown challenge command.')] });
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
        .addSubcommandGroup(group => group
            .setName('autokick')
            .setDescription('Manage verification autokick')
            .addSubcommand(subcommand => subcommand
                .setName('status')
                .setDescription('Show the current verification autokick status'),
            )
            .addSubcommand(subcommand => addStringOption(
                addStringOption(
                    subcommand
                        .setName('set')
                        .setDescription('Update verification autokick'),
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
            ))
        )
        .addSubcommandGroup(group => group
            .setName('challenge')
            .setDescription('Manage verification challenges')
            .addSubcommand(subcommand => subcommand
                .setName('list')
                .setDescription('Show configured challenge IDs and verification challenge settings'),
            )
            .addSubcommand(subcommand => addStringOption(
                subcommand
                    .setName('active-set')
                    .setDescription('Set the active verification challenge ID list'),
                'ids',
                'Challenge IDs separated by commas or spaces',
            ))
            .addSubcommand(subcommand => addDurationOption(subcommand
                .setName('timer')
                .setDescription('Set the prompt expiry timer for verification challenges'),
            ))
            .addSubcommand(subcommand => addDurationOption(subcommand
                .setName('cooldown')
                .setDescription('Set the retry cooldown after a failed verification attempt'),
            ))
            .addSubcommand(subcommand => addChallengeIdOption(subcommand
                .setName('overrides-view')
                .setDescription('Show prompt and answer overrides for a challenge'),
            ))
            .addSubcommand(subcommand => addStringOption(
                addChallengeIdOption(subcommand
                    .setName('prompt-set')
                    .setDescription('Set the prompt override for a challenge'),
                ),
                'prompt',
                'Prompt text',
            ))
            .addSubcommand(subcommand => addChallengeIdOption(subcommand
                .setName('prompt-clear')
                .setDescription('Clear the prompt override for a challenge'),
            ))
            .addSubcommand(subcommand => addStringOption(
                addChallengeIdOption(subcommand
                    .setName('answers-set')
                    .setDescription('Set the complete answer override list for a challenge'),
                ),
                'answers',
                'Comma-separated answer list. Spaces inside answers are allowed.',
            ))
            .addSubcommand(subcommand => addChallengeIdOption(subcommand
                .setName('answers-clear')
                .setDescription('Clear answer overrides for a challenge'),
            ))
        ),
    async execute(interaction) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

        try {
            const verificationConfig = config.Warden?.verification;
            const subcommandGroup = interaction.options.getSubcommandGroup(false);
            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guild?.id;

            if (subcommand === 'mode') {
                return handleVerificationModeCommand(interaction, guildId);
            }

            if (subcommandGroup === 'autokick') {
                return handleVerificationAutokickCommand(interaction, subcommand, guildId);
            }

            if (subcommandGroup === 'challenge') {
                return handleVerificationChallengeCommand(interaction, subcommand, guildId);
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
