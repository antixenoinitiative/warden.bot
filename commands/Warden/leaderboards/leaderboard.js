const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('leaderboard')
	.setDescription('link to Leaderboards'),
	permissions: 0,
	async execute(interaction) {
        interaction.reply({ content: "🏆 https://antixenoinitiative.com/leaderboards" });
    }
}
