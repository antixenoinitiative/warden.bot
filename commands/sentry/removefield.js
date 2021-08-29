module.exports = {
	name: 'removefield',
	description: 'Manually removes a field',
	usage: '',
	permissions: 1, // 0 = Everyone, 1 = Mentor, 2 = Staff
	args: true,
	execute(message, args, updateEmbedField) {
    let fieldName = args[0]
    if(fieldName === 'incursion') updateEmbedField({ name: "**Incursions:**"})
    else if(fieldName === 'starport') updateEmbedField({ name: "**Evacuations:**"})
    else if(fieldName === 'repair') updateEmbedField({ name: "**Repairs:**"})
		else updateEmbedField({ name: fieldName, value: null})
    message.react("✅")
	},
};
