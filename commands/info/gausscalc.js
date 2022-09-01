const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('gausscalc')
	.setDescription('Link to Orodruin\'s Gauss Shot Calculator'),
    permissions: 0,
    execute(interaction) {
        const link = "https://docs.google.com/spreadsheets/d/1bviDWAJewa6KPyOfU7maWjnIsGxZjxeTmzPCPsQ1drs/"
        const row = new Discord.MessageActionRow()
                    .addComponents(
                        new Discord.MessageButton()
                        .setLabel("Visit Orodruin's Gauss Shot Calculator")
                        .setStyle("LINK")
                        .setURL(link)
                    )
        interaction.reply({ 
            content: "📝 ".concat(link),
            components: [row],
        });
    }
};