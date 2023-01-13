const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('repository')
	.setDescription('Link to the AXI Ship build repository'),
    permissions: 0,
    execute(interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setColor('#FF7100')
        .setTitle("**AX Ship Build Repository**")
        .setDescription(`A large repository of good AX builds for all ships. Please note that many of these builds are not beginner friendly, and require good knowledge of AX mechanics to pilot.`)
        .addFields(
            {name: "Build Repository", value: "https://wiki.antixenoinitiative.com/en/buildrepository"},
        )
        interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
    }
};