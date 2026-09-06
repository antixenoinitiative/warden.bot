/**
 @description * Changing the 'Type' variable to 'null' results in production level mode automatically and the name of the bot being declared by the .env file.
 @description * Enter a declared DEV mode by naming the bot.
 @description * process.env.MODE being labeled anything, but "PROD" will designate a dev server
 */
let type = null;
if (process.env.MODE != "PROD") {
	// type = "GuardianAI"
	// type = "Warden"
}


//! Modularity for codebase. Stff
/**
 * @description The bot's "bot.user.username" is dictated by the Discord Dev Portal and the name of the bot you selected there. Not here.
 * @description Your responsibility is to name them appropriately. Extremely recommended to lable both the same.
 * @example       - The config.json file "botTypes[0].active" is determined by the 'hostname'.
 * @description   - Bot will fail to run if hostname does not match.
 * @description Dont place the main contents of the bot in a folder with the same name of the bot.
 * @example      - IF bot name is Warden.bot, Use something like './warden.bot/' not ./warden/
 * @description  - Naming the bot root directory as the same name of the bot will cause it to fail hardcore.
 */
//! functions.js 
/**
 * @description  Houses all the ancilliary functions that the bot may need. 
 * @description  Keeps from hardcoding functions in multiple places that could otherwise be used in multiple places.
 */

//!config.json explaination
/**
 * @description Bot Name'd objects is the location that you put specific bot information to call from anywhere in your code.
 * @example 
 * {
 * 	"Warden": {},
 *  "GuardianAI": {},
 *  "botTypes" [] 
 * }
 */

//! botTypes: []
/**
 * @field      useGlobalCommands
 * @description - Allows the use of commands from any "active:false" bot.
 * @description - Within the './commands' folder you can cross load commands from an inactive bot to an active bot.
 * @description - GuardianAI is the botName
 * @description - path2 is the folder and command sets that you want to include
 * @description - ENSURE that you do not duplicate commands in the bots local folder and a globally attached folder
 * @example
 * "useGlobalCommands": ["GuardianAI.path2","GuardianAI.path1"]
 * @field       ignoreCommands:[]
 * @description - Within the './commands' folders tells the 'active' bot to ignore these folders in its subdirectories.
 * @description - Allows you to ingore command folders in the bots: './commands/someBot/sherrif/'
 * @example 
 * "ignoreCommands": ["sheriff","watch","reminder"]
 * 
 */

/**
 * @package.json Known issues
 * Upgrade node-fetch past version two will incure ES Module errors. node-fetch v3 is ES Module only. BLUF use v2.7.0
 */

// Imported Modules
const Discord = require("discord.js")
const { REST } = require('@discordjs/rest')
const { Routes } = require('discord-api-types/v10')
const botFunc = require('./functions.js')
const { createConsoleReporter, logConsoleStartupStatus } = require('./logging/consoleReporting')
const cron = require('node-cron');
const fs = require('fs');
const path = require('path')
const colors = require('colors')

//Warden.bot variables for index.js
let warden_vars = {};
//Guardian.bot variables for index.js
let guardianai_vars = {};


// Retrieve hostname so the bot knows where its being launched from.
//!! If you are running running all bots from the SAME HOST. You'll have to come up with another solution on your own if you want to have them run from the same host. This is a great bot template.
const os = require('os');

/**
 * @description Sets the config.json file in memory with "active:true" for the correct bot based on the hostname.
 * @description Loads the specific bot based on the hostname and annotates the mode (Dev/Prod) to the bot.
 * @description HOSTNAME is configured in the appropriate *.env file.
 * @param {string} hostname - The current hostname provided by os.hostname().
 * @param {string} BotName - The name of the bot for development purposes. Omit for PROD mode.
 * @param @type Declared on Line 2.
 * @returns {truthy/falsy}
 * @author testfax (Medi0cre) @testfax
 */
