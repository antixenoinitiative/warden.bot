const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`cyclops`)
    .setDescription(`Cyclops info card`),
    permissions: 0,
    execute (interaction) {
        interaction.reply({ content: "https://cdn.discordapp.com/attachments/763535317360705606/808376804619321394/Cyclops.png" });
    }
}