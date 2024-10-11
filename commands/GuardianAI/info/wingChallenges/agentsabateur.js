const Discord = require("discord.js");
const { botIdent } = require('../../../../functions');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`agentsaboteur`)
    .setDescription(`Display Information`),
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle(`Agent Sabotuer`)
        .setColor('#FF7100')
        .setAuthor({name: botIdent().activeBot.botName,iconURL: botIdent().activeBot.icon})
        .setThumbnail(botIdent().activeBot.icon)
        .setDescription(`Agent Saboteur Information`)
        .addFields(
            { name: "Title:", value: "Fully sabotage a Thargoid Spire Site in a wing of 2 to 4 CMDRs.", inline: false },
            { name: "Special:", value: "N/A", inline: false },
        )
        .setFooter({ text: `Agent Saboteur`, iconURL: botIdent().activeBot.icon })
        const buttonRow = new Discord.ActionRowBuilder()
                .addComponents(new Discord.ButtonBuilder().setLabel('Visit XSF website for Agent Saboteur Requirements').setStyle(Discord.ButtonStyle.Link).setURL('https://xenostrikeforce.com/?page_id=1207#wing-combat-ranks'),)
        interaction.reply({ components: [buttonRow], embeds: [returnEmbed] })
    }
}