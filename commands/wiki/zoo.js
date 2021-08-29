const Discord = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
	.setName('zoo')
	.setDescription('Learn about the zoo'),
    usage: '',
    args: false,
    permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
    hidden: false,
    execute (message) {
        const returnEmbed = new Discord.MessageEmbed()
		.setColor('#FF7100')
		.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
		.setTitle("**The Zoo**")
		.setDescription(`The Zoo is a special system known to be the **only** source of __Guaranteed Solo Hydra NHSS Threat 8__ Signal sources in the Pleiades nebula along with a large number of NHSS very close to the main star.\n\n This system is known as the zoo as all variants can be found easily. However it has no Nav Beacon.`)
        .addField("System Name", "```Pleiades Sector MI-S B4-0```")

        const buttonRow = new Discord.MessageActionRow()
        .addComponents(new Discord.MessageButton().setLabel('Learn more about the Zoo').setStyle('LINK').setURL('https://wiki.antixenoinitiative.com/en/nhss'),)

        message.reply({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] });
    }
}