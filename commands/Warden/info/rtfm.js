const Discord = require("discord.js");
module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('rtfm')
	.setDescription('Link to the AXI Wiki Home Page'),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions:0,
    execute(interaction) {
        interaction.reply({ content: "🏠 https://wiki.antixenoinitiative.com/" });
    }
};