const Discord = require("discord.js");


module.exports = {
	name: 'inara',
	description: 'Get information from Inara',
    usage: '"name"',
	permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
	restricted: false,
	async execute(message, args) {
		let name = args[0];
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
				console.log(`statusCode: ${res.statusCode}`)

				res.on('data', d => {
					let response = JSON.parse(d); //prints inara's output to the node console, process it further here
					var cmdr = response.events[0].eventData
					const returnEmbed = new Discord.MessageEmbed()
					.setColor('#FF7100')
					.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
					.setTitle(`CMDR ${cmdr.userName}`)
					.setFooter(`${cmdr.userName}`, cmdr.avatarImageURL)
					if (cmdr.preferredGameRole != undefined) { returnEmbed.addField("Role", `${cmdr.preferredGameRole}`) }
					if (cmdr.preferredAllegianceName != undefined) { returnEmbed.addField("Allegiance", `${cmdr.preferredAllegianceName}`, true) }
					if (cmdr.preferredPowerName != undefined) { returnEmbed.addField("Role", `${cmdr.preferredPowerName}`, true) }
					if (cmdr.commanderSquadron != undefined) { 
						returnEmbed.addField("Squadron", `[${cmdr.commanderSquadron.squadronName}](${cmdr.commanderSquadron.inaraURL})`)
						returnEmbed.addField("Squadron Rank", `${cmdr.commanderSquadron.squadronMemberRank}`, true) 
					}
					if (cmdr.inaraURL != undefined) { returnEmbed.addField("Link", `${cmdr.inaraURL}`, true) }

					message.channel.send({ embeds: [returnEmbed.setTimestamp()] });
				})
			})

			req.on('error', error => {
				console.error(error)
			})

			req.write(data)
			req.end()
		} catch (err) {
			message.channel.send({ content: `Sorry, something went wrong with that command. Please try again.`})
		}
		
	},
};
