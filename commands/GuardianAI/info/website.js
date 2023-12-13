const Discord = require("discord.js");
const { botIdent } = require("../../../functions")
module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('website')
	.setDescription('Link to the Xeno Strike Force Home Website'),
    permissions: 0,
    execute(interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle('Xeno Strike Force Website')
        .setThumbnail(botIdent().activeBot.icon)
        .setDescription(`Review our team and our mission essential tasks`)
        const buttonRow = new Discord.ActionRowBuilder()
        .addComponents(new Discord.ButtonBuilder().setLabel('Visit XSF website').setStyle(Discord.ButtonStyle.Link).setURL('https://xenostrikeforce.com'),)
        interaction.reply({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] });
    } 
};