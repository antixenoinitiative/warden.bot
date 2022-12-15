const Discord = require("discord.js");
const config = require('../../config.json');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`mbooni`)
    .setDescription(`Where to purchase pre-engineered AX weaponry`),
    permissions: 0,
    execute (interaction) {
        const returnEmbed = new Discord.MessageEmbed()
        .setTitle('Pre-engineered Weapons')
//         .setURL('https://www.antixenoinitiative.com/wiki/ship-builds/common-mistakes') will add an updated weapons page at some point
        .setAuthor({name: 'Anti-Xeno Initiative',iconURL: config.icon})
        .setDescription(`Modified Guardian Weapons are available at Prospect's Deep, a planetary port found in the Mbooni system.
          You will need a permit to access Mbooni, which can be earned at the "Glorious Prospect" in LHS 1163 through work for Azimuth Biotech.
          Additionally, you can now obtain pre-engineered Heatsinks at certain locations. Just like the Modified Guardian Weapons, these are pay-per-module.
          You can find them at Tech Brokers on the Sirius megaships listed below.`)
        interaction.reply({embeds: [returnEmbed]})
        interaction.channel.send({content:`https://cdn.discordapp.com/attachments/393381262355595265/1048559484181680239/image.png`})
    }
}
