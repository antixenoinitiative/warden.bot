const Discord = require("discord.js");
const { botIdent } = require('../../../../functions');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`maelstromdiver`)
    .setDescription(`Display Information`),
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle(`Maelstrom Diver`)
        .setColor('#FF7100')
        .setAuthor({name: botIdent().activeBot.botName,iconURL: botIdent().activeBot.icon})
        .setThumbnail(botIdent().activeBot.icon)
        .setDescription(`Maelstrom Diver Information`)
        .addFields(
            { name: "Title:", value: "Dive into a Maelstrom with one or more Wingmates and successfully reach the Titan.", inline: false },
            { name: "Special:", value: "This rank will grant you embed permissions in our discord, in addition to access to our in-game squadron.", inline: false },
        )
        .setFooter({ text: `Maelstrom Diver`, iconURL: botIdent().activeBot.icon })
        const buttonRow = new Discord.ActionRowBuilder()
                .addComponents(new Discord.ButtonBuilder().setLabel('Visit XSF website for Maelstrom Diver Requirements').setStyle(Discord.ButtonStyle.Link).setURL('https://xenostrikeforce.com/?page_id=1207#wing-combat-ranks'),)
        interaction.reply({ components: [buttonRow], embeds: [returnEmbed] })
    }
}