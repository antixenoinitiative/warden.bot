const Discord = require("discord.js");

module.exports = {
    data: [
	new Discord.SlashCommandBuilder()
	    .setName('zoo')
	    .setDescription('Learn about the zoo'),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	new Discord.SlashCommandBuilder()
	    .setName('soloceptor')
	    .setDescription('Where to duel interceptors'),
    ],
    permissions: 0,
    hidden: false,
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
		.setColor('#FF7100')
		.setTitle("**Solo Interceptor Hunting**")
		.setDescription(`The following are systems that we recommend for solo interceptor duels:`)
        .addFields(
		{name: "`Asterope`, `Merope`, and `Sterope II`", value: "Our go-to hunting grounds in the Pleiades Nebula. Has stations if you don't have a Fleet Carrier and are close to the Bubble. Sterope II is a recommended Hydra hunting ground.", inline: false},
		{name: "`Musca Dark Region HM-V c2-17`", value: "Coalsack Nebula. No station in-system or nearby, but contains high spawn density of higher-threat NHSSes if you have a Fleet Carrier to operate out of. Also has material traders within approximately ~30 LY's.", inline: false},
		{name: "`Pleiades Sector MI-S B4-0`", value: "Historically known as The Zoo, this was known for being the only system to spawn solo, no-scout Hydras in both “guaranteed” (triple icon / debris field) and non-guaranteed (single icon / green cloud) instances; it is still a recommended Hydra hunting ground but not the only place that Hydras can be found.", inline: false})

        const buttonRow = new Discord.ActionRowBuilder()
	.addComponents(new Discord.ButtonBuilder().setLabel('A more detailed list of where to find Thargoids, including AXCZs').setStyle(Discord.ButtonStyle.Link).setURL('https://wiki.antixenoinitiative.com/en/finding-thargoids'),)
        .addComponents(new Discord.ButtonBuilder().setLabel('Learn more about Non-Human Signal Sources (NHSS)').setStyle(Discord.ButtonStyle.Link).setURL('https://wiki.antixenoinitiative.com/en/nhss'),)

        interaction.reply({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] });
    }
}
