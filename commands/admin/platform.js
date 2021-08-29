const Discord = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`platform`)
    .setDescription(`Create the Platform buttons`),
    permlvl: 2,
    async execute (interaction) {
        const returnEmbed = new Discord.MessageEmbed()
		.setColor('#FF7100')
		.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
		.setTitle("**Welcome to the Anti-Xeno Initiative!**")
		.setDescription(`Please use the buttons below to assign the platform that you play on. Once you have completed this you will gain access to the rest of the discord channels.\n\n__If you are a new AX pilot who is unfamiliar with AX combat and would like help from our mentors, please make use of #recruit-academy after reacting to one of the platforms.__\n\nIf at any point you feel stuck, or if something doesnt work (and you are sure you've done everything correctly) - message any @Overseer, @Coordinator or @Director\n\n**Select your platform below:**`)

        const row = new Discord.MessageActionRow()
        .addComponents(new Discord.MessageButton().setCustomId('platformpc').setLabel('PC').setStyle('SECONDARY'),)
        .addComponents(new Discord.MessageButton().setCustomId('platformxb').setLabel('XB').setStyle('SUCCESS'),)
        .addComponents(new Discord.MessageButton().setCustomId('platformps').setLabel('PS').setStyle('PRIMARY'),)

        interaction.channel.send({ embeds: [returnEmbed], components: [row] });
    }
}