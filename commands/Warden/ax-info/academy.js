const Discord = require("discord.js");
const academydata = require("./academydata.json");

var data = new Discord.SlashCommandBuilder()
    .setName('academy')
    .setDescription('Anti-Xeno Academy: Learn how to fight Thargoids')
    .addStringOption(option => option.setName('timestamp')
        .setDescription('Select which section you\'d like to be linked')
        .setRequired(false)
    );
academydata.forEach(element => {
    data.options[0].addChoices({ name: element.name, value: element.name })
});
module.exports = {
    data: data,
    permissions: 0,
    execute(interaction) {
        //iterate through academydata and find the name of the section, then get its link and return the reply
        if (interaction.options.data.find(arg => arg.name === 'timestamp') != undefined) {
            let selection = interaction.options.data.find(arg => arg.name === 'timestamp').value;
            var response;
            for (const value of academydata) {
                if (selection === value.name) {
                    response = value;
                }
            }
            interaction.reply(`**${response.name}**\n${response.link}`);
        }
        else {
            //default reply with no selection
            interaction.reply(`**Anti-Xeno Academy: Learn how to fight Thargoids**\nhttps://www.youtube.com/watch?v=70xUm6Jh5eg`);
        }
    }
};
