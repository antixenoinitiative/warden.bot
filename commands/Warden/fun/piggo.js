const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`piggo`)
    .setDescription(`Summons the not so holy piggo`),
    permissions: 0,
    execute (interaction) {
        interaction.reply({ content:'You summoneth the piggo! <@352201261971668992>', files:['https://tenor.com/view/waddles-pig-blink-gravity-falls-animal-gif-17396160.gif'] });
    }
}