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
        .setThumbnail(botIdent().activeBot.icon)
        .setDescription(`Active-duty XSF CMDRs are expected to maintain ships and on-foot suits conforming with our livery regulation. Follow the link to the website for more information.`)
        const buttonRow = new Discord.ActionRowBuilder()
        .addComponents(new Discord.ButtonBuilder().setLabel('Visit XSF website').setStyle(Discord.ButtonStyle.Link).setURL('https://xenostrikeforce.com/?page_id=239'),)
        interaction.reply({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] });
    }
}