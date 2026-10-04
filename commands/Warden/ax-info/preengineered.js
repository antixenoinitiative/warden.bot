const Discord = require("discord.js");
const { getIdentityBrandColor, getIdentityEmbedAuthor } = require('../../../functions');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`preengineered`)
    .setDescription(`Where to purchase pre-engineered weapons and modules`),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions:0,
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle('Pre-Engineered Modules')
        .setColor(getIdentityBrandColor())
        .setAuthor(getIdentityEmbedAuthor())
        .setDescription(`It should be noted that **all pre-engineered modules require materials for each purchase**. Unlock costs for these can be found on Inara's crafting section.`)
        .addFields(
            {name: "Modified Guardian Weapons, Azimuth EAXMC", value: "Available at `Prospect's Deep`, a planetary port found in the `Mbooni` system. You will need a permit to access Mbooni, which can be earned through raising standings to Allied with Azimuth Biotech. You may need to visit the `Glorious Prospect` in `LHS 1163`.", inline: false},
            {name: "Azimuth EAXMC", value: "Can also be found at techbrokers of Rescue Megaships:\n- `Rescue Ship Hutner` in `Luyten's Star`\n- `Rescue Ship Cornwallis` in `V886 Centauri`\n- `Allied Solace` in `Sun Wen`\n- `Imperial Sanctum` in `Hixkaramu`", inline: false},
            {name: "Sirius AX Missile Rack, Sirius Heat Sinks", value: "Can be found at Sirius Tech Brokers (see image below).", inline: false},
            {name: "Frame Shift Drive (SCO)", value: "Can be found at Human Tech Brokers (see image below).", inline: false},   
        )
        .setImage('https://wiki.antixenoinitiative.com/img/techbrokers.png');

        const actionRow = new Discord.ActionRowBuilder()
        .addComponents(
            new Discord.ButtonBuilder()
            .setLabel('AX Weapons')
            .setStyle(Discord.ButtonStyle.Link)
            .setURL('https://wiki.antixenoinitiative.com/en/weapons'),
        );

        interaction.reply({embeds: [returnEmbed.setTimestamp()], components: [actionRow]})
    }
}
