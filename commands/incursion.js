module.exports = {
	name: 'incursion',
	description: 'Updates list of systems under incursion and/or damaged starports with an attached image.',
	usage: '',
	permlvl: 1, // 0 = Everyone, 1 = Mentor, 2 = Staff
	restricted: true,
	execute(message, args, passArray) {
		try {
			//importing functions and variables
			attachIsImage = passArray[0]
			googleClient = passArray[1]
			parseIncursionSystems = passArray[2]
			parseDamagedStarports = passArray[3]
			updateEmbedField = passArray[4]

			if(message.attachments.size > 0 && message.attachments.every(attachIsImage)) {
				const attachment = message.attachments.array()[0]
				if(attachment.size > 4000000) return message.reply("Image too large!")
				message.react("🤔")
				console.log("Sending image to Cloud Vision API with url " + attachment.url)
				googleClient
					.textDetection(attachment.url)
					// .textDetection("./testImage.png")
					.then((results) => {
						try {
							console.log("Reply recieved in " + (Date.now() - message.createdTimestamp) + "ms")
							message.reactions.removeAll()
							if(results[0].error != null) {
								console.log("ERROR: " + results[0].error.message)
								message.reply("ERROR: " + results[0].error.message)
								message.react("❌")
								return
							}
							const visionText = results[0].textAnnotations[0].description
							var fieldArray = []
							let descriptionText = "Confirmed Target Systems in order of priority (Top to Bottom)"
							if(visionText.indexOf("no reports of") != -1) {
								//No incursion case
								descriptionText += "\n \n Status: **CODE YELLOW** :yellow_square:"
								updateEmbedField({ name: "**Incursions:**", value: "No Incursions detected. Please aid with starport repairs and standby for additional attacks."})
							}
							else {
								//yes incursion case
								descriptionText += "\n \n Status: **CODE RED** :red_square:"
								updateEmbedField({ name: "**Incursions:**", value: parseIncursionSystems(visionText)})
							}
							if(visionText.indexOf("have been attacked") != -1) {
								updateEmbedField({ name: "**Evacuations:**", value: parseDamagedStarports(visionText)})
							}
							updateEmbedField({ name: null, value: descriptionText})
							message.react("✅")
						} catch (err) {
							console.log(err);
							message.reply(`there was an error trying to execute that command!: ${err}`);
						}
					})
			} else {
				message.reply("Please attach an image")
			}
		} catch (err) {
			console.log(err);
			message.reply(`there was an error trying to execute that command!: ${err}`);
		}
	},
};
