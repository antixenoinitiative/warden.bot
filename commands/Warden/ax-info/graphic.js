const Discord = require("discord.js");
const graphicdata = require("./graphdata.json");

var data = new Discord.SlashCommandBuilder()
.setName('graphic')
.setDescription('Request a graphic, diagram or resource from a repository, use "-graphic" to get a list.')
.addStringOption(option => option.setName('selection')
    .setDescription('Select which graphic to display')
    .setRequired(true)
);
graphicdata.forEach(element => {
    data.options[0].addChoices({ name: element.argument, value: element.argument })
});
module.exports = {
    data: data,
    permissions: 0,
    execute(interaction) {
        let selection;
        if (interaction.options.data.find(arg => arg.name === 'selection') != undefined){ 
            selection = interaction.options.data.find(arg => arg.name === 'selection').value 
        }
        var response;
        for (const value of graphicdata) {
            if (selection === value.argument) {
                response = value;
            }
        }
        if (response.type == "text") {
            interaction.reply(response.link);
        } else if (response.type == "embed") {
            const returnEmbed = new Discord.EmbedBuilder()
            .setColor('#FF7100')
            .setTitle(response.title)
            .setDescription(response.description)
            .setImage(response.link)
            interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
        }
    }
};
