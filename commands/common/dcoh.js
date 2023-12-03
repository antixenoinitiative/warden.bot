const Discord = require("discord.js");
const { botIdent } = require('../../functions');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`dcoh`)
    .setDescription(`Info about the Defense Council of Humanity`),
    permissions: 0,
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle('DCoH: Overwatch')
        .setAuthor({name: botIdent().activeBot.botName,iconURL: botIdent().activeBot.icon})
        .setThumbnail('https://cdn.discordapp.com/attachments/865043404479791135/1065460572520468542/DCoH_logo.png')
        .setDescription(`The Defense Council of Humanity (DCoH) Overwatch is a tool developed to help track and coordinate resistance to Thargoid invasions. It includes an interactive map as well as a list of weekly progress in all affected systems. This is a great resource for visualizing the entire war, including efforts from groups other than the AXI.`)
        // .setImage(`https://dcoh.watch/assets/DCoH_Overwatch.png`)
        const buttonRow = new Discord.ActionRowBuilder()
        .addComponents(new Discord.ButtonBuilder().setLabel('Visit DCoH Website').setStyle(Discord.ButtonStyle.Link).setURL('https://dcoh.watch/'),)
        .addComponents(new Discord.ButtonBuilder().setLabel('View DCoH Map').setStyle(Discord.ButtonStyle.Link).setURL('https://dcoh.watch/map'),)
        interaction.reply({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] });
    }
}