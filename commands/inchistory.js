const db = require('./../db/index');
const Discord = require("discord.js");

module.exports = {
	name: 'inchistory',
	description: 'Gets a list of systems under incursion on a specified date',
    usage: '"YYYY-MM-DD"',
	permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
	restricted: false,
	args: true,
	execute(message, args) {
		try {
			db.getIncursionsByDate(args[0]).then((res) => {
				if (res.length == 0) {
					return message.channel.send(`No incursions found on ${args[0]} 🙁`);
				}
				const returnEmbed = new Discord.MessageEmbed()
                .setColor('#FF7100')
				.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
				.setTitle("**Incursion History**")
				.setDescription(`Found **${res.length}** incursions for the week of "${args[0]}"`)
                for (let i = 0; i < res.length; i++) {
                    returnEmbed.addField(`Incursion #${i+1}`,res[i]);
                }
				message.channel.send(returnEmbed.setTimestamp())
			})
		} catch (err) {
			message.channel.send("Something went wrong, please ensure the date format is correct 'YYYY-MM-DD'")
		}
	},
};