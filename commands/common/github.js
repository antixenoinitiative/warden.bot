const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('github')
	.setDescription('Link to the Warden.bot Github Page'),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions:0,
    execute(interaction) {
        interaction.reply({ content: "🛠 https://github.com/antixenoinitiative/warden.bot" });
    }
};