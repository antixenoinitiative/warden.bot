module.exports = {
	name: 'ranks',
	description: 'Get rank statistics. **Arguments:** challenge, progression',
    format: 'Search Term',
	permlvl: 0,
	restricted: false,
	execute(message, args) {
        if (args == "challenge") {
            try {
                wiki.search(args).then((res) => {
                    const returnEmbed = new Discord.MessageEmbed()
                    .setColor('#FF7100')
                    .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
                    .setTitle("**Challenge Ranks**")
                    .setDescription(`Challenge Rank Statistics`)
                    returnEmbed.addField("Caduceus' Glint", guild.roles.get("810410422871785472").members.size)
                    returnEmbed.addField("Ace", guild.roles.get("650449319262158868").members.size)
                    returnEmbed.addField("Astraea's Clarity", guild.roles.get("868809340788834324").members.size)
                    returnEmbed.addField("Snake Eater", guild.roles.get("508638571565940736").members.size)
                    returnEmbed.addField("Soaring Sleipnir", guild.roles.get("603345251192537098").members.size)
                    returnEmbed.addField("Annihilator", guild.roles.get("528577192746287104").members.size)
                    returnEmbed.addField("100% Club", guild.roles.get("477645690630307841").members.size)
                    returnEmbed.addField("Myrmidon", guild.roles.get("810410728023916554").members.size)
                    returnEmbed.addField("Vanguard", guild.roles.get("642840616694317104").members.size)
                    message.channel.send(returnEmbed.setTimestamp())
                })
            } catch {
                message.channel.send("Something went wrong, please try again later")
            }
        } else if (args == "progression") {

        } else {
            message.channel.send("Please include an argument: `-ranks challenge` or `-ranks progression`"); 
            return;
        }
	},
};