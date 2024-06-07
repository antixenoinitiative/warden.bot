const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`cyclops`)
    .setDescription(`Cyclops info card`),
    permissions: 0,
    execute (interaction) {
        interaction.reply({ content: "https://cdn.discordapp.com/attachments/832092794293190706/1246006598090887188/cyclops.png" });
    }
}