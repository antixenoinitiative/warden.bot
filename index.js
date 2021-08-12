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
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

// Discord client setup
const myIntents = new Discord.Intents();
myIntents.add(
	Discord.Intents.FLAGS.GUILDS,
	Discord.Intents.FLAGS.GUILD_PRESENCES, 
	Discord.Intents.FLAGS.GUILD_MEMBERS, 
	Discord.Intents.FLAGS.GUILD_MESSAGES, 
	Discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS, 
	Discord.Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS);
const discordClient = new Discord.Client({ intents: myIntents })
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

//Discord client
const incursionsEmbed = new Discord.MessageEmbed()
.setColor('#FF7100')
.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
.setTitle("**Defense Targets**")
let messageToUpdate

discordClient.once("ready", async() => {
	discordClient.channels.cache.find(x => x.id == process.env.STARTUPCHANNEL).send({ content: `Warden is now Online!`, })
  	console.log(`[✔] Discord bot Logged in as ${discordClient.user.tag}!`);
	/*if(!process.env.MESSAGEID) return console.log("ERROR: No incursion embed detected")
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
	*/

	console.log("Getting Embed")

	const platformEmbed = await discordClient.channels.cache.find(x => x.id == "533765786502823946").messages.fetch(process.env.PLATFORMEMBEDID)

	const collector = platformEmbed.createMessageComponentCollector({ componentType: 'BUTTON' });
	try {		
		collector.on("collect", (b) => {
			if (b.customId === "platformpc") {
				b.deferUpdate();
				b.member.roles.add("428260067901571073")
				b.member.roles.add("380247760668065802")
			} else if (b.customId === "platformxb") {
				b.deferUpdate();
				b.member.roles.add("533774176478035991")
				b.member.roles.add("380247760668065802")
			} else if (b.customId === "platformps") {
				b.deferUpdate();
				b.member.roles.add("428259777206812682")
				b.member.roles.add("380247760668065802")
			}
		})
	} catch (err) {
		console.error(err);
	}

})

discordClient.on('messageCreate', message => {
	if (!message.content.startsWith(prefix) || message.author.bot) return;

	// Check if arguments contains forbidden words
	const forbiddenWords = [ "@everyone", "@here", "everyone", "here" ];
	for (var i = 0; i < forbiddenWords.length; i++) {
		if (message.content.includes(forbiddenWords[i])) {
		  	// message.content contains a forbidden word;
		  	// delete message, log, etc.
		  	return message.channel.send({ content: `❗ Command contains forbidden words.` })
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
				//Only commands with permlvl zero are considered unrestricted
				if (value.permlvl == 0 && !value.hidden) {
					returnEmbed.addField(`${prefix}${key} ${value.usage}`, `${value.description} ${perm.getAllowedName(value.permlvl)}`)
				}
			}
			message.channel.send({ embeds: [returnEmbed.setTimestamp()] })
		}
		if (message.content === `${prefix}help -r`) { // Restricted Commands.
			const returnEmbed = new Discord.MessageEmbed()
			.setColor('#FF7100')
			.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
			.setTitle("**Restricted Commands**")
			.setDescription("List of current **Restricted** bot commands:")
			for (const [key, value] of discordClient.commands.entries()) {
				//No permlvl is treated as restricted
				if (value.permlvl != 0 && !value.hidden) {
					returnEmbed.addField(`${prefix}${key} ${value.usage}`, `${value.description} ${perm.getAllowedName(value.permlvl)}`)
				}
			}
			message.channel.send({ embeds: [returnEmbed.setTimestamp()] })
		}

		if (message.content === `${prefix}ping`) {
			message.channel.send({ content: `🏓 Latency is ${Date.now() - message.createdTimestamp}ms. API Latency is ${Math.round(discordClient.ws.ping)}ms` });
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
	  if (allowed == 0) { return message.reply({ content: "You don't have permission to use that command!" }) } // returns true if the member has the role)

	}
  	if (command.args && !args.length) {
    	let reply = `You didn't provide any arguments, ${message.author}!`;
		if (command.usage) {
			reply = `Expected usage: \`${prefix}${command.name} ${command.usage}\``;
		}
		return message.channel.send({ content: `${reply}` });
  	}
	try {
		command.execute(message, args, updateEmbedField);
	} catch (error) {
		console.error(error);
		message.reply(`there was an error trying to execute that command!: ${error}`);
	}
});

/**
* Updates or adds a single field to the stored embed and updates the message
* @author   Airom
* @param    {Array} field    {name: nameOfField, value: valueOfField}
*/
function updateEmbedField(field) {
	if(!messageToUpdate) return
	if(field.name == null) return messageToUpdate.edit({ embeds: [incursionsEmbed.setDescription(field.value).setTimestamp()] })
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
	messageToUpdate.edit({ embeds: [incursionsEmbed.setTimestamp()] })
	console.log(messageToUpdate.embeds[0].fields)
}

// Switch Statements
if (enableDiscordBot == 1) { discordClient.login(process.env.TOKEN) } else { console.error(`WARN: Discord Bot Disabled`)}
