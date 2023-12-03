const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('website')
	.setDescription('Link to the AXI Home Website'),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions:0,
    execute(interaction) {
        interaction.reply({ content: "🏠 https://www.antixenoinitiative.com/" });
    }
};