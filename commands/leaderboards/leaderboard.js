const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
	.setName('leaderboard')
	.setDescription('link to Leaderboards'),
	permissions: 0,
	async execute(interaction) {
        interaction.reply({ content: "🏆 https://antixenoinitiative.com/leaderboards" });
    }
}
