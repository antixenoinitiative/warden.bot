const wiki = require('.././../graphql/index');
const Discord = require("discord.js");

module.exports = {
	name: 'wiki',
	description: 'Search the AXI Wiki',
    usage: '"term"',
	permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
	restricted: false,
	execute(message, args) {
		if (args == "") { message.channel.send({ content: "**The Anti-Xeno Wiki:** https://wiki.antixenoinitiative.com/" }); return; }
		try {
			wiki.search(args).then((res) => {
				const returnEmbed = new Discord.MessageEmbed()
				.setColor('#FF7100')
				.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
				.setTitle("**Wiki Search**")
				.setDescription(`Found **${res.length}** search results for "${args}"`)
				for (let i = 0; i < res.length; i++) {
				returnEmbed.addField(res[i].title,`https://wiki.antixenoinitiative.com/en/${res[i].path}`)
				}
				message.channel.send({ embeds: [returnEmbed.setTimestamp()] })
			})
		} catch {
			message.channel.send({ content: "Something went wrong, please you entered a correct term" })
		}
	},
};
