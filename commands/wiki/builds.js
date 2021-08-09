const Discord = require("discord.js");

module.exports = {
    name: 'builds',
    description: 'Useful Information and links for AX Ship Builds',
    permlvl: 0,
    format: '',
    restricted: false,
    execute(message, args) {
      const returnEmbed = new Discord.MessageEmbed()
        .setColor('#FF7100')
        .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
        .setTitle("**AX Ship Builds**")
        .setDescription(`How to build a good Anti-Xeno Combat ship. Guides for both Interceptor and Scout hunting ships included.`)
        .addFields(
          {name: "Recommended Builds", value: "https://wiki.antixenoinitiative.com/en/builds"},
          {name: "Ship Build Theory", value: "https://wiki.antixenoinitiative.com/en/shipbuildtheory"},
          {name: "Build Repository", value: "https://wiki.antixenoinitiative.com/en/buildrepository"},
        )
      message.channel.send(returnEmbed.setTimestamp());
    }
};