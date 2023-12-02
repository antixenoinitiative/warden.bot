const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`medusa`)
    .setDescription(`Medusa info card`),
    permissions: 0,
    execute (interaction) {
        interaction.reply({ content: "https://cdn.discordapp.com/attachments/955583721883467787/1075228406133817384/Medusa.png" });
    }
}