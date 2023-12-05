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
            .setImage('https://cdn.discordapp.com/attachments/1175469325356896446/1181359720280358932/Raws.png?ex=6580c5f9&is=656e50f9&hm=6f7430c952d93c4d441886193867b078dd7665e06ef37471fdd5a7b48582c508&')
            
            interaction.reply({ embeds: [returnEmbed.setTimestamp()] })
        }
        if (args.mats == 'manufactured') {
        returnEmbed = new Discord.EmbedBuilder()
            .setColor('#FF7100')
            .setTitle(`Manufactured Material Locations`)
            .setDescription(`Manufactured`)
            .setImage('https://cdn.discordapp.com/attachments/1175469325356896446/1181359692035919983/Manufactured.png?ex=6580c5f3&is=656e50f3&hm=8182682caaba2fe77ff2cfb8841cdf2b0ef61695ed3f6c149eb9a7b57ffd1997&')
            
            interaction.reply({ embeds: [returnEmbed.setTimestamp()] })
        }
		
    }
}