const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`dave`)
    .setDescription(`Pings konstantine so you don't have to`),
    permissions: 0,
    execute (interaction) {
        interaction.reply({ content: `<@421493720832016385>` });
    }
}