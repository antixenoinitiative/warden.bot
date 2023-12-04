//! Modularity for codebase.
// The bot's "bot.user.username" is dictated by the Discord Dev Portal and the name of the bot you selected there. Not here.
// Your responsibility is to name them appropriately. Extremely recommended to lable both the same.
//    -The config.json file "botTypes[0].active" is determined by the 'hostname'.
//    -Bot will fail to run if hostname does not match.
// Dont place the main contents of the bot in a folder with the same name of the bot.
//  - Use something like './warden.bot/'
//  - Naming the bot root directory as the same name of the bot will cause it to fail hardcore.


//! functions.js 
//  Houses all the ancilliary functions that the bot may need. Keeps from hardcoding functions in multiple places that could otherwise.
//    	be used in multiple places.

// config.json explaination
// Bot Name'd objects is the location that you put specific bot information to call from anywhere in your code.
//!    EXAMPLE: 
//!    { 
//!       "Warden": {},
//!       "GuardianAI": {},
//!    } 
//
//
//! botTypes: []
//todo    'useGlobalCommands' 
//        - Within the './commands' folder you can cross load commands from an inactive bot to an active bot.
//!    EXAMPLE: "useGlobalCommands": ["GuardianAI.path2","GuardianAI.path1"],
//      - Allows the use of commands from any "active:false" bot.
//      - GuardianAI is the botName which is 
//      - path2 is the folder that you want to include
//	    - ENSURE that you do not duplicate commands in the bots local folder and a globally attached folder.
//
//todo   'ignoreCommands' 
//       - Within the './commands' folders tells the 'active' bot to ignore these folders.
//!	   EXAMPLE: "ignoreCommands": ["sheriff","watch","reminder"]
//		- Allows you to ingore command folders in the bots: './commands/someBot/sherrif/'

