const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('wtfamhp')
	.setDescription('Where the fuck are my hardpoints!?'),
    permissions: 0,
    execute(interaction) {
        interaction.reply({ content: "⁉ https://web.archive.org/web/20220511122720/http://a.teall.info/edsa/" });
    }
};