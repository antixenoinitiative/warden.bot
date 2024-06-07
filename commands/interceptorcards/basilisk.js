const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`basilisk`)
    .setDescription(`Basilisk info card`),
    permissions: 0,
    execute (interaction) {
        interaction.reply({ content: "https://cdn.discordapp.com/attachments/832092794293190706/1246006596778066010/basilisk.png" });
    }
}