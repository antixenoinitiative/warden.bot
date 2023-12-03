const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('zoo')
	.setDescription('Learn about the zoo'),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions: 0,
    hidden: false,
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
		.setColor('#FF7100')
		.setTitle("**The Zoo**")
		.setDescription(`The Zoo is known for being the only system to spawn solo (no-scout) Hydras, in both “guaranteed” (triple icon / debris field) and non-guaranteed (single icon / green cloud) instances. However it has no Nav Beacon.`)
        .addFields({ name: "System Name", value: "```Pleiades Sector MI-S B4-0```" })

        const buttonRow = new Discord.ActionRowBuilder()
        .addComponents(new Discord.ButtonBuilder().setLabel('Learn more about the Zoo').setStyle(Discord.ButtonStyle.Link).setURL('https://wiki.antixenoinitiative.com/en/nhss'),)

        interaction.reply({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] });
    }
}