const Discord = require("discord.js");
const { cleanString } = require("../../discord/cleanString");
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
	.setName('cross')
	.setDescription('How many people with rank1 also have rank2?')
	.addRoleOption(option => option.setName('first-rank')
		.setDescription('First Rank')
		.setRequired(true))
	.addRoleOption(option => option.setName('second-rank')
		.setDescription('Second Rank')
		.setRequired(true)),
	permlvl: 0,
	execute(interaction) {
		try {
			let count = 0
			const returnEmbed = new Discord.MessageEmbed()
			.setColor('#FF7100')
            .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
            .setTitle("**Count**")
			let actualrole1 = ""
			let actualrole2 = ""
			let memberwithrole1 = null
			try
			{
				let roleID = interaction.options.data.find(arg => arg.name === 'first-rank').value
				memberwithrole1 = interaction.guild.roles.cache.get(roleID).members
				actualrole1 = cleanString(interaction.guild.roles.cache.find(role => role.id == roleID).name)
			}
			catch(TypeError)
			{
				throw("Role 1 may have errors, please check and retry.")
			}
			let memberwithrole2 = null
			try
			{
				let roleID = interaction.options.data.find(arg => arg.name === 'second-rank').value
				memberwithrole2 = interaction.guild.roles.cache.get(roleID).members
				actualrole2 = cleanString(interaction.guild.roles.cache.find(role => role.id == roleID).name)
			}
			catch(TypeError)
			{
				throw("Role 2 may have errors, please check and retry.")
			}
			let countrole1 = memberwithrole1.size
			let countrole2 = memberwithrole2.size
			memberwithrole1.map( m => {
				memberwithrole2.map( n =>{
					if(m.user.username == n.user.username)
					{
						count+=1
					}
				})
			})
			returnEmbed.addField("Members with rank " + actualrole1,"```" + countrole1 + "```",true)
			returnEmbed.addField("Members with rank " + actualrole2,"```" + countrole2 + "```",true)
			returnEmbed.addField("Members with rank " + actualrole1 + " having rank " + actualrole2, "```" + count + "```")
			interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
		} catch(err) {
			console.error(err);
			interaction.reply({ content: `ERROR! Something went wrong:\n${err}` })
		}
	},
};
