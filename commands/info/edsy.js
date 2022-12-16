const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('edsy')
	.setDescription('Link to the ED Shipyard'),
    permissions: 0,
    execute(interaction) {
        interaction.reply({ content: "🚀 https://edsy.org/" });
    }
};