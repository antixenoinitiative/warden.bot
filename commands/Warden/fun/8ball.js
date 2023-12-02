const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`8ball`)
    .setDescription(`Ask the magic 8ball whatever questions that are bothering you at this time!`)
    .addStringOption(option => option.setName('question')
        .setDescription('The thing you wanna ask')
        .setRequired(true)),
    permissions: 0,

    async execute(interaction) {
        let rand = Math.random() * 100;
        
        let answer = "Yes"
        if (rand < 50) answer = "No"

        try
        {
            await interaction.reply({content: `${interaction.member} asked: "${interaction.options.data.find(arg => arg.name === 'question').value}" 

Answer: **${answer}**` })
        }

        catch (err) {
            console.log(err);
            interaction.reply({ content: `Something went wrong!\nERROR: ${err}` });
        }
    }
}
