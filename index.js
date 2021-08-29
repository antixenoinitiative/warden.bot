//------------------ SWITCHES ----------------------
// To enable or disble components for testing purposes
const enableDiscordBot = 1; // Set to 0 to disable discord bot from running
//--------------------------------------------------

require("dotenv").config();
require('./deploy-commands'); // Re-register slash commands
const fs = require('fs');
const Discord = require("discord.js");
const event = require('./events/event.js');
const config = require('./config.json');
const prefix = config.prefix

// Discord client setup
const myIntents = new Discord.Intents();
myIntents.add(
	Discord.Intents.FLAGS.GUILDS,
	Discord.Intents.FLAGS.GUILD_PRESENCES, 
	Discord.Intents.FLAGS.GUILD_MEMBERS, 
	Discord.Intents.FLAGS.GUILD_MESSAGES, 
	Discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS, 
	Discord.Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS
);
const discordClient = new Discord.Client({ intents: myIntents })

//Command detection
discordClient.commands = new Discord.Collection();
const commandFolders = fs.readdirSync('./commands');
for (const folder of commandFolders) {
	const commandFiles = fs.readdirSync(`./commands/${folder}`).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const command = require(`./commands/${folder}/${file}`);
		command.category = folder;
		if (command.data === undefined) {
			discordClient.commands.set(command.name, command) // For non-slash commands
		} else {
			discordClient.commands.set(command.data.name, command) // For slash commands
		}
	}
}

//Discord client
const incursionsEmbed = new Discord.MessageEmbed()
.setColor('#FF7100')
.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
.setTitle("**Defense Targets**")
let messageToUpdate

/**
 * Log a discord bot event in the Log Channel
 * @author  (Mgram) Marcus Ingram
 * @param	{string} event		The message to send.
 * @param	{string} severity	Message severity ("low", "medium", "high").
 */
function botLog(event, severity) {
	const logEmbed = new Discord.MessageEmbed()
	.setAuthor('Warden', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png");
	switch (severity) {
		case "low":
			logEmbed.setColor('#42f569')
			logEmbed.setDescription(`${event}`)
			break;
		case "medium":
			logEmbed.setColor('#f5bf42')
			logEmbed.setDescription(`${event}`)
			break;
		case "high":
			logEmbed.setColor('#f55142')
			logEmbed.setDescription(`${event}`)
			break;
	}
	if (process.env.LOGCHANNEL) {
		discordClient.channels.cache.find(x => x.id === process.env.LOGCHANNEL).send({ embeds: [logEmbed], })
	} else {
		console.warn("ERROR: No Log Channel Environment Variable Found, Logging will not work.") 
	}
}

discordClient.once("ready", async() => {
	botLog(`Warden is now online! ⚡`, `high`);
	console.log(`[✔] Discord bot Logged in as ${discordClient.user.tag}!`);
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
		console.error(err)
	})
})

