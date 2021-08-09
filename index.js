/**
* AXI Warden is a discord bot for the Anti-Xeno Initiative Discord Server.
* @author   CMDR Mgram, CMDR Airom
*/

//------------------ SWITCHES ----------------------
// To enable or disble components for testing purposes
const enableDiscordBot = 1; // Set to 0 to disable discord bot from running
const prefix = "-" // Command Prefix for discord commands
//--------------------------------------------------

require("dotenv").config();
const fs = require('fs');
const Discord = require("discord.js");
const perm = require('./permissions');
const vision = require("@google-cloud/vision");

// Discord client setup
const discordClient = new Discord.Client()
//Command detection
discordClient.commands = new Discord.Collection();
const commandFolders = fs.readdirSync('./commands');
for (const folder of commandFolders) {
	const commandFiles = fs.readdirSync(`./commands/${folder}`).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const command = require(`./commands/${folder}/${file}`);
		discordClient.commands.set(command.name, command);
	}
}

console.log(discordClient.commands.entries());

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
/*
const vision = require("@google-cloud/vision")
const googleClient = new vision.ImageAnnotatorClient({
	keyFilename: "./originalkey.json",
})*/

//Discord client
const incursionsEmbed = new Discord.MessageEmbed()
.setColor('#FF7100')
.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
.setTitle("**Defense Targets**")
let messageToUpdate

discordClient.once("ready", () => {

  console.log(`[✔] Discord bot Logged in as ${discordClient.user.tag}!`);
  discordClient.channels.cache.get("860453324959645726").send(`Warden is now Online!`)
	if(!process.env.MESSAGEID) return console.log("ERROR: No incursion embed detected")
	discordClient.guilds.cache.get(process.env.GUILDID).channels.cache.get(process.env.CHANNELID).messages.fetch(process.env.MESSAGEID).then(message =>{
		messageToUpdate = message
		const currentEmbed = message.embeds[0]
		incursionsEmbed.description = currentEmbed.description
		currentEmbed.fields.forEach((field) => {
			//console.log(field)
			incursionsEmbed.addField(field.name, field.value)
		})
	}).catch(err => {
		console.log(err)
	})

})

discordClient.on('message', message => {
	if (!message.content.startsWith(prefix) || message.author.bot) return;

	// Check if arguments contains forbidden words
	const forbiddenWords = [ "@everyone", "@here", "everyone", "here" ];
	for (var i = 0; i < forbiddenWords.length; i++) {
		if (message.content.includes(forbiddenWords[i])) {
		  	// message.content contains a forbidden word;
		  	// delete message, log, etc.
		  	return message.channel.send(`❗ Command contains forbidden words.`)
		}
	}

	let args;
	let commandName;
	let command;
	try {
		args = message.content.replace(/[”]/g,`"`).slice(prefix.length).trim().match(/(?:[^\s"]+|"[^"]*")+/g); // Format Arguments
		commandName = args.shift().toLowerCase(); // Convert command to lowercase and remove first string in args (command)
		command = discordClient.commands.get(commandName); // Gets the command info
	} catch (err) {
		console.log(`Invalid command input`)
	}

	//checks if command exists, then goes to non-subfiled commandsp
	if (!discordClient.commands.has(commandName)) {
		// Basic Commands
		
		if (message.content === `${prefix}help`) { // Unrestricted Commands.
			const returnEmbed = new Discord.MessageEmbed()
			.setColor('#FF7100')
			.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
			.setTitle("**Commands**")
			.setDescription("List of current bot commands:")
			for (const [key, value] of discordClient.commands.entries()) {
				if (value.restricted == false) {
					returnEmbed.addField(`${prefix}${key} ${value.usage}`, value.description)
				}
			}
			message.channel.send(returnEmbed.setTimestamp())
		}
		if (message.content === `${prefix}help -r`) { // Restricted Commands.
			const returnEmbed = new Discord.MessageEmbed()
			.setColor('#FF7100')
			.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
			.setTitle("**Restricted Commands**")
			.setDescription("List of current **Restricted** bot commands:")
			for (const [key, value] of discordClient.commands.entries()) {
				if (value.restricted == true && value.hidden != true) {
					returnEmbed.addField(`${prefix}${key} ${value.usage}`, value.description)
				}
			}
			message.channel.send(returnEmbed.setTimestamp())
		}
		
		if (message.content === `${prefix}ping`) {  
			message.channel.send(`🏓 Latency is ${Date.now() - message.createdTimestamp}ms. API Latency is ${Math.round(discordClient.ws.ping)}ms`);
		}

		return;
	}

	// checks for proper permissions by role against permissions.js
	let allowedRoles = perm.getRoles(command.permlvl);
	if (allowedRoles != 0) {
	  let allowed = 0;
	  for (i=0; i < allowedRoles.length; i++) {
		  if (message.member.roles.cache.has(allowedRoles[i])) {
			  allowed++;
		  }
	  }
	  if (allowed == 0) { return message.reply("You don't have permission to use that command!") } // returns true if the member has the role) 
    
	}
  	if (command.args && !args.length) {
    	let reply = `You didn't provide any arguments, ${message.author}!`;
		if (command.usage) {
			reply = `Expected usage: \`${prefix}${command.name} ${command.usage}\``;
		}
		return message.channel.send(reply);
  	}
	try {
		command.execute(message, args, passArray);
	} catch (error) {
		console.error(error);
		message.reply(`there was an error trying to execute that command!: ${error}`);
	}
});

/**
* Returns whether or not an attachment is an .jpg or .png
* @author
* @param    {Attachment} msgAttach    Input attachment
* @return   {String}              Returns if the attachment is an image
*/
function attachIsImage(msgAttach) {
	const url = msgAttach.url;
  	//True if this url is a png image.
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

/**
* Updates or adds a single field to the stored embed and updates the message
* @author   Airom
* @param    {Array} field    {name: nameOfField, value: valueOfField}
*/
function updateEmbedField(field) {
	if(!messageToUpdate) return
	if(field.name == null) return messageToUpdate.edit(incursionsEmbed.setDescription(field.value).setTimestamp())
	const temp = new Discord.MessageEmbed()
	.setColor('#FF7100')
	.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
	.setTitle("**Defense Targets**")
	.setDescription(incursionsEmbed.description)
	let isUpdated = false
	for(var i = 0; i < incursionsEmbed.fields.length; i++) {
		if(incursionsEmbed.fields[i].name == field.name) {
			if(field.value) {
				temp.addField(field.name, field.value)
			}
			isUpdated = true
			console.log("Updated existing field: " + field.name)
		} else {
			temp.addField(incursionsEmbed.fields[i].name, incursionsEmbed.fields[i].value)
			console.log("Copied existing field: " + incursionsEmbed.fields[i].name)
		}
	}
	if(!isUpdated && field.value){
		temp.addField(field.name, field.value)
		console.log("Added new field: " + field.name)
	}
	incursionsEmbed.fields = temp.fields
	messageToUpdate.edit(incursionsEmbed.setTimestamp())
	console.log(messageToUpdate.embeds[0].fields)
}

// Switch Statements
if (enableDiscordBot == 1) { discordClient.login(process.env.TOKEN) } else { console.error(`WARN: Discord Bot Disabled`)}

//Array used to pass variables and functions through the command handler
const passArray = [
	attachIsImage,
	googleClient,
	parseIncursionSystems,
	parseDamagedStarports,
	updateEmbedField
]
