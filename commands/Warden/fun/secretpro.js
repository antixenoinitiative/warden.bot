const Discord = require("discord.js");
module.exports = 
{
    data: new Discord.SlashCommandBuilder()
        .setName(`secretpro`)
        .setDescription(`Hydra when's Secretpro`),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions:0,
    async execute(interaction) {
        interaction.reply({
            content: `<:tharghydra:591368703388418080> :question: <@319224862235164672>`
        })
    }
}