const Discord = require('discord.js');
const config = require('../../../config.json');
const { botLog } = require('../../../functions');
const verificationEmbedConfig = require('../verification/verificationEmbedConfig.json');
const {
    verificationChallenges,
    getActiveVerificationChallenge,
    getEnabledVerificationChallenges,
    getVerificationChallengeStep,
    getVerificationChallengeSteps,
    hasNextVerificationChallengeStep,
    validateAnswer,
} = require('../verification/verificationChallenges');
const { setChallenge, getChallenge, clearChallenge, setCooldown, getCooldownRemaining, clearCooldown } = require('../verification/verificationState');

const VERIFICATION_MODES = {
    enabled: 'enabled',
    disabled: 'disabled',
    skip: 'skip',
};

let runtimeVerificationMode;

function resolveEmbedColor(color, fallbackColor = '#3498DB') {
    if (typeof color === 'string' && /^#[0-9a-fA-F]{3}$/.test(color)) {
        return `#${color.slice(1).split('').map((char) => char + char).join('')}`;
    }

    return color ?? fallbackColor;
}

function resolveVerificationMode(verificationConfig = config.Warden?.verification) {
    if (runtimeVerificationMode) return runtimeVerificationMode;

    const configuredMode = verificationConfig?.mode;
    if (Object.values(VERIFICATION_MODES).includes(configuredMode)) {
        return configuredMode;
    }

    if (verificationConfig?.enabled === false) return VERIFICATION_MODES.disabled;

    return VERIFICATION_MODES.enabled;
}

function setRuntimeVerificationMode(mode) {
    if (!Object.values(VERIFICATION_MODES).includes(mode)) {
        throw new Error(`Invalid verification mode: ${mode}`);
    }

    runtimeVerificationMode = mode;
}

function userErrorEmbed(message) {
    return new Discord.EmbedBuilder()
        .setColor(resolveEmbedColor('#E74C3C'))
        .setTitle('Verification Error')
        .setDescription(message);
}


function selectVerificationChallenge() {
    const enabledChallenges = getEnabledVerificationChallenges(config.Warden);
    if (enabledChallenges.length < 2) {
        return enabledChallenges[0] ?? getActiveVerificationChallenge(config.Warden);
    }

    return enabledChallenges[Math.floor(Math.random() * enabledChallenges.length)];
}

function buildWelcomeEmbed() {
    const welcomeEmbedConfig = verificationEmbedConfig.welcomeEmbed ?? {};
    const embed = new Discord.EmbedBuilder()
        .setColor(resolveEmbedColor(welcomeEmbedConfig.color))
        .setTitle(welcomeEmbedConfig.title ?? 'Welcome to the server')
        .setDescription(welcomeEmbedConfig.description ?? 'Please verify to access the server.');

    if (welcomeEmbedConfig.thumbnail?.enabled && welcomeEmbedConfig.thumbnail.url) {
        embed.setThumbnail(welcomeEmbedConfig.thumbnail.url);
    }

    if (welcomeEmbedConfig.icon?.enabled && welcomeEmbedConfig.icon.url) {
        embed.setAuthor({ name: welcomeEmbedConfig.title ?? 'Welcome to the server', iconURL: welcomeEmbedConfig.icon.url });
    }

    return embed;
}

function buildResultEmbed(embedConfig, fallbackTitle, fallbackDescription, replacements = {}) {
    let description = embedConfig?.description ?? fallbackDescription;

    for (const [key, value] of Object.entries(replacements)) {
        description = description.replaceAll(`{${key}}`, String(value));
    }

    return new Discord.EmbedBuilder()
        .setColor(resolveEmbedColor(embedConfig?.color))
        .setTitle(embedConfig?.title ?? fallbackTitle)
        .setDescription(description);
}

function applyFieldToEmbed(embed, field) {
    if (!field) return;

    if (field.imageUrl) {
        return;
    }

    const value = field.content ?? field.value ?? field.description;
    if (!value) return;

    embed.addFields({
        name: field.title ?? field.name ?? '\u200B',
        value,
        inline: field.inline ?? false,
    });
}

function buildImageEmbed(fieldOrEmbed, embedConfig) {
    const embed = new Discord.EmbedBuilder()
        .setColor(resolveEmbedColor(fieldOrEmbed.color ?? embedConfig.color));

    if (fieldOrEmbed.title ?? fieldOrEmbed.name) {
        embed.setTitle(fieldOrEmbed.title ?? fieldOrEmbed.name);
    }

    if (fieldOrEmbed.description ?? fieldOrEmbed.content ?? fieldOrEmbed.value) {
        embed.setDescription(fieldOrEmbed.description ?? fieldOrEmbed.content ?? fieldOrEmbed.value);
    }

    if (fieldOrEmbed.imageUrl) {
        embed.setImage(fieldOrEmbed.imageUrl);
    }

    if (fieldOrEmbed.thumbnailUrl) {
        embed.setThumbnail(fieldOrEmbed.thumbnailUrl);
    }

    return embed;
}

