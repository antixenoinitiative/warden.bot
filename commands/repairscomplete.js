module.exports = {
	name: 'repair',
	description: 'Updates current repair target.',
	execute(message, args) {
		message.channel.send("Clearing Repairs field")
	},
};
