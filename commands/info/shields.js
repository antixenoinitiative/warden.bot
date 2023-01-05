const Discord = require("discord.js");
const config = require('../../config.json');
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`shields`)
    .setDescription(`Explains why we don't use shields for cold orbiting vessels.`),
    permissions: 0,
    execute (interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
        .setTitle('Shields')
        .setColor('#FF7100')
        .setAuthor({name: 'Anti-Xeno Initiative',iconURL: config.icon})
        .setDescription(`While shields in AX can be viable on large vessels fitted with reinforced prismatic shields, on medium and small ships they are not recommended. This is because, fundimentally, the shield serves no purpose. A shields primary function is to provide a regenerating health pool. In AX, we use repair limpets and hull as a regenerating health pool.
        In addition:
        1. Shields drain your SYS capacitor, meaning less pips for weapons
        2. Shields have a larger hitbox, making you a larger target for the swarm
        3. Thargoid attacks phase through shields, meaning you still need hull under the shields
        4. Having a shield means you cannot employ silent running to instantly mask your heat signature
        5. Thargoid lightning deals significantly higher damage to shields than to hull
        .setFooter({ text: 'Why shields are bad', iconURL: config.icon });
        interaction.reply({embeds: [returnEmbed]})
    }
}
