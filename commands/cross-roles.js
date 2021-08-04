const Discord = require("discord.js");
module.exports = {
	name: 'cross',
	description: 'How many people with rank1 also have rank2?',
    format: '"role1" "role2"',
	permlvl: 0,
	restricted: true,
	execute(message, args) {
		try {
			count = 0
			const returnEmbed = new Discord.MessageEmbed()
			.setColor('#FF7100')
            .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
            .setTitle("**Count**")
			roles = {}
			roles_name = {}
			message.guild.roles.cache
			.forEach(role => {
				roles[role.name.toLowerCase().replace(/[.,\/#!$\^&\*;:{}=\-_`'~()]/g,"")] = role.id
				roles_name[role.name.toLowerCase().replace(/[.,\/#!$\^&\*;:{}=\-_`'~()]/g,"")] = role.name
			})
			role1 = args[0].replace(/["']/g,"")
			role2 = args[1].replace(/["']/g,"")
			let memberwithrole1 = message.guild.roles.cache.get(roles[role1]).members
			let memberwithrole2 = message.guild.roles.cache.get(roles[role2]).members
			memberwithrole1.map( m => {
				memberwithrole2.map( n =>{
					if(m.user.username == n.user.username)
					{
						count+=1
					}
				})
			})
			returnEmbed.addField("Members with rank " + roles_name[role1] + " having rank " + roles_name[role2] + ":", count, true)
			message.channel.send(returnEmbed.setTimestamp());
		} catch(err) {
			message.channel.send(`Something went wrong: -cross ${role1} ${role2} \n ERROR: ${err}`)
		}
	},
};