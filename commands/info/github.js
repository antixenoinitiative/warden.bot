const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
	.setName('github')
	.setDescription('Link to the Warden.bot Github Page'),
    permissions: 0,
    execute(interaction) {
        interaction.reply({ content: "🛠 https://github.com/antixenoinitiative/warden.bot" });
    }
};