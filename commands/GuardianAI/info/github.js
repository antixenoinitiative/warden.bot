const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('github')
	.setDescription('Link to the GuardianAI.bot Github Page'),
    permissions: 0,
    execute(interaction) {
        interaction.reply({ content: "🛠 https://github.com/antixenoinitiative/warden.bot" });
    }
};