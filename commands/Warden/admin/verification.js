const Discord = require('discord.js');
const config = require('../../../config.json');
const { botLog } = require('../../../functions');
const { captchas, getActiveCaptcha, getCaptchaStep, hasNextCaptchaStep, validateAnswer } = require('../verification/verificationCaptchas');
const { setChallenge, getChallenge, clearChallenge, setCooldown, getCooldownRemaining, clearCooldown } = require('../verification/verificationState');

function userErrorEmbed(message) {
    return new Discord.EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('Verification Error')
        .setDescription(message);
}

function buildWelcomeEmbed(verificationConfig) {
    const welcomeEmbedConfig = verificationConfig.welcomeEmbed ?? {};
    const embed = new Discord.EmbedBuilder()
        .setColor(welcomeEmbedConfig.color ?? '#3498DB')
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
        .setColor(embedConfig?.color ?? '#3498DB')
        .setTitle(embedConfig?.title ?? fallbackTitle)
        .setDescription(description);
}


function buildChallengeEmbed(verificationConfig, captcha, stepIndex = 0) {
    const step = getCaptchaStep(captcha.id, stepIndex);
    const embedConfig = verificationConfig.challengeEmbed ?? {};
    const totalSteps = Array.isArray(captcha.steps) && captcha.steps.length > 0 ? captcha.steps.length : 1;
    const stepLabel = totalSteps > 1 ? `\n\nStep ${stepIndex + 1} of ${totalSteps}` : '';
    const prompt = step?.prompt ?? captcha.prompt ?? 'Please answer the verification challenge.';
    let description = embedConfig.description ?? '{challenge}';

    description = description
        .replaceAll('{challenge}', prompt)
        .replaceAll('{step}', String(stepIndex + 1))
        .replaceAll('{totalSteps}', String(totalSteps));

    const embed = new Discord.EmbedBuilder()
        .setColor(embedConfig.color ?? '#3498DB')
        .setTitle(step?.title ?? embedConfig.title ?? 'Verification Challenge')
        .setDescription(`${description}${stepLabel}`);

    const imageUrl = step?.imageUrl ?? captcha.imageUrl;
    const thumbnailUrl = step?.thumbnailUrl ?? captcha.thumbnailUrl;

    if (imageUrl) {
        embed.setImage(imageUrl);
    }

    if (thumbnailUrl) {
        embed.setThumbnail(thumbnailUrl);
    }

    return embed;
}

function buildGiveAnswerRow(captchaId, stepIndex = 0) {
    return new Discord.ActionRowBuilder()
        .addComponents(
            new Discord.ButtonBuilder()
                .setCustomId(`wardenVerify-answer-${captchaId}-${stepIndex}`)
                .setLabel('Give Answer')
                .setStyle(Discord.ButtonStyle.Primary),
        );
}

function buildAnswerModal(captchaId, stepIndex = 0) {
    const answerInput = new Discord.TextInputBuilder()
        .setCustomId('answer')
        .setLabel('Verification answer')
        .setPlaceholder('Enter your Answer here')
        .setStyle(Discord.TextInputStyle.Short)
        .setRequired(true);

    return new Discord.ModalBuilder()
        .setCustomId(`wardenVerify-submit-${captchaId}-${stepIndex}`)
        .setTitle('Verify')
        .addComponents(new Discord.ActionRowBuilder().addComponents(answerInput));
}

function resolveCaptchaId(captcha) {
    return captcha.id;
}

async function handleVerifyStart(interaction) {
    const verificationConfig = config.Warden?.verification;

    if (!verificationConfig?.enabled) {
        return interaction.reply({ content: 'Verification is not enabled.', ephemeral: true });
    }

    const cooldownRemaining = getCooldownRemaining(interaction.user.id);
    if (cooldownRemaining > 0) {
        const retryAt = Math.ceil((Date.now() + cooldownRemaining) / 1000);
        return interaction.reply({ content: `Please wait before trying verification again. You can retry <t:${retryAt}:R>.`, ephemeral: true });
    }

    const captcha = getActiveCaptcha({ verification: { captchaId: verificationConfig.activeCaptchaId || verificationConfig.captchaId } });
    const captchaId = resolveCaptchaId(captcha);
    const stepIndex = 0;
    setChallenge(interaction.user.id, { captchaId, stepIndex });

    return interaction.reply({
        embeds: [buildChallengeEmbed(verificationConfig, captcha, stepIndex)],
        components: [buildGiveAnswerRow(captchaId, stepIndex)],
        ephemeral: true,
    });
}

async function handleVerifyAnswer(interaction) {
    const verificationConfig = config.Warden?.verification;

    if (!verificationConfig?.enabled) {
        return interaction.reply({ content: 'Verification is not enabled.', ephemeral: true });
    }

    const activeChallenge = getChallenge(interaction.user.id);
    if (!activeChallenge) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'Your verification challenge has expired. Please start verification again.',
            )],
            ephemeral: true,
        });
    }

    return interaction.showModal(buildAnswerModal(activeChallenge.captchaId, activeChallenge.stepIndex ?? 0));
}

