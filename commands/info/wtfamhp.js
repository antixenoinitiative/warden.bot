const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('wtfamhp')
	.setDescription('Where the fuck are my hardpoints!?'),
    permissions: 0,
    execute(interaction) {
        interaction.reply({ content: "⁉ http://wherethefuckaremyhardpoints.com/" });
    }
};