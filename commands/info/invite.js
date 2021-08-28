const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
	.setName('invite')
	.setDescription('Get a server invite link'),
    usage: '',
    permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
    execute (message) {
        message.channel.send({ content: `To invite people to the server, please use the following link: https://discord.gg/bqmDxdm` });
    }
}
