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
        .split(/[\s,]+/)
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
    const promptLine = override?.prompt ? `Prompt override: ${override.prompt}` : 'Prompt override: not set';
    const answerLine = override?.answers?.length
        ? `Answer overrides:\n${override.answers.map((answer) => `- ${answer}`).join('\n')}`
        : 'Answer overrides: not set';
    const updatedLine = override?.updatedAt
        ? `Last updated: ${override.updatedAt}${override.updatedBy ? ` by <@${override.updatedBy}>` : ''}`
        : 'Last updated: never';

    return `${promptLine}\n\n${answerLine}\n\n${updatedLine}`;
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

module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName('verification')
        .setDescription('Manage Warden verification')
        .setDefaultMemberPermissions(Discord.PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('post')
                .setDescription('Post a new verification post or refresh one by message ID')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to post the verification post in')
                        .addChannelTypes(
                            Discord.ChannelType.GuildText,
                            Discord.ChannelType.GuildAnnouncement,
                        )
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('Existing verification post message ID to refresh')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('mode')
                .setDescription('Set the persisted verification mode')
                .addStringOption(option =>
                    option
                        .setName('setting')
                        .setDescription('Verification mode to use')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Challenge', value: VERIFICATION_MODES.challenge },
                            { name: 'Halt', value: VERIFICATION_MODES.halt },
                            { name: 'One-Click', value: VERIFICATION_MODES.oneClick },
                        )
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('autokick')
                .setDescription('Set or inspect the persisted verification autokick state and timer')
                .addStringOption(option =>
                    option
                        .setName('set')
                        .setDescription('Whether verification autokick is enabled')
                        .setRequired(false)
                        .addChoices(
                            { name: 'On', value: 'on' },
                            { name: 'Off', value: 'off' },
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('status')
                        .setDescription('Show the current verification autokick status')
                        .setRequired(false)
                        .addChoices({ name: 'Show current status', value: 'status' })
                )
                .addStringOption(option =>
                    option
                        .setName('timer')
                        .setDescription('Autokick delay, such as 10m, 600s, or 10 minutes')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('challenge')
                .setDescription('Manage configured Warden verification challenges')
                .addStringOption(option =>
                    option
                        .setName('action')
                        .setDescription('Challenge setting to inspect or update')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Lists verification state and info', value: 'list' },
                            { name: 'Set active challenge ID list', value: 'set' },
                            { name: 'Set prompt expiry timer for all challenges', value: 'timer' },
                            { name: 'Set retry cooldown timer for all challenges', value: 'cooldown' },
                            { name: 'List challenge prompts/answers', value: 'answer_list' },
                            { name: 'Set the prompt of a challenge', value: 'prompt_set' },
                            { name: 'Clear prompt of a challenge', value: 'prompt_clear' },
                            { name: 'Set the answer (list) of a challenge', value: 'answer_set' },
                            { name: 'Clear answers of a challenge', value: 'answer_clear' },
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('id')
                        .setDescription('Challenge ID, or complete ID list for set separated by commas/spaces')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('prompt')
                        .setDescription('Prompt text for prompt_set')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('answer')
                        .setDescription('Set full answer list for the selected challengeID, separated by commas and/or spaces')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('time')
                        .setDescription('Duration for timer or cooldown, such as 90s, 2m, or 2 minutes')
                        .setRequired(false)
                )
        ),
    async execute(interaction) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

        try {
            const verificationConfig = config.Warden?.verification;
            const subcommand = interaction.options.getSubcommand();

            const guildId = interaction.guild?.id;

            if (subcommand === 'mode') {
                const mode = interaction.options.getString('setting', true);
                await setVerificationMode(guildId, mode, interaction.user.id);
                return interaction.editReply(buildVerificationAdminSettingUpdated(
                    'Mode',
                    `Verification mode set to **${mode}**.`,
                ));
            }


            if (subcommand === 'autokick') {
                const setting = interaction.options.getString('set');
                const status = interaction.options.getString('status');
                const timerInput = interaction.options.getString('timer');
                const verificationSettings = await getVerificationSettings(guildId);

                if ((setting && status) || (!setting && !status)) {
                    return interaction.editReply({ embeds: [userErrorEmbed('Choose either `set` to update autokick or `status` to inspect it.')] });
                }

                if (status) {
                    return interaction.editReply(buildVerificationAdminStatus(
                        'Autokick',
                        `Verification autokick is currently **${verificationSettings.autokickEnabled ? 'ON' : 'OFF'}** with a timer of **${formatDuration(verificationSettings.autokickSeconds)}**.`,
                    ));
                }

                const durationSeconds = timerInput ? parseDurationSeconds(timerInput) : undefined;

                if (timerInput && !durationSeconds) {
                    return interaction.editReply({ embeds: [userErrorEmbed('Please provide a valid autokick timer, such as `600s`, `10m`, or `10 minutes`.')] });
                }

                const updatedSettings = await setAutokickSettings(guildId, setting === 'on', durationSeconds, interaction.user.id);
                return interaction.editReply(buildVerificationAdminSettingUpdated(
                    'Autokick',
                    `Verification autokick is now **${updatedSettings.autokickEnabled ? 'ON' : 'OFF'}** with a timer of **${formatDuration(updatedSettings.autokickSeconds)}**.`,
                ));
            }

            if (subcommand === 'challenge') {
                const action = interaction.options.getString('action', true);
                const verificationSettings = await getVerificationSettings(guildId);
                const enabledChallengeIds = getEnabledVerificationChallenges({ verification: verificationSettings }).map((challenge) => challenge.id);

                if (action === 'list') {
                    const challengeList = Object.values(verificationChallenges)
                        .map(challenge => `${enabledChallengeIds.includes(challenge.id) ? '**' : ''}${challenge.id}${enabledChallengeIds.includes(challenge.id) ? '** [active]' : ''}`)
                        .join('\n');

                    return interaction.editReply(buildVerificationAdminConfiguration(
                        'Challenge',
                        `Configured verification challenge IDs:\n${challengeList}`,
                        [
                            {
                                name: 'Prompt expiry',
                                value: `**${formatDuration(verificationSettings.challengeExpirySeconds)}**`,
                                inline: true,
                            },
                            {
                                name: 'Retry cooldown',
                                value: `**${formatDuration(verificationSettings.cooldownSeconds)}**`,
                                inline: true,
                            },
                            {
                                name: 'Autokick',
                                value: `**${verificationSettings.autokickEnabled ? 'on' : 'off'} after ${formatDuration(verificationSettings.autokickSeconds)}**`,
                                inline: false,
                            },
                        ],
                    ));
                }

                if (action === 'timer' || action === 'cooldown') {
                    const durationSeconds = parseDurationSeconds(interaction.options.getString('time'));
                    if (!durationSeconds) {
                        return interaction.editReply({ embeds: [userErrorEmbed('Please provide a valid time, such as `90s`, `2m`, or `2 minutes`.')] });
                    }

                    const updatedSettings = action === 'timer'
                        ? await setChallengeExpirySeconds(guildId, durationSeconds, interaction.user.id)
                        : await setCooldownSeconds(guildId, durationSeconds, interaction.user.id);
                    const settingName = action === 'timer' ? 'challenge expiry timer' : 'verification retry cooldown';
                    const updatedSeconds = action === 'timer' ? updatedSettings.challengeExpirySeconds : updatedSettings.cooldownSeconds;

                    return interaction.editReply(buildVerificationAdminSettingUpdated(
                        'Setting',
                        `Updated ${settingName} to **${formatDuration(updatedSeconds)}**.`,
                    ));
                }

                if (action === 'set') {
                    const challengeIds = parseChallengeIdList(interaction.options.getString('id'));
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


                if (['prompt_set', 'prompt_clear', 'answer_set', 'answer_list', 'answer_clear'].includes(action)) {
                    const { challengeId, error } = getSingleKnownChallengeId(interaction);
                    if (error) {
                        return interaction.editReply({ embeds: [error] });
                    }

                    if (action === 'answer_list') {
                        return interaction.editReply(buildVerificationAdminSummary(
                            'Challenge Overrides',
                            `Overrides for **${challengeId}**:`,
                            getChallengeOverrideSummary(verificationSettings, challengeId),
                            'info',
                        ));
                    }

                    if (action === 'prompt_set') {
                        const prompt = String(interaction.options.getString('prompt') ?? '').trim();
                        if (!prompt) {
                            return interaction.editReply({ embeds: [userErrorEmbed('Please provide prompt text for `prompt_set`.')] });
                        }

                        const updatedSettings = await setChallengePromptOverride(guildId, challengeId, prompt, interaction.user.id);
                        return interaction.editReply(buildVerificationAdminSummary(
                            'Challenge Prompt Updated',
                            `Prompt override updated for **${challengeId}**.`,
                            getChallengeOverrideSummary(updatedSettings, challengeId),
                            'success',
                        ));
                    }

                    if (action === 'prompt_clear') {
                        const updatedSettings = await clearChallengePromptOverride(guildId, challengeId, interaction.user.id);
                        await sendVerificationStaffWarning(
                            interaction.guild,
                            'Verification challenge prompt cleared',
                            `The prompt of **${challengeId}** was cleared by ${interaction.user}. If this challenge requires a configured prompt, set it again with \`/verification challenge action:prompt_set id:${challengeId}\`.`,
                        );
                        return interaction.editReply(buildVerificationAdminSummary(
                            'Challenge Prompt Cleared',
                            `Prompt override cleared for **${challengeId}**. Staff warning sent.`,
                            getChallengeOverrideSummary(updatedSettings, challengeId),
                            'warning',
                        ));
                    }

                    if (action === 'answer_set') {
                        const answers = parseAnswerOverrideList(interaction.options.getString('answer'));
                        if (answers.length < 1) {
                            return interaction.editReply({ embeds: [userErrorEmbed('Please provide a complete answer list for `answer_set`, separated by commas or spaces.')] });
                        }

                        const updatedSettings = await setChallengeAnswerOverrides(guildId, challengeId, answers, interaction.user.id);
                        return interaction.editReply(buildVerificationAdminSummary(
                            'Challenge Answers Updated',
                            `Answer overrides set for **${challengeId}**.`,
                            getChallengeOverrideSummary(updatedSettings, challengeId),
                            'success',
                        ));
                    }

                    if (action === 'answer_clear') {
                        const updatedSettings = await clearChallengeAnswerOverrides(guildId, challengeId, interaction.user.id);
                        await sendVerificationStaffWarning(
                            interaction.guild,
                            'Verification challenge answer list cleared',
                            `Answer list for **${challengeId}** was cleared by ${interaction.user}. If this challenge requires configured answers, set them again with \`/verification challenge action:answer_set id:${challengeId}\`.`,
                        );
                        return interaction.editReply(buildVerificationAdminSummary(
                            'Challenge Answers Cleared',
                            `Answer list cleared for **${challengeId}**. Staff warning sent.`,
                            getChallengeOverrideSummary(updatedSettings, challengeId),
                            'warning',
                        ));
                    }
                }
            }


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
        catch (err) {
            console.log(err);
            botLog(interaction.guild, new Discord.EmbedBuilder()
                .setTitle('⛔ Verification post failed')
                .setDescription('```' + err.stack + '```')
                , 2, 'error'
            );

            return interaction.editReply({ embeds: [userErrorEmbed('Failed to post the verification message. Please try again later.')] });
        }
    },
};
