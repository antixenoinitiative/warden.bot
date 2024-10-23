const Discord = require("discord.js");
const { botIdent } = require('../../../functions');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`guardianwep`)
    .setDescription(`Info Guardian Weapons`),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions:0,
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle('Guardian Weapons')
        .setColor('#FF7100')
        .setAuthor({name: botIdent().activeBot.botName,iconURL: botIdent().activeBot.icon})
        .setDescription(`Briefly describes Guardian Weapons`)
        .addFields(
            {name: 'Purchased with Credits'            ,value: 'Guardian Plasma, Guardian Shard, Guardian Gauss', inline: false},
            {name: 'Available at'                      ,value: 'Any Guardian tech broker', inline: true},
            {name: 'Purchase per Module with Materials',value: 'Modified Plasma, Modified Shard, Modified Gauss', inline: false},
            {name: 'Available at'                      ,value: 'Prospects Deep in the Mbooni system', inline: true},
            {name: 'Blueprint Unlocks'                 ,value: 'Guardian weapons require **weapon blueprints** to unlock, https://wiki.antixenoinitiative.com/en/guardianunlocks', inline: false},
            {name: 'Blueprint Materials'               ,value: 'Modified Guardian weapons require **weapon blueprints** with purchase', inline: false},
            {name: 'Gauss'                             ,value: 'Deal high armor piercing damage and kill hearts quickly. Used in sizes small and medium', inline: false},
            {name: 'Modified Shards'                   ,value: 'Deal high alpha damage to hull and shields, have 5 round clip, have higher armor piercing. Only used in size medium', inline: false},
            {name: 'Modified Plasma'                   ,value: 'Deal high alpha damage to hull and shields, have 20 round clip, are less favorable for heart due to lower armor piercing. Primarily used in size medium, though smalls are worse, but still viable.', inline: false},       
        )
        interaction.reply({embeds: [returnEmbed]})
    }
}
