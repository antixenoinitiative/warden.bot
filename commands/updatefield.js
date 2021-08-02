module.exports = {
	name: 'updatefield',
	description: 'Manually updates a field',
	format: '',
	args: true,
	restricted: true,
	execute(message, args, passArray) {
		updateEmbedField = passArray[4]
		fieldName = args[0]
		let arguments = args[1]
		for(var i = 2; i < args.length; i++) arguments += " " + args[i]
		if(fieldName === 'incursion') updateEmbedField({ name: "**Incursions:**", value: arguments})
		else if(fieldName === 'starport') updateEmbedField({ name: "**Evacuations:**", value: arguments})
		else if(fieldName === 'repair') updateEmbedField({ name: "**Repairs:**", value: arguments})
		else updateEmbedField({ name: fieldName, value: arguments})
		message.react("✅")
	},
};
