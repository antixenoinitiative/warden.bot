const Discord = require("discord.js");
const config = require('../../config.json');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`mrp`)
    .setDescription(`Info about the usage of MRPs`),
    permissions: 0,
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle('Using Module Reinforcement Packages')
        .setAuthor({name: 'Anti-Xeno Initiative',iconURL: config.icon})
        .setThumbnail('https://static.wikia.nocookie.net/elite-dangerous/images/9/96/MRP.png/revision/latest?cb=20170114223512')
        .setDescription(`Multiple MRPs will combine their module protection %, but always take damage in a set order:

        - Optional Slots before Military Slots
        - Largest to smallest
        
        Always ensure your largest MRP is in an Optional slot or your module protection will be compromised much sooner.`)
        .setFooter({ text: 'Module Reinforcement Package', iconURL: config.icon });
        interaction.reply({embeds: [returnEmbed]})
    }
}