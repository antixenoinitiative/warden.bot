const Discord = require("discord.js");
const { botIdent } = require('../../functions');
const config = require('../../config.json');
module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName(`pg`)
        .setDescription(`Posts info on how to join the ${botIdent().activeBot.communityName} Private Group`),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions: 0,
    execute(interaction) {
        const channels = interaction.guild.channels.cache;
        const rulesChannelId = channels.find(
            channel => channel.name === config[botIdent().activeBot.botName].channels.privateGroupRules
        ).id;

        const returnEmbed = new Discord.EmbedBuilder()
            .setTitle(`${botIdent().activeBot.communityName} Private Group`)
            .setColor('#FF7100')
            .setAuthor({ name: botIdent().activeBot.botName, iconURL: botIdent().activeBot.icon })
            .setThumbnail(botIdent().activeBot.icon)
            .setDescription(
                `**How to join the Private Group**\n` +
                `1. Open the Social Menu (Menu > Social)\n` +
                `2. On the Friends tab, use the search box to find "${botIdent().activeBot.communityName}".\n` +
                `3. Select the "${botIdent().activeBot.communityName}" and click "Request to join private group"\n` +
                `4. The Request will be automatically approved\n` +
                `5. Return to the menu, select Start > Private Group > ${botIdent().activeBot.communityName} > Join Group\n` +
                `\nPlease read the Private Group Rules before joining: <#${rulesChannelId}>`
            )
            .setFooter({ text: `Joining ${botIdent().activeBot.communityName} Private Group`, iconURL: botIdent().activeBot.icon });
        interaction.reply({ embeds: [returnEmbed] })
    }
}