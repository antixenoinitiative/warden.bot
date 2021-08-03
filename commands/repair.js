module.exports = {
	name: 'repair',
	description: 'Updates current repair target.',
	format: '',
	permlvl: 1,
	args: true,
	usage: '<stationName> <systemName>',
	restricted: true,
	execute(message, args, passArray) {
		updateEmbedField = passArray[4]
		for(var i = 0; i < args.length; i++) {
			args[i] = args[i].substring(0,1).toUpperCase() + args[i].substring(1)
		}
		let reply = args[0] + " " + args[1] + " -"
		for(var i = 2; i < args.length; i++) {
			reply += " " + args[i]
		}
		updateEmbedField({ name: "**Repairs:**", value: "The station currently being repaired is:\n- " + reply})
		message.react("✅")
	},
};
