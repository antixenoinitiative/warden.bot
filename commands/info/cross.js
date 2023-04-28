const Discord = require("discord.js");
const { cleanString } = require("../../discord/cleanString");

module.exports = {
	data: new Discord.SlashCommandBuilder()
	.setName('cross')
	.setDescription('How many people with rank1 also have rank2?')
	.addRoleOption(option => option.setName('first-rank')
		.setDescription('First Rank')
		.setRequired(true))
	.addRoleOption(option => option.setName('second-rank')
		.setDescription('Second Rank')
		.setRequired(true)),
	permissions: 0,
	execute(interaction) {
		try {
			let count = 0
			const returnEmbed = new Discord.EmbedBuilder()
			.setColor('#FF7100')
            .setTitle("**Count**")
			let actualrole1 = ""
			let actualrole2 = ""
			let memberwithrole1 = null
			try
			{
				let roleID = interaction.options.data.find(arg => arg.name === 'first-rank').value
				memberwithrole1 = interaction.guild.roles.cache.get(roleID).members
				if(memberwithrole1.size > 1500)
				{
					interaction.reply({ content: `Cannot proceed. Too many members in one or more selected roles.`, ephemeral: true })
					return;
				}
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
				if(memberwithrole2.size > 1500)
				{
					interaction.reply({ content: `Cannot proceed. Too many members in one or more selected roles.`, ephemeral: true })
					return;
				}
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
			returnEmbed.addFields({ name:"Members with rank " + actualrole1, value: "```" + countrole1 + "```", inline: true })
			returnEmbed.addFields({ name:"Members with rank " + actualrole2, value: "```" + countrole2 + "```", inline: true })
			returnEmbed.addFields({ name:"Members with rank " + actualrole1 + " having rank " + actualrole2, value: "```" + count + "```" })
			interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
		} catch(err) {
			console.error(err);
			interaction.reply({ content: `ERROR! Something went wrong:\n${err}` })
		}
	},
};
