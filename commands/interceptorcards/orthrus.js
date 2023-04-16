const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`orthrus`)
    .setDescription(`Orthrus info card`),
    permissions: 0,
    execute (interaction) {
        interaction.reply({ content: "https://cdn.discordapp.com/attachments/566728213737373707/1087075059539116044/Orthrus.png" });
    }
}