const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`hydra`)
    .setDescription(`Hydra info card`),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions:0,
    execute (interaction) {
        interaction.reply({ content: "https://cdn.discordapp.com/attachments/832092794293190706/1246006599093587989/hydra.png" });
    }
}