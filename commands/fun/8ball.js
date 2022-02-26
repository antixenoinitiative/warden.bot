const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`8ball`)
    .setDescription(`Ask the magic 8ball whatever questions that are bothering you at this time!`)
    .addStringOption(option => option.setName('your_question')
        .setDescription('The thing you wanna ask')
        .setRequired(true)),
    permissions: 0,

    execute(interaction) {
        let rand = Math.random() * 100;

        interaction.channel.send({content: `${interaction.member} asked: "${interaction.options.data.find(arg => arg.name === 'your_question').value}"`})

        if (rand < 50) interaction.channel.send({ content: `Yes` });
        else interaction.channel.send({ content: `No` });
    }
}