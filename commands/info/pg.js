const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require("discord.js");
const config = require('../../config.json');
module.exports = {
    data: new SlashCommandBuilder()
    .setName(`pg`)
    .setDescription(`Posts info on how to join the Anti-Xeno Initiative Private Group`),
    permissions: 0,
    execute (interaction) {
        const returnEmbed = new Discord.MessageEmbed()
        .setTitle('Anti-Xeno Initiative Private Group')
        .setColor('#FF7100')
        .setAuthor({name: 'Anti-Xeno Initiative',iconURL: config.icon})
        .setThumbnail(config.icon)
        .setDescription(`**How to join the Private Group**
                            1. Open the Social Menu (Menu > Social)
                            2. On the Friends tab, use the search box to find "Anti-Xeno Initiative".
                            3. Select the "Anti-Xeno Initiative" and click "Request to join private group"
                            4. The Request will be automatically approved
                            5. Return to the menu, select Start > Private Group > Anti-Xeno Initiative > Join Group`)
        .setFooter({ text: 'Joining Anti-Xeno Initiative Private Group', iconURL: config.icon });
        interaction.reply({embeds: [returnEmbed]})
    }
}