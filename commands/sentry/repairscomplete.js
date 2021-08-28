const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
	.setName('repairscomplete')
	.setDescription('Changes repair target to a standby message'),
	usage: '',
	permlvl: 1, // 0 = Everyone, 1 = Mentor, 2 = Staff
	execute(message, args, updateEmbedField) {
		updateEmbedField({ name: "**Repairs:**", value: "All repairs completed. Please stand by for further targets."})
		message.react("✅")
	},
};
