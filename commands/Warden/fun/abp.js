const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`abp`)
    .setDescription(`Summon aman!`),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions:0,
    execute (interaction) {
      interaction.reply({ content: `You summoned Aman! <@321304077239582723>` });
    }
}