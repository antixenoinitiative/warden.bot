const Discord = require("discord.js");
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`nuts`)
    .setDescription(`Some nuts from Hella`),
    permissions: 0,
    execute (interaction) {
        interaction.reply({ content: `<@978097217648869467> gives you deez nuts.` });
        interaction.channel.send({ content: "https://media.discordapp.net/attachments/763535317360705606/1014990469039669350/nuts.png" });
    }
}
