module.exports = {
	name: 'updatefield',
	description: 'Manually updates a field',
	usage: '',
	permlvl: 1, // 0 = Everyone, 1 = Mentor, 2 = Staff
	args: true,
	execute(message, args, updateEmbedField) {
		let fieldName = args[0]
		let arg = args[1]
		for(var i = 2; i < args.length; i++) arg += " " + args[i]
		if(fieldName === 'incursion') updateEmbedField({ name: "**Incursions:**", value: arg})
		else if(fieldName === 'starport') updateEmbedField({ name: "**Evacuations:**", value: arg})
		else if(fieldName === 'repair') updateEmbedField({ name: "**Repairs:**", value: arg})
		else if(fieldName === 'description') updateEmbedField({ name: null, value: arg})
		else updateEmbedField({ name: fieldName, value: arg})
		message.react("✅")
	},
};
