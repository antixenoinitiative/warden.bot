const Discord = require("discord.js");
const { botIdent } = require('../../../functions');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`preengineered`)
    .setDescription(`Where to purchase pre-engineered modules.`),
    permissions: 0,
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle('Pre-engineered Modules')
        .setURL('https://wiki.antixenoinitiative.com/en/weapons')
        .setAuthor({name: botIdent().activeBot.botName,iconURL: botIdent().activeBot.icon})
        .setDescription(`It should be noted that **all pre-engineered modules require materials for each purchase**.
          **Modified Guardian Weapons** are available at **Prospect's Deep**, a planetary port found in the **Mbooni** system.
          You will need a permit to access Mbooni, which can be earned at the "Glorious Prospect" in LHS 1163 through work for Azimuth Biotech.
          The **V1 Frame Shift Drive** can be obtained at any human tech broker.
          **Pre-engineered Heatsinks** can be found at Tech Brokers on the Sirius megaships listed below.
          Unlock costs for these can be found on Inara's crafting section.`)
        .setImage('https://cdn.discordapp.com/attachments/832092794293190706/1060318125943439380/image.png')
        interaction.reply({embeds: [returnEmbed.setTimestamp()]})
    }
}
