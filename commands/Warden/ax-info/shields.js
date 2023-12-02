const Discord = require("discord.js");
const { botIdent } = require('../../../functions');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`shields`)
    .setDescription(`Explains why we don't use shields for cold orbiting vessels.`)
    .addStringOption(option => option.setName('detail')
    .setDescription('Detailed or Summarized breakdown.')
    .setRequired(false)
    .addChoices(
        { name:'True', value:'true' }
    )),
    permissions: 0,
    execute (interaction) {
        var message;
        if(interaction.options.data.find(arg => arg.name === 'detail') === undefined) {
            message = `We recognize that a large portion of commanders starting their AX careers will **feel more familiar with shielded builds** than with hull-based repair builds. However, the nature of Thargoids **makes shields more of a liability** than an asset in AX combat.
            In particular:
            - Interceptor and swarm fire pierces shields
            - Shields make your hitbox much bigger
            - Lightning makes short work of shields 
            - Shield cell banks cannot be synthesized in combat
            - Shields prevent you from using Silent Running 
            - Shields force you to put PIPs in SYS, creating substantial compromises on either speed or weapon use`
        } else {
            message = `We recognize that a large portion of commanders starting their AX careers will **feel more familiar with shielded builds** than with hull-based repair builds. However, the nature of Thargoids **makes shields more of a liability** than an asset in AX combat. In particular:
        
            A) Both Interceptor Cannon and Thargon Swarm fire phase through shields; as a consequence, **having a shield does not substitute for reinforcing your hull**, and having to split modules and utilities to reinforce BOTH hull and shields greatly diminishes the benefits of doing either.
            
            B) Shields **greatly increase your hitbox size**. While thargon swarms will mostly miss a shieldless build, most of their shots will hit a shielded one. It is not uncommon to take **more** hull damage in a shielded ship than in a comparable shieldless one.
            
            C) The **lightning special attack** of interceptors **will make short work of just about any shield**, while doing only limited damage on your hull.
            
            D) Quickly refilling your shields in combat requires Shield Cell Banks, which generate a lot of heat and cannot be rearmed in combat (SCB ammo cannot be synthed). Repair limpets, on the other hand, generate no heat and can be synthesized at will (but are slower to repair and their use can be interrupted by taking damage). Limpets also instantly repair your canopy.
            
            E) **Shields prevent you from using** what is arguably the most effective emergency tactic in AX combat: **silent running** (as silent running instantly drops your shield when activated.)
            
            F) Shields require SYS pips for resistances and charge; this makes them compete with heatsinks (also need SYS) and with ENG (critical for mobility.) **Needing SYS creates great compromises** on an AX build`
        }
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle('Usage of shields on small and medium ships')
        .setColor('#FF7100')
        .setAuthor({name: botIdent().activeBot.botName,iconURL: botIdent().activeBot.icon})
        .setDescription(message)
        interaction.reply({embeds: [returnEmbed.setTimestamp()]})
    }
};
