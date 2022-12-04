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
		.setDescription('Incursions State')
		.setRequired(true)
        .addChoice('Active', '1')
        .addChoice('Inactive', '0'))
    .addStringOption(option => option.setName('presence-level')
		.setDescription('Set the presence level')
		.setRequired(true)
        .addChoice('Maelstrom', '4')
		.addChoice('Controlled', '3')
        .addChoice('Invasion', '2')
        .addChoice('Alert', '1')
        .addChoice('Safe', '0')),
	permissions: 2,
	async execute(interaction) {
        await interaction.reply({ content: `Updating system info`});
		try {
            let systemName = interaction.options.data.find(arg => arg.name === 'system-name').value
            let status = interaction.options.data.find(arg => arg.name === 'inc-status').value
            let presenceLevel = interaction.options.data.find(arg => arg.name === 'presence-level').value.toLowerCase();
            let res = await db.query(`SELECT * FROM systems`)
            let data = res.rows

            let system = data.find(element => element.name === systemName)

            if (system) {
                interaction.channel.send({ content: `**${systemName}** is already in the database, updating fields.`})
                if (status) {
                    await db.query(`UPDATE systems SET status = $1 WHERE name = $2`, [status, systemName])
                    interaction.channel.send({ content: `System status updated to: **${status}**`})
                }
                if (presenceLevel) {
                    await db.query(`UPDATE systems SET presence = $1 WHERE name = $2`, [presenceLevel, systemName])
                    interaction.channel.send({ content: `Presence Level updated to: **${presenceLevel}**`})
                }
            }
            if (!system) {
                await db.query(`INSERT INTO systems(name,status,presence)VALUES($1,$2,$3)`, [systemName, status, presenceLevel])
                return interaction.channel.send({ content: `**${systemName}** manually added to the Database`})
            }

		} catch (err) {
            console.log(err)
			interaction.channel.send({ content: "Something went wrong, please ensure you have entered the correct format." })
		}        
	},
};
