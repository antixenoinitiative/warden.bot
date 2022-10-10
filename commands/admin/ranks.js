const Discord = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`rankrequirements`)
    .setDescription(`Create the Rank Requirement buttons`)
    .setDefaultPermission(false),
    async execute (interaction) {
        const returnEmbed = new Discord.MessageEmbed()
		.setColor('#FF7100')
		.setTitle("**Rank Requirements**")
		.setAuthor({ name: 'Anti-Xeno Initiative', iconURL: 'https://axicloud.blob.core.windows.net/public/images/AXI_Insignia_Hypen_128.png', url: 'https://antixenoinitiative.com' })
		.setThumbnail('https://axicloud.blob.core.windows.net/public/images/club10.png')
		.setDescription(`The Anti-Xeno Initiative uses ranks to encourage CMDRs to develop and prove their skills as an AX Pilot. Learn all about the various challenges and competitive ranks you can earn in the AXI. 

Please click the link below to view our Ranks website to find all the up-to-date information on how to earn your first AX combat rank. This can also be found by visiting our website at www.antixenoinitiative.com.`)

        const row = new Discord.MessageActionRow()
        .addComponents(new Discord.MessageButton().setLabel('View Rank Requirements').setStyle('LINK').setURL('https://antixenoinitiative.com/ranks'),)

        interaction.channel.send({ embeds: [returnEmbed], components: [row] });
    }
}
