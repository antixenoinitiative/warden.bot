const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`lasers`)
    .setDescription(`Information about TV beams`),
    permissions: 0,
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle('Beam Lasers')
        .setDescription(`Thermal vent beam lasers, often called TV beams, are a very useful weapon in AX. While useful for keeping cool during the shield phase, they **cannot** be used for cold orbiting while firing weapons, exceptions (AX MR / AX MC). The added distro drain will heat you up more instead of cooling you down.`)
        const buttonRow = new Discord.ActionRowBuilder()
          .addComponents(new Discord.ButtonBuilder().setLabel('Learn more about TV beams').setStyle(Discord.ButtonStyle.Link).setURL('https://wiki.antixenoinitiative.com/en/lasers'),)
          interaction.reply({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] });
    }
}
