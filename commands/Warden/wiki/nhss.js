const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('nhss')
	.setDescription('All you need to know about Non-Human Signal Sources'),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions: 0,
    execute(interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setColor('#FF7100')
        .setTitle("**NHSS Types**")
        .addFields({ name: "You can semi consistently determine NHSS in nebulae contents based on their threat rating:", value: "Threat 3: 2 Scouts + 0-3 Human ships\nThreat 4: 4-7 Scouts + 0-3 Human ships\nThreat 5: 1 Cyclops OR 4-8 Scouts\nThreat 6: 1 Basilisk OR 1 Cyclops + 4 Scouts OR 12 Scouts\nThreat 7: 1 Medusa OR 1 Basilisk + 4 Scouts\nThreat 8: 1 Hydra OR 1 Medusa + 4 Scouts\nThreat 9: 1 Hydra + 4 Scouts" })
        .addFields({name: "Spawns are more random in war systems.", value: "NHSS can only be consistently predicted in nebulae, and war systems spawns are random."})
        .addFields({ name: "If a Nonhuman Signal Source has a Salvage Icon (cylinder) in the navigation panel, it will always be a solo Thargoid Interceptor.", value: "Click the button below for more." })
        .addFields({ name: "Always get interceptors using Full Spectrum System (FSS) Scanner:", value: "When using the FSS, you are able to filter which kind of instance you will get based on where you put your tuner. Click the button below for more." })

		const buttonRow = new Discord.ActionRowBuilder()
        .addComponents(new Discord.ButtonBuilder().setLabel('Learn more about NHSS').setStyle(Discord.ButtonStyle.Link).setURL('https://wiki.antixenoinitiative.com/en/nhss'),)
	.addComponents(new Discord.ButtonBuilder().setLabel('FSS Filter Trick').setStyle(Discord.ButtonStyle.Link).setURL('https://wiki.antixenoinitiative.com/en/nhssviafss'),)

        interaction.reply({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] });
    }
};
