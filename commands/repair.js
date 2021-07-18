module.exports = {
	name: 'repair',
	description: 'Updates current repair target.',
	args: true,
	usage: '<stationName> <systemName>',
	execute(message, args) {
		for(var i = 0; i < args.length; i++) {
			args[i] = args[i].substring(0,1).toUpperCase() + args[i].substring(1)
		}
		let reply = args[0] + " " + args[1] + " -"
		for(var i = 2; i < args.length; i++) {
			reply += " " + args[i]
		}
		message.channel.send(reply)
	},
};