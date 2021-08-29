const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
	.setName('invite')
	.setDescription('Get a server invite link'),
    permlvl: 0,
    execute (interaction) {
        interaction.reply({ content: `To invite people to the server, please use the following link: https://discord.gg/bqmDxdm` });
    }
}
