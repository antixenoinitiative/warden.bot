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
                .setTitle(`Encoded - Jameson's Crash Site`)
                .addFields(
                {name: "Location", value: `HIP 12099`, inline: true},
                {name: "Body", value: `Body 1B`, inline: true},
                {name: "Coordinates", value: `-54.3, -50.3`, inline: true})
                
            interaction.reply({ embeds: [returnEmbed.setTimestamp()] })

        }
        if (args.mats == 'raw') {
        returnEmbed = new Discord.EmbedBuilder()
            .setColor('#FF7100')
            .setTitle(`Raw Material Locations`)
            .setDescription(`Raw`)
            .setImage('https://cdn.discordapp.com/attachments/1174547681453015140/1181763630136565772/MatsRaw.png?ex=65823e25&is=656fc925&hm=a54f1a495b47ab155388c08c0d21cd479df2f612ed27e640358973fb7d74bb88&')
            
            interaction.reply({ embeds: [returnEmbed.setTimestamp()] })
        }
        if (args.mats == 'manufactured') {
        returnEmbed = new Discord.EmbedBuilder()
            .setColor('#FF7100')
            .setTitle(`Manufactured Material Locations`)
            .setDescription(`Manufactured`)
            .addFields(
                { name:"Search", value: "Use Inara -> Search Nearest -> Star Systems and the table below to find a system with a controlling faction of the proper Allegiance and State" },
                { name: "Faction Control", value: "Higher controlling faction influence (INF) % gives a higher chance for an HGE to belong to that faction" },
                { name: "Population", value: "HGEs spawn more often in high-population systems: >1 Billion" },
                // { name: "Reliable Systems:", value: ""}  
            )
            .setImage('https://cdn.discordapp.com/attachments/1174547681453015140/1182168421081808926/MatsManufactured.png?ex=6583b723&is=65714223&hm=d2cfc4b5936685c04751fefd81054e807bf97a739e57560c9dec01c62378f870&')
            
            interaction.reply({ embeds: [returnEmbed.setTimestamp()] })
        }
		
    }
}