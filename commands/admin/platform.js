const Discord = require("discord.js");


module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`platform`)
    .setDescription(`Create the Platform buttons`)
    .setDefaultMemberPermissions(0),
    permissions: 2,
    async execute (interaction) {
        if(!interaction.member.roles.cache.has('894437648851165234'))
        {
            interaction.reply({content: "Missing permissions.", ephemeral: true});
            return;
        }
        const returnEmbed = new Discord.EmbedBuilder()
		.setColor('#FF7100')
		.setTitle("**Welcome to the Anti-Xeno Initiative!**")
		.setDescription(`Please use the buttons below to assign the platform that you play on. Once you have completed this you will gain access to the rest of the discord channels.\n\n__If you are a new AX pilot who is unfamiliar with AX combat and would like help from our mentors, please make use of #recruit-academy after reacting to one of the platforms.__\n\nIf at any point you feel stuck, or if something doesnt work (and you are sure you've done everything correctly) - message any @Overseer, @Coordinator or @Director\n\n**Select your platform below:**`)

        const row = new Discord.ActionRowBuilder()
        .addComponents(new Discord.ButtonBuilder().setCustomId('platformpc').setLabel('PC').setStyle(Discord.ButtonStyle.Secondary),)
        .addComponents(new Discord.ButtonBuilder().setCustomId('platformxb').setLabel('XB').setStyle(Discord.ButtonStyle.Success),)
        .addComponents(new Discord.ButtonBuilder().setCustomId('platformps').setLabel('PS').setStyle(Discord.ButtonStyle.Primary),)

        interaction.channel.send({ embeds: [returnEmbed], components: [row] });
    }
}