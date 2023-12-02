const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`scout`)
    .setDescription(`Scout info card`),
    permissions: 0,
    execute (interaction) {
        if(Math.random() * 100 < 1) {
            interaction.reply({ content: "https://cdn.discordapp.com/attachments/955583721883467787/1075232081237508166/scoutfoil.png" });
        } else {
            interaction.reply({ content: "https://cdn.discordapp.com/attachments/955583721883467787/1075229944323526727/scout.png" });
        }
        
    }
}