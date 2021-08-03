const Discord = require("discord.js");

module.exports = {
	name: 'ranks',
	description: 'Get rank statistics. **Arguments:** challenge, progression',
    format: 'Search Term',
	permlvl: 0,
	restricted: false,
	execute(message, args) {
        if (args == "challenge") {
            try {
                const returnEmbed = new Discord.MessageEmbed()
                .setColor('#FF7100')
                .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
                .setTitle("**Challenge Ranks**")
                .setDescription(`Challenge Rank Statistics`)
                returnEmbed.addField("Caduceus' Glint", message.guild.roles.cache.get("810410422871785472").members.size)
                returnEmbed.addField("Ace", message.guild.roles.cache.get("650449319262158868").members.size)
                returnEmbed.addField("Astraea's Clarity", message.guild.roles.cache.get("868809340788834324").members.size)
                returnEmbed.addField("Snake Eater", message.guild.roles.cache.get("508638571565940736").members.size)
                returnEmbed.addField("Soaring Sleipnir", message.guild.roles.cache.get("603345251192537098").members.size)
                returnEmbed.addField("Annihilator", message.guild.roles.cache.get("528577192746287104").members.size)
                returnEmbed.addField("100% Club", message.guild.roles.cache.get("477645690630307841").members.size)
                returnEmbed.addField("Myrmidon", message.guild.roles.cache.get("810410728023916554").members.size)
                returnEmbed.addField("Vanguard", message.guild.roles.cache.get("642840616694317104").members.size)
                message.channel.send(returnEmbed.setTimestamp());
            } catch (err) {
                message.channel.send(`Something went wrong. Error: ${err}`);
            }
        } else if (args == "progression") {

        } else {
            message.channel.send("Please include an argument: `-ranks challenge` or `-ranks progression`"); 
            return;
        }
	},
};