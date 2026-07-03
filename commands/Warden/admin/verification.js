const Discord = require('discord.js');
const config = require('../../../config.json');
const { botLog } = require('../../../functions');
const { getActiveCaptcha, validateAnswer } = require('../verification/verificationCaptchas');

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

function resolveCaptchaId(verificationConfig, captcha) {
    return verificationConfig.activeCaptchaId
        || verificationConfig.captchaId
        || captcha.id;
}

async function handleVerifyStart(interaction) {
    const verificationConfig = config.Warden?.verification;

    if (!verificationConfig?.enabled) {
        return interaction.reply({ content: 'Verification is not enabled.', ephemeral: true });
    }

    const captcha = getActiveCaptcha({ verification: { captchaId: verificationConfig.activeCaptchaId || verificationConfig.captchaId } });
    const captchaId = resolveCaptchaId(verificationConfig, captcha);
    const answerInput = new Discord.TextInputBuilder()
        .setCustomId('answer')
        .setLabel('Verification answer')
        .setPlaceholder(captcha.prompt.slice(0, 100))
        .setStyle(Discord.TextInputStyle.Short)
        .setRequired(true);
    const modal = new Discord.ModalBuilder()
        .setCustomId(`wardenVerify-submit-${captchaId}`)
        .setTitle('Verify')
        .addComponents(new Discord.ActionRowBuilder().addComponents(answerInput));

    return interaction.showModal(modal);
}

async function handleVerifySubmit(interaction) {
    const verificationConfig = config.Warden?.verification;

    if (!verificationConfig?.enabled) {
        return interaction.reply({ content: 'Verification is not enabled.', ephemeral: true });
    }

    const captchaId = interaction.customId.replace('wardenVerify-submit-', '');
    const answer = interaction.fields.getTextInputValue('answer');
    const result = validateAnswer(captchaId, answer);

    if (!result.ok) {
        return interaction.reply({
            embeds: [buildResultEmbed(
                verificationConfig.failureEmbed,
                'Verification Failed',
                'That answer was incorrect. Please try again in {cooldownSeconds} seconds.',
                { cooldownSeconds: verificationConfig.cooldownSeconds ?? 60 },
            )],
            ephemeral: true,
        });
    }

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
        ),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const verificationConfig = config.Warden?.verification;

            if (!verificationConfig?.enabled) {
                return interaction.editReply({ content: 'Verification is not enabled in the Warden configuration.' });
            }

            const configuredChannelId = verificationConfig.channelId;
            const optionChannel = interaction.options.getChannel('channel');
            const targetChannelId = optionChannel?.id ?? configuredChannelId;

            if (!targetChannelId) {
                return interaction.editReply({ content: 'No verification channel is configured. Please provide a channel option.' });
            }

            const targetChannel = optionChannel ?? await interaction.guild.channels.fetch(targetChannelId).catch(() => null);

            if (!targetChannel || !targetChannel.isTextBased()) {
                return interaction.editReply({ content: 'The verification channel could not be found or is not a text channel.' });
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
            console.error(err);
            botLog(interaction.guild, new Discord.EmbedBuilder()
                .setTitle('⛔ Verification post failed')
                .setDescription(`\`\`\`js\n${err.stack ?? err}\n\`\`\``)
                , 2, 'error'
            );

            return interaction.editReply({ content: `Failed to post the verification message: ${err.message ?? err}` });
        }
    },
};
