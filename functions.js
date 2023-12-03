const config = require('./config.json')

const bot = {
    botIdent: function() {
        const activeBot = config.botTypes.find(bot => bot.active === true);
        let inactiveBots = []
        inactiveBots.push(config.botTypes.filter(bot => bot.active === false).map(bot => bot.botName))
        return {activeBot,inactiveBots}
    },
    fileNameBotMatch: function(e) {
        let foundBotName = null;
        const stackLines = e.stack.split("\n")
        stackLines.forEach((line) => {
            const botNameMatch = line.match(bot.botIdent().inactiveBots);
            if (botNameMatch && botNameMatch.length > 0) {
                foundBotName = botNameMatch[0];
                return foundBotName
            }
        });
        return foundBotName
    },
    examplezzzzz: function() {},
    examplesssss: "SomeExampleVariable",
}

module.exports = bot