const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`basilisk`)
    .setDescription(`Basilisk info card`),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions:0,
    execute (interaction) {
        interaction.reply({ content: "https://media.discordapp.net/attachments/832092794293190706/1246006596778066010/basilisk.png" });
    }
}