// Imported Modules
const { Client, IntentsBitField, EmbedBuilder, Collection } = require("discord.js")
const { REST } = require('@discordjs/rest')
const { Routes } = require('discord-api-types/v9')
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
//!! Disable the next 3 lines, if you are running from the SAME HOST. You'll have to come up with another solution on your own if so.
//!! Best case is to run it from a separate folder/repo if you want to do the same host. 
//!!      or make a map of the remaining code and run as a loop.
const os = require('os');
//Will set its config.json file inmemory "active:true" on correct bot.
if (botFunc.adjustActive(os.hostname())) {
	console.log("[STARTUP]".yellow,`${botFunc.botIdent().activeBot.botName}`.green,"Hostname Retrieved:".magenta,`${os.hostname()}`.bgYellow)
	mainOperation()
}
//Separated to provide control over execution during hostname retrieval.
function mainOperation(){ 
	// Start the bot with the correct .env
	require("dotenv").config({ path: `${botFunc.botIdent().activeBot.env}` });
	// Bot Determination
	// Local Modules determined by bot "active" state.
	// Specific bots need specific things, load them here.
	if (botFunc.botIdent().activeBot.botName == 'Warden') {
	    const leaderboardInteraction = require(`./${botFunc.botIdent().activeBot.botName}/interaction/submission.js`)
		const { query } = require(`./${botFunc.botIdent().activeBot.botName}/db`)
		warden_vars[leaderboardInteraction] = leaderboardInteraction
		warden_vars[query] = query
	}
	if (botFunc.botIdent().activeBot.botName == 'GuardianAI') {
		const db  = require(`./${botFunc.botIdent().activeBot.botName}/db/database`)
		guardianai_vars[db] = db
	}
	
	console.log("[STARTUP]".yellow, `${botFunc.botIdent().activeBot.botName}`.green,"Loading Commands:".magenta,"🕗")
	
	// Discord client setup
	const serverIntents = new IntentsBitField(3276799);
	const bot = new Client({ intents: serverIntents })
	
	/**
	 * Loads command objects from the commands folder
	 * @author  (testfax) Medi0cr3
	 */
	bot.commands = new Collection();
	async function deployCommands() {
		try {
			let commands = [];
			const commandFolders = fs.readdirSync('./commands');
			for (const folder of commandFolders) {
				const folderPath = path.join(__dirname,'commands',folder)
				if (fs.existsSync(folderPath)) { loadCommandsFromFolder(folderPath,commands); }
			}
			const rest = new REST({version:9}).setToken(process.env.TOKEN);
			await rest.put(
				Routes.applicationGuildCommands(process.env.CLIENTID, process.env.GUILDID),
				{ body: commands },
			);
	
			console.log("[STARTUP]".yellow,`${botFunc.botIdent().activeBot.botName}`.green,"Commands Registered:".magenta,'✅');
		} catch (error) {
			console.error(error);
		}
	}
	function loadCommandsFromFolder(folderPath,commands) {
		// path.sep is the path modules operating system specific separator for filepaths. 
		const inactiveBots = botFunc.botIdent().inactiveBots[0]
		const files = fs.readdirSync(folderPath);
		const folderSplit = folderPath.split(path.sep)
		const globalCommands = botFunc.botIdent().activeBot.useGlobalCommands
		let useGlobalCommands = 0;
		const ignoreCommands = botFunc.botIdent().activeBot.ignoreCommands
		function continueLoad(thisFolderPath,files) {
			for (const file of files) {
				let cmdGlobalPath = null
				//Make sure the Global command is in the scope from the array. "GuardianAI.path2"
				// GuardianAI is the bot
				// path2 is the folder within that ./commands/GuardianAI/path2/somecommand.js
				//The following disects everythign into an Object called 'cmdGlobalPath'
				try {
					if (useGlobalCommands) {
						//If this folder contains global commands from the active bot, build the object.
						let globalCommandObject = globalCommands.map(i=>{
							const array = i.split(".")
							return array.length > 0 ? { bot:array[0],folder:array[1] } : "None"
						})
						const folderPathSplit = thisFolderPath.split(path.sep).pop();
						//findIndex results: -1 Not Found, Anything 0 and up is the index number FOLDER found at, not file. *.js files are handled elsewhere..
						const index = globalCommandObject.findIndex(obj => obj.bot === botFunc.fileNameBotMatch(folderPathSplit) && obj.folder === file);
						// if (displayConsole) { console.log(index,folderPathSplit,file) } // Find Folders, Ignore Files.
						//*.js files are handled elsewhere. This is strictly for paths and folders.
						if (index >= 0) { 
							let joinedPath = path.join(folderPath,file)
							joinedPath = { path: path.normalize(joinedPath) }
							//Merge path into the correct globalCommandObject so that the the follow on code can tell what to do. 
							cmdGlobalPath = {...globalCommandObject[index],...joinedPath}
						}
					}
				}
				catch (e) { console.log(e) }
				//Now that 'cmdGlobalPath' was established for global commands, move onto the recursive structure. 
	
	
				//Check if its a directory or file.
				const filePath = path.join(thisFolderPath, file);
				const fileStat = fs.statSync(filePath);
				if (fileStat.isDirectory()) {
					const filePathSplit = filePath.split(path.sep).pop()
					if (cmdGlobalPath && useGlobalCommands == 1) {
						//Now that a path has been found, go into that subfolder and get the files.
						loadCommandsFromFolder(cmdGlobalPath.path,commands); // Recursively go into subdirectories
					}
					if (!ignoreCommands.includes(filePathSplit) && useGlobalCommands == 0) {
						loadCommandsFromFolder(filePath,commands); // Recursively go into subdirectories
					}
				} else if (file.endsWith('.js')) {
					const command = require(filePath);
					const folderName = path.basename(folderPath);
					command.category = folderName;
					if (command.data === undefined) {
						bot.commands.set(command.name, command); // For non-slash commands
					} else {
						bot.commands.set(command.data.name, command); // For slash commands
					}
					if (command.data !== undefined) {
						commands.push(command.data.toJSON());
					}
				}
			}
		}
		function findInactiveBotInPath(dir) {
			if (dir.length > 1) { 
				let match = dir.filter(ele => botFunc.botIdent().inactiveBots[0].includes(ele))
				return match.length > 0 ? match[0] : ""
			}
		}
		//Initial Folders for all folders except inactiveBots.
		//'folderSplit' gets all folders and subfolders within the ./commands/ folder.
		if (!inactiveBots.includes(findInactiveBotInPath(folderSplit)) && !ignoreCommands.includes(findInactiveBotInPath(folderSplit))) {
			useGlobalCommands = 0
			continueLoad(folderPath,files) 
		}
		//Get Global Commands from Active Bot config.
		if (inactiveBots.includes(findInactiveBotInPath(folderSplit))) {
			useGlobalCommands = 1
			continueLoad(folderPath,files) 
		}
	}
	// Have the bot login
	bot.login(process.env.TOKEN)
	/**
	 * Event handler for Bot Login, manages post-login setup
	 * @author  (Mgram) Marcus Ingram, (Airom42) Airom
	 */
	bot.once("ready", async() => {
		await deployCommands();
		botLog(new EmbedBuilder().setDescription(`💡 ${bot.user.username} online! logged in as ${bot.user.tag}`).setTitle(`${bot.user.username} Online`),2);
		console.log("[STARTUP]".yellow,`${botFunc.botIdent().activeBot.botName}`.green,"Bot has Logged In:".magenta,'✅');
	
		if (botFunc.botIdent().activeBot.botName == 'Warden') {
			// Scheduled Role Backup Task
			if(process.env.MODE == "PROD") {
				cron.schedule('*/5 * * * *', function () {
					backupClubRoles()
				});
			}
		}
	})
	/**
	 * Log a discord bot event in the Log Channel
	 * @author  (Mgram) Marcus Ingram
	 */
	async function botLog(embed,severity) {
		let logColor
		switch (severity) {
			case 0:
				logColor = '#42f569'
				break;
			case 1:
				logColor = '#f5bf42'
				break;
			case 2:
				logColor = '#f55142'
				break;
		}
		embed.setColor(logColor)
		.setTimestamp()
		.setFooter({ text: `${botFunc.botIdent().activeBot.botName}  Logs`, iconURL: botFunc.botIdent().activeBot.icon });
		try {
			await bot.channels.cache.get(process.env.LOGCHANNEL).send({ embeds: [embed], })
		} catch {
			console.warn("ERROR: No Log Channel Environment Variable Found, Logging will not work.")
		}
	}
	/**
	 * Event handler for Slash Commands, takes interaction to test before executing command code.
	 * @author  (Mgram) Marcus Ingram
	 */
	bot.on('interactionCreate', async interaction => {
		if (interaction.isCommand()) {
			const command = bot.commands.get(interaction.commandName);
			if (!command) {
				console.log('WARNING: Unknown command detected.');
				botLog(new EmbedBuilder().setDescription(`Command used by ${interaction.user.tag} - Command ` + "`" + `${interaction.commandName}` + "`" + ` with arguments: ` + "`" + `${args}` + "`"),0);
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
				botLog(new EmbedBuilder().setDescription(`Command used by ${interaction.user.tag} - Command ` + "`" + `${interaction.commandName}` + "`" + ` with arguments: ` + "`" + `${args}` + "`"),0);
				await command.execute(interaction, args);
			} catch (error) {
				console.error(error);
				await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
			}
		}
	
		if (interaction.isButton()) {
			botLog(new EmbedBuilder().setDescription(`Button triggered by user **${interaction.user.tag}** - Button ID: ${interaction.customId}`),0);
			if (botFunc.botIdent().activeBot.botName == 'Warden') {
				if (interaction.customId.startsWith("submission")) {
					interaction.deferUpdate();
					warden_vars.leaderboardInteraction(interaction);
					return;
				}
			}
		}
	});
	// Message Deleted by user
	bot.on('messageDelete', async message => {
		try {
			botLog(new EmbedBuilder().setDescription(`Message deleted by user: ${message.author}` + '```' + `${message.content}` + '```').setTitle(`Message Deleted 🗑️`),1)
		} catch (err) {
			botLog(new EmbedBuilder().setDescription(`Something went wrong while logging a Deletion event: ${err}`).setTitle(`Logging Error`),2);
		}
	})
	// Message Updated by user
	bot.on('messageUpdate', (oldMessage, newMessage) => {
		if (oldMessage != newMessage && oldMessage.author.id != process.env.CLIENTID) {
			botLog(new EmbedBuilder().setDescription(`Message updated by user: ${oldMessage.author}` + '```' + `${oldMessage}` + '```' + `Updated Message:` + '```' + `${newMessage}` + '```' + `Message Link: ${oldMessage.url}`).setTitle(`Message Updated 📝`),1)
		}
	});
	// User leaving server
	bot.on('guildMemberRemove', member => {
		let roles = ``
		member.roles.cache.each(role => roles += `${role}\n`)
		botLog(new EmbedBuilder()
		.setDescription(`User ${member.user.tag}(${member.displayName}) has left or was kicked from the server.`)
		.setTitle(`User Left/Kicked from Server`)
		.addFields(
			{ name: `ID`, value: `${member.id}`},
			{ name: `Date Joined`, value: `<t:${(member.joinedTimestamp/1000) >> 0}:F>`},
			{ name: `Roles`, value: `${roles}`},
		),2)
	})
	// Other functions
	if (botFunc.botIdent().activeBot.botName == 'Warden') {
		/**
		 * Role backup system, takes the targetted role and table and backs up to SQL database.
		 * @author  (Mgram) Marcus Ingram
		 */
		async function backupClubRoles() {
			let guilds = bot.guilds.cache.map((guild) => guild);
			let guild = guilds[0]
			await guild.members.fetch()
			let members = guild.roles.cache.get('974673947784269824').members.map(m=>m.user)
			try {
				await warden_vars.query(`DELETE FROM club10`)
			} catch (err) {
				console.log(`Unable to delete rows from table`)
				return;
			}
			for (let member of members) {
				let name = await guild.members.cache.get(member.id).nickname
				await warden_vars.query(`INSERT INTO club10(user_id, name, avatar) VALUES($1,$2,$3)`, [
					member.id,
					name,
					member.avatar
				])
			}
			console.log('Club 10 table updated')
		}
		//Reminder system, probably pull it out.
		if(process.env.MODE == "PROD") {
			//the following part handles the triggering of reminders
			let minutes = 0.1, the_interval = minutes * 60 * 1000; //this sets at what interval are the reminder due times getting checked
			setInterval(async function() {
				let currentDate = new Date(Date.now());
		
				let res = await warden_vars.query("SELECT * FROM reminders WHERE duetime < $1", [currentDate]);
		
				if (res.rowCount == 0) return; //if there are no due reminders, exit the function
		
				for (let row = 0; row < res.rowCount; row++) { //send all
					const channel = await bot.channels.cache.get(res.rows[row].channelid);
					channel.send(`<@${res.rows[row].discid}>: ${res.rows[row].memo}`);
				}
		
				try {
					res = await warden_vars.query("DELETE FROM reminders WHERE duetime < $1", [currentDate]);
				} catch (err) {
					console.log(err);
				}
			}, the_interval);
		}
	}
	// General error handling
	process.on('uncaughtException', function (err) {
		console.log(`⛔ Fatal error occured:`)
		console.error(err);
		bot.channels.cache.get(process.env.LOGCHANNEL).send({ content: `⛔ Fatal error experienced: ${err}` })
	})
}
