module.exports = {
	name: 'repairscomplete',
	description: 'Changes repair target to a standby message',
	format: '',
	permlvl: 1,
	restricted: true,
	execute(message, args, passArray) {
		updateEmbedField = passArray[4]
		updateEmbedField({ name: "**Repairs:**", value: "All repairs completed. Please stand by for further targets."})
		message.react("✅")
	},
};
