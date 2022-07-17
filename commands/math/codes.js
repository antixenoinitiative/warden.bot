const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require("discord.js");


module.exports = {
    data: new SlashCommandBuilder()
    .setName(`codes`)
    .setDescription(`How to write Weapon-Codes`),
    permissions: 0,
    execute (interaction) {
        let types = "";

        const weapons = require("./calc/weapondata.json")
        for (let [key, value] of Object.entries(weapons)) {
            types += `${key} = Size ${value.size} ${value.type} ${value.weapon}\n`
        }
        
        const returnEmbed = new Discord.MessageEmbed()
		.setColor('#FF7100')
		.setTitle("**Weapon Codes**")
		.setDescription(`Weapon Codes are a method for quickly explaining the total type/number of weapon modules on a ship. The most common weapon code used in the AXI 
        is the "2m2s" code, which means, 2 Medium Gauss and 2 Small Gauss.
        
        The Standard for Weapon codes is as follows:
        - Number/Size/Mount/Weapon
        
        for example:
        - 2lfaxmc = 2x Large Fixed AX Multicannons
        - 1mtpc = 1x Medium Turreted Plasma Charger
        - 4mfsc = 4x Medium Fixed Shard Cannons
        
        **Note:** These codes can all be used with the **/mttot** command`)
		.addField(`Codes`, `${types}`);
		interaction.reply({ embeds: [returnEmbed.setTimestamp()] })
    }
}
