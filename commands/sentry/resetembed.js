module.exports = {
	name: 'resetembed',
	description: 'Resets embed to Code Yellow Status',
	usage: '',
	permissions: 1,
	execute(message, args, updateEmbedField) {
    updateEmbedField({ name: "**Incursions:**"})
    updateEmbedField({ name: "**Evacuations:**"})
    updateEmbedField({ name: "**Repairs:**"})
    updateEmbedField({ name: null, value: "\n Status: **CODE YELLOW** :yellow_square: \n All Incursions cleared and all Starports repaired."})
		message.react("✅")
	},
};