function buildChallengeEmbeds(challenge, stepIndex = 0) {
    const step = getVerificationChallengeStep(challenge.id, stepIndex);
    const embedConfig = verificationEmbedConfig.challengeEmbed ?? {};
    const steps = getVerificationChallengeSteps(challenge);
    const totalSteps = steps.length || 1;
    const stepLabel = totalSteps > 1 ? `\n\nStep ${stepIndex + 1} of ${totalSteps}` : '';
    const prompt = step?.prompt ?? challenge.prompt ?? 'Please answer the verification challenge.';
    const stepDescription = step?.description ? `${step.description}\n\n` : '';
    let description = embedConfig.description ?? '{challenge}';

    description = description
        .replaceAll('{challenge}', `${stepDescription}${prompt}`)
        .replaceAll('{step}', String(stepIndex + 1))
        .replaceAll('{totalSteps}', String(totalSteps));

    const embed = new Discord.EmbedBuilder()
        .setColor(resolveEmbedColor(step?.color ?? embedConfig.color))
        .setTitle(step?.title ?? embedConfig.title ?? 'Verification Challenge')
        .setDescription(`${description}${stepLabel}`);

    const imageUrl = step?.imageUrl ?? challenge.imageUrl;
    const thumbnailUrl = step?.thumbnailUrl ?? challenge.thumbnailUrl;

    if (imageUrl) {
        embed.setImage(imageUrl);
    }

    if (thumbnailUrl) {
        embed.setThumbnail(thumbnailUrl);
    }

    for (const field of step?.fields ?? []) {
        applyFieldToEmbed(embed, field);
    }

    const embeds = [embed];

    for (const field of step?.fields ?? []) {
        if (field.imageUrl) {
            embeds.push(buildImageEmbed(field, embedConfig));
        }
    }

    for (const extraEmbed of step?.embeds ?? []) {
        embeds.push(buildImageEmbed(extraEmbed, embedConfig));
    }

    return embeds.slice(0, 10);
}

function buildGiveAnswerRow(challengeId, stepIndex = 0) {
    return new Discord.ActionRowBuilder()
        .addComponents(
            new Discord.ButtonBuilder()
                .setCustomId(`wardenVerify-answer-${challengeId}-${stepIndex}`)
                .setLabel('Give Answer')
                .setStyle(Discord.ButtonStyle.Primary),
        );
}

function buildAnswerModal(challengeId, stepIndex = 0) {
    const answerInput = new Discord.TextInputBuilder()
        .setCustomId('answer')
        .setLabel('Verification answer')
        .setPlaceholder('Enter your Answer here')
        .setStyle(Discord.TextInputStyle.Short)
        .setRequired(true);

    return new Discord.ModalBuilder()
        .setCustomId(`wardenVerify-submit-${challengeId}-${stepIndex}`)
        .setTitle('Verify')
        .addComponents(new Discord.ActionRowBuilder().addComponents(answerInput));
}

function parseChallengeComponentCustomId(customId, prefix) {
    if (!customId.startsWith(prefix)) return undefined;

    const payload = customId.slice(prefix.length);
    const stepSeparatorIndex = payload.lastIndexOf('-');

    if (stepSeparatorIndex < 1) return undefined;

    const challengeId = payload.slice(0, stepSeparatorIndex);
    const stepIndex = Number(payload.slice(stepSeparatorIndex + 1));

    if (!Number.isInteger(stepIndex) || stepIndex < 0) return undefined;

    return { challengeId, stepIndex };
}

function parseAnswerCustomId(customId) {
    return parseChallengeComponentCustomId(customId, 'wardenVerify-answer-');
}

function parseSubmitCustomId(customId) {
    return parseChallengeComponentCustomId(customId, 'wardenVerify-submit-');
}

async function completeVerification(interaction) {
    const verificationConfig = config.Warden?.verification;
    clearChallenge(interaction.user.id);
    clearCooldown(interaction.user.id);

    const unverifiedRoleId = verificationConfig?.unverifiedRoleId;

    if (unverifiedRoleId && interaction.member?.roles?.cache?.has(unverifiedRoleId)) {
        await interaction.member.roles.remove(unverifiedRoleId);
    }

    return interaction.reply({
        embeds: [buildResultEmbed(
            verificationEmbedConfig.successEmbed,
            'Verification Complete',
            'You have been verified successfully.',
        )],
        ephemeral: true,
    });
}

