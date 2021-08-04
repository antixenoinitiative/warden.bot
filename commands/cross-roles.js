const Discord = require("discord.js");
module.exports = {
	name: 'cross',
	description: 'How many people with X rank also have Y rank?',
    format: 'X Y',
	permlvl: 0,
	restricted: true,
	execute(message, args) {
		try {
			count = 0
			const returnEmbed = new Discord.MessageEmbed()
			.setColor('#FF7100')
            .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
            .setTitle("**Count**")
			
			let role1 = args[0]
			let role2 = args[1]

			let memberwithrole1 = message.guild.roles.cache.get(role1).members
			let memberwithrole2 = message.guild.roles.cache.get(role2).members
			memberwithrole1.map( m => {
				memberwithrole2.map( n =>{
					if(m.user.username == n.user.username)
					{
						count+=1
					}
				})
			})
			// try 1 of the code, shit doesn't work :(
			// const ar1 = message.guild.roles.cache.get(args[0]).members
			// console.log(ar1.size)
			// const ar2 = message.guild.roles.cache.get(args[1]).members
			// console.log(ar2.size)
			// ar1.forEach( member => function(member){
			// 	console.log(member.user.username)
			// 	var username = member.user.username
			// 	ar2.forEach(member => function(member,username){
			// 		console.log(member.user.username)
			// 		if(member.user.username == username)
			// 			count=count+1
			// 	})
			// })
			returnEmbed.addField("Members with rank " + args[0] + " having rank " + args[1] + ":", count, true)
			message.channel.send(returnEmbed.setTimestamp());
		} catch(err) {
			message.channel.send(`Something went wrong: -cross ${args[0]} ${args[1]} ERROR: ${err}`)
		}
	},
};