const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
	.setName('website')
	.setDescription('Link to the AXI Home Website'),
    permissions: 0,
    execute(interaction) {
        interaction.reply({ content: "🏠 https://www.antixenoinitiative.com/" });
    }
};