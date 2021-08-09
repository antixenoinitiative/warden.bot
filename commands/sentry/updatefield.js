module.exports = {
	name: 'updatefield',
	description: 'Manually updates a field',
	usage: '',
	permlvl: 1, // 0 = Everyone, 1 = Mentor, 2 = Staff
	args: true,
	execute(message, args, updateEmbedField) {
		fieldName = args[0]
		let arguments = args[1]
		for(var i = 2; i < args.length; i++) arguments += " " + args[i]
		if(fieldName === 'incursion') updateEmbedField({ name: "**Incursions:**", value: arguments})
		else if(fieldName === 'starport') updateEmbedField({ name: "**Evacuations:**", value: arguments})
		else if(fieldName === 'repair') updateEmbedField({ name: "**Repairs:**", value: arguments})
		else if(fieldName === 'description') updateEmbedField({ name: null, value: arguments})
		else updateEmbedField({ name: fieldName, value: arguments})
		message.react("✅")
	},
};
