module.exports = {
	name: 'incursion',
	description: 'Updates list of systems under incursion and/or damaged starports.',
	restricted: true,
	execute(message, args) {
		if(message.attachments.size > 0 && message.attachments.every(attachIsImage)) {
			const attachment = message.attachments.array()[0]
			if(attachment.size > 4000000) return
			message.react("🤔")
			console.log("Sending image to Cloud Vision API...")
			const url = attachment.url
			googleClient
				.textDetection(url)
				.then((results) => {
					console.log("Reply recieved in " + (Date.now() - message.createdTimestamp) + "ms")
					message.reactions.removeAll()
					if(results[0].error != null) {
						console.log("ERROR: " + results[0].error.message)
						message.react("❌")
						return
					}
					console.log(results[0])
					const visionText = results[0].textAnnotations[0].description
					var fieldArray = []
					let messageToReturn = "Confirmed Target Systems in order of priority (Top to Bottom)"
					if(visionText.indexOf("no reports of") != -1) {
						//No incursion case
						messageToReturn += "\n \n Status: **CODE YELLOW** :yellow_square:"
						fieldArray.push({ name: "**Incursions:**", value: "No Incursions detected. Please aid with starport repairs and standby for additional attacks."})
					}
					else {
						//yes incursion case
						messageToReturn += "\n \n Status: **CODE RED** :red_square:"
						fieldArray.push({ name: "**Incursions:**", value: parseIncursionSystems(visionText)})
					}
					if(visionText.indexOf("Starport Status Update") != -1) {
						fieldArray.push({ name: "**Evacuations:**", value: parseDamagedStarports(visionText)})
					}
					console.log(fieldArray)
					const returnEmbed = new Discord.MessageEmbed()
						.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
						.setTitle("**Defense Targets**")
						.setDescription(messageToReturn)
						.setTimestamp()
					fieldArray.forEach((field) => {
						returnEmbed.addField(field.name, field.value)
					})
					message.channel.send({ embed: returnEmbed })
					message.react("✔️")
				})
		}
		else message.reply("Please attach an image")
	},
};
