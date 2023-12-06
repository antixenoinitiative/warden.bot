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
            .setImage('https://cdn.discordapp.com/attachments/1174547681453015140/1181758654941245501/MatsManufactured.png?ex=65823983&is=656fc483&hm=eaeffd379a39ff6a6f3a18039bbde151dee7254b4cb818a60a31bd4d28685632&')
            
            interaction.reply({ embeds: [returnEmbed.setTimestamp()] })
        }
		
    }
}