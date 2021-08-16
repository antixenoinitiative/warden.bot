const vision = require("@google-cloud/vision")
require("dotenv").config();

// Generate Google Key from ENV varaiables then Connect Google Client
const builtkey = `{
	"type": "service_account",
	"project_id": "axi-sentry",
	"private_key_id": "${process.env.GOOGLEKEYID}",
	"private_key": "${process.env.GOOGLEKEY}",
	"client_email": "sentry@axi-sentry.iam.gserviceaccount.com",
	"client_id": "105556351573320071528",
	"auth_uri": "https://accounts.google.com/o/oauth2/auth",
	"token_uri": "https://oauth2.googleapis.com/token",
	"auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
	"client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/sentry%40axi-sentry.iam.gserviceaccount.com"
	}`;
const privateKey = JSON.parse(builtkey);
const googleClient = new vision.ImageAnnotatorClient({ credentials: privateKey, });

// Uncomment if using your own cloud API endpoint

// const googleClient = new vision.ImageAnnotatorClient({
// 	keyFilename: "./originalkey.json",
// })

/**
* Returns whether or not an attachment is an .jpg or .png
* @author
* @param    {Attachment} msgAttach    Input attachment
* @return   {String}              Returns if the attachment is an image
*/
function attachIsImage(msgAttach) { //True if this url is a png image.
	const url = msgAttach.url;
	return url.indexOf("png", url.length - "png".length /*or 3*/) !== -1 || url.indexOf("jpg", url.length - "jpg".length /*or 3*/) !== -1;
}

/**
* Returns formatted incursion text for use in embed
* @author   Airom
* @param    {String} text    Input value of message text
* @return   {String}              Returns the formatted incursion field
*/
function parseIncursionSystems(text) {
	let systemList = text.substring(text.indexOf(":\n") + 2)
	if(systemList.indexOf("have been attacked") != -1) systemList = systemList.substring(0, systemList.indexOf("Starport"))
	systemList = systemList.split("\n")
	let returnStr = "\n"
	if(systemList[systemList.length-1] == '') systemList.pop()
	systemList.forEach((item) => {
		const system = item.substring(0, item.indexOf(":"))
		if(system.indexOf("[") != -1) {
			returnStr += "- " + system.substring(1, system.length - 1) + " [" + item.substring(item.indexOf(":") + 2, item.length - 1) + "] <:tharg_r:417424014861008907>\n"
		}
		else {
			returnStr += "- " + system + " [Thargoid presence eliminated] <:tharg_g:417424014525333506>\n"
		}
	})
	return returnStr
}

/**
* Returns formatted damaged starport text for use in embed
* @author   Airom
* @param    {String} text    Input value of message text
* @return   {String}              Returns the formatted station field
*/
function parseDamagedStarports(text) {
	const starportList = text.substring(text.indexOf("Update") + 7).split("\n")
	let returnStr = "The following stations have been attacked and may require assistance:"
	// console.log(starportList)
	for(var i = 1; i < starportList.length - 1; i++) {
		returnStr += "\n- " + starportList[i] + " 🔥"
	}
	return returnStr
}

module.exports = {
	name: 'incursion',
	description: 'Updates list of systems under incursion and/or damaged starports with an attached image.',
	usage: '',
	permlvl: 1, // 0 = Everyone, 1 = Mentor, 2 = Staff
	execute(message, args, updateEmbedField) {
		try {
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
							message.reply({ content: `there was an error trying to execute that command!: ${err}` });
						}
					})
			} else {
				message.reply({ content: "Please attach an image" })
			}
		} catch (err) {
			console.log(err);
			message.reply({ content: `there was an error trying to execute that command!: ${err}` });
		}
	},
};
