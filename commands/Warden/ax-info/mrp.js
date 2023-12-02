const Discord = require("discord.js");
const { botIdent } = require('../../../functions');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`mrp`)
    .setDescription(`Info about the usage of MRPs`),
    permissions: 0,
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle('Using Module Reinforcement Packages')
        .setColor('#FF7100')
        .setAuthor({name: botIdent().activeBot.botName,iconURL: botIdent().activeBot.icon})
        .setThumbnail('https://static.wikia.nocookie.net/elite-dangerous/images/9/96/MRP.png/revision/latest?cb=20170114223512')
        .setDescription(`Multiple MRPs will combine their module protection %, but always take damage in a set order:

        - MRPs are critically important, you will want at least 3 on shieldless ships and 2 on shielded ships.
        - Modules around the largest MRP take damage first, which is why it is generally reccomended to have one large and two small MRPs.
        - Military slots should be used for HRPs (Hull Reinceforcement Packages), and not for MRPs
        - The guardian version of the MRP (GMRP) offers a bit more integrity than the normal one, albeit at the cost of power, so you should choose what suits you best.
        
        Always ensure your largest MRP is in an optional slot (and not a military one) or your module protection will be compromised much sooner.`)
        .setFooter({ text: 'Module Reinforcement Package', iconURL: botIdent().activeBot.icon });
        interaction.reply({embeds: [returnEmbed]})
    }
}