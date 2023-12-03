const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`scythe`)
    .setDescription(`Scythe info card`),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions:0,
    execute (interaction) {
        interaction.reply({ content: "https://cdn.discordapp.com/attachments/566728213737373707/1139392296866029580/Scythe.png" });
    }
}