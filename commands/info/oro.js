const { SlashCommandBuilder } = require('@discordjs/builders');
const {MessageActionRow, MessageButton} = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder()
	.setName('oro')
	.setDescription('Link to Orodruin\'s Gauss Shot Calculator'),
    permissions: 0,
    execute(interaction) {
        const link = "https://docs.google.com/spreadsheets/d/1bviDWAJewa6KPyOfU7maWjnIsGxZjxeTmzPCPsQ1drs/"
        const row = new MessageActionRow()
                    .addComponents(
                        new MessageButton()
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