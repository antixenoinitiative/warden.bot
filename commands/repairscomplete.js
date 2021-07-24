module.exports = {
	name: 'repair',
	description: 'Updates current repair target.',
	restricted: true,
	execute(message, args) {
		message.channel.send("Clearing Repairs field")
	},
};