async function handleVerifySubmit(interaction) {
    const verificationConfig = config.Warden?.verification;

    if (!verificationConfig?.enabled) {
        return interaction.reply({ content: 'Verification is not enabled.', ephemeral: true });
    }

    const activeChallenge = getChallenge(interaction.user.id);
    if (!activeChallenge) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationConfig.expiredChallengeEmbed,
                'Verification Challenge Expired',
                'Your verification challenge has expired. Please start verification again.',
            )],
            ephemeral: true,
        });
    }

    const captchaId = activeChallenge.captchaId || interaction.customId.replace('wardenVerify-submit-', '').split('-')[0];
    const stepIndex = activeChallenge.stepIndex ?? 0;
    const answer = interaction.fields.getTextInputValue('answer');
    const result = validateAnswer(captchaId, answer, stepIndex);

    if (!result.ok) {
        const cooldownSeconds = Number(verificationConfig.cooldownSeconds ?? 60);
        const retryAt = Date.now() + (cooldownSeconds * 1000);
        clearChallenge(interaction.user.id);
        setCooldown(interaction.user.id, retryAt);

        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationConfig.failureEmbed,
                'Verification Failed',
                'That answer was incorrect. Please try again in {cooldownSeconds} seconds.',
                { cooldownSeconds, retryTime: `<t:${Math.floor(retryAt / 1000)}:R>` },
            )],
            ephemeral: true,
        });
    }

    if (hasNextCaptchaStep(captchaId, stepIndex)) {
        const nextStepIndex = stepIndex + 1;
        const captcha = getActiveCaptcha({ verification: { captchaId } });
        setChallenge(interaction.user.id, { captchaId, stepIndex: nextStepIndex });

        return interaction.reply({
            embeds: [buildChallengeEmbed(verificationConfig, captcha, nextStepIndex)],
            components: [buildGiveAnswerRow(captchaId, nextStepIndex)],
            ephemeral: true,
        });
    }

    clearChallenge(interaction.user.id);
    clearCooldown(interaction.user.id);

    const unverifiedRoleId = verificationConfig.unverifiedRoleId;

    if (unverifiedRoleId && interaction.member?.roles?.cache?.has(unverifiedRoleId)) {
        await interaction.member.roles.remove(unverifiedRoleId);
    }

    return interaction.reply({
        embeds: [buildResultEmbed(
            verificationConfig.successEmbed,
            'Verification Complete',
            'You have been verified successfully.',
        )],
        ephemeral: true,
    });
}

module.exports = {
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
        .addSubcommandGroup(group =>
            group
                .setName('captcha')
                .setDescription('Inspect reserved Warden verification captcha settings')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('List configured captcha IDs')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('set')
                        .setDescription('Reserved: select a captcha after settings persistence is chosen')
                        .addStringOption(option =>
                            option
                                .setName('id')
                                .setDescription('Captcha ID to select later')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('disable')
                        .setDescription('Reserved: disable captchas after settings persistence is chosen')
                )
        ),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const verificationConfig = config.Warden?.verification;
            const subcommandGroup = interaction.options.getSubcommandGroup(false);
            const subcommand = interaction.options.getSubcommand();

            if (subcommandGroup === 'captcha') {
                const activeCaptcha = getActiveCaptcha(config.Warden);

                if (subcommand === 'list') {
                    const captchaList = Object.values(captchas)
                        .map(captcha => `${captcha.id === activeCaptcha.id ? '**' : ''}${captcha.id}${captcha.id === activeCaptcha.id ? '** (active)' : ''}`)
                        .join('\n');

                    return interaction.editReply({ content: `Configured captcha IDs:\n${captchaList}` });
                }

                if (subcommand === 'set') {
                    const captchaId = interaction.options.getString('id', true);
                    return interaction.editReply({ content: `Captcha selection is reserved for a future persistent settings command. To select this captcha now, set \`config.Warden.verification.activeCaptchaId\` to \`${captchaId}\` in \`config.json\`.` });
                }

                if (subcommand === 'disable') {
                    return interaction.editReply({ content: 'Captcha disabling is reserved for a future persistent settings command. No configuration was changed.' });
                }
            }

            if (!verificationConfig?.enabled) {
                return interaction.editReply({ embeds: [userErrorEmbed('Verification is not enabled in the Warden configuration.')] });
            }

            const configuredChannelId = verificationConfig.channelId;
            const optionChannel = interaction.options.getChannel('channel');
            const targetChannelId = optionChannel?.id ?? configuredChannelId;

            if (!targetChannelId) {
                return interaction.editReply({ embeds: [userErrorEmbed('No verification channel is configured. Please provide a channel option.')] });
            }

            const targetChannel = optionChannel ?? await interaction.guild.channels.fetch(targetChannelId);

            if (!targetChannel || !targetChannel.isTextBased()) {
                return interaction.editReply({ embeds: [userErrorEmbed('The verification channel could not be found or is not a text channel.')] });
            }

            const welcomeEmbed = buildWelcomeEmbed(verificationConfig);
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
