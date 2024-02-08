let config = require('./config.json')
const fs = require("fs")
const path = require("path")
const glob = require('glob')
//This functions.js file serves as a global functions context for all bots that may resuse the same code.
/**
 * @author (testfax) Medi0cr3 @testfax
 * @function adjustActive,botIdent,fileNameBotMatch,deployCommands,eventTimeCreate
 */

const thisBotFunctions = {
    adjustActive: function(current,mode) {
        try {
            function getFile(current) {
                let result = null;
                const readEnvFiles = glob.sync("./" + '*.env')
                readEnvFiles.forEach(file=>{
                    const env = fs.readFileSync(file,'utf-8')
                    const array = env.split("\n")
                    const modifiedArray = array.filter(item => !item.startsWith('#'))
                    const hostnameIndex = modifiedArray.findIndex(i=>i.includes("HOSTNAME"))
                    const botnameIndex = modifiedArray.findIndex(i=>i.includes("BOTNAME"))
                    let obj = {}
                    if (hostnameIndex >= 0) {
                        let mod1 = modifiedArray[hostnameIndex]
                        obj["hostName"] = mod1.split("=")[1].trim()
                        if (obj.hostName === current) { result = obj }
                    } else { console.log("[STARTUP]".red,`${file}`.yellow,"HOSTNAME".bgRed,"not found.".red) }
                    if (botnameIndex >= 0) {
                        let mod2 = modifiedArray[botnameIndex]
                        obj["botName"] = mod2.split("=")[1].trim()
                        if (obj.hostName === current) { result = obj }
                    } else { console.log("[STARTUP]".red,`${file}`.yellow,"BOTNAME".bgRed,"not found.".red) }
                })
                return result?.hostName === current ? result : false
            }
            if (mode) {
                const activeBot = config.botTypes.find(bot => bot.botName === mode);
                const indexNum = config.botTypes.indexOf(activeBot);
                config.botTypes[indexNum].active = true
                console.log("[STARTUP]".yellow,`${thisBotFunctions.botIdent().activeBot.botName}`.green,"Development Mode:".bgRed,'✅')
                return true
            }
            const whatBot = getFile(current)
            if (whatBot.botName) {
                const activeBot = config.botTypes.find(bot => bot.botName === whatBot.botName);
                const indexNum = config.botTypes.indexOf(activeBot);
                //todo Overwrite the config.json file with new array.
                return indexNum >= 0 ? config.botTypes[indexNum].active = true : false
            }
            if (!whatBot.hostName) {
                console.log("ERROR: Incorrect hostname!!!!".bgRed,)
                console.log(`Insert the following into "hostname" in the applicable *.env for the correct bot.`.bgRed)
                console.log("Hostname ---->>>>>".red,`${current}`.bgYellow)    
                return false
            }
        }
        catch (e) {
            console.log("adjustActive function",e)
        }
    },
    botIdent: function() {
        const activeBot = config.botTypes.find(bot => bot.active === true);
        let inactiveBots = []
        inactiveBots.push(config.botTypes.filter(bot => bot.active === false).map(bot => bot.botName))
        return {activeBot,inactiveBots}
    },
    fileNameBotMatch: function(e) {
        //This only works, because the codebase is not one of the matching bot names. Case-Sensitive.
        // Example.   This codebase is: /warden.bot/ and not /Warden/ name of bot should be reserved for programming.
        function isError(val) { return val instanceof Error }
        let foundBotName = null;
        let stackLines = null;
        if (isError(e)) { stackLines = e.stack.split("\n") }
        else { stackLines = e.split(path.sep) }
        for (const line of stackLines) {
            const botNameMatch = thisBotFunctions.botIdent().inactiveBots[0].find(element => line.includes(element));
            if (botNameMatch && botNameMatch.length > 0) {
              foundBotName = botNameMatch;
              return foundBotName
            }
          }
        return foundBotName
    },
    deployCommands: async (commandsColl,REST,Routes,client) => {
		try {
            
            //Load Commands
			let commands = [];
			const commandFolders = fs.readdirSync('./commands');
			for (const folder of commandFolders) {
				const folderPath = path.join(__dirname,'commands',folder)
				if (fs.existsSync(folderPath)) { loadCommandsFromFolder(folderPath,commands); }
			}
			function loadCommandsFromFolder(folderPath,commands) {
				// path.sep is the path modules operating system specific separator for filepaths. 
				const inactiveBots = thisBotFunctions.botIdent().inactiveBots[0]
				const files = fs.readdirSync(folderPath);
				const folderSplit = folderPath.split(path.sep)
				const globalCommands = thisBotFunctions.botIdent().activeBot.useGlobalCommands
				let useGlobalCommands = 0;
				const ignoreCommands = thisBotFunctions.botIdent().activeBot.ignoreCommands
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
								const index = globalCommandObject.findIndex(obj => obj.bot === thisBotFunctions.fileNameBotMatch(folderPathSplit) && obj.folder === file);
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
								commandsColl.set(command.name, command); // For non-slash commands
							} else {
								commandsColl.set(command.data.name, command); // For slash commands
							}
							if (command.data !== undefined) {
								commands.push(command.data.toJSON());
							}
						}
					}
				}
				function findInactiveBotInPath(dir) {
					if (dir.length > 1) { 
						let match = dir.filter(ele => thisBotFunctions.botIdent().inactiveBots[0].includes(ele))
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
            //Load Discord JS Event Listeners.
            loadEventHandlers(client, path.join(__dirname, 'discordEvents'))
            function loadEventHandlers(client, directory) {
                
                try {
                    const files = fs.readdirSync(directory);
                    for (const file of files) {
                        const filePath = path.join(directory, file); // Remove __dirname from here
                        if (fs.lstatSync(filePath).isDirectory()) {
                            console.log(filePath)
                            loadEventHandlers(client, filePath); // Recursively traverse folders
                        } else if (file.endsWith('.js')) {
                            const event = require(filePath);
                            if (event && typeof event === 'object') {
                                for (const key in event) {
                                    if (typeof event[key] === 'function') {
                                        client.on(key, (...args) => event[key](...args, client));
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.log("[STARTUP]".red, `${thisBotFunctions.botIdent().activeBot.botName}`.green, "Event Handler Registration Failure:".magenta, '⛔');
                    console.error(e);
                }
            }
			const rest = new REST({version:9}).setToken(process.env.TOKEN);
			await rest.put(
				Routes.applicationGuildCommands(process.env.CLIENTID, process.env.GUILDID),
				{ body: commands },
			);
	
			console.log("[STARTUP]".yellow,`${thisBotFunctions.botIdent().activeBot.botName}`.green,"Commands Registered:".magenta,'✅');
		} catch (error) {
			console.error(error);
		}
	},
    eventTimeCreate: (dateString) => {
        function convertToUnixTimestamp(dateString) {
            dateString = dateString.toLowerCase()
            try {
                const dateTimeParts = dateString.split('+');
                const dateParts = dateTimeParts[0].split('/');
                const months = {
                  'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
                  'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
                };
                const day = parseInt(dateParts[0], 10);
                const month = months[dateParts[1]];
                const year = parseInt(dateParts[2].substring(0, 2), 10) + 2000;
                const timeOfDay = parseInt(dateTimeParts[1], 10);
                const date = new Date(year, month, day);
                const hours = Math.floor(timeOfDay / 100);
                const minutes = timeOfDay % 100;
                date.setHours(hours, minutes);
                const unixTimestampMilliseconds = date.getTime();
                const unixTimestampSeconds = Math.floor(unixTimestampMilliseconds);
                return unixTimestampSeconds;
            }
            catch(e) { 
                return "Malformed Time - Ex: 01/JAN/24+1800"
            }
          }
        const unixTimestamp = convertToUnixTimestamp(dateString);
        
        return unixTimestamp
    },
    /**
     * Log a discord bot event in the Log Channel
     * @author  (Mgram) Marcus Ingram @MgramTheDuck
     * @function botLog
    */
    botLog: async (bot,embed,severity) => {
        require("dotenv").config({ path: `./${thisBotFunctions.botIdent().activeBot.env}/` });
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
		.setFooter({ text: `${thisBotFunctions.botIdent().activeBot.botName}  Logs`, iconURL: thisBotFunctions.botIdent().activeBot.icon });
		try {
            await bot.channels.cache.get(process.env.LOGCHANNEL).send({ embeds: [embed], })
		} catch {
			console.error("ERROR: No Log Channel Environment Variable Found, Logging will not work. OR your bot permissions are not high enough.")
		}
	},
    getSortedRoleIDs: (message) => {
        /**
       * Function takes a input string and returns the closest matching Server Role ID
       * @param   {object} message        Pass through the message object
       * @returns {object}                Returns an Object of role id's and their positions IN REVERSE ORDER
       */
        try {
          let roleNameObj = {};
          let size = 0;
          message.guild.roles.cache.forEach(() => {size+=1});
          size-=1 // removing the count for @everyone from size
          message.guild.roles.cache.forEach((role) => {
            if (role.name != "@everyone" && role.name != "@here") {
              roleNameObj[size - parseInt(role.rawPosition)] = [role.id,`<@&${role.id}>`];
            }
          });
          return roleNameObj
        } catch (err) {
          console.log(err);
        }
    },
    getRoleID: (message, name) => {
        /**
         * Function takes a input string and returns the closest matching Server Role ID
         * @param   {object} message    Pass through the message object
         * @param   {string} name       The Role name you need to check
         * @returns {string}            Returns the Role ID
         */
        try {
            let roleList = []
            message.guild.roles.cache.forEach(role => {
                if (role.name !='@everyone' && role.name != '@here') {
                    roleList.push(thisBotFunctions.cleanString(role.name));
                }
            });
            switch(name.toLowerCase())
            {
                case "pc": return '428260067901571073';
                case "xb": return '533774176478035991';
                case "ps": return '428259777206812682';
                case "bgs": case "loyalist": return '712110659814293586';
                case "axi": case "axin": return '848726942786387968';
                default: break;
            }
            let best = compare.findBestMatch(name, roleList);
            return message.guild.roles.cache.find(role => thisBotFunctions.cleanString(role.name) == roleList[best["bestMatchIndex"]]).id.toString()
        } catch (err) {
            console.log(err);
        }
    },
    cleanString: (input) => {
        var output = "";
        for(var i=0;i<input.length;i++)
        {
            if(input.charCodeAt(i)<=127)
            {
                output+=input.charAt(i);
            }
        }
        return output.trim();
    },
    examplezzzzz: function() {},
    examplesssss: "SomeExampleVariable",
}

module.exports = thisBotFunctions