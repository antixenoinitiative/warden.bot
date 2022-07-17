const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
	.setName('wtfamhp')
	.setDescription('Where the fuck are my hardpoints!?'),
    permissions: 0,
    execute(interaction) {
        interaction.reply({ content: "⁉ http://wherethefuckaremyhardpoints.com/" });
    }
};