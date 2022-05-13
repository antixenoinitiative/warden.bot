const Discord = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
      .setName('listrole')
      .setDescription('List all users in a role')
    .addRoleOption(option => option.setName('role')
        .setDescription('The role to target')
        .setRequired(true)),
    permissions: 0,
    execute(interaction) {
        try {
            let roleID = interaction.options.data.find(arg => arg.name === 'role').value
            let role = interaction.guild.roles.cache.get(roleID)
            let users = role.members.map(m=>m.user.tag);
            let list = ""
            for (user of users) {
                list += `${user}\n`
            }

    
            const returnEmbed = new Discord.MessageEmbed()
            .setColor('#FF7100')
            .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
            .setTitle(`**Role List - ${role.name}**`)
            .setDescription(`User List for ${role}`)
            .addFields({name: "Users", value: `${list}`, inline: true})
            interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
        }
        catch(err) {
            console.error(err);
            interaction.reply({ content: `Something went wrong, please try again!` })
        }
    },
};
  
