const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`orthrus`)
    .setDescription(`Orthrus info card`),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions:0,
    execute (interaction) {
        interaction.reply({ content: "https://media.discordapp.net/attachments/832092794293190706/1246006601257848932/orthrus.png" });
    }
}