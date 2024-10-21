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
            {name: 'Purchesed with Credits'            ,value: 'Guardian Plasma, Guardian Shard, Guardian Gauss', inline: false},
            {name: 'Available at'                      ,value: 'Any Guardian Tech Broker', inline: true},
            {name: 'Purches per Module with Materials' ,value: 'Modified Plasma, Modified Shard, Modified Gauss', inline: false},
            {name: 'Available at'                      ,value: 'Prospects Deep in the Mbooni System', inline: true},
            {name: 'Blueprint Unlocks'                 ,value: 'Guardian weapons require **weapon blueprints** to unlock, https://wiki.antixenoinitiative.com/en/guardianunlocks', inline: false},
            {name: 'Blueprint Materials'               ,value: 'Modified Guardian weapons require **weapon blueprints** with purchase', inline: false},
            {name: 'Plasma'                            ,value: 'Deal high alpha damage to hull and shields, have 20 round clip, are less favorable for heart due to lower armor piercing. Require a lot of weapon distributor', inline: false},
            {name: 'Shard'                             ,value: 'Deal high alpha damage to hull and shields, have 5 round clip, have higher armor piercing. Requrie a lot of heat sinks as they run hot.', inline: false},
            {name: 'Gauss'                             ,value: 'Deal high armor piercing damage and kill hearts quickly. Mod Gauss is not better in any occasion as its stats are weaker than regular Gauss. Edge case being useful with small distros. Typically a weapon for high skill levels with added difficulty, nothing more.', inline: false},
        )
        .setFooter({ text: 'Module Reinforcement Package', iconURL: botIdent().activeBot.icon });
        interaction.reply({embeds: [returnEmbed]})
    }
}
