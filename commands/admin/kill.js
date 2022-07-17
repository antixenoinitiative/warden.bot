const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
    .setName(`kill`)
    .setDescription(`Kills the AXI bot until it is rebooted (Auto-Reboot every 24 Hours)`)
	.setDefaultPermission(false),
	permissions: 2,
	async execute(interaction) {
		await interaction.reply({content: "Killing Warden Bot! 💀"})
		interaction.client.destroy();
	}
};
