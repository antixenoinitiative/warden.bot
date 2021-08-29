const Discord = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
	.setName('zoo')
	.setDescription('Learn about the zoo'),
    permlvl: 0,
    hidden: false,
    execute (interaction) {
        const returnEmbed = new Discord.MessageEmbed()
		.setColor('#FF7100')
		.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
		.setTitle("**The Zoo**")
		.setDescription(`The Zoo is known for being the only system to spawn solo (no-scout) Hydras, in both “guaranteed” (triple icon / debris field) and non-guaranteed (single icon / green cloud) instances. However it has no Nav Beacon.`)
        .addField("System Name", "```Pleiades Sector MI-S B4-0```")

        const buttonRow = new Discord.MessageActionRow()
        .addComponents(new Discord.MessageButton().setLabel('Learn more about the Zoo').setStyle('LINK').setURL('https://wiki.antixenoinitiative.com/en/nhss'),)

        interaction.reply({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] });
    }
}