const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`smol`)
    .setDescription(`Some cookies from amy`),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions:0,
    execute (interaction) {
        interaction.reply({ content: `<@914605889028247583> says you are smol and gives you cookies.`, files:["https://cdn.discordapp.com/attachments/763535317360705606/932044351901663262/REEEEE.png"] });
    }
}