const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('builds')
	.setDescription('Useful Information and links for AX Ship Builds'),
    permissions: 0,
    execute(interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setColor('#FF7100')
        .setTitle("**AX Ship Builds**")
        .setDescription(`How to build a good Anti-Xeno Combat ship. Guides for both Interceptor and Scout hunting ships included.`)
        .addFields(
            {name: "Recommended Builds", value: "https://wiki.antixenoinitiative.com/en/builds" },
            {name: "Ship Build Theory", value: "https://wiki.antixenoinitiative.com/en/shipbuildtheory"},
        )
        interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
    }
};
