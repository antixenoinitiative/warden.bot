const Discord = require("discord.js");

module.exports = {
	data: new Discord.SlashCommandBuilder()
    .setName(`inara`)
    .setDescription(`Get information from Inara`)
	.addStringOption(option => option.setName('name')
		.setDescription('Search for a user name')
		.setRequired(true)),
	permissions: 0,
	async execute(interaction) {
		let name = interaction.options.data.find(arg => arg.name === 'name').value
		try {
			const https = require('https');
			require("dotenv").config();
			const data = new TextEncoder().encode(
				JSON.stringify(
					{
						"header": {
							"appName": "AXIWarden",
							"appVersion": "1.00",
							"isDeveloped": true,
							"APIkey": process.env.INARAKEY,
						},
						"events": [
							{
								"eventName": "getCommanderProfile",
								"eventTimestamp": `${new Date().toISOString()}`,
								"eventData": {
									"searchName": `${name}`
								}
							}
						]
					}
				) //your JSON goes into these parentheses
			)

			const options = {
				hostname: 'inara.cz',
				port: 443,
				path: '/inapi/v1/',
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': data.length
				}
			}

			const req = https.request(options, res => {

				res.on('data', d => {
					let response = JSON.parse(d); //prints inara's output to the node console, process it further here
					var cmdr = response.events[0].eventData
					const returnEmbed = new Discord.EmbedBuilder()
					.setColor('#FF7100')
					.setTitle(`CMDR ${cmdr.userName}`)
					.setFooter(`${cmdr.userName}`, cmdr.avatarImageURL)
					if (cmdr.preferredGameRole != undefined) { returnEmbed.addFields([{ name: "Role", value: `${cmdr.preferredGameRole}` }]) }
					if (cmdr.preferredAllegianceName != undefined) { returnEmbed.addFields({ name:"Allegiance", value:`${cmdr.preferredAllegianceName}`, inline: true, }) }
					if (cmdr.preferredPowerName != undefined) { returnEmbed.addFields({ name: "Power", value: `${cmdr.preferredPowerName}`, inline: true }) }
					if (cmdr.commanderSquadron != undefined) { 
						returnEmbed.addFields({ name: "Squadron", value: `[${cmdr.commanderSquadron.squadronName}](${cmdr.commanderSquadron.inaraURL})` })
						returnEmbed.addFields({ name: "Squadron Rank", value: `${cmdr.commanderSquadron.squadronMemberRank}`, inline: true }) 
					}
					if (cmdr.inaraURL != undefined) { returnEmbed.addFields({ name: "Link", value: `${cmdr.inaraURL}`, inline: true }) }

					interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
				})
			})

			req.on('error', error => {
				console.error(error)
			})

			req.write(data)
			req.end()
		} catch (err) {
			console.error(err);
			interaction.channel.send({ content: `Sorry, something went wrong with that command. Please try again.`})
		}
		
	},
};
