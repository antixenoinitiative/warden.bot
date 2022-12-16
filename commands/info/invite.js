const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('invite')
	.setDescription('Get a server invite link'),
    permissions: 0,
    execute (interaction) {
        interaction.reply({ content: `To invite people to the server, please use the following link: https://discord.gg/bqmDxdm` });
    }
}
