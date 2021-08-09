const Discord = require("discord.js");

module.exports = {
    name: 'builds',
    description: 'Useful Information and links for AX Ship Builds',
    permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
    usage: '',
    restricted: false,
    execute(message, args) {
        const returnEmbed = new Discord.MessageEmbed()
        .setColor('#FF7100')
        .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
        .setTitle("**AX Ship Builds**") 
        .setDescription(`How to build a good Anti-Xeno Combat ship. Guides for both Interceptor and Scout hunting ships included.`)
		returnEmbed.addField("Recommended Builds", "https://wiki.antixenoinitiative.com/en/builds")
		returnEmbed.addField("Ship Build Theory", "https://wiki.antixenoinitiative.com/en/shipbuildtheory")
		returnEmbed.addField("Build Repository",  "https://wiki.antixenoinitiative.com/en/buildrepository")
        message.channel.send(returnEmbed.setTimestamp());
    }
};