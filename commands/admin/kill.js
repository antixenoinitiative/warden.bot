module.exports = {
	name: 'kill',
	description: 'Kills the AXI bot until it is rebooted (Auto-Reboot every 24 Hours) **(Admin Only)**',
  usage: '',
	permlvl: 2, // 0 = Everyone, 1 = Mentor, 2 = Staff
	restricted: true,
	execute(message) {
        message.channel.send("Killing Warden Bot! 💀")
		message.client.destroy();
	},
};
