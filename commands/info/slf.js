const Discord = require("discord.js");
const config = require('../../config.json');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`slf`)
    .setDescription(`Posts the SLF Infographic`),
    permissions: 0,
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle('Ship-Launched Fighters')
        .setURL('https://www.antixenoinitiative.com/wiki/ship-builds/common-mistakes')
        .setAuthor({name: 'Anti-Xeno Initiative',iconURL: config.icon})
        .setThumbnail('https://cdn-longterm.mee6.xyz/plugins/commands/images/380246809076826112/1b407b966d73977b5d85d0ab03b3177486fed82614d84d11cc1d633fb19bf902.png')
        .setDescription(`Unfortunately, all forms of Ship-Launched Fighter are effectively useless for AX combat. During an Interceptor fight, they will attract the swarm for a short period of time and will die to it in a matter of seconds at best. While the swarm is engaged with the SLF, it will fly much more erratically, making the destruction of the swarm a much more difficult task than without the presence of an SLF. This often results in a aggrivated swarm which can pose a huge issue to you.

        The SLF will NOT attract the attention of the Interceptor, either. Fighter weapons do minimal damage, and NPC pilots will have low time on target making them only marginally useful for exerting. Furthermore, NPC SLF cannot specifically subtarget hearts, making them effectively useless for progressing the fight.
        
        In almost all cases a Fighter Bay is better off used for far more useful modules like Hull Reinforcements.
        
        _SIDE NOTE:_
        - Fighter Pilots also steal half your combat EXP and a portion of your credits, even when not equipped.`)
        .setImage(`https://media.discordapp.net/attachments/625989888432537611/707451541405171733/SL-OOOF.gif`)
        .setFooter({ text: 'Ship-Launched Fighters', iconURL: config.icon });
        interaction.reply({embeds: [returnEmbed]})
    }
}