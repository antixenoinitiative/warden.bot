const Discord = require('discord.js');
const config = require('../../../config.json');
const { botLog } = require('../../../functions');
const { captchas, getActiveCaptcha } = require('../verification/verificationCaptchas');

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

module.exports = {
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
