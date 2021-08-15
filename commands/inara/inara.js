const Discord = require("discord.js");


module.exports = {
	name: 'inara',
	description: 'Get information from Inara',
    usage: '"term"',
	permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
	restricted: false,
	async execute(message, args) {
		let name = args[0];

		const https = require('https');

		const data = new TextEncoder().encode(
			JSON.stringify(
				{
					"header": {
						"appName": "AXIWarden",
						"appVersion": "1.00",
						"isDeveloped": false,
						"APIkey": `"${process.env.INARAKEY}"`,
					},
					"events": [
						{
							"eventName": "getCommanderProfile",
							"eventTimestamp": `${new Date().toISOString()}`,
							"eventData": {
								"searchName": "Mgram"
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
				console.log(JSON.parse(d)); //prints inara's output to the node console, process it further here
			})
		})

		req.on('error', error => {
			console.error(error)
		})

		req.write(data)
		req.end()
		
	},
};
