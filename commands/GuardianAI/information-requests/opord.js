const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName('opord')
        .setDescription('Create an Opord')
        .addStringOption(option =>
            option.setName('input')
                .setDescription('The input to echo back')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('input2')
                .setDescription('The input to echo back')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('category')
                .setDescription('The gif category')
                .setRequired(true)
                .addChoices(
                    { name: 'Funny', value: 'gif_funny' },
                    { name: 'Meme', value: 'gif_meme' },
                    { name: 'Movie', value: 'gif_movie' },
                )
        )
        
        
    ,permissions: 0,
    async execute(interaction) {
        interaction.reply({ content: "Yolo" });
    } 
};