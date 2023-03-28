const Discord = require("discord.js");
module.exports = 
{
    data: new Discord.SlashCommandBuilder()
        .setName(`lacrak`)
        .setDescription(`Hydra wens LaCrak27`),
    permissions: 0,
    async execute(interaction) {
        interaction.reply({
            content: `Hydra wen <@534312102890962965>`
        })
    }
}
