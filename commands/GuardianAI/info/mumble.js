const Discord = require("discord.js");
const { botIdent } = require('../../../functions');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`mumble`)
    .setDescription(`Info about the XSF active duty uniform`),
    permissions: 0,
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle('Xeno Strike Force Mumble Server')
        .setAuthor({name: botIdent().activeBot.botName,iconURL: botIdent().activeBot.icon})
        .setThumbnail(botIdent().activeBot.icon)
        .setDescription(`Individually Link Wing Communications`)
        .addFields(
            { name: "Nickname", value: "Special characters other than - and _ are not allowed. Therefore the name should be your in game name ONLY! I.E. 'Mechan'" },
            { name: "Server URL", value: '45.56.69.77' },
            { name: "Password", value: 'xenostrikeforce' },
            { name: "Certificates", value: 'You will be prompted to download a certificate from the server, this identifies you specifically and you will not have to enter in the password again.' },
        )
        const buttonRow = new Discord.ActionRowBuilder()
        .addComponents(new Discord.ButtonBuilder().setLabel('Visit XSF website for more details on Mumble').setStyle(Discord.ButtonStyle.Link).setURL('https://xenostrikeforce.com/?page_id=559'),)
        interaction.reply({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] });
    }
}