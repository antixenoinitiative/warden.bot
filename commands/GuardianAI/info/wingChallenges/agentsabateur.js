const Discord = require("discord.js");
const { botIdent } = require('../../../../functions');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`agentsabateur`)
    .setDescription(`Display Information`),
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle(`Agent Sabatuer`)
        .setColor('#FF7100')
        .setAuthor({name: botIdent().activeBot.botName,iconURL: botIdent().activeBot.icon})
        .setThumbnail(botIdent().activeBot.icon)
        .setDescription(`**How to join the Private Group**
                            1. Open the Social Menu (Menu > Social)
                            2. On the Friends tab, use the search box to find "XSF Official".
                            3. Select the "XSF Official" and click "Request to join private group"
                            4. The Request will be automatically approved
                            5. Return to the menu, select Start > Private Group > XSF Official > Join Group
                            Its also recommended to send a friend request to "XSF Official" incase the PG gets locked down.
                            `
                            
                        )
        .setFooter({ text: `Joining XSF Official private group`, iconURL: botIdent().activeBot.icon });
        interaction.reply({embeds: [returnEmbed]})
    }
}