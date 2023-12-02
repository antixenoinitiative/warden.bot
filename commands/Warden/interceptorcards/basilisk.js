const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`basilisk`)
    .setDescription(`Basilisk info card`),
    permissions: 0,
    execute (interaction) {
        interaction.reply({ content: "https://cdn.discordapp.com/attachments/955583721883467787/1075228405794086993/Basilisk.png" });
    }
}