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
	console.log("[STARTUP]".yellow,`${botFunc.botIdent().activeBot.botName}`.green,"Hostname Retrieved:".magenta,`${os.hostname()}`.yellow)
	mainOperation()  
}
//Separated to provide control over execution during hostname retrieval.
function mainOperation(){ 
	// Start the bot with the correct .env
	require("dotenv").config({ path: `${botFunc.botIdent().activeBot.env}` });

	// Discord client setup
	const serverIntents = new Discord.IntentsBitField(3276799)
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

	bot.once("ready", async() => {
		console.log("[STARTUP]".yellow,`${botFunc.botIdent().activeBot.botName}`.green,"Login Process Completed:".magenta,`✅`)
		await botFunc.deployCommands(commandsColl,REST,Routes,bot)
		botFunc.botLog(bot,new Discord.EmbedBuilder().setDescription(`💡 ${bot.user.username} online! logged in as ${bot.user.tag}\n - Cache cleared`).setTitle(`${bot.user.username} Online`),0);
		global.guild = bot.guilds.cache.first()
        
		if (botFunc.botIdent().activeBot.botName == 'GuardianAI') {
			const database = require(`./${botFunc.botIdent().activeBot.botName}/db/database`)
			guardianai_vars = database
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
		if (botFunc.botIdent().activeBot.botName == 'Warden') {
			const database = await require(`./${botFunc.botIdent().activeBot.botName}/db/database`)
			warden_vars = database

			const verificationGuildId = process.env.GUILDID || guild?.id
			let verificationSnapshot

			if (!verificationGuildId) {
				console.warn('[STARTUP] Skipped verification challenge catalog sync because no verification guild ID is configured.')
			}
			else try {
				const { initializeVerificationData } = require('./commands/Warden/verification/verificationService')

				verificationSnapshot = await initializeVerificationData(verificationGuildId)
				console.log('[STARTUP] Checked verification challenge catalog templates.')
			}
			catch (err) {
				console.error('[STARTUP] Failed to initialize verification data:', err)
			}

			if (verificationGuildId) try {
				const { getVerificationSettings, applyVerificationConfigSafeguard } = require('./commands/Warden/verification/verificationService')
				const { getLocalVerificationImagePoolIssues } = require('./commands/Warden/verification/verificationImages')

				const verificationSettings = verificationSnapshot?.guildSettings
					?? await getVerificationSettings(verificationGuildId)
				console.log('[STARTUP] Loaded catalog-authoritative verification challenge settings.')

				await applyVerificationConfigSafeguard({
					guildId: verificationGuildId,
					guild,
					snapshot: verificationSnapshot,
					source: 'startup',
					actorId: 'startup',
					reason: 'Startup verification configuration preflight.',
					notifyStaff: true,
					deactivateUnsafeActiveChallenges: true,
				})

				const imagePoolIssues = await getLocalVerificationImagePoolIssues()
				if (imagePoolIssues.length > 0) {
					console.warn('[STARTUP] Warden verification local image pool preflight found missing or invalid files:', imagePoolIssues)
					await botFunc.botLog(guild, new Discord.EmbedBuilder()
						.setTitle('Verification local image pool preflight failed')
						.setDescription(`The following verification image pool files are missing or invalid:\n${imagePoolIssues.map((issue) => `- ${issue}`).join('\n')}`),
					2,
					'error',
					).catch((logErr) => console.error('[STARTUP] Failed to log verification local image pool issues:', logErr))
				}
			}
			catch (err) {
				console.error('[STARTUP] Failed to warm Warden verification settings or image pool preflight:', err)
			}

			if(process.env.MODE == "PROD") {
				const evaluateMessageUpdate = 1
				const leaderboards = ['speedrun','ace']
				leaderboards.forEach(i => { processLeaderboardWithDelay(i) })
				let processedLeaderboard = 0
				async function processLeaderboardWithDelay(leaderboard) {
					try {
						let unapproved_array = []
						const unapproved_list_values = false
						const unapproved_list_sql = `SELECT id,embed_id FROM ${leaderboard} WHERE approval = (?)`
						const unapproved_list_response = await database.query(unapproved_list_sql, unapproved_list_values)
						if (unapproved_list_response.length > 0) {
							unapproved_array = unapproved_list_response
							const intervalTime = evaluateMessageUpdate == 1 ? 3500 : 10
							
							for (const dbInfo of unapproved_array) {
								processedLeaderboard++
								await processLeaderboard(dbInfo, intervalTime, leaderboard, unapproved_array, processedLeaderboard)
								await new Promise(resolve => setTimeout(resolve, intervalTime))
							}
						}
					}
					catch (err) {
						console.log(err)
						botFunc.botLog(guild,new Discord.EmbedBuilder()
							.setDescription('```' + err.stack + '```')
							.setTitle(`⛔ Fatal error experienced. processLeaderboardWithDelay(${leaderboard})`)
							,2
							,'error'
						)
						return
					}
				}
				async function processLeaderboard(dbInfo, intervalTime, leaderboard, unapproved_array, processedLeaderboard) {
					const staffChannel = process.env.STAFFCHANNELID
					const staffChannel_obj = await guild.channels.fetch(staffChannel)
					let messagesLeft = unapproved_array.length - processedLeaderboard
					let secondsRemaining = (messagesLeft * intervalTime) / 1000
					let minutesRemaining = (secondsRemaining / 60).toFixed(2)
					console.log(`Processed leaderboard message: ${leaderboard}`.green, dbInfo, minutesRemaining)
					try {
						const originalMessage = await staffChannel_obj.messages.fetch(dbInfo.embed_id)
						const receivedEmbed = originalMessage.embeds[0]
						let oldEmbedSchema = {
							title: receivedEmbed.title,
							description: receivedEmbed.description,
							color: receivedEmbed.color,
							fields: receivedEmbed.fields
						} 
						const newEmbed = new Discord.EmbedBuilder()
							.setTitle(oldEmbedSchema.title)
							.setDescription(oldEmbedSchema.description)
							.setColor(oldEmbedSchema.color)
							.setThumbnail(botFunc.botIdent().activeBot.icon)  
						oldEmbedSchema.fields.forEach(i => {
							newEmbed.addFields({name: i.name, value: i.value, inline: true},)
						})
						const row = new Discord.ActionRowBuilder()
							.addComponents(new Discord.ButtonBuilder().setCustomId(`submission-${leaderboard}-approve-${dbInfo.id}`).setLabel('Approve').setStyle(Discord.ButtonStyle.Success),)
							.addComponents(new Discord.ButtonBuilder().setCustomId(`submission-${leaderboard}-deny-${dbInfo.id}`).setLabel('Delete').setStyle(Discord.ButtonStyle.Danger),)
						const editedEmbed = Discord.EmbedBuilder.from(newEmbed)
						let buttonResult = null;
						buttonResult = await originalMessage.edit({ embeds: [editedEmbed], components: [row] })
						
						try {
							const submissionUpdate_values = [dbInfo.embed_id,dbInfo.id]
							const submissionUpdate_sql = `UPDATE ${leaderboard} SET embed_id = (?) WHERE id = (?);`
							await database.query(submissionUpdate_sql, submissionUpdate_values)
						} catch (err) {
							console.log(err)
							botFunc.botLog(guild,new Discord.EmbedBuilder()
								.setDescription('```' + err.stack + '```')
								.setTitle(`⛔ Fatal error experienced. processLeaderboard(${leaderboard})`)
								,2
								,'error'
							)
						}
						if (processedLeaderboard == unapproved_array.length) { 
							setTimeout(() => {
								console.log(`Processed ${leaderboard} Messages Completed`.cyan)
								processedLeaderboard == 0
								// interaction.editReply(
								// 	{
								// 		content: `Tag Correction Completed. Reviewed **${guildMemberCount}** Users.`, 
								// 		embeds: [], 
								// 		flags: Discord.MessageFlags.Ephemeral, 
								// 	}
								// ).catch(console.error)
							},3500)
						}
					}
					catch (err) {
						console.log(err)
						botFunc.botLog(guild,new Discord.EmbedBuilder()
							.setDescription('```' + err.stack + '```')
							.setTitle(`⛔ Fatal error experienced: checkLeaderboards(${leaderboard})`)
							,2
							,'error'
						)
						return
					}
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
		console.log("[STARTUP]".yellow,`${botFunc.botIdent().activeBot.botName}`.green,"Bot has Loaded In:".magenta,'✅');
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
		console.log("[STARTUP]".yellow,`${botFunc.botIdent().activeBot.botName}`.green,"Initiating Login Process:".magenta,`🕗`)
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