if (botFunc.adjustActive(os.hostname(),type)) {
	logConsoleStartupStatus(botFunc.botIdent().activeBot.botName, 'Hostname Retrieved', `${os.hostname()}`.yellow)
	mainOperation()  
}
//Separated to provide control over execution during hostname retrieval.
function mainOperation(){ 
	// Start the bot with the correct .env
	require("dotenv").config({ path: `${botFunc.botIdent().activeBot.env}` });

	// Discord client setup
	const serverIntents = new Discord.IntentsBitField([
		Discord.GatewayIntentBits.Guilds,
		Discord.GatewayIntentBits.GuildMembers,
		Discord.GatewayIntentBits.GuildModeration,
		Discord.GatewayIntentBits.GuildEmojisAndStickers,
		Discord.GatewayIntentBits.GuildIntegrations,
		Discord.GatewayIntentBits.GuildWebhooks,
		Discord.GatewayIntentBits.GuildInvites,
		Discord.GatewayIntentBits.GuildVoiceStates,
		Discord.GatewayIntentBits.GuildMessages,
		Discord.GatewayIntentBits.GuildMessageReactions,
		Discord.GatewayIntentBits.GuildMessageTyping,
		Discord.GatewayIntentBits.DirectMessages,
		Discord.GatewayIntentBits.DirectMessageReactions,
		Discord.GatewayIntentBits.DirectMessageTyping,
		Discord.GatewayIntentBits.MessageContent,
		Discord.GatewayIntentBits.GuildScheduledEvents,
		Discord.GatewayIntentBits.AutoModerationConfiguration,
		Discord.GatewayIntentBits.AutoModerationExecution,
	])
	const bot = new Discord.Client({ 
		intents: serverIntents, 
		partials: [
			Discord.Partials.User, 
			Discord.Partials.Message, 
			Discord.Partials.Channel, 
			Discord.Partials.Reaction
		] 
	})
	/**
	 * Loads command objects from the commands folder
	 * @author  (testfax) Medi0cr3 @testfax
	 */
	let commandsColl = bot.commands = new Discord.Collection()

	bot.once(Discord.Events.ClientReady, async() => {
		logConsoleStartupStatus(botFunc.botIdent().activeBot.botName, 'Login Process Completed', '✅')
		await botFunc.deployCommands(commandsColl,REST,Routes,bot)
		const configuredGuildId = process.env.GUILDID || botFunc.botIdent().activeBot.guildId
		const guild = bot.guilds.cache.get(configuredGuildId) ?? bot.guilds.cache.first()
		global.guild = guild
		const activeBotName = botFunc.botIdent().activeBot.botName
		const activeDatabase = require(`./${activeBotName}/db/database`)
		const wardenLeaderboards = activeBotName === 'Warden'
			? require('./Warden/leaderboards')
			: undefined
		const wardenScheduledEvents = activeBotName === 'Warden'
			? require('./Warden/scheduledEvents')
			: undefined
		const leaderboardLifecycleReport = activeBotName === 'Warden'
			? createConsoleReporter('Leaderboard').forSubsystem('Lifecycle')
			: undefined
		const scheduledEventLifecycleReport = activeBotName === 'Warden'
			? createConsoleReporter('Scheduled Events').forSubsystem('Lifecycle')
			: undefined
		const loggingSettings = require('./logging/loggingSettings')
		try {
			await loggingSettings.initializeLoggingSettings({
				guild,
				guildId: configuredGuildId,
			})
			logConsoleStartupStatus(activeBotName, 'Logging Settings', '✅')
			void botFunc.botLog(bot,new Discord.EmbedBuilder().setDescription(`💡 ${bot.user.username} online! logged in as ${bot.user.tag}\n - Cache cleared`).setTitle(`${bot.user.username} Online`),0)
				.catch((error) => console.error(error))
		}
		catch (err) {
			logConsoleStartupStatus(activeBotName, 'Logging Settings', '❌', {
				failed: true,
				error: err,
			})
		}
        
		if (activeBotName == 'GuardianAI') {
			guardianai_vars = activeDatabase
			if (process.env.MODE == "PROD") {
				//Assigns the ActivityType (status) of the bot with the system name.
				carrierJumpRedisplay()
				async function carrierJumpRedisplay() {
					const currentSystem_sql = 'SELECT starSystem FROM `carrier_jump` ORDER BY id DESC LIMIT 1';
					const currentSystem_response = await guardianai_vars.query(currentSystem_sql)
					if (currentSystem_response.length > 0) {
						let guardianai = await guild.members.fetch({query: botFunc.botIdent().activeBot.botName, limit: 1})
						guardianai = guardianai.first()
						guardianai.user.setActivity(`${currentSystem_response[0].starSystem}`, { type: Discord.ActivityType.Custom });
					}
				}
			}
		} 
		if (activeBotName == 'Warden') {
			const database = activeDatabase
			warden_vars = database

			if(process.env.MODE == "PROD") {
				try {
					const { reconcilePendingLeaderboardApprovals } = require('./commands/Warden/leaderboards/staffApproval/reconciliation')
					await reconcilePendingLeaderboardApprovals(guild, { reason: 'startup' })
				}
				catch (err) {
					leaderboardLifecycleReport.error('Startup reconciliation failed', err)
					void Promise.resolve(botFunc.botLog(guild, new Discord.EmbedBuilder()
						.setDescription('```' + err.stack + '```')
						.setTitle('⛔ Leaderboard startup reconciliation failed'), 2, 'error'))
						.catch((logError) => leaderboardLifecycleReport.error('Discord error report failed', logError))
				}

				// Scheduled Role Backup Task
				// cron.schedule('*/5 * * * *', function () {
				// 	//TODO REBUILD THIS, not absolutely necessary, as people that leave the server showup in the staff channel with all previous roles.
				// 	// backupClubRoles()
				// 	// console.log("Reminder to implement backup features for roles.")
				// });
				/**
				 * Role backup system, takes the targetted role and table and backs up to SQL database.
				 * @author  (Mgram) Marcus Ingram @MgramTheDuck
				 */
				
				// //the following part handles the triggering of reminders
				// let minutes = 0.1, the_interval = minutes * 60 * 1000; //this sets at what interval are the reminder due times getting checked
				// setInterval(async function() {
				// 	let currentDate = new Date(Date.now());
			
				// 	let res = await warden_vars.query("SELECT * FROM reminders WHERE duetime < $1", [currentDate]);
			
				// 	if (res.rowCount == 0) return; //if there are no due reminders, exit the function
			
				// 	for (let row = 0; row < res.rowCount; row++) { //send all
				// 		const channel = await bot.channels.cache.get(res.rows[row].channelid);
				// 		channel.send(`<@${res.rows[row].discid}>: ${res.rows[row].memo}`);
				// 	}
			 
				// 	try {
				// 		res = await warden_vars.query("DELETE FROM reminders WHERE duetime < $1", [currentDate]);
				// 	} catch (err) {
				// 		console.log(err);
				// 	}
				// }, the_interval);
				}
			}
		logConsoleStartupStatus(activeBotName, 'Bot has Loaded In', '✅');
		if (wardenLeaderboards) {
			void Promise.resolve().then(async () => {
				await wardenLeaderboards.initializeLeaderboardWebsite({ guild, guildId: configuredGuildId })
			}).catch((err) => leaderboardLifecycleReport.warn('Website startup sync failed', err))
		}
		if (wardenScheduledEvents) {
			void Promise.resolve().then(() => (
				wardenScheduledEvents.initialize({ guild, guildId: configuredGuildId })
			)).catch((err) => scheduledEventLifecycleReport.warn('Startup reconciliation failed', err))
		}
	})
	if (process.env.MODE != "PROD") {
		bot.on('error', console.log)
		bot.on('debug', console.log) 
		bot.on('warn', console.log)
	}
	// bot.rest.on('rateLimited', (info) => {
	// 	/**
	//    * 
	//    * @param {rate limit} item 
	//    * 4. Specific API Limits
	// 		API Action	Rate Limit
	// 		Sending Messages	    	5 requests per channel per 5 seconds.
	// 		Editing Messages	    	5 requests per message per 5 seconds.
	// 		Reaction Add/Remove	    	1 request per 1 second per user.
	// 		Channel Modifications		2 requests per 10 seconds per channel.
	// 		Guild Member Modifications	10 requests per 10 seconds per guild.
	// 		Command Interactions		Limited by user interaction timing (~1 second).
	//    */
	// 	console.log('Potential Rate limit hit:'.red);
	// 	console.log(info)
	// 	botFunc.botLog(guild,new Discord.EmbedBuilder()
	// 		.setTitle(`⛔ Potential Rate Limit`)
	// 		.setDescription('Monitor server for rate limiting.')
	// 		.addFields(
	// 			{ name: `Global:`, value: `${info.global}`, inline: false },
	// 			{ name: `Hash:`, value: `${info.hash}`, inline: false },
	// 			{ name: `Limit:`, value: `${info.limit}`, inline: false },
	// 			{ name: `majorParameter:`, value: `${info.majorParameter}`, inline: false },
	// 			{ name: `method:`, value: `${info.method}`, inline: false },
	// 			{ name: `name:`, value: `${info.name}`, inline: false },
	// 			{ name: `retryAfter:`, value: `${info.retryAfter}`, inline: false },
	// 			{ name: `route:`, value: `${info.route}`, inline: false },
	// 			{ name: `scope:`, value: `${info.scope}`, inline: false },
	// 			{ name: `sublimitTimeout:`, value: `${info.sublimitTimeout}`, inline: false },
	// 			{ name: `timeToReset(ms):`, value: `${info.timeToReset}`, inline: false },
	// 			{ name: `url:`, value: `${info.url}`, inline: false }, 
	// 		)
	// 		,2
	// 		,'error'
	// 	)
	// })
	  
	// Have the bot login
	function checkENV(item) {
		if (item) { return item}
		else { console.log("[ENV]".red,"ERROR".bgRed,"ENV file Malformed or Missing".yellow); return false }
	}
	if (checkENV(process.env.TOKEN)) { 
		logConsoleStartupStatus(botFunc.botIdent().activeBot.botName, 'Initiating Login Process', '🕗')
		bot.login(process.env.TOKEN)
	}
	// General error handling
	process.on('uncaughtException', function (err) {
		const dateTime = botFunc.generateDateTime();
		console.log('[ERROR]'.red,`${dateTime} ⛔ Unhandled Exception:`,err.stack)
		botFunc.botLog(guild,new Discord.EmbedBuilder()
			.setTitle(`⛔ Fatal error experienced`)
			.setDescription('```' + err.stack + '```')
			,2
			,'error'
		)
	})
}
