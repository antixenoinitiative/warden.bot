const Discord = require("discord.js");


module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName('listrole')
    .setDescription('List all users in a role')
    .addRoleOption(option => option.setName('role')
    .setDescription('The role to target')
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setRequired(true)),
    permissions: 0,
    execute(interaction) {
        try {
            let roleID = interaction.options.data.find(arg => arg.name === 'role').value
            let role = interaction.guild.roles.cache.get(roleID)
            let users = role.members.map(m => m.user.id);
            let lists = [[]]; // Initialize an array to hold lists of users
            let currentListIndex = 0;
            let currentLength = 0;

            for (let user of users) {
                let userMentionLength = `<@${user}>\n`.length;
                if ((currentLength + userMentionLength) <= 950) {
                    lists[currentListIndex].push(`<@${user}>\n`);
                    currentLength += userMentionLength;
                } else {
                    currentListIndex++;
                    lists[currentListIndex] = [`<@${user}>\n`];
                    currentLength = userMentionLength;
                }
            }

            const returnEmbed = new Discord.EmbedBuilder()
            .setColor('#FF7100')
            .setTitle(`**Role List - ${role.name}**`)
            .setDescription(`User List for ${role}`)
            // .addFields({name: "Users", value: `${list}`, inline: true})
            for (let i = 0; i < lists.length; i++) {
                returnEmbed.addFields({ name: `${i + 1}`, value: lists[i].join(""), inline: true });
            }
            interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
        }
        catch(err) {
            console.error(err);
            interaction.reply({ content: `Something went wrong, please try again!` })
        }
    },
};