const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`nickname`)
    .setDescription(`Changes your nickname to comply with server rules.`)

    .addStringOption(option => option.setName(`in-game name`)
        .setDescription(`Your username that appears in game.`)
        .setRequired(true))

    .addStringOption(option => option.setName(`squadron code`)
        .setDescription(`The 4 character code of your squadron.`)
        .setRequired(false)),

    permissions: 0,

    async execute(interaction) {
        interaction.reply({ content: `hello`})
    }
}