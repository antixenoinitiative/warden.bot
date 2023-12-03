const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('website')
	.setDescription('Link to the Xeno Strike Force Home Website'),
    permissions: 0,
    execute(interaction) {
        interaction.reply({ content: "🏠 https://xenostrikeforce.com/" });
    } 
};