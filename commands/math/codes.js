const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`codes`)
    .setDescription(`How to write Weapon-Codes`),
    permissions: 0,
    execute (interaction) {        
        const returnEmbed = new Discord.EmbedBuilder()
		.setColor('#FF7100')
		.setTitle("**Weapon Codes**")
		.setDescription(`Weapon Codes are a method for quickly explaining the total type/number of weapon modules on a ship. The most common weapon code used in the AXI 
        is the "2m2s" code, which means, 2 Medium Gauss and 2 Small Gauss.
        
        The Standard for Weapon codes is as follows:
        - Number/Size/Mount/Modifier/Weapon

        **Size** can be small (s), medium (m) or large (l).
        **Mount** can be fixed(f), gimballed (g), or turreted (t).
        **Modifiers** can be enhanced(e) or modified(m).
        **Weapon** names are as follows:
        gc = Gauss Cannon
        pc = Plasma Charger
        sc = Shard Cannon
        axmc = AX Multicannon
        axmr = AX Missile Rack

        for example:
        - 2lfaxmc = 2x Large Fixed AX Multicannons
        - 1mtpc = 1x Medium Turreted Plasma Charger
        - 4mfsc = 4x Medium Fixed Shard Cannons
        - 2mfmsc = 4x Medium Fixed Modified Shard Cannons
        - 2lfeaxmr = 2 Large Fixed Enhanced AX Missile Racks`)
		interaction.reply({ embeds: [returnEmbed.setTimestamp()] })
    }
}
