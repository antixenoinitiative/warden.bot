const Discord = require("discord.js");
module.exports = {
	name: 'cross',
	description: 'How many people with rank1 also have rank2?',
    format: '"role1" "role2"',
	permlvl: 0,
	restricted: false,
	execute(message, args) {
		try {
			count = 0
			// Function to remove any ASCII characters that are not helpful, eg. - Magic spaces after progression ranks
			// Also trims the spaces now.
			function cleanString(input)
			{
				var output = "";
				for(var i=0;i<input.length;i++)
				{
					if(input.charCodeAt(i)<=127)
					{
						output+=input.charAt(i);
					}
				}
				return output.trim();
			}
			const returnEmbed = new Discord.MessageEmbed()
			.setColor('#FF7100')
            .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
            .setTitle("**Count**")
			roles = {}
			roles_name = {}
			message.guild.roles.cache
			.forEach(role => {
				roles[cleanString(role.name.trim().toLowerCase().replace(/[.,\/#!$\^&\*;:{}=\-_`'~()]/g,""))] = role.id
				roles_name[cleanString(role.name.trim().toLowerCase().replace(/[.,\/#!$\^&\*;:{}=\-_`'~()]/g,""))] = cleanString(role.name)
			})
			//Following commented lines prints the whole dictionary/object created in above code.
			//console.log(roles)
			//console.log(roles_name)
			var role1 = args[0].toLowerCase().replace(/["'”“]/g,"").trim()
			var role2 = args[1].toLowerCase().replace(/["'”“]/g,"").trim()
			console.log(role1,role2)
			let memberwithrole1 = message.guild.roles.cache.get(roles[role1]).members
			let memberwithrole2 = message.guild.roles.cache.get(roles[role2]).members
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
			returnEmbed.addField("Members with rank " + roles_name[role1],countrole1,true)
			returnEmbed.addField("Members with rank " + roles_name[role2],countrole2,true)
			returnEmbed.addField("Members with rank " + roles_name[role1] + " having rank " + roles_name[role2], count)
			message.channel.send(returnEmbed.setTimestamp());
		} catch(err) {
			message.channel.send(`Something went wrong: -cross ${role1} ${role2} \n ERROR: ${err}`)
		}
	},
};