module.exports = {
	name: 'kill',
	description: 'Kills the AXI bot until it is rebooted (Auto-Reboot every 24 Hours) **(Admin Only)**',
    format: ' ',
	permlvl: 2,
	restricted: true,
	execute(message, args) {
        message.channel.send("Killing Sentry Bot! 💀")
		message.client.destroy();
	},
};
