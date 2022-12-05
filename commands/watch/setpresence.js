const { SlashCommandBuilder } = require('@discordjs/builders');
const db = require("../../db/index");

function getPresence(presence) {
    switch (presence) {
        case 0:
            return "Safe"
        case 1:
            return "Alert"
        case 2:
            return "Invasion"
        case 3:
            return "Controlled"
        case 4:
            return "Maelstrom"
    }
}

module.exports = {
    data: new SlashCommandBuilder()
	.setName('setpresence')
	.setDescription('Update the presence of a system in Sentry Database')
    .addStringOption(option => option.setName('system-name')
		.setDescription('Name of the System')
		.setRequired(true))
    .addStringOption(option => option.setName('presence-level')
		.setDescription('Set the presence level')
		.setRequired(true)
        .addChoice('Maelstrom', '4')
		.addChoice('Controlled', '3')
        .addChoice('Invasion', '2')
        .addChoice('Alert', '1')
        .addChoice('Safe', '0')),
	permissions: 1,
	async execute(interaction) {
		try {
            let systemName = interaction.options.data.find(arg => arg.name === 'system-name').value
            let presenceLevel = interaction.options.data.find(arg => arg.name === 'presence-level').value.toLowerCase();

            let res = await db.query(`SELECT * FROM systems WHERE name = $1`,[systemName])
            let data = res.rows[0]

            // Check if exists
            if (res.rowCount === 0) {
                interaction.reply({ content: `Sorry, "**${systemName}**" could not be found in the database, it may not have been detected by sentry yet. Please visit the system with EDMC running.`})
                return;
            }

            // Check if submitted status is different
            if (data.presence == presenceLevel) {
                interaction.reply({ content: `**${systemName}** is already set to **${getPresence(parseInt(presenceLevel))}**.`})
                return;
            }
            
            await db.query('UPDATE systems SET presence = $1 WHERE system_id = $2',[presenceLevel, data.system_id])
            interaction.reply({ content: `✅ Presence updated for **${systemName}** to **${getPresence(parseInt(presenceLevel))}**`})


		} catch (err) {
            console.log(err)
			interaction.channel.send({ content: "Something went wrong, please ensure you have entered the correct format." })
		}        
	},
};
