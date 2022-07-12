const Discord = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
	.setName('nhss')
	.setDescription('All you need to know about Non-Human Signal Sources'),
    permissions: 0,
    execute(interaction) {
        const returnEmbed = new Discord.MessageEmbed()
        .setColor('#FF7100')
        .setTitle("**NHSS Types**")
        .addField("You can semi consistently determine NHSS contents based on their threat rating:", "Threat 3: 2 Scouts + 0-3 Human ships\nThreat 4: 4-7 Scouts + 0-3 Human ships\nThreat 5: 1 Cyclops OR 4-8 Scouts\nThreat 6: 1 Basilisk OR 1 Cyclops + 4 Scouts OR 12 Scouts\nThreat 7: 1 Medusa OR 1 Basilisk + 4 Scouts\nThreat 8: 1 Hydra OR 1 Medusa + 4 Scouts\nThreat 9: 1 Hydra + 4 Scouts")
        .addField("**NOTE:** If a Nonhuman Signal Source has a Salvage Icon (cylinder) in the navigation panel, it will always be a solo Thargoid Interceptor.", "Click the button below for more.")
        .addField("Always get interceptors using Full Spectrum System (FSS) Scanner:", "When using the FSS, you are able to filter which kind of instance you will get based on where you put your tuner. Click the button below for more.")

		const buttonRow = new Discord.MessageActionRow()
        .addComponents(new Discord.MessageButton().setLabel('Learn more about NHSS').setStyle('LINK').setURL('https://wiki.antixenoinitiative.com/en/nhss'),)
	.addComponents(new Discord.MessageButton().setLabel('FSS Filter Trick').setStyle('LINK').setURL('https://wiki.antixenoinitiative.com/en/nhssviafss'),)

        interaction.reply({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] });
    }
};