// Command Handler for Non-Slash Commands
discordClient.on('messageCreate', message => {
	if (!message.content.startsWith(prefix) || message.author.bot) return;

	// Argument Handler and commands
	let args;
	let commandName;
	let command;
	try {
		args = message.content.replace(/[”]/g,`"`).slice(prefix.length).trim().match(/(?:[^\s"]+|"[^"]*")+/g); // Format Arguments - Split by spaces, except where there are quotes.
		args = args.map(arg => arg.replaceAll('"', ''))
		commandName = args.shift().toLowerCase(); // Convert command to lowercase and remove first string in args (command)
		command = discordClient.commands.get(commandName); // Gets the command info
	} catch (err) {
		console.warn(`Invalid command input: ${err}`)
	}

	//checks if command exists, then goes to non-subfiled commandsp
	if (!discordClient.commands.has(commandName)) {
		// Basic Commands
		if (message.content === `${prefix}help`) { // Unrestricted Commands.
			message.reply({ content: "Type `/` to view all commands"})
		}

		if (message.content === `${prefix}ping`) {
			message.channel.send({ content: `🏓 Latency is ${Date.now() - message.createdTimestamp}ms. API Latency is ${Math.round(discordClient.ws.ping)}ms` });
		}

		return;
	}

	if (command.permlvl != 0) {
		// checks for proper permissions by role against permissions.js
		let allowedRoles = config.securityGroups[command.permlvl].roles;
		if (allowedRoles !== 0) {
			let allowed = 0;
			for (const value of allowedRoles) {
				if (message.member.roles.cache.has(value)) {
					allowed++;
				}
			}
			if (allowed === 0) { 
				botLog('**' + message.author.username + '#' + message.author.discriminator + '** Attempted to use command: `' + prefix + command.name + ' ' + args + '`' + ' Failed: Insufficient Permissions', "medium")  
				return message.reply("You don't have permission to use that command!") 
			} 	// returns false if the member has the role) 
		}
	}


	if (command.args && !args.length) {
		let reply = `You didn't provide any arguments, ${message.author}!`;
		if (command.usage) {
			reply = `Expected usage: \`${prefix}${command.name} ${command.usage}\``;
		}
		return message.channel.send({ content: `${reply}` });
	}
	try {
		command.execute(message, args, updateEmbedField); // Execute the command
		botLog('**' + message.author.username + '#' + message.author.discriminator + '** Used command: `' + prefix + command.name + ' ' + args + '`', "low");
	} catch (error) {
		console.error(error);
		message.reply(`there was an error trying to execute that command!: ${error}`);
	}
});

// Button Handler
discordClient.on('interactionCreate', b => {
	if (!b.isButton()) return;
	
	// Event Response Handler
	if (b.customId.startsWith("event")) {
		b.deferUpdate();
		let response = b.customId.split("-");
		if (response[2] === "enroll") {
			event.joinEvent(b, response[1])
		}
		if (response[2] === "leave") {
			event.leaveEvent(b, response[1])
		}
		return;
	}

	// Platform Response Handler
	if (b.customId === "platformpc") {
		b.deferUpdate();
		b.member.roles.add("428260067901571073")
		b.member.roles.add("380247760668065802")
		botLog(`Welcome Verification passed - User: **${b.member.nickname}**`, "low")
	} else if (b.customId === "platformxb") {
		b.deferUpdate();
		b.member.roles.add("533774176478035991")
		b.member.roles.add("380247760668065802")
		botLog(`Welcome Verification passed - User: **${b.member.nickname}**`, "low")
	} else if (b.customId === "platformps") {
		b.deferUpdate();
		b.member.roles.add("428259777206812682")
		b.member.roles.add("380247760668065802")
		botLog(`Welcome Verification passed - User: **${b.member.nickname}**`, "low")
	}
	b.member.roles.add("642840406580658218");
	b.member.roles.add("642839749777948683");
});

// Slash Command Handler
discordClient.on('interactionCreate', async interaction => {
	if (!interaction.isCommand()) return;
	console.log(interaction)

	const command = discordClient.commands.get(interaction.commandName);
	console.log(command)
	if (!command) return;

	const args = interaction.options.data

	if (command.permlvl != 0) {
		// checks for proper permissions by role against permissions.js
		let allowedRoles = config.securityGroups[command.permlvl].roles;
		let userRoles = interaction.member._roles;
		let allowed = false;
		for (let role of allowedRoles) {
			if (userRoles.includes(role)) { allowed = true }
		}
		if (allowed == false) { 
			botLog('**' + interaction.member.nickname + '** Attempted to use command: /`' + interaction.commandName + ' ' + interaction.data + '`' + ' Failed: Insufficient Permissions', "medium")  
			return interaction.reply("You don't have permission to use that command!") 
		}
	}

	try {
		await command.execute(interaction, args);
		botLog('**' + interaction.member.nickname + '** Used command: `' + interaction.commandName + ' ' + interaction.data + '`', "low");
	} catch (error) {
		console.error(error);
		await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
	}
});

discordClient.on("error", () => { discordClient.login(discordClient.login(process.env.TOKEN)) });

/**
* Updates or adds a single field to the stored embed and updates the message
* @author   Airom
* @param    {Array} field    {name: nameOfField, value: valueOfField}
*/
function updateEmbedField(field) {
	if(!messageToUpdate) return
	if(field.name === null) return messageToUpdate.edit({ embeds: [incursionsEmbed.setDescription(field.value).setTimestamp()] })
	const temp = new Discord.MessageEmbed()
	.setColor('#FF7100')
	.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
	.setTitle("**Defense Targets**")
	.setDescription(incursionsEmbed.description)
	let isUpdated = false
	for(const value of incursionsEmbed.fields) {
		if(value.name === field.name) {
			if(field.value) {
				temp.addField(field.name, field.value)
			}
			isUpdated = true
			console.log("Updated existing field: " + field.name)
		} else {
			temp.addField(value.name, value.value)
			console.log("Copied existing field: " + value.name)
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
if (enableDiscordBot === 1) { discordClient.login(process.env.TOKEN) } else { console.error(`WARN: Discord Bot Disabled`)}