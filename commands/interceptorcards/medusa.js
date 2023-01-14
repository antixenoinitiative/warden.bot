const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`medusa`)
    .setDescription(`Medusa info card`),
    permissions: 0,
    execute (interaction) {
        interaction.reply({ content: "https://cdn.discordapp.com/attachments/763535317360705606/808376871485964338/Medusa.png" });
    }
}