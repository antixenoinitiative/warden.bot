module.exports = {
	name: 'repair',
	description: 'Updates current repair target.',
	permlvl: 1, // 0 = Everyone, 1 = Mentor, 2 = Staff
	args: true,
	usage: '"stationName" "systemName"',
	execute(message, args, updateEmbedField) {

		let reply = `${args[0]} - ${args[1]}`

		updateEmbedField({ name: "**Repairs:**", value: "The station currently being repaired is:\n- " + reply})
		message.react("✅")
	},
};
