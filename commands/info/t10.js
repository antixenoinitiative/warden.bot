const Discord = require("discord.js");
const config = require('../../config.json');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`t10`)
    .setDescription(`Posts the T10 Infographic`),
    permissions: 0,
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle('Type-10 Defender')
        .setAuthor( {name: 'Anti-Xeno Initiative',iconURL: config.icon} )
        .setThumbnail('https://images-ext-2.discordapp.net/external/WoTs_UEfXkb6LQ6MdGXGznAPj5Fm12KsH6GmT4drd9I/https/cdn-longterm.mee6.xyz/plugins/commands/images/380246809076826112/50872c245865c41fd7045a2c26e57caba882e377df970b3991452da2ac7d2e1a.png')
        .setDescription(`~~T10 is traaaaaaaaaaash~~
        T10 is generally considered one of the worst possible ships for Anti-Xeno combat, especially versus Interceptors, despite what its description might imply. Reasons for this are numerous and will take quite long to explain in detail. If you have specific questions, our Mentors will be glad to answer them.
        
        Some other bad ships are....
        - Anaconda (Too slow)
        - Crusader (Downgraded Chieftain/Challenger)
        - Mamba (Terrible convergence)
        - Type-9 (Obviously)
        
        Ask a <@&468153018899234816> if you would like to know more about why these ships are so terrible for AX.`)
        .setFooter({ text: 'Just dont do it....', iconURL: config.icon });
        interaction.reply({embeds: [returnEmbed]})
    }
}