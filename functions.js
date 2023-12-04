let config = require('./config.json')
const fs = require("fs")
const path = require("path")
// "hostname": "3577bedc-4d01-4364-ae86-ab776a6ba880" //GuardianAI
const bot = {
    adjustActive: function(current) {
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
            // console.log(line, "botNameMatch".red, botNameMatch);
            if (botNameMatch && botNameMatch.length > 0) {
              foundBotName = botNameMatch;
            //   console.log(`foundBotName: ${foundBotName}`.yellow);
              return foundBotName
            }
          }
        // console.log(`foundBotName: ${foundBotName}`.yellow)
        return foundBotName
    },
    examplezzzzz: function() {},
    examplesssss: "SomeExampleVariable",
}

module.exports = bot