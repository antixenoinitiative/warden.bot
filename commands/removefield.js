module.exports = {
	name: 'removefield',
	description: 'Manually removes a field',
	usage: '',
	permlvl: 1, // 0 = Everyone, 1 = Mentor, 2 = Staff
  	args: true,
	restricted: true,
	execute(message, args, passArray) {
		updateEmbedField = passArray[4]
    fieldName = args[0]
    if(fieldName === 'incursion') updateEmbedField({ name: "**Incursions:**"})
    else if(fieldName === 'starport') updateEmbedField({ name: "**Evacuations:**"})
    else if(fieldName === 'repair') updateEmbedField({ name: "**Repairs:**"})
		else updateEmbedField({ name: fieldName, value: null})
    message.react("✅")
	},
};
