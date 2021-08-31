const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`nickname`)
    .setDescription(`Changes your nickname to comply with server rules`)
}