const Discord = require("discord.js");
const { botIdent } = require('../../../functions');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`pg`)
    .setDescription(`Posts info on how to join the ${botIdent().activeBot.communityName} Private Group`),
    permissions: 0,
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle(`${botIdent().activeBot.communityName} Private Group`)
        .setColor('#FF7100')
        .setAuthor({name: botIdent().activeBot.botName, iconURL: botIdent().activeBot.icon})
        .setThumbnail(botIdent().activeBot.icon)
        .setDescription(`**How to join the Private Group**
                            1. Open the Social Menu (Menu > Social)
                            2. On the Friends tab, use the search box to find "${botIdent().activeBot.communityName}".
                            3. Select the "${botIdent().activeBot.communityName}" and click "Request to join private group"
                            4. The Request will be automatically approved
                            5. Return to the menu, select Start > Private Group > ${botIdent().activeBot.communityName} > Join Group`)
        .setFooter({ text: `Joining ${botIdent().activeBot.communityName} Private Group`, iconURL: botIdent().activeBot.icon });
        interaction.reply({embeds: [returnEmbed]})
    }
}