async function handleVerifyStart(interaction) {
    const verificationConfig = config.Warden?.verification;
    const verificationMode = resolveVerificationMode(verificationConfig);

    if (verificationMode === VERIFICATION_MODES.disabled) {
        return interaction.reply({ content: 'Verification is currently disabled.', ephemeral: true });
    }

    if (verificationMode === VERIFICATION_MODES.skip) {
        return completeVerification(interaction);
    }

    const cooldownRemaining = getCooldownRemaining(interaction.user.id);
    if (cooldownRemaining > 0) {
        const retryAt = Math.ceil((Date.now() + cooldownRemaining) / 1000);
        return interaction.reply({ content: `Please wait before trying verification again. You can retry <t:${retryAt}:R>.`, ephemeral: true });
    }

    const challenge = selectVerificationChallenge();
    const challengeId = challenge.id;
    const stepIndex = 0;
    setChallenge(interaction.user.id, { challengeId, stepIndex });

    return interaction.reply({
        embeds: buildChallengeEmbeds(challenge, stepIndex),
        components: [buildGiveAnswerRow(challengeId, stepIndex)],
        ephemeral: true,
    });
}

async function handleVerifyAnswer(interaction) {
    const verificationMode = resolveVerificationMode(config.Warden?.verification);

    if (verificationMode === VERIFICATION_MODES.disabled) {
        return interaction.reply({ content: 'Verification is currently disabled.', ephemeral: true });
    }

    if (verificationMode === VERIFICATION_MODES.skip) {
        return completeVerification(interaction);
    }

    const activeChallenge = getChallenge(interaction.user.id);
    if (!activeChallenge) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'Your verification challenge has expired. Please start verification again.',
            )],
            ephemeral: true,
        });
    }

    const clickedChallenge = parseAnswerCustomId(interaction.customId);
    const challengeId = activeChallenge.challengeId;
    const stepIndex = activeChallenge.stepIndex ?? 0;

    if (!clickedChallenge
        || clickedChallenge.challengeId !== challengeId
        || clickedChallenge.stepIndex !== stepIndex) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'This challenge button is no longer current. Please use the latest verification challenge message.',
            )],
            ephemeral: true,
        });
    }

    return interaction.showModal(buildAnswerModal(challengeId, stepIndex));
}

async function handleVerifySubmit(interaction) {
    const verificationMode = resolveVerificationMode(config.Warden?.verification);

    if (verificationMode === VERIFICATION_MODES.disabled) {
        return interaction.reply({ content: 'Verification is currently disabled.', ephemeral: true });
    }

    if (verificationMode === VERIFICATION_MODES.skip) {
        return completeVerification(interaction);
    }

    const activeChallenge = getChallenge(interaction.user.id);
    if (!activeChallenge) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'Your verification challenge has expired. Please start verification again.',
            )],
            ephemeral: true,
        });
    }

    const submittedChallenge = parseSubmitCustomId(interaction.customId);
    const challengeId = activeChallenge.challengeId;
    const stepIndex = activeChallenge.stepIndex ?? 0;

    if (!submittedChallenge
        || submittedChallenge.challengeId !== challengeId
        || submittedChallenge.stepIndex !== stepIndex) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'This answer modal is no longer current. Please use the latest verification challenge message.',
            )],
            ephemeral: true,
        });
    }

    const answer = interaction.fields.getTextInputValue('answer');
    const result = validateAnswer(challengeId, answer, stepIndex);

    if (!result.ok) {
        const cooldownSeconds = Number(config.Warden?.verification?.cooldownSeconds ?? 60);
        const retryAt = Date.now() + (cooldownSeconds * 1000);
        clearChallenge(interaction.user.id);
        setCooldown(interaction.user.id, retryAt);

        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationEmbedConfig.failureEmbed,
                'Verification Failed',
                'That answer was incorrect. Please try again in {cooldownSeconds} seconds.',
                { cooldownSeconds, retryTime: `<t:${Math.floor(retryAt / 1000)}:R>` },
            )],
            ephemeral: true,
        });
    }

    if (hasNextVerificationChallengeStep(challengeId, stepIndex)) {
        const nextStepIndex = stepIndex + 1;
        const challenge = verificationChallenges[challengeId] ?? getActiveVerificationChallenge(config.Warden);
        setChallenge(interaction.user.id, { challengeId, stepIndex: nextStepIndex });

        return interaction.reply({
            embeds: buildChallengeEmbeds(challenge, nextStepIndex),
            components: [buildGiveAnswerRow(challengeId, nextStepIndex)],
            ephemeral: true,
        });
    }

    return completeVerification(interaction);
}

