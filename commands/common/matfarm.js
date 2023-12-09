const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('matfarm')
	.setDescription('Mat Farming Information')
	.addStringOption(option => option.setName('mats')
		.setDescription('Material Type')
		.setRequired(true)
		.addChoices(
			{ name:'Manufactured', value:'manufactured' },
			{ name:'Encoded', value:'encoded' },
			{ name:'Raw', value:'raw' }
		)),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions:0,
	async execute(interaction) {
		let args = {}
		let res;
		let user = interaction.member.id
		let timestamp = Date.now()

        for (let key of interaction.options.data) {
            args[key.name] = key.value
        }
        if (args.mats == 'encoded') {
            returnEmbed = new Discord.EmbedBuilder()
                .setColor('#FF7100')
                .setTitle(`Encoded Material Farming`)
                .setDescription(`Recommended method:\n- Scanning Comms Control beacons at the Jameson Crash Site in HIP 12099 1B and cross-trading at an Encoded trader is a reliable way to farm the necessary Encoded materials for engineering.\n- If more specific Encoded materials are needed, use the sources given in the table below.`)
                .setImage('https://cdn.discordapp.com/attachments/1174547681453015140/1182964374520991765/MatsEncoded.png?ex=65869c6d&is=6574276d&hm=515d1f4046d4452bc5277969c54e83b9c85f8cfa301ba26e105e8fbff9c6115a&')
                
            interaction.reply({ embeds: [returnEmbed.setTimestamp()] })

        }
        if (args.mats == 'raw') {
        returnEmbed = new Discord.EmbedBuilder()
            .setColor('#FF7100')
            .setTitle(`Raw Material Farming`)
            .setDescription(`Recommended method:\n- At the material sites given in the table below, use the Remote Release Flak Launcher and Collector Limpets to efficiently gather materials as shown in [this video guide](https://www.youtube.com/watch?v=oLSUiZyQvoI).\n- Use the [Compass Panel](https://github.com/EDDiscovery/EDDiscovery/wiki/Using-the-Compass-Panel) in [EDDiscovery](https://github.com/EDDiscovery/EDDiscovery/wiki) for help navigating to planetary coordinates.\n- Alternatively, probe the planet with a Detailed Surface Scanner and fly to "blue zones," regions of high concentration of Crystal Shards or Brain Trees.`)
            .setImage('https://cdn.discordapp.com/attachments/1174547681453015140/1181763630136565772/MatsRaw.png?ex=65823e25&is=656fc925&hm=a54f1a495b47ab155388c08c0d21cd479df2f612ed27e640358973fb7d74bb88&')
            
            interaction.reply({ embeds: [returnEmbed.setTimestamp()] })
        }
        if (args.mats == 'manufactured') {
        returnEmbed = new Discord.EmbedBuilder()
            .setColor('#FF7100')
            .setTitle(`Manufactured Material Farming`)
            .setDescription(`Recommended method:`)
            .addFields(
                { name:"Search", value: "- Use [Inara Star Systems Search](https://inara.cz/elite/nearest-starsystems/) and the table below to find a system with a controlling faction of the proper Allegiance and State." },
                { name: "Faction Control", value: "- Higher controlling faction influence (INF) % gives a higher chance for an HGE to belong to that faction." },
                { name: "Population", value: "- HGEs spawn more often in high-population systems (> 1 billion)." },
                { name: "Reliable Systems:", value: "- Imperial Shielding - Iota Hydri\n- Core Dynamics Composites - Blatrimpe"}  
            )
            .setImage('https://cdn.discordapp.com/attachments/1174547681453015140/1182168421081808926/MatsManufactured.png?ex=6583b723&is=65714223&hm=d2cfc4b5936685c04751fefd81054e807bf97a739e57560c9dec01c62378f870&')
            
            interaction.reply({ embeds: [returnEmbed.setTimestamp()] })
        }
		
    }
}