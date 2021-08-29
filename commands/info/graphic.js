const Discord = require("discord.js");
const data = require("./graphdata.json");
const { SlashCommandBuilder } = require('@discordjs/builders');

function isValid(args) {
    for (const value of data) {
        if (args === value.argument) {
            return true;
        }
    }
    return false;
}

module.exports = {
    data: new SlashCommandBuilder()
	.setName('graphic')
	.setDescription('Request a graphic, diagram or resource from a repository, use "-graphic" to get a list.')
    .addStringOption(option => option.setName('selection')
		.setDescription('Select which graphic do display')
		.setRequired(false)),
    permlvl: 0,
    execute(interaction) {
        let selection;
        if (interaction.options.data.find(arg => arg.name === 'selection') != undefined) { selection = interaction.options.data.find(arg => arg.name === 'selection').value }
        let response;
        if (!isValid(selection)) {
            const returnEmbed = new Discord.MessageEmbed()
            .setColor('#FF7100')
            .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
            .setTitle("Graphics")
            .setDescription("List of valid graphic commands")
            for (const value of data) {
                returnEmbed.addField(`/graphic ${value.argument}`, value.title);
            }
            return interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
        }

        for (const value of data) {
            if (selection === value.argument) {
                response = value;
            }
        }

        if (response.type == "text") {
            interaction.reply(response.link);
        } else if (response.type == "embed") {
            const returnEmbed = new Discord.MessageEmbed()
            .setColor('#FF7100')
            .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
            .setTitle(response.title)
            .setDescription(response.description)
            .setImage(response.link)
            interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
        }
    }
};
