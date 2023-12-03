const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`glaive`)
    .setDescription(`Glaive info card`),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions:0,
    execute (interaction) {
        interaction.reply({ content: "https://cdn.discordapp.com/attachments/566728213737373707/1139392296442409130/Glaive.png" });
    }
}