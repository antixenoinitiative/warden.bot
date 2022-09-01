const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('repo')
	.setDescription('Link to the Anti-Xeno Initiative\'s Ship Build Repository'),
    permissions: 0,
    execute(interaction) {
        const link = "https://docs.google.com/spreadsheets/d/1tshjtvrFU9lDkd8kGcnsE1dRdGaDwqz-KKAr0RkDzWg/"
        const row = new Discord.MessageActionRow()
                    .addComponents(
                        new Discord.MessageButton()
                        .setLabel("Visit Anti-Xeno Initiative's Ship Build Repository")
                        .setStyle("LINK")
                        .setURL(link)
                    )
        interaction.reply({ 
            content: "📝 ".concat(link),
            components: [row],
        });
    }
};