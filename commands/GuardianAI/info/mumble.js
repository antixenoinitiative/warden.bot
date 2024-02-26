const Discord = require("discord.js");
const { botIdent } = require('../../../functions');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`mumble`)
    .setDescription(`Information about the Mumble Server`),
    permissions: 0,
    execute (interaction) {
        let thisUser = interaction.member.nickname
        thisUser = thisUser.split('CMDR')
        thisUser = thisUser[1].split('(')
        thisUser = '[XSTF] CMDR ' + thisUser[0].trim()

        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle('Xeno Strike Force Mumble Server')
        .setAuthor({name: botIdent().activeBot.botName,iconURL: botIdent().activeBot.icon})
        .setThumbnail(botIdent().activeBot.icon)
        .setDescription(`Individually Link Wing Communications`)
        .addFields(
            { name: "Download", value: "https://www.Mumble.info"},
            { name: "Connecting", value: "Follow the website instructions to connect, link below."},
            { name: "Username", value: `Enter in your XSF Community Name, Example: \n ${thisUser}` },
            { name: "Password", value: 'WingUpAndStrike' },
            { name: "Address", value: 'mumble.xenostrikeforce.com' },
            { name: "Certificates", value: 'You will be prompted to download a certificate from the server, this identifies you specifically and will not have to enter in the password again.' },
        )
        
        const buttonRow = new Discord.ActionRowBuilder()
        .addComponents(new Discord.ButtonBuilder().setLabel('Visit XSF website for all the Mumble details').setStyle(Discord.ButtonStyle.Link).setURL('https://xenostrikeforce.com/?page_id=559'),)
        interaction.reply({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] });
    }
}