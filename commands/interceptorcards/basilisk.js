const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`basilisk`)
    .setDescription(`Basilisk info card`),
    permissions: 0,
    execute (interaction) {
        interaction.reply({ content: "https://media.discordapp.net/attachments/763535317360705606/808376840217165844/Basilisk.png" });
    }
}