const { SlashCommandBuilder } = require('@discordjs/builders');
module.exports = 
{
    data: new SlashCommandBuilder()
        .setName(`secretpro`)
        .setDescription(`Hydra when's Secretpro`),
    permissions: 0,
    async execute(interaction) {
        interaction.reply({
            content: `<:tharghydra:591368703388418080> :question: <@319224862235164672>`
        })
    }
}