module.exports = {
    VERIFICATION_MODES,
    handleVerifyStart,
    handleVerifyAnswer,
    handleVerifySubmit,
    data: new Discord.SlashCommandBuilder()
        .setName('verification')
        .setDescription('Manage Warden verification')
        .setDefaultMemberPermissions(Discord.PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('post')
                .setDescription('Post the verification welcome message')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to post the verification welcome message in')
                        .addChannelTypes(
                            Discord.ChannelType.GuildText,
                            Discord.ChannelType.GuildAnnouncement,
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('mode')
                .setDescription('Set the runtime verification mode')
                .addStringOption(option =>
                    option
                        .setName('setting')
                        .setDescription('Verification mode to use until the bot restarts')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Enabled', value: VERIFICATION_MODES.enabled },
                            { name: 'Disabled', value: VERIFICATION_MODES.disabled },
                            { name: 'Skip', value: VERIFICATION_MODES.skip },
                        )
                )
        )
        .addSubcommandGroup(group =>
            group
                .setName('challenge')
                .setDescription('Inspect configured Warden verification challenges')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('List configured verification challenge IDs')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('set')
                        .setDescription('Reserved: select a challenge after settings persistence is chosen')
                        .addStringOption(option =>
                            option
                                .setName('id')
                                .setDescription('Challenge ID to select later')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('disable')
                        .setDescription('Reserved: disable challenges after settings persistence is chosen')
                )
        ),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const verificationConfig = config.Warden?.verification;
            const subcommandGroup = interaction.options.getSubcommandGroup(false);
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'mode') {
                const mode = interaction.options.getString('setting', true);
                setRuntimeVerificationMode(mode);
                return interaction.editReply({ content: `Verification mode set to **${mode}** until the bot restarts.` });
            }

            if (subcommandGroup === 'challenge') {
                const activeChallenge = getActiveVerificationChallenge(config.Warden);
                const enabledChallengeIds = getEnabledVerificationChallenges(config.Warden).map((challenge) => challenge.id);

                if (subcommand === 'list') {
                    const challengeList = Object.values(verificationChallenges)
                        .map(challenge => `${challenge.id === activeChallenge.id ? '**' : ''}${challenge.id}${challenge.id === activeChallenge.id ? '** (active)' : ''}${enabledChallengeIds.includes(challenge.id) ? ' [enabled]' : ''}`)
                        .join('\n');

                    return interaction.editReply({ content: `Configured verification challenge IDs:\n${challengeList}` });
                }

                if (subcommand === 'set') {
                    const challengeId = interaction.options.getString('id', true);
                    return interaction.editReply({ content: `Challenge selection is reserved for a future persistent settings command. To select this challenge now, set \`config.Warden.verification.activeChallengeIds\` to [\`${challengeId}\`] in \`config.json\`.` });
                }

                if (subcommand === 'disable') {
                    return interaction.editReply({ content: 'Challenge disabling is reserved for a future persistent settings command. No configuration was changed.' });
                }
            }

            if (resolveVerificationMode(verificationConfig) === VERIFICATION_MODES.disabled) {
                return interaction.editReply({ embeds: [userErrorEmbed('Verification is disabled in the Warden configuration.')] });
            }

            const configuredChannelId = verificationConfig?.channelId;
            const optionChannel = interaction.options.getChannel('channel');
            const targetChannelId = optionChannel?.id ?? configuredChannelId;

            if (!targetChannelId) {
                return interaction.editReply({ embeds: [userErrorEmbed('No verification channel is configured. Please provide a channel option.')] });
            }

            const targetChannel = optionChannel ?? await interaction.guild.channels.fetch(targetChannelId);

            if (!targetChannel || !targetChannel.isTextBased()) {
                return interaction.editReply({ embeds: [userErrorEmbed('The verification channel could not be found or is not a text channel.')] });
            }

            const welcomeEmbed = buildWelcomeEmbed();
            const row = new Discord.ActionRowBuilder()
                .addComponents(
                    new Discord.ButtonBuilder()
                        .setCustomId('wardenVerify-start')
                        .setLabel('Verify')
                        .setStyle(Discord.ButtonStyle.Success),
                );

            const message = await targetChannel.send({ embeds: [welcomeEmbed], components: [row] });

            return interaction.editReply({ content: `Verification message posted successfully in ${targetChannel}. ${message.url}` });
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
