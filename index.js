require("dotenv").config();
require('log-timestamp');
const { deployCommands } = require('./deploy-commands'); // Re-register slash commands
const { readdirSync } = require('fs');
const { Client, Intents, MessageEmbed, Collection } = require("discord.js");
const { leaderboardInteraction } = require('./interaction/submission.js');
const { prefix, icon, securityGroups } = require('./config.json');
const cron = require('node-cron');
const { queryWarden } = require("./db");

// Discord client setup
const serverIntents = new Intents();
serverIntents.add(
	Intents.FLAGS.GUILDS,
	Intents.FLAGS.GUILD_PRESENCES,
	Intents.FLAGS.GUILD_MEMBERS,
	Intents.FLAGS.GUILD_MESSAGES,
	Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
	Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS
);
const bot = new Client({ intents: serverIntents })

// Command Setup
bot.commands = new Collection();
const commandFolders = readdirSync('./commands');
for (const folder of commandFolders) {
	const commandFiles = readdirSync(`./commands/${folder}`).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const command = require(`./commands/${folder}/${file}`);
		command.category = folder;
		if (command.data === undefined) {
			bot.commands.set(command.name, command) // For non-slash commands
		} else {
			bot.commands.set(command.data.name, command) // For slash commands
		}
	}
}

/**
 * Log a discord bot event in the Log Channel
 * @author  (Mgram) Marcus Ingram
 * @param	{string} event		The message to send.
 * @param	{string} severity	Message severity ("low", "medium", "high").
 */
const botLog = (event, severity) => {
	console.log(`${event}`)
	const logEmbed = new MessageEmbed()
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
	try {
		bot.channels.cache.find(x => x.id === process.env.LOGCHANNEL).send({ embeds: [logEmbed], })
	} catch {
		console.warn("ERROR: No Log Channel Environment Variable Found, Logging will not work.")
	}
}

/**
 * Event handler for Bot Login, manages post-login setup
 * @author  (Mgram) Marcus Ingram, (Airom42) Airom
 */
bot.once("ready", async() => {
	await deployCommands();
	botLog(`[✔] Warden is now online! logged in as ${bot.user.tag}`, `high`);
	// Scheduled Role Backup Task
	cron.schedule('*/5 * * * *', async function() {
		try {
			console.log('Running Ace Backup Task');
			await backupRoles('974673947784269824', 'club10')
			console.log(`Role Backup Job Complete (${table})`)
		} catch (err) {
			console.log(`Error completing Ace backup task: (${err})`)
		}
	});
})

/**
 * Event handler for Slash Commands, takes interaction to test before executing command code.
 * @author  (Mgram) Marcus Ingram
 */
bot.on('interactionCreate', async interaction => {
	if (interaction.isCommand()) {
		const command = bot.commands.get(interaction.commandName);
		if (!command) {
			console.log('WARNING: Unknown command detected.');
			return;
		}
		let args;
		if (interaction.options !== undefined) {
			try {
				args = JSON.stringify(interaction.options.data)
			} catch (err) {
				console.log(`WARNING: Unable to create arguments for legacy command '${interaction.commandName}', this may not affect modern slash commands: ${err}`)
			}
		}
		try {
			botLog(`Command Executed - **${interaction.commandName}** - User: **${interaction.user.tag}** - Arguments: ` + "`" + `${args}` + "`", "low");
			await command.execute(interaction, args);
		} catch (error) {
			console.error(error);
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
	}

	if (interaction.isButton()) {
		botLog(`Button triggered by user **${interaction.user.tag}** - Button ID: ${interaction.customId}`, "low")
		if (interaction.customId.startsWith("submission")) {
			interaction.deferUpdate();
			leaderboardInteraction(interaction);
			return;
		}
		if (interaction.customId === "platformpc") {
			interaction.deferUpdate();
			interaction.member.roles.add("428260067901571073")
			interaction.member.roles.add("380247760668065802")
			botLog(`Welcome Verification passed - User: **${interaction.user.tag}**`, "low")
		} else if (interaction.customId === "platformxb") {
			interaction.deferUpdate();
			interaction.member.roles.add("533774176478035991")
			interaction.member.roles.add("380247760668065802")
			botLog(`Welcome Verification passed - User: **${interaction.user.tag}**`, "low")
		} else if (interaction.customId === "platformps") {
			interaction.deferUpdate();
			interaction.member.roles.add("428259777206812682")
			interaction.member.roles.add("380247760668065802")
			botLog(`Welcome Verification passed - User: **${interaction.user.tag}**`, "low")
		}
		interaction.member.roles.add("642840406580658218");
		interaction.member.roles.add("642839749777948683");
	}
});

// Role Backup System

async function backupRoles(roleId, table) {
	console.log(`Starting Role Backup Job (${table})`)
	let guilds = bot.guilds.cache.map((guild) => guild);
	let guild = guilds[0]
	await guild.members.fetch()
	let members = guild.roles.cache.get(roleId).members.map(m=>m.user)
	try {
		await queryWarden(`DROP TABLE ${table}`)
	} catch (err) {
		console.log(`Backup Roles: Unable to delete table: ${err}`)
	}
	try {
		await queryWarden(`CREATE TABLE ${table}(
			id              SERIAL PRIMARY KEY,
			user_id         text,
			name            text,
			avatar          text
		);`)
	} catch (err) {
		console.log(`Backup Roles: Unable to reset table, exiting task: ${err}`)
		return;
	}
	for (let member of members) {
		let timestamp = Date.now()
		let name = await guild.members.cache.get(member.id).nickname
		await queryWarden(`INSERT INTO ${table}(user_id, name, avatar) VALUES($1,$2,$3)`, [
			member.id,
			name,
			member.avatar
		])
	}
}

bot.on("error", () => { bot.login(bot.login(process.env.TOKEN)) });
bot.login(process.env.TOKEN)