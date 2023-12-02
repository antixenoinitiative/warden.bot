
const { botIdent } = require('../../../functions.js');
const db = require(`../../../${botIdent().activeBot.botName}/db/index`);
const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('setpriority')
	.setDescription('Update the priority of a system in Sentry Database')
    .addStringOption(option => option.setName('system-name')
		.setDescription('Name of the System')
		.setRequired(true))
    .addStringOption(option => option.setName('priority')
		.setDescription('Set the priority level')
		.setRequired(true)
        .addChoices(
            { name: '#1', value: '1' },
            { name: '#2', value: '2' },
            { name: '#3', value: '3' },
            { name: 'None', value: '0' },
        )),
	permissions: 2,
	async execute(interaction) {
        await interaction.deferReply();
		try {
            let systemName = interaction.options.data.find(arg => arg.name === 'system-name').value
            let priorityLevel = interaction.options.data.find(arg => arg.name === 'priority').value;

            let res = await db.query(`SELECT * FROM systems`)
            let data = res.rows

            let system = data.find(element => element.name === systemName)

            if (!system) {
                return interaction.editReply({ content: `Sorry, "**${systemName}**" could not be found in the database, it may not have been detected by sentry yet. Please visit the system with EDMC running.`})
            } 

            if (system.priority == priorityLevel) {
                return interaction.editReply({ content: `**${systemName}** is already set to **${priorityLevel}**.`})
            }

            await db.query(`UPDATE systems SET priority = null WHERE priority = $1`, [priorityLevel])
            await db.query(`UPDATE systems SET priority = $1 WHERE name = $2`, [priorityLevel, systemName])
            interaction.editReply({ content: `✅ **${systemName}** updated to Priority **#${priorityLevel}**`})

		} catch (err) {
            console.log(err)
			interaction.channel.send({ content: "Something went wrong, please ensure you have entered the correct format." })
		}        
	},
};
