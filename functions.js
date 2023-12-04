let config = require('./config.json')
const fs = require("fs")
const path = require("path")
/**
 * @author (testfax) Medi0cr3 @testfax
 * @function adjustActive,botIdent,fileNameBotMatch
 */
const bot = {
    adjustActive: function(current,mode) {
        if (mode) { 
            const activeBot = config.botTypes.find(bot => bot.botName === mode);
            const indexNum = config.botTypes.indexOf(activeBot);
            config.botTypes[indexNum].active = true
            console.log("[STARTUP]".yellow,`${bot.botIdent().activeBot.botName}`.green,"Development Mode:".bgRed,'✅')
            return true
        }
        try {
            const activeBot = config.botTypes.find(bot => bot.hostname === current);
            const indexNum = config.botTypes.indexOf(activeBot);
            config.botTypes[indexNum].active = true
            //todo Overwrite the config.json file with new array.
            return true
        }
        catch (e) {
            console.log("ERROR: Incorrect hostname!!!!".bgRed,)
            console.log(`Insert the following into "hostname" in config.json for the correct bot.`.bgRed)
            console.log("Hostname ---->>>>>".red,`${current}`.bgYellow)
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
            const botNameMatch = bot.botIdent().inactiveBots[0].find(element => line.includes(element));
            if (botNameMatch && botNameMatch.length > 0) {
              foundBotName = botNameMatch;
              return foundBotName
            }
          }
        return foundBotName
    },
    examplezzzzz: function() {},
    examplesssss: "SomeExampleVariable",
}

module.exports = bot