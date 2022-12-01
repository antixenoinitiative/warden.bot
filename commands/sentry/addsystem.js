const { SlashCommandBuilder } = require('@discordjs/builders');
const db = require("../../db/index");

module.exports = {
    data: new SlashCommandBuilder()
	.setName('updatesystem')
	.setDescription('Add or update a system to Thargoid.Watch')
    .addStringOption(option => option.setName('system-name')
		.setDescription('Name of the System')
		.setRequired(true))
    .addStringOption(option => option.setName('inc-status')
		.setDescription('Set the priority level')
		.setRequired(true)
        .addChoice('Active', '1')
        .addChoice('Inactive', '0')),
	permissions: 2,
	async execute(interaction) {
        await interaction.deferReply();
		try {
            let systemName = interaction.options.data.find(arg => arg.name === 'system-name').value
            let status = interaction.options.data.find(arg => arg.name === 'inc-status').value

            let res = await db.query(`SELECT * FROM systems`)
            let data = res.rows

            let system = data.find(element => element.name === systemName)

            if (system) {
                await db.query(`UPDATE systems SET status = $1 WHERE name = $2`, [status, systemName])
                return interaction.editReply({ content: `**${systemName}** is already in the database, Incursion status has been set to True.`})
            }
            if (!system) {
                await db.query(`INSERT INTO systems(name,status,presence)VALUES($1,$2,4)`, [systemName, status])
                return interaction.editReply({ content: `System manually added to the Database`})
            }

		} catch (err) {
            console.log(err)
			interaction.channel.send({ content: "Something went wrong, please ensure you have entered the correct format." })
		}        
	},
};
