const { SlashCommandBuilder } = require('@discordjs/builders');
module.exports = {
    data: new SlashCommandBuilder()
	.setName('rtfm')
	.setDescription('Link to the AXI Wiki Home Page'),
    permissions: 0,
    execute(interaction) {
        interaction.reply({ content: "🏠 https://wiki.antixenoinitiative.com/" });
    }
};