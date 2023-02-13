const Discord = require("discord.js");
const config = require('../../config.json');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`engineering`)
    .setDescription(`Information on engineering.`),
    permissions: 0,
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle('Resources on Engineering')
        .setAuthor({name: 'Anti-Xeno Initiative',iconURL: config.icon})
        .setThumbnail("https://edassets.org/static/img/engineers/Engineer_icon.png")
        .addFields(
            {name: "ED Materials", value: "https://www.edmaterials.app\nComprehensive guide on where and how to farm engineering materials. This is the single best resource for engineering in the game." },
            {name: "AXI Horizons Engineering", value: "https://wiki.antixenoinitiative.com/en/engineering\nAXI's engineering material guide."},
            {name: "AX Engineer Unlock Guide", value: "https://wiki.antixenoinitiative.com/en/Unlocking-Engineers\nAXI's guide for unlocking engineers."},
            {name: "AXI Odyssey Engineering", value: "https://wiki.antixenoinitiative.com/en/engineering-odyssey\nAXI's guide to odyssey engineering materials."},
            {name: "Engineering and Module Unlock Costs", value: "https://inara.cz/elite/techbroker/\nList of module unlock costs and engineering roll costs."},
        )
        interaction.reply({embeds: [returnEmbed.setTimestamp()]})
    }
}
