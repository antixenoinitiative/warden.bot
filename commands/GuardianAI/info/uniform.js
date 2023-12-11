const Discord = require("discord.js");
const { botIdent } = require('../../../functions');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`uniform`)
    .setDescription(`Info about the XSF active duty uniform`),
    permissions: 0,
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle('Our Uniform')
        .setAuthor({name: botIdent().activeBot.botName,iconURL: botIdent().activeBot.icon})
        .setThumbnail('https://cdn.discordapp.com/attachments/1182805294531760211/1183270502651920504/Emblem.png?ex=6587b987&is=65754487&hm=3a5cfc95b4d591fc8286717046a220904fa58cbece32e94c38031bab91bab168&')
        .setDescription(`Active-duty XSF CMDRs are expected to maintain ships and on-foot suits conforming with our livery regulation. Follow the link to the website for more information.`)
        const buttonRow = new Discord.ActionRowBuilder()
        .addComponents(new Discord.ButtonBuilder().setLabel('Visit XSF website').setStyle(Discord.ButtonStyle.Link).setURL('https://xenostrikeforce.com/?page_id=239'),)
        interaction.reply({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] });
    }
}