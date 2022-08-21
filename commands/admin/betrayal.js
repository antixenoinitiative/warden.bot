const Discord = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');
module.exports = {
    data: new SlashCommandBuilder()
      .setName('betrayal')
      .setDescription('Gives/Removes conspirator role')
    .addUserOption(option => option.setName('user')
        .setRequired(true)
        .setDescription('Mention a user')),
    permissions: 2,
    execute(interaction) {
        const conspirator_role_id = '800227831694229514' //axi conspirator roleID
        let target = interaction.guild.members.cache.get(interaction.options.data.find(arg => arg.name === 'user').value)
        let target_servername = target.nickname
        cons_role = interaction.guild.roles.cache.find(role => role.id === conspirator_role_id)
        if(target._roles.includes(conspirator_role_id))
        {
            target.roles.remove(cons_role)
            interaction.reply({ content: `${target_servername} now does not have :poop: role.`})
        }
        else
        {
            target.roles.add(cons_role)
            interaction.reply({ content: `${target_servername} has been granted the :poop: role.`})
        }
    }
}