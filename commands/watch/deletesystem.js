const { SlashCommandBuilder } = require('@discordjs/builders');
const db = require("../../db/index");

module.exports = {
    data: new SlashCommandBuilder()
	.setName('deletesystem')
	.setDescription('Remove a system from Thargoid.watch')
    .addStringOption(option => option.setName('system-name')
		.setDescription('Name of the System')
		.setRequired(true)),
	permissions: 2,
	async execute(interaction) {
        await interaction.reply({ content: `Updating system info`});
		try {
            let systemName = interaction.options.data.find(arg => arg.name === 'system-name').value

            let res = await db.query(`SELECT * FROM systems`)
            let data = res.rows

            let system = data.find(element => element.name === systemName)

            if (system) {
                await db.query(`DELETE FROM systems WHERE name = $1`, [systemName])
                return interaction.channel.send({ content: `**${systemName}** has been removed from the Database`})
            }
            if (!system) {
                return interaction.channel.send({ content: `**${systemName}** was not found in the Database`})
            }
		} catch (err) {
            console.log(err)
			interaction.channel.send({ content: "Something went wrong, please ensure you have entered the correct format." })
		}        
	},